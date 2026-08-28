"""Pure Kanban task state transitions."""

from __future__ import annotations

import time
import uuid
import importlib.util
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any

try:
    from ..models import ActivityRecord, ExecutionRecord, TaskRecord
except ImportError:
    _spec = importlib.util.spec_from_file_location("_kanban_models", Path(__file__).resolve().parents[1] / "models.py")
    if _spec is None or _spec.loader is None:
        raise ImportError("Could not load Kanban models")
    _module = importlib.util.module_from_spec(_spec)
    sys.modules[_spec.name] = _module
    _spec.loader.exec_module(_module)
    ActivityRecord = _module.ActivityRecord
    ExecutionRecord = _module.ExecutionRecord
    TaskRecord = _module.TaskRecord

try:
    from .outcome_service import (
        begin_goal_attempt,
        build_goal,
        build_result_packet,
        configure_goal,
        finalize_goal,
        goal_run_blocker,
        mark_goal_status,
        project_execution_summary,
        project_task_runner_snapshot,
        should_continue_goal,
    )
except ImportError:
    _outcome_path = Path(__file__).with_name("outcome_service.py")
    _outcome_spec = importlib.util.spec_from_file_location("_kanban_outcome_service", _outcome_path)
    if _outcome_spec is None or _outcome_spec.loader is None:
        raise ImportError("Could not load Kanban outcome service")
    _outcome_module = importlib.util.module_from_spec(_outcome_spec)
    sys.modules[_outcome_spec.name] = _outcome_module
    _outcome_spec.loader.exec_module(_outcome_module)
    begin_goal_attempt = _outcome_module.begin_goal_attempt
    build_goal = _outcome_module.build_goal
    build_result_packet = _outcome_module.build_result_packet
    configure_goal = _outcome_module.configure_goal
    finalize_goal = _outcome_module.finalize_goal
    goal_run_blocker = _outcome_module.goal_run_blocker
    mark_goal_status = _outcome_module.mark_goal_status
    project_execution_summary = _outcome_module.project_execution_summary
    project_task_runner_snapshot = _outcome_module.project_task_runner_snapshot
    should_continue_goal = _outcome_module.should_continue_goal

TASK_STATUSES = ("backlog", "todo", "running", "done", "failed")
TASK_ENGINES = ("auto", "chat", "task_runner", "autopilot")
EXECUTION_ENGINES = ("chat", "task_runner", "autopilot")
EXECUTION_RESULTS = ("succeeded", "failed", "cancelled")
RESULT_TO_STATUS = {"succeeded": "done", "failed": "failed", "cancelled": "todo"}


def _activity(task: TaskRecord, kind: str, summary: str, execution_id: str | None = None) -> list[Any]:
    record_type = ActivityRecord
    if record_type is None:
        return list(getattr(task, "activity", []))
    return [
        *getattr(task, "activity", []),
        record_type(str(uuid.uuid4()), time.time(), kind, summary[:240], execution_id),
    ][-200:]


def create_task(title: str, description: str = "", prompt: str = "", status: str = "todo", tags: list[str] | None = None, priority: str = "medium", refining: bool = False, engine: str = "chat", goal: object | None = None) -> TaskRecord:
    now = time.time()
    return TaskRecord(
        id=str(uuid.uuid4()), title=title, description=description, prompt=prompt,
        status=status if status in TASK_STATUSES else "todo", created_at=now,
        updated_at=now, tags=tags or [],
        priority=priority if priority in ("low", "medium", "high") else "medium",
        refining=refining, engine=engine if engine in TASK_ENGINES else "chat",
        goal=goal,
        activity=[ActivityRecord(str(uuid.uuid4()), now, "created", "Task created")]
        if ActivityRecord is not None else [],
    )


def move_task(task: TaskRecord, new_status: str) -> TaskRecord:
    if new_status not in TASK_STATUSES:
        raise ValueError(f"Invalid status: {new_status!r}")
    return replace(task, status=new_status, updated_at=time.time(), activity=_activity(task, "moved", f"Moved to {new_status}"))


def start_execution(task: TaskRecord, engine: str) -> tuple[TaskRecord, ExecutionRecord]:
    if engine not in EXECUTION_ENGINES:
        raise ValueError(f"Invalid execution engine: {engine!r}")
    now = time.time()
    execution = ExecutionRecord(id=str(uuid.uuid4()), started_at=now, engine=engine)
    return replace(
        task, status="running", updated_at=now, executions=[*task.executions, execution],
        active_engine=engine, goal=begin_goal_attempt(task.goal, now),
        activity=_activity(task, "started", f"Started {engine}", execution.id),
    ), execution


def settle_execution(
    task: TaskRecord,
    execution_id: str,
    outcome: str,
    error: str | None = None,
    summary: str | None = None,
) -> TaskRecord:
    now = time.time()
    clean_summary = summary.strip()[:8000] if isinstance(summary, str) and summary.strip() else None
    task = project_execution_summary(task, execution_id, clean_summary)
    latest_unsettled = next((ex.id for ex in reversed(task.executions) if not ex.result), None)
    owns_status = latest_unsettled is None or latest_unsettled == execution_id
    executions = []
    settled_execution = None
    for ex in task.executions:
        if ex.id == execution_id:
            settled_execution = replace(
                ex,
                ended_at=now,
                result=outcome,
                error=error,
                summary=clean_summary or ex.summary,
            )
            executions.append(settled_execution)
        else:
            executions.append(ex)
    if settled_execution is None:
        return task
    intermediate = replace(
        task,
        status=RESULT_TO_STATUS.get(outcome, "failed") if owns_status else task.status,
        updated_at=now,
        executions=executions,
        goal=finalize_goal(task, settled_execution, outcome, error),
        activity=_activity(
            task,
            "settled",
            (clean_summary or settled_execution.summary or "").splitlines()[0]
            if (clean_summary or settled_execution.summary)
            else f"Execution {outcome}",
            execution_id,
        ),
    )
    return replace(
        intermediate,
        result_packet=build_result_packet(intermediate, settled_execution, outcome),
    )


def update_execution_progress(
    task: TaskRecord,
    execution_id: str,
    progress: str | None,
    progress_detail: str | None,
) -> TaskRecord:
    """Persist a Task Runner's latest concise progress without adding timeline noise."""
    executions = [
        replace(
            ex,
            progress=progress if ex.id == execution_id else ex.progress,
            progress_detail=progress_detail if ex.id == execution_id else ex.progress_detail,
        )
        for ex in task.executions
    ]
    return replace(task, updated_at=time.time(), executions=executions)


def update_execution_snapshot(task: TaskRecord, execution_id: str, snapshot: object) -> TaskRecord:
    """Project one Host Task Runner status payload into the durable card."""
    return project_task_runner_snapshot(task, execution_id, snapshot)


def attach_session_key(task: TaskRecord, execution_id: str, session_key: str) -> TaskRecord:
    return _attach(task, execution_id, session_key=session_key)


def attach_runner_id(task: TaskRecord, execution_id: str, runner_id: str) -> TaskRecord:
    return _attach(task, execution_id, runner_id=runner_id)


def _attach(task: TaskRecord, execution_id: str, *, session_key: str | None = None, runner_id: str | None = None) -> TaskRecord:
    executions = [
        replace(
            ex,
            session_key=session_key if ex.id == execution_id else ex.session_key,
            runner_id=runner_id if ex.id == execution_id else ex.runner_id,
        )
        for ex in task.executions
    ]
    return replace(task, updated_at=time.time(), executions=executions)
