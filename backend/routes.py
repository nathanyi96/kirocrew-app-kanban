"""Kanban board HTTP routes.

External-app contract (differs from builtins): ``register_routes(ctx)`` returns
a ``list[AppRoute]`` whose paths are RELATIVE to ``/api/apps/kanban``, and each
handler takes ``(request, ctx)``. Registering on the router directly would never
dispatch — the RouteRegistry catch-all shadows it.

Running a card creates a REAL dashboard chat session (a named chat slot) rather
than a headless subagent, because the point is that the user can open it. Two
consequences are deliberate:

* The slot is NOT stamped ``_app``, so it stays visible in the Sessions list and
  is reachable at ``/chat?sid=<slot key>``. Hiding it would defeat the feature.
* No trust is granted to the slot. Tool-approval prompts render in the main chat
  UI, which is exactly where this session lives, so the user approves there.
  Auto-approving would exempt these runs from the interactive-approval layer for
  no gain.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator

from aiohttp import web

from kiro_crew.apps.route_registry import AppRoute

# fcntl is POSIX-only. On Windows the lock degrades to a no-op: one gateway
# process still serialises its own writes through the event loop, and refusing
# to run at all would be worse than losing cross-process exclusion.
try:  # pragma: no cover - platform dependent
    import fcntl
except ImportError:  # pragma: no cover - Windows
    fcntl = None  # type: ignore[assignment]



logger = logging.getLogger("kirocrew.app.kanban")

STORE_VERSION = 1
_LOCK_TIMEOUT_SECS = 5.0
_LOCK_POLL_SECS = 0.02

TASK_STATUSES = ("backlog", "todo", "running", "done", "failed")
#: Columns a user may drag a card INTO. ``running`` is never one of them: it is
#: set by starting a run and cleared by the run settling.
MANUAL_MOVE_TARGETS = ("backlog", "todo", "done", "failed")
PRIORITIES = ("low", "medium", "high")


# ── Model ──


@dataclass
class ExecutionRecord:
    """One attempt at running a task."""

    id: str
    started_at: float
    ended_at: float | None = None
    session_key: str | None = None
    result: str | None = None  # succeeded | failed | cancelled
    error: str | None = None


@dataclass
class ScheduleRule:
    """A cron rule that runs the task unattended."""

    enabled: bool = False
    cron: str = ""
    next_run_at: float | None = None
    last_triggered_at: float | None = None
    job_id: str = ""  # the cron job backing this rule, so we can update/remove it


@dataclass
class TaskRecord:
    """A card on the board."""

    id: str
    title: str
    description: str = ""
    prompt: str = ""
    status: str = "todo"
    created_at: float = 0.0
    updated_at: float = 0.0
    executions: list[ExecutionRecord] = field(default_factory=list)
    schedule: ScheduleRule | None = None
    tags: list[str] = field(default_factory=list)
    priority: str = "medium"


# ── Transitions (pure) ──


def _now() -> float:
    return time.time()


def _replace(task: TaskRecord, **changes: Any) -> TaskRecord:
    """Return a copy of *task* with *changes* applied and ``updated_at`` bumped."""
    data = {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "prompt": task.prompt,
        "status": task.status,
        "created_at": task.created_at,
        "updated_at": _now(),
        "executions": task.executions,
        "schedule": task.schedule,
        "tags": task.tags,
        "priority": task.priority,
    }
    data.update(changes)
    return TaskRecord(**data)


def create_task(
    title: str,
    description: str = "",
    prompt: str = "",
    status: str = "todo",
    tags: list[str] | None = None,
    priority: str = "medium",
) -> TaskRecord:
    """Mint a new task. Unknown status/priority fall back to the safe default."""
    now = _now()
    return TaskRecord(
        id=str(uuid.uuid4()),
        title=title,
        description=description,
        prompt=prompt,
        status=status if status in TASK_STATUSES else "todo",
        created_at=now,
        updated_at=now,
        tags=list(tags or []),
        priority=priority if priority in PRIORITIES else "medium",
    )


def move_task(task: TaskRecord, new_status: str) -> TaskRecord:
    """Move a card to another column."""
    if new_status not in TASK_STATUSES:
        raise ValueError(f"Invalid status: {new_status!r}")
    return _replace(task, status=new_status)


def start_execution(task: TaskRecord) -> tuple[TaskRecord, ExecutionRecord]:
    """Open a new execution and put the card in ``running``."""
    execution = ExecutionRecord(id=str(uuid.uuid4()), started_at=_now())
    return (
        _replace(task, status="running", executions=[*task.executions, execution]),
        execution,
    )


def settle_execution(
    task: TaskRecord,
    execution_id: str,
    outcome: str,
    error: str | None = None,
) -> TaskRecord:
    """Close an execution and land the card in the column its outcome implies.

    A cancelled run returns the card to ``todo`` rather than marking it failed —
    nothing was decided about the work itself.
    """
    now = _now()
    status = {"succeeded": "done", "failed": "failed", "cancelled": "todo"}.get(
        outcome, "failed"
    )
    executions = [
        ExecutionRecord(
            id=ex.id,
            started_at=ex.started_at,
            ended_at=now,
            session_key=ex.session_key,
            result=outcome,
            error=error,
        )
        if ex.id == execution_id
        else ex
        for ex in task.executions
    ]
    return _replace(task, status=status, executions=executions)


def attach_session_key(
    task: TaskRecord, execution_id: str, session_key: str
) -> TaskRecord:
    """Record which chat session is running an execution."""
    executions = [
        ExecutionRecord(
            id=ex.id,
            started_at=ex.started_at,
            ended_at=ex.ended_at,
            session_key=session_key,
            result=ex.result,
            error=ex.error,
        )
        if ex.id == execution_id
        else ex
        for ex in task.executions
    ]
    return _replace(task, executions=executions)


def with_schedule(task: TaskRecord, rule: ScheduleRule | None) -> TaskRecord:
    return _replace(task, schedule=rule)


# ── Serialization ──


def task_to_dict(task: TaskRecord) -> dict[str, Any]:
    data = asdict(task)
    if data.get("schedule") is None:
        data.pop("schedule", None)
    return data


def task_from_dict(raw: dict[str, Any]) -> TaskRecord | None:
    """Parse one stored task. Returns None for a row too broken to use.

    Deliberately tolerant: a single corrupt row drops out of the board instead
    of taking the whole file down with it.
    """
    try:
        task_id = str(raw.get("id") or "")
        title = str(raw.get("title") or "")
        if not task_id or not title:
            return None

        status = raw.get("status", "todo")
        if status not in TASK_STATUSES:
            status = "todo"

        executions: list[ExecutionRecord] = []
        for item in raw.get("executions") or []:
            if isinstance(item, dict) and item.get("id"):
                executions.append(
                    ExecutionRecord(
                        id=str(item["id"]),
                        started_at=float(item.get("started_at") or 0),
                        ended_at=item.get("ended_at"),
                        session_key=item.get("session_key"),
                        result=item.get("result"),
                        error=item.get("error"),
                    )
                )

        schedule = None
        raw_schedule = raw.get("schedule")
        if isinstance(raw_schedule, dict):
            schedule = ScheduleRule(
                enabled=bool(raw_schedule.get("enabled")),
                cron=str(raw_schedule.get("cron") or ""),
                next_run_at=raw_schedule.get("next_run_at"),
                last_triggered_at=raw_schedule.get("last_triggered_at"),
                job_id=str(raw_schedule.get("job_id") or ""),
            )

        tags = raw.get("tags")
        priority = raw.get("priority")
        return TaskRecord(
            id=task_id,
            title=title,
            description=str(raw.get("description") or ""),
            prompt=str(raw.get("prompt") or ""),
            status=status,
            created_at=float(raw.get("created_at") or 0),
            updated_at=float(raw.get("updated_at") or 0),
            executions=executions,
            schedule=schedule,
            tags=[str(t) for t in tags] if isinstance(tags, list) else [],
            priority=priority if priority in PRIORITIES else "medium",
        )
    except (TypeError, ValueError) as exc:
        logger.warning("kanban: dropping unreadable task row: %s", exc)
        return None


# ── Store ──


@contextlib.contextmanager
def _file_lock(lock_path: Path) -> Iterator[None]:
    """Advisory exclusive lock, with a bounded wait."""
    if fcntl is None:  # pragma: no cover - Windows
        yield
        return
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("w")
    deadline = time.monotonic() + _LOCK_TIMEOUT_SECS
    try:
        while True:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise TimeoutError(
                        f"kanban: could not lock {lock_path} within "
                        f"{_LOCK_TIMEOUT_SECS}s"
                    )
                time.sleep(_LOCK_POLL_SECS)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    finally:
        handle.close()


class KanbanStore:
    """The board on disk.

    Layout, under the app's data directory::

        board.json   the tasks
        .lock        advisory lock file
    """

    def __init__(self, root: Path) -> None:
        self._root = Path(root).expanduser()
        self._root.mkdir(parents=True, exist_ok=True)
        self._board = self._root / "board.json"
        self._lock = self._root / ".lock"

    # ── Reads ──

    def load(self) -> list[TaskRecord]:
        with _file_lock(self._lock):
            return self._read()

    def get(self, task_id: str) -> TaskRecord | None:
        for task in self.load():
            if task.id == task_id:
                return task
        return None

    # ── Writes ──

    def add(self, task: TaskRecord) -> TaskRecord:
        with _file_lock(self._lock):
            tasks = self._read()
            tasks.append(task)
            self._write(tasks)
        return task

    def update(
        self, task_id: str, updater: Callable[[TaskRecord], TaskRecord | None]
    ) -> TaskRecord | None:
        """Load, apply *updater* to the matching task, save — all under the lock.

        ``updater`` returning None deletes the task. Returns the new record, or
        None when the task was absent or deleted.
        """
        with _file_lock(self._lock):
            tasks = self._read()
            result: TaskRecord | None = None
            kept: list[TaskRecord] = []
            for task in tasks:
                if task.id != task_id:
                    kept.append(task)
                    continue
                updated = updater(task)
                if updated is not None:
                    kept.append(updated)
                    result = updated
            self._write(kept)
            return result

    def delete(self, task_id: str) -> bool:
        with _file_lock(self._lock):
            tasks = self._read()
            kept = [t for t in tasks if t.id != task_id]
            if len(kept) == len(tasks):
                return False
            self._write(kept)
            return True

    def save_all(self, tasks: list[TaskRecord]) -> None:
        with _file_lock(self._lock):
            self._write(tasks)

    # ── Internals (must hold the lock) ──

    def _read(self) -> list[TaskRecord]:
        if not self._board.exists():
            return []
        try:
            raw = json.loads(self._board.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("kanban: cannot read board.json (%s); starting empty", exc)
            return []
        if not isinstance(raw, dict):
            return []
        version = raw.get("version", STORE_VERSION)
        if version != STORE_VERSION:
            logger.warning(
                "kanban: board.json is version %s, this build writes %s; "
                "reading best-effort",
                version,
                STORE_VERSION,
            )
        tasks: list[TaskRecord] = []
        for item in raw.get("tasks") or []:
            if isinstance(item, dict):
                task = task_from_dict(item)
                if task is not None:
                    tasks.append(task)
        return tasks

    def _write(self, tasks: list[TaskRecord]) -> None:
        payload = {
            "version": STORE_VERSION,
            "tasks": [task_to_dict(t) for t in tasks],
        }
        # Write-then-rename so a crash mid-write cannot truncate the board.
        tmp = self._board.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        tmp.replace(self._board)


# ── Routes ──


#: How long a run may stay unsettled before we give up on it.
_WATCH_TIMEOUT_SECS = 30 * 60
_WATCH_POLL_SECS = 3.0
#: Give a dispatched turn a moment to actually start before idle means "done".
_WATCH_GRACE_SECS = 3.0

_STORES: dict[str, KanbanStore] = {}


def _store(ctx: Any) -> KanbanStore:
    """The board for this app instance, cached per data directory."""
    root = Path(ctx.data_dir) / "board"
    key = str(root)
    store = _STORES.get(key)
    if store is None:
        store = KanbanStore(root)
        _STORES[key] = store
    return store


def _authed(request: web.Request) -> bool:
    return request.get("user") is not None


def _deny() -> web.Response:
    return web.json_response({"error": "unauthorized"}, status=401)


async def _body(request: web.Request) -> dict[str, Any] | None:
    try:
        data = await request.json()
    except (json.JSONDecodeError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _task_response(task: TaskRecord) -> web.Response:
    return web.json_response(task_to_dict(task))


# ── Refine ──


def _title_from_prompt(prompt: str) -> str:
    """A short, readable title from a free-form prompt.

    Deliberately a heuristic rather than a model call: creating a card must not
    depend on an LLM round-trip being available, and the user can edit the title
    in the detail modal anyway.
    """
    first = prompt.strip().split("\n", 1)[0].strip()
    if len(first) <= 60:
        return first
    cut = first[:57]
    space = cut.rfind(" ")
    return (cut[:space] if space > 30 else cut) + "…"


def _summary_from_prompt(prompt: str) -> str:
    """A one-paragraph summary, when the prompt is long enough to have one."""
    text = prompt.strip()
    if len(text) <= 120:
        return ""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    return paragraphs[0] if len(paragraphs) > 1 else ""


async def refine(request: web.Request, ctx: Any) -> web.Response:
    """POST /refine — turn a raw prompt into title + description."""
    if not _authed(request):
        return _deny()
    body = await _body(request)
    if body is None:
        return web.json_response({"error": "invalid JSON body"}, status=400)
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return web.json_response({"error": "prompt is required"}, status=400)
    return web.json_response(
        {
            "title": _title_from_prompt(prompt),
            "description": _summary_from_prompt(prompt),
            "prompt": prompt,
        }
    )


# ── Tasks ──


async def list_tasks(request: web.Request, ctx: Any) -> web.Response:
    """GET /tasks — the whole board, optionally filtered."""
    if not _authed(request):
        return _deny()
    tasks = _store(ctx).load()

    status = request.query.get("status")
    tag = request.query.get("tag")
    needle = (request.query.get("q") or "").strip().lower()
    if status:
        tasks = [t for t in tasks if t.status == status]
    if tag:
        tasks = [t for t in tasks if tag in t.tags]
    if needle:
        tasks = [
            t
            for t in tasks
            if needle in t.title.lower()
            or needle in t.description.lower()
            or needle in t.prompt.lower()
        ]
    return web.json_response(
        {"tasks": [task_to_dict(t) for t in tasks], "total": len(tasks)}
    )


async def create(request: web.Request, ctx: Any) -> web.Response:
    """POST /tasks — add a card."""
    if not _authed(request):
        return _deny()
    body = await _body(request)
    if body is None:
        return web.json_response({"error": "invalid JSON body"}, status=400)
    title = str(body.get("title") or "").strip()
    if not title:
        return web.json_response({"error": "title is required"}, status=400)
    tags = body.get("tags")
    task = create_task(
        title=title,
        description=str(body.get("description") or ""),
        prompt=str(body.get("prompt") or ""),
        status=str(body.get("status") or "todo"),
        tags=[str(t) for t in tags] if isinstance(tags, list) else None,
        priority=str(body.get("priority") or "medium"),
    )
    _store(ctx).add(task)
    return web.json_response(task_to_dict(task), status=201)


async def get_task(request: web.Request, ctx: Any) -> web.Response:
    """GET /tasks/{id}."""
    if not _authed(request):
        return _deny()
    task = _store(ctx).get(request.match_info["id"])
    if task is None:
        return web.json_response({"error": "task not found"}, status=404)
    return _task_response(task)


async def update(request: web.Request, ctx: Any) -> web.Response:
    """PATCH /tasks/{id} — edit the card's own fields."""
    if not _authed(request):
        return _deny()
    body = await _body(request)
    if body is None:
        return web.json_response({"error": "invalid JSON body"}, status=400)

    def updater(task: TaskRecord) -> TaskRecord:
        title = body.get("title")
        description = body.get("description")
        prompt = body.get("prompt")
        tags = body.get("tags")
        priority = body.get("priority")
        return TaskRecord(
            id=task.id,
            title=title.strip() if isinstance(title, str) and title.strip() else task.title,
            description=description if isinstance(description, str) else task.description,
            prompt=prompt if isinstance(prompt, str) else task.prompt,
            status=task.status,
            created_at=task.created_at,
            updated_at=time.time(),
            executions=task.executions,
            schedule=task.schedule,
            tags=[str(t) for t in tags] if isinstance(tags, list) else task.tags,
            priority=priority if priority in PRIORITIES else task.priority,
        )

    result = _store(ctx).update(request.match_info["id"], updater)
    if result is None:
        return web.json_response({"error": "task not found"}, status=404)
    return _task_response(result)


