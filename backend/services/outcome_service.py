"""Outcome, verification, artifact, and bounded-goal projections."""

from __future__ import annotations

import hashlib
import importlib.util
import re
import sys
import time
import uuid
from dataclasses import replace
from pathlib import Path
from typing import Any, Iterable

try:
    from ..models import (
        ArtifactRecord,
        ExecutionStepRecord,
        GoalRecord,
        ResultPacket,
        TaskRecord,
        VerificationRecord,
    )
except ImportError:
    _spec = importlib.util.spec_from_file_location(
        "_kanban_models", Path(__file__).resolve().parents[1] / "models.py"
    )
    if _spec is None or _spec.loader is None:
        raise ImportError("Could not load Kanban models")
    _module = importlib.util.module_from_spec(_spec)
    sys.modules[_spec.name] = _module
    _spec.loader.exec_module(_module)
    ArtifactRecord = _module.ArtifactRecord
    ExecutionStepRecord = _module.ExecutionStepRecord
    GoalRecord = _module.GoalRecord
    ResultPacket = _module.ResultPacket
    TaskRecord = _module.TaskRecord
    VerificationRecord = _module.VerificationRecord


GOAL_MODES = ("one_run", "loop")
GOAL_STATUSES = (
    "ready",
    "working",
    "needs_input",
    "needs_review",
    "achieved",
    "paused",
    "blocked",
    "budget_exhausted",
    "cancelled",
)
VERIFICATION_STATUSES = ("pending", "running", "passed", "failed", "unknown")

_URL_RE = re.compile(r"https?://[^\s<>\])}]+", re.IGNORECASE)
_MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)", re.IGNORECASE)
_PATH_RE = re.compile(
    r"`((?:[A-Za-z]:[\\/]|/|\.?\.?/)?[^`\n]+\.(?:md|txt|json|ya?ml|csv|html?|pdf|png|jpe?g|gif|svg|tsx?|jsx?|py|go|rs|java|kt|swift|css|scss|sql))`",
    re.IGNORECASE,
)


