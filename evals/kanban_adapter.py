"""Drive one prepared benchmark workspace through the real Kanban HTTP API."""

from __future__ import annotations

import json
import math
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from .models import BenchmarkSuite, EvalConfigError


TERMINAL_GOAL_STATUSES = {
    "achieved",
    "blocked",
    "budget_exhausted",
    "cancelled",
    "needs_input",
    "needs_review",
    "paused",
}


class KanbanApiError(RuntimeError):
    """The local Kanban API refused or could not complete a request."""


@dataclass(frozen=True)
class KanbanRunResult:
    task_id: str
    status: str
    goal_status: str
    success: bool
    error: str
    attempts: int
    tokens_used: int
    duration_seconds: float
    task: dict[str, Any]


def build_task_payload(
    suite: BenchmarkSuite,
    instance: dict[str, Any],
    workspace: Path,
    *,
    loop_attempts: int,
    token_budget: int,
) -> dict[str, Any]:
    instance_id = instance.get("instance_id")
    problem = instance.get("problem_statement")
    if not isinstance(instance_id, str) or not instance_id:
        raise EvalConfigError("benchmark row has no instance_id")
    if not isinstance(problem, str) or not problem.strip():
        raise EvalConfigError(f"benchmark task {instance_id} has no problem_statement")
    if loop_attempts < 1 or loop_attempts > 10:
        raise EvalConfigError("loop_attempts must be between 1 and 10")
    evaluation_contract = (
        f"{problem.strip()}\n\n"
        "Evaluation contract: work only in the prepared repository. Do not edit "
        "tests or benchmark metadata to make the task appear solved. Implement the "
        "requested behavior, run relevant checks when practical, and leave all "
        "solution changes in the workspace for the external evaluator."
    )
    max_minutes = max(1, math.ceil(suite.timeout_seconds / 60))
    return {
        "title": f"[eval] {instance_id}"[:240],
        "prompt": evaluation_contract,
        "engine": "task_runner",
        "tags": ["external-eval", suite.benchmark],
        "metadata": {
            "workspace_dir": str(workspace.resolve()),
            "eval_suite": suite.id,
            "benchmark": suite.benchmark,
            "instance_id": instance_id,
            "dataset_revision": suite.revision,
        },
        "goal": {
            "mode": "loop",
            "criteria": [
                "The requested behavior is implemented in the prepared workspace",
                "Relevant existing behavior remains intact",
                "The final workspace contains a reviewable solution patch",
            ],
            "max_attempts": loop_attempts,
            "max_minutes": max_minutes,
            "token_budget": token_budget,
        },
    }


def _mint_local_cookie(base_url: str) -> str:
    try:
        from kiro_crew.dashboard.token_auth import generate_token
    except ImportError as exc:
        raise KanbanApiError(
            "No auth cookie was supplied and KiroCrew is not importable. Set "
            "KANBAN_AUTH_COOKIE or run this command from the KiroCrew environment."
        ) from exc
    parsed = urlsplit(base_url)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    token = generate_token("kanban-evals", ttl_seconds=12 * 60 * 60, register_nonce=False)
    return f"mc_token_{port}={token}"


class KanbanClient:
    def __init__(self, base_url: str, cookie: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.cookie = cookie or os.environ.get("KANBAN_AUTH_COOKIE") or _mint_local_cookie(
            self.base_url
        )

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        request = urllib.request.Request(self.base_url + path, method=method)
        request.add_header("Cookie", self.cookie)
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, data=data, timeout=30) as response:
                payload = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            try:
                message = json.loads(raw).get("error", raw)
            except json.JSONDecodeError:
                message = raw
            raise KanbanApiError(f"Kanban API {method} {path} returned {exc.code}: {message}") from exc
        except (OSError, urllib.error.URLError) as exc:
            raise KanbanApiError(f"Kanban API {method} {path} failed: {exc}") from exc
        if not payload:
            return {}
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise KanbanApiError(f"Kanban API returned malformed JSON for {path}") from exc
        if not isinstance(parsed, dict):
            raise KanbanApiError(f"Kanban API returned a non-object for {path}")
        return parsed

    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/apps/kanban/tasks", payload)

    def preflight(self) -> None:
        tasks = self._request("GET", "/api/apps/kanban/tasks")
        if not isinstance(tasks.get("tasks"), list):
            raise KanbanApiError("Kanban app is enabled but returned an invalid task list")
        task_runner = self._request("GET", "/api/taskrunner")
        if task_runner.get("available") is not True:
            raise KanbanApiError(
                "KiroCrew Task Runner is not available; enable it before running external evals"
            )

    def run_task(self, task_id: str) -> dict[str, Any]:
        return self._request("POST", f"/api/apps/kanban/tasks/{task_id}/run", {})

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        payload = self._request("GET", "/api/apps/kanban/tasks")
        tasks = payload.get("tasks", [])
        if not isinstance(tasks, list):
            raise KanbanApiError("Kanban task list has an invalid shape")
        return next(
            (task for task in tasks if isinstance(task, dict) and task.get("id") == task_id),
            None,
        )

    def pause_goal(self, task_id: str) -> None:
        self._request(
            "POST",
            f"/api/apps/kanban/tasks/{task_id}/goal/action",
            {"action": "pause"},
        )


def _run_result(task: dict[str, Any], started: float) -> KanbanRunResult:
    goal = task.get("goal") if isinstance(task.get("goal"), dict) else {}
    executions = task.get("executions") if isinstance(task.get("executions"), list) else []
    latest = executions[-1] if executions and isinstance(executions[-1], dict) else {}
    status = str(task.get("status", ""))
    goal_status = str(goal.get("status", ""))
    error = str(latest.get("error") or goal.get("stop_reason") or "")
    return KanbanRunResult(
        task_id=str(task.get("id", "")),
        status=status,
        goal_status=goal_status,
        success=status == "done",
        error=error,
        attempts=int(goal.get("attempts", len(executions)) or 0),
        tokens_used=int(goal.get("tokens_used", 0) or 0),
        duration_seconds=max(0.0, time.monotonic() - started),
        task=task,
    )


def run_prepared_task(
    client: KanbanClient,
    payload: dict[str, Any],
    *,
    timeout_seconds: int,
    poll_seconds: float = 2.0,
) -> KanbanRunResult:
    created = client.create_task(payload)
    task_id = created.get("id")
    if not isinstance(task_id, str) or not task_id:
        raise KanbanApiError("Kanban create response has no task id")
    client.run_task(task_id)
    started = time.monotonic()
    deadline = started + timeout_seconds
    while time.monotonic() < deadline:
        task = client.get_task(task_id)
        if task is None:
            raise KanbanApiError(f"Kanban task {task_id} disappeared")
        goal = task.get("goal") if isinstance(task.get("goal"), dict) else {}
        status = task.get("status")
        goal_status = goal.get("status")
        if status in ("done", "failed") or goal_status in TERMINAL_GOAL_STATUSES:
            return _run_result(task, started)
        time.sleep(max(0.1, poll_seconds))

    try:
        client.pause_goal(task_id)
    except KanbanApiError:
        pass
    task = client.get_task(task_id) or created
    result = _run_result(task, started)
    return KanbanRunResult(
        **{
            **result.__dict__,
            "success": False,
            "error": result.error or f"Kanban run timed out after {timeout_seconds} seconds",
        }
    )