async def delete(request: web.Request, ctx: Any) -> web.Response:
    """DELETE /tasks/{id} — remove the card and any cron backing it."""
    if not _authed(request):
        return _deny()
    task_id = request.match_info["id"]
    store = _store(ctx)
    task = store.get(task_id)
    if task is not None and task.schedule and task.schedule.job_id:
        await _remove_cron(ctx, task.schedule.job_id)
    if not store.delete(task_id):
        return web.json_response({"error": "task not found"}, status=404)
    return web.json_response({"deleted": True})


async def move(request: web.Request, ctx: Any) -> web.Response:
    """POST /tasks/{id}/move — drop the card in another column."""
    if not _authed(request):
        return _deny()
    body = await _body(request)
    if body is None:
        return web.json_response({"error": "invalid JSON body"}, status=400)
    new_status = str(body.get("status") or "")
    if new_status not in MANUAL_MOVE_TARGETS:
        return web.json_response(
            {
                "error": (
                    f"cannot move to {new_status!r}; allowed: "
                    f"{', '.join(MANUAL_MOVE_TARGETS)}"
                )
            },
            status=400,
        )

    def updater(task: TaskRecord) -> TaskRecord:
        # A running card may only leave 'running' by settling, not by a drag.
        if task.status == "running" and new_status not in ("done", "failed"):
            return task
        return move_task(task, new_status)

    result = _store(ctx).update(request.match_info["id"], updater)
    if result is None:
        return web.json_response({"error": "task not found"}, status=404)
    return _task_response(result)


