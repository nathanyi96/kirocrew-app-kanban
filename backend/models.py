"""Persistent Kanban data contracts."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExecutionRecord:
    id: str
    started_at: float
    ended_at: float | None = None
    session_key: str | None = None
    result: str | None = None
    error: str | None = None
    engine: str = "chat"
    runner_id: str | None = None
    progress: str | None = None
    progress_detail: str | None = None
    summary: str | None = None


@dataclass
class ActivityRecord:
    id: str
    at: float
    kind: str
    summary: str
    execution_id: str | None = None


@dataclass
class TaskRecord:
    id: str
    title: str
    description: str = ""
    prompt: str = ""
    status: str = "todo"
    created_at: float = 0.0
    updated_at: float = 0.0
    executions: list[ExecutionRecord] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    priority: str = "medium"
    refining: bool = False
    engine: str = "auto"
    active_engine: str | None = None
    assignee: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)
    activity: list[ActivityRecord] = field(default_factory=list)
