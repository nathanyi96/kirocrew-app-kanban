"""Persistent Kanban data contracts."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ArtifactRecord:
    """A durable output produced by one agent execution."""

    id: str
    title: str
    kind: str = "link"
    url: str | None = None
    path: str | None = None
    execution_id: str | None = None
    step_id: str | None = None
    preview: str | None = None
    created_at: float = 0.0
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass
class VerificationRecord:
    """One observable check used to decide whether an outcome is complete."""

    id: str
    label: str
    status: str = "pending"
    evidence: str = ""
    source: str = ""
    required: bool = True
    checked_at: float | None = None
    artifact_ids: list[str] = field(default_factory=list)


@dataclass
class ExecutionStepRecord:
    """A projected Host Task Runner step, retained after the run disappears."""

    id: str
    index: int
    title: str
    status: str = "pending"
    summary: str = ""
    error: str = ""
    attempts: int = 0
    requires_approval: bool = False
    artifact_ids: list[str] = field(default_factory=list)


@dataclass
class ResultPacket:
    """Outcome-first completion payload shown instead of a raw transcript."""

    status: str = "pending"
    summary: str = ""
    verification: list[VerificationRecord] = field(default_factory=list)
    artifact_ids: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    next_actions: list[str] = field(default_factory=list)
    changed_files: int = 0
    created_at: float = 0.0


@dataclass
class GoalRecord:
    """A bounded, durable contract for running until an outcome is verified."""

    objective: str
    mode: str = "one_run"
    status: str = "ready"
    criteria: list[VerificationRecord] = field(default_factory=list)
    max_attempts: int = 3
    max_minutes: int = 60
    token_budget: int = 50000
    attempts: int = 0
    tokens_used: int = 0
    started_at: float | None = None
    achieved_at: float | None = None
    stop_reason: str = ""
    last_failure: str = ""
    repeated_failures: int = 0
    pause_on_approval: bool = True
    pause_on_ambiguity: bool = True
    pause_on_no_progress: bool = True


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
    steps: list[ExecutionStepRecord] = field(default_factory=list)
    artifacts: list[ArtifactRecord] = field(default_factory=list)
    verifications: list[VerificationRecord] = field(default_factory=list)
    tokens_used: int = 0
    replan_count: int = 0
    commit_hashes: list[str] = field(default_factory=list)
    branch_name: str = ""
    stop_reason: str = ""


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
    goal: GoalRecord | None = None
    artifacts: list[ArtifactRecord] = field(default_factory=list)
    result_packet: ResultPacket | None = None