# ── Execution ──


def _slot_name(task_id: str) -> str:
    """A stable slot per task, so a re-run continues the same conversation."""
    return f"kanban-{task_id[:8]}"


async def _open_session(request: web.Request, task: TaskRecord, prompt: str) -> str | None:
    """Create/reuse this task's chat session and dispatch the prompt into it.

    Returns the slot key, which the UI turns into ``/chat?sid=<key>``.
    """
    state = request.app.get("state")
    if state is None:
        logger.warning("kanban: no gateway state on the request; cannot run")
        return None
    try:
        from kiro_crew.dashboard.chat_runner import _run_chat
    except ImportError as exc:  # pragma: no cover - gateway internals moved
        logger.warning("kanban: chat runner unavailable (%s); cannot run", exc)
        return None

    slot = state.get_or_create_slot(name=_slot_name(task.id))
    slot.title = (task.title or "Kanban task")[:80]
    # Queues instead of racing when the slot is already mid-turn.
    slot.enqueue_or_run_prompt(prompt, _run_chat, state)
    state.push_slots_update()
    return str(slot.key)


def _slot_outcome(slot: Any) -> tuple[str, str | None]:
    """Map a finished slot to (outcome, error)."""
    error = getattr(slot, "last_error", "") or ""
    if error:
        return "failed", str(error)[:500]
    return "succeeded", None