def _bounded_int(value: Any, default: int, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return max(low, min(high, int(value)))


def build_goal(
    objective: str,
    *,
    mode: str = "loop",
    criteria: Iterable[str] | None = None,
    max_attempts: int = 3,
    max_minutes: int = 60,
    token_budget: int = 50000,
) -> GoalRecord:
    """Create a bounded goal contract from user-facing values."""
    clean_objective = objective.strip()[:8000]
    labels = [str(item).strip()[:500] for item in (criteria or []) if str(item).strip()]
    if not labels:
        labels = [
            "The requested outcome is implemented",
            "Relevant checks pass without regressions",
            "The final result and produced artifacts are summarized",
        ]
    checks = [
        VerificationRecord(id=str(uuid.uuid4()), label=label, source="goal_contract")
        for label in labels[:12]
    ]
    return GoalRecord(
        objective=clean_objective,
        mode=mode if mode in GOAL_MODES else "loop",
        criteria=checks,
        max_attempts=_bounded_int(max_attempts, 3, 1, 10),
        max_minutes=_bounded_int(max_minutes, 60, 5, 720),
        token_budget=_bounded_int(token_budget, 50000, 1000, 2_000_000),
    )


def configure_goal(
    task: TaskRecord,
    *,
    objective: str,
    mode: str,
    criteria: Iterable[str],
    max_attempts: int,
    max_minutes: int,
    token_budget: int,
) -> TaskRecord:
    goal = build_goal(
        objective or task.prompt or task.title,
        mode=mode,
        criteria=criteria,
        max_attempts=max_attempts,
        max_minutes=max_minutes,
        token_budget=token_budget,
    )
    return replace(task, goal=goal, updated_at=time.time())


def begin_goal_attempt(goal: GoalRecord | None, now: float | None = None) -> GoalRecord | None:
    if goal is None:
        return None
    at = time.time() if now is None else now
    # A new attempt may change previously verified state, so every criterion is
    # re-opened until the new outcome has fresh evidence.
    criteria = [replace(check, status="running", evidence="", checked_at=None) for check in goal.criteria]
    return replace(
        goal,
        status="working",
        criteria=criteria,
        attempts=goal.attempts + 1,
        started_at=goal.started_at or at,
        achieved_at=None,
        stop_reason="",
    )


def mark_goal_status(task: TaskRecord, status: str, reason: str = "") -> TaskRecord:
    if task.goal is None:
        return task
    clean_status = status if status in GOAL_STATUSES else task.goal.status
    goal = replace(task.goal, status=clean_status, stop_reason=reason[:500])
    return replace(task, goal=goal, updated_at=time.time())


def _value(source: Any, name: str, default: Any = None) -> Any:
    if isinstance(source, dict):
        return source.get(name, default)
    return getattr(source, name, default)


def _status(value: Any) -> str:
    raw = getattr(value, "value", value)
    normalized = str(raw or "pending").strip().lower().replace(" ", "_")
    if normalized in ("completed", "complete", "succeeded", "success", "passed", "done"):
        return "passed"
    if normalized in ("in_progress", "running", "reviewing", "working"):
        return "running"
    if normalized in ("failed", "error"):
        return "failed"
    if normalized in ("skipped", "cancelled"):
        return normalized
    return "pending"


def _artifact_id(execution_id: str, kind: str, target: str) -> str:
    digest = hashlib.sha256(f"{kind}:{target}".encode("utf-8")).hexdigest()[:14]
    return f"{execution_id}:{digest}"


def _artifacts_from_text(text: str, execution_id: str, step_id: str | None = None) -> list[ArtifactRecord]:
    if not text:
        return []
    found: list[ArtifactRecord] = []
    seen: set[str] = set()
    for label, url in _MARKDOWN_LINK_RE.findall(text):
        clean_url = url.rstrip(".,;:")
        if clean_url in seen:
            continue
        seen.add(clean_url)
        found.append(
            ArtifactRecord(
                id=_artifact_id(execution_id, "link", clean_url),
                title=label.strip()[:200] or clean_url.rsplit("/", 1)[-1],
                kind="link",
                url=clean_url,
                execution_id=execution_id,
                step_id=step_id,
                created_at=time.time(),
            )
        )
    for url in _URL_RE.findall(text):
        clean_url = url.rstrip(".,;:")
        if clean_url in seen:
            continue
        seen.add(clean_url)
        found.append(
            ArtifactRecord(
                id=_artifact_id(execution_id, "link", clean_url),
                title=clean_url.rsplit("/", 1)[-1] or clean_url,
                kind="link",
                url=clean_url,
                execution_id=execution_id,
                step_id=step_id,
                created_at=time.time(),
            )
        )
    for path in _PATH_RE.findall(text):
        clean_path = path.strip()
        if not clean_path or clean_path in seen:
            continue
        seen.add(clean_path)
        suffix = Path(clean_path).suffix.lower()
        kind = "note" if suffix in (".md", ".txt") else "file"
        found.append(
            ArtifactRecord(
                id=_artifact_id(execution_id, kind, clean_path),
                title=Path(clean_path).name or clean_path,
                kind=kind,
                path=clean_path,
                execution_id=execution_id,
                step_id=step_id,
                created_at=time.time(),
            )
        )
    return found


def _structured_artifacts(raw: Any, execution_id: str) -> list[ArtifactRecord]:
    if not isinstance(raw, list):
        return []
    records: list[ArtifactRecord] = []
    for item in raw[:100]:
        if not isinstance(item, dict):
            continue
        url = item.get("url") or item.get("href")
        path = item.get("path")
        target = url or path or item.get("id") or item.get("title") or item.get("name")
        if not isinstance(target, str) or not target:
            continue
        kind = str(item.get("kind") or item.get("type") or "artifact")[:40]
        records.append(
            ArtifactRecord(
                id=str(item.get("id") or _artifact_id(execution_id, kind, target))[:240],
                title=str(item.get("title") or item.get("name") or Path(target).name or target)[:200],
                kind=kind,
                url=url if isinstance(url, str) else None,
                path=path if isinstance(path, str) else None,
                execution_id=execution_id,
                step_id=str(item.get("step_id")) if item.get("step_id") is not None else None,
                preview=str(item.get("preview"))[:1000] if item.get("preview") else None,
                created_at=float(item.get("created_at") or time.time()),
            )
        )
    return records


def project_task_runner_snapshot(task: TaskRecord, execution_id: str, snapshot: Any) -> TaskRecord:
    """Persist the Host's public Task Runner status as durable Kanban state."""
    raw_steps = _value(snapshot, "step_details", _value(snapshot, "tasks", []))
    if not isinstance(raw_steps, list):
        raw_steps = []

    steps: list[ExecutionStepRecord] = []
    artifacts = _structured_artifacts(_value(snapshot, "artifacts", []), execution_id)
    for position, raw in enumerate(raw_steps):
        index = _bounded_int(_value(raw, "index", position + 1), position + 1, 0, 1000)
        step_id = str(_value(raw, "id", f"{execution_id}:step:{index}"))
        title = str(_value(raw, "title", f"Step {index}"))[:300]
        summary = str(_value(raw, "result", _value(raw, "summary", "")) or "")[:8000]
        error = str(_value(raw, "error", "") or "")[:2000]
        step_artifacts = _artifacts_from_text(summary, execution_id, step_id)
        artifacts.extend(step_artifacts)
        steps.append(
            ExecutionStepRecord(
                id=step_id,
                index=index,
                title=title,
                status=_status(_value(raw, "status", "pending")),
                summary=summary,
                error=error,
                attempts=_bounded_int(_value(raw, "attempts", 0), 0, 0, 100),
                requires_approval=bool(
                    _value(raw, "requires_approval", False)
                    or _value(raw, "force_approval", False)
                ),
                artifact_ids=[item.id for item in step_artifacts],
            )
        )

    commit_hashes = [
        str(item)[:80]
        for item in (_value(snapshot, "commit_hashes", []) or [])
        if isinstance(item, str) and item
    ][:100]
    for sha in commit_hashes:
        artifacts.append(
            ArtifactRecord(
                id=_artifact_id(execution_id, "commit", sha),
                title=f"Commit {sha[:8]}",
                kind="commit",
                execution_id=execution_id,
                created_at=time.time(),
                metadata={"sha": sha},
            )
        )

    branch_name = str(_value(snapshot, "branch_name", "") or "")[:500]
    if branch_name:
        artifacts.append(
            ArtifactRecord(
                id=_artifact_id(execution_id, "branch", branch_name),
                title=branch_name,
                kind="branch",
                execution_id=execution_id,
                created_at=time.time(),
            )
        )

    summary = str(
        _value(snapshot, "summary", "")
        or _value(snapshot, "result", "")
        or _value(snapshot, "output", "")
        or ""
    )[:8000]
    if not summary:
        summary = next((step.summary for step in reversed(steps) if step.summary), "")[:8000]
    artifacts.extend(_artifacts_from_text(summary, execution_id))
    unique_artifacts = {item.id: item for item in artifacts}
    artifacts = list(unique_artifacts.values())

    run_status = str(_value(snapshot, "status", "") or "").lower()
    completed = sum(step.status in ("passed", "skipped") for step in steps)
    total = len(steps) or _bounded_int(_value(snapshot, "steps", 0), 0, 0, 1000)
    current_index = _bounded_int(_value(snapshot, "current_task", 0), 0, 0, max(total, 1))
    current_step = next(
        (step for step in steps if step.status in ("running", "pending")), None
    )
    progress = f"{completed} of {total}" if total else (run_status.title() or None)
    progress_detail = current_step.title if current_step else (summary.splitlines()[0][:500] if summary else None)

    verifications = [
        VerificationRecord(
            id=f"{execution_id}:verify:{step.id}",
            label=step.title,
            status=(
                "passed" if step.status in ("passed", "skipped")
                else "failed" if step.status == "failed"
                else "running" if step.status == "running"
                else "pending"
            ),
            evidence=(step.summary or step.error)[:1000],
            source="task_runner_review",
            checked_at=time.time() if step.status in ("passed", "failed", "skipped") else None,
            artifact_ids=step.artifact_ids,
        )
        for step in steps
    ]

    tokens_used = _bounded_int(_value(snapshot, "tokens_used", 0), 0, 0, 2_000_000_000)
    replan_count = _bounded_int(_value(snapshot, "replan_count", 0), 0, 0, 1000)
    executions = []
    updated_execution = None
    for execution in task.executions:
        if execution.id != execution_id:
            executions.append(execution)
            continue
        updated_execution = replace(
            execution,
            progress=progress,
            progress_detail=progress_detail,
            summary=summary or execution.summary,
            steps=steps,
            artifacts=artifacts,
            verifications=verifications,
            tokens_used=tokens_used,
            replan_count=replan_count,
            commit_hashes=commit_hashes,
            branch_name=branch_name,
        )
        executions.append(updated_execution)

    goal = task.goal
    total_tokens = sum(int(getattr(item, "tokens_used", 0) or 0) for item in executions)
    needs_input = run_status in ("needs_input", "awaiting_input", "awaiting_approval", "blocked")
    needs_input = needs_input or any(
        step.requires_approval and step.status in ("pending", "running") for step in steps
    )
    if goal is not None:
        checks = goal.criteria
        if run_status in ("completed", "succeeded") and not any(step.status == "failed" for step in steps):
            evidence = (
                f"Task Runner completed {completed or total} reviewed step"
                f"{'s' if (completed or total) != 1 else ''}"
            )
            checks = [
                replace(
                    check,
                    status="passed",
                    evidence=evidence,
                    source="task_runner_review",
                    checked_at=time.time(),
                    artifact_ids=[item.id for item in artifacts],
                )
                for check in checks
            ]
        elif needs_input:
            checks = [
                replace(check, status="running" if check.status != "passed" else "passed")
                for check in checks
            ]
        goal = replace(
            goal,
            status="needs_input" if needs_input else goal.status,
            criteria=checks,
            tokens_used=total_tokens,
            stop_reason="User input or approval is required" if needs_input else goal.stop_reason,
        )

    merged = {item.id: item for item in task.artifacts}
    merged.update({item.id: item for item in artifacts})
    return replace(
        task,
        executions=executions,
        artifacts=list(merged.values())[-300:],
        goal=goal,
        updated_at=time.time(),
    )


def project_execution_summary(task: TaskRecord, execution_id: str, summary: str | None) -> TaskRecord:
    """Extract durable link/file references from a Chat or Autopilot result."""
    if not summary:
        return task
    artifacts = _artifacts_from_text(summary, execution_id)
    if not artifacts:
        return task
    artifact_map = {item.id: item for item in task.artifacts}
    artifact_map.update({item.id: item for item in artifacts})
    executions = []
    for execution in task.executions:
        if execution.id != execution_id:
            executions.append(execution)
            continue
        execution_artifacts = {item.id: item for item in execution.artifacts}
        execution_artifacts.update({item.id: item for item in artifacts})
        executions.append(replace(execution, artifacts=list(execution_artifacts.values())))
    return replace(task, executions=executions, artifacts=list(artifact_map.values())[-300:])


def _close_unverified_checks(
    checks: Iterable[VerificationRecord], evidence: str, checked_at: float
) -> list[VerificationRecord]:
    """Ensure a terminal run never leaves verification rows looking live."""
    return [
        check
        if check.status == "passed"
        else replace(
            check,
            status="unknown",
            evidence=evidence[:1000],
            source="execution_outcome",
            checked_at=checked_at,
        )
        for check in checks
    ]


def finalize_goal(task: TaskRecord, execution: Any, outcome: str, error: str | None) -> GoalRecord | None:
    goal = task.goal
    if goal is None:
        return None
    now = time.time()
    checks_passed = bool(goal.criteria) and all(
        check.status == "passed" for check in goal.criteria if check.required
    )
    if outcome == "succeeded" and checks_passed:
        return replace(goal, status="achieved", achieved_at=now, stop_reason="All required checks passed")
    if outcome == "succeeded":
        return replace(
            goal,
            status="needs_review",
            criteria=_close_unverified_checks(
                goal.criteria, "The run finished without conclusive verification evidence", now
            ),
            stop_reason="The run finished, but required checks still need review",
        )
    if outcome == "cancelled":
        if goal.status in ("paused", "budget_exhausted"):
            return replace(
                goal,
                criteria=_close_unverified_checks(
                    goal.criteria, error or goal.stop_reason or "Execution paused", now
                ),
            )
        return replace(
            goal,
            status="cancelled",
            criteria=_close_unverified_checks(
                goal.criteria, error or "Execution cancelled before verification", now
            ),
            stop_reason=error or "Execution cancelled",
        )

    failure = str(error or getattr(execution, "error", "") or getattr(execution, "summary", "") or "Execution failed")[:500]
    repeated = goal.repeated_failures + 1 if failure == goal.last_failure else 1
    criteria = _close_unverified_checks(goal.criteria, f"Not verified: {failure}", now)
    may_retry = goal.mode == "loop" and goal.attempts < goal.max_attempts and repeated < 2
    if may_retry:
        return replace(
            goal,
            status="working",
            criteria=criteria,
            stop_reason=f"Attempt {goal.attempts} failed; preparing the next bounded attempt",
            last_failure=failure,
            repeated_failures=repeated,
        )
    reason = (
        "The same failure repeated; automatic looping paused"
        if repeated >= 2 and goal.pause_on_no_progress
        else "The goal reached its attempt limit"
        if goal.attempts >= goal.max_attempts
        else failure
    )
    return replace(
        goal,
        status="blocked",
        criteria=criteria,
        stop_reason=reason[:500],
        last_failure=failure,
        repeated_failures=repeated,
    )


def build_result_packet(task: TaskRecord, execution: Any, outcome: str) -> ResultPacket:
    goal = task.goal
    verification = list(goal.criteria if goal is not None else getattr(execution, "verifications", []))
    required = [check for check in verification if check.required]
    verified = bool(required) and all(check.status == "passed" for check in required)
    if outcome == "failed":
        status = "failed"
    elif outcome == "cancelled":
        status = "paused"
    elif verified:
        status = "verified"
    else:
        status = "needs_review"

    summary = str(
        getattr(execution, "summary", "")
        or getattr(execution, "progress_detail", "")
        or getattr(execution, "error", "")
        or ("The requested goal was verified." if verified else "The agent run finished.")
    ).strip()[:8000]
    artifacts = list(getattr(execution, "artifacts", []))
    risks = [check.label for check in required if check.status == "failed"]
    if getattr(execution, "error", None):
        risks.insert(0, str(execution.error)[:500])
    next_actions = (
        ["Review the evidence and accept the result", "Continue the goal with another instruction"]
        if status == "verified"
        else ["Review the unverified checks", "Give the agent a corrective instruction"]
        if status == "needs_review"
        else ["Inspect the stop reason", "Adjust the goal or continue with a new instruction"]
    )
    changed_files = len([item for item in artifacts if item.kind in ("file", "change", "commit")])
    return ResultPacket(
        status=status,
        summary=summary,
        verification=verification,
        artifact_ids=[item.id for item in artifacts],
        risks=risks[:8],
        next_actions=next_actions,
        changed_files=changed_files,
        created_at=time.time(),
    )


def should_continue_goal(task: TaskRecord) -> bool:
    return bool(
        task.goal
        and task.goal.mode == "loop"
        and task.goal.status == "working"
        and task.status != "running"
        and task.goal.attempts < task.goal.max_attempts
        and task.goal.repeated_failures < 2
    )


def goal_run_blocker(task: TaskRecord, now: float | None = None) -> str | None:
    """Return why another loop attempt is forbidden by its durable limits."""
    goal = task.goal
    if goal is None or goal.mode != "loop":
        return None
    if goal.status == "achieved":
        return "This goal is already achieved"
    if goal.attempts >= goal.max_attempts:
        return f"Goal attempt limit reached ({goal.attempts}/{goal.max_attempts})"
    if goal.token_budget and goal.tokens_used >= goal.token_budget:
        return f"Goal token budget exhausted ({goal.tokens_used:,}/{goal.token_budget:,})"
    at = time.time() if now is None else now
    if goal.started_at and goal.max_minutes and at - goal.started_at >= goal.max_minutes * 60:
        return f"Goal time budget exhausted ({goal.max_minutes} minutes)"
    return None