def _settle(store: KanbanStore, task_id: str, execution_id: str, outcome: str,
            error: str | None = None) -> None:
    store.update(
        task_id,
        lambda t, e=execution_id, o=outcome, x=error: settle_execution(t, e, o, x),
    )
    logger.info("kanban: task %s settled as %s", task_id[:8], outcome)


async def _watch(state: Any, store: KanbanStore, task_id: str, execution_id: str,
                 slot_key: str) -> None:
    """Settle the card when its session's turn ends."""
    await asyncio.sleep(_WATCH_GRACE_SECS)
    deadline = time.monotonic() + _WATCH_TIMEOUT_SECS
    while time.monotonic() < deadline:
        # Slots live on a private attribute; a rename upstream should degrade to
        # "leave it running and let reconcile decide", not crash the watcher.
        slot = getattr(state, "_slots", {}).get(slot_key)
        if slot is None:
            _settle(store, task_id, execution_id, "cancelled")
            return
        if not getattr(slot, "running", False):
            outcome, error = _slot_outcome(slot)
            _settle(store, task_id, execution_id, outcome, error)
            return
        await asyncio.sleep(_WATCH_POLL_SECS)
    _settle(store, task_id, execution_id, "failed", "run exceeded 30 minutes")


async def run(request: web.Request, ctx: Any) -> web.Response:
    """POST /tasks/{id}/run — start the card's agent session."""
    if not _authed(request):
        return _deny()
    task_id = request.match_info["id"]
    store = _store(ctx)
    task = store.get(task_id)
    if task is None:
        return web.json_response({"error": "task not found"}, status=404)
    if task.status == "running":
        return web.json_response({"error": "task is already running"}, status=409)

    prompt = task.prompt.strip() or task.title
    running, execution = start_execution(task)
    store.update(task_id, lambda _t, r=running: r)

    try:
        session_key = await _open_session(request, task, prompt)
    except Exception as exc:  # noqa: BLE001 - report, never leave the card stuck
        logger.warning("kanban: could not start run: %s", exc)
        _settle(store, task_id, execution.id, "failed", str(exc)[:500])
        return web.json_response(
            {"error": f"could not start the run: {exc}"}, status=500
        )

    if not session_key:
        _settle(store, task_id, execution.id, "failed", "no chat session available")
        return web.json_response(
            {"error": "no chat session available to run this task"}, status=503
        )

    store.update(
        task_id,
        lambda t, e=execution.id, k=session_key: attach_session_key(t, e, k),
    )
    state = request.app["state"]
    asyncio.create_task(_watch(state, store, task_id, execution.id, session_key))

    return web.json_response(
        {"execution_id": execution.id, "session_key": session_key, "status": "running"},
        status=202,
    )


async def executions(request: web.Request, ctx: Any) -> web.Response:
    """GET /tasks/{id}/executions — newest first."""
    if not _authed(request):
        return _deny()
    task = _store(ctx).get(request.match_info["id"])
    if task is None:
        return web.json_response({"error": "task not found"}, status=404)
    from dataclasses import asdict as _asdict

    rows = [_asdict(ex) for ex in reversed(task.executions)]
    return web.json_response({"executions": rows, "total": len(rows)})


async def reconcile(request: web.Request, ctx: Any) -> web.Response:
    """POST /reconcile — settle cards whose session already finished.

    A gateway restart drops the in-memory watchers, so a card can be left in
    ``running`` with nothing watching it. The UI calls this on load.
    """
    if not _authed(request):
        return _deny()
    store = _store(ctx)
    state = request.app.get("state")
    slots = getattr(state, "_slots", {}) if state is not None else {}

    running = [t for t in store.load() if t.status == "running"]
    settled = 0
    for task in running:
        if not task.executions:
            continue
        last = task.executions[-1]
        if last.result is not None:
            _settle(store, task.id, last.id, last.result)
            settled += 1
            continue
        if not last.session_key:
            _settle(store, task.id, last.id, "cancelled")
            settled += 1
            continue
        slot = slots.get(last.session_key)
        if slot is None:
            _settle(store, task.id, last.id, "cancelled")
            settled += 1
        elif not getattr(slot, "running", False):
            outcome, error = _slot_outcome(slot)
            _settle(store, task.id, last.id, outcome, error)
            settled += 1

    return web.json_response({"reconciled": settled, "running": len(running) - settled})


# ── Schedule ──


def _next_run_at(cron_expr: str) -> float | None:
    try:
        from croniter import croniter

        return float(croniter(cron_expr, time.time()).get_next(float))
    except Exception:  # noqa: BLE001 - a bad expression is caught by the validator
        return None


def _valid_cron(cron_expr: str) -> str | None:
    """Return an error message for an unusable expression, else None."""
    try:
        from croniter import croniter

        croniter(cron_expr)
    except ImportError:  # pragma: no cover - croniter ships with the gateway
        return "cron support is unavailable on this gateway"
    except (ValueError, TypeError, KeyError) as exc:
        return f"invalid cron expression: {exc}"
    return None


async def _remove_cron(ctx: Any, job_id: str) -> None:
    """Drop a backing cron job, tolerating an already-removed one."""
    cron = getattr(ctx, "cron", None)
    if cron is None or not job_id:
        return
    try:
        await cron.remove_job_async(job_id)
    except Exception as exc:  # noqa: BLE001 - a stale id must not fail the request
        logger.warning("kanban: could not remove cron job %s: %s", job_id, exc)


async def schedule(request: web.Request, ctx: Any) -> web.Response:
    """POST /tasks/{id}/schedule — set or clear the card's cron rule.

    Enabling creates an app-owned cron job whose message drives this app's own
    run path; disabling removes it. The rule and the job are kept in step by
    storing the job id on the task.
    """
    if not _authed(request):
        return _deny()
    body = await _body(request)
    if body is None:
        return web.json_response({"error": "invalid JSON body"}, status=400)

    enabled = bool(body.get("enabled"))
    cron_expr = str(body.get("cron") or "").strip()
    if enabled and not cron_expr:
        return web.json_response(
            {"error": "a cron expression is required to enable a schedule"}, status=400
        )
    if cron_expr:
        problem = _valid_cron(cron_expr)
        if problem:
            return web.json_response({"error": problem}, status=400)

    task_id = request.match_info["id"]
    store = _store(ctx)
    task = store.get(task_id)
    if task is None:
        return web.json_response({"error": "task not found"}, status=404)

    previous_job = task.schedule.job_id if task.schedule else ""
    cron = getattr(ctx, "cron", None)
    job_id = ""

    if enabled and cron is not None:
        message = (
            f"Run Kanban task {task_id} on the board. Do the work described in "
            f'its prompt: "{task.prompt.strip() or task.title}". '
            "When you are done, say what you did in one line."
        )
        try:
            if previous_job:
                await cron.update_job_async(
                    previous_job, cron_expr=cron_expr, message=message, enabled=True
                )
                job_id = previous_job
            else:
                job = await cron.add_job_async(
                    name=f"kanban-{task_id[:8]}",
                    message=message,
                    cron_expr=cron_expr,
                    silent=True,
                    persistent_session=False,
                )
                job_id = str(getattr(job, "id", "") or "")
        except Exception as exc:  # noqa: BLE001 - surface, don't half-save
            logger.warning("kanban: could not schedule task %s: %s", task_id[:8], exc)
            return web.json_response(
                {"error": f"could not create the schedule: {exc}"}, status=500
            )
    elif not enabled and previous_job:
        await _remove_cron(ctx, previous_job)

    rule = ScheduleRule(
        enabled=enabled,
        cron=cron_expr,
        next_run_at=_next_run_at(cron_expr) if (enabled and cron_expr) else None,
        last_triggered_at=(task.schedule.last_triggered_at if task.schedule else None),
        job_id=job_id,
    )
    result = store.update(task_id, lambda t, r=rule: with_schedule(t, r))
    if result is None:
        return web.json_response({"error": "task not found"}, status=404)
    return _task_response(result)


# ── Registration ──


def register_routes(ctx: Any) -> list[AppRoute]:
    """Declare the board's routes. Paths are relative to /api/apps/kanban."""
    ctx.logger.info("kanban: registering routes (data dir: %s)", ctx.data_dir)
    return [
        AppRoute("POST", "/refine", refine),
        AppRoute("GET", "/tasks", list_tasks),
        AppRoute("POST", "/tasks", create),
        AppRoute("POST", "/reconcile", reconcile),
        AppRoute("GET", "/tasks/{id}", get_task),
        AppRoute("PATCH", "/tasks/{id}", update),
        AppRoute("DELETE", "/tasks/{id}", delete),
        AppRoute("POST", "/tasks/{id}/move", move),
        AppRoute("POST", "/tasks/{id}/run", run),
        AppRoute("POST", "/tasks/{id}/schedule", schedule),
        AppRoute("GET", "/tasks/{id}/executions", executions),
    ]
