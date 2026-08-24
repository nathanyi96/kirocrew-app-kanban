"""Task Runner request shaping and host capability checks."""

from __future__ import annotations

from typing import Any


def task_runner_spec(task: Any, prompt: str) -> str:
    return (
        f"# {task.title}\n\n"
        "## Goal\n"
        f"{prompt.strip() or task.title}\n\n"
        "## Steps\n"
        "1. Work through the requested goal and any required sub-tasks.\n"
        "2. Verify the result and summarize what was completed.\n"
    )


def task_runner_is_available(state: Any) -> bool:
    runner = getattr(state, "task_runner", None)
    return runner is not None and callable(getattr(runner, "start_background", None))


TASK_RUNNER_NOT_ENABLED_MESSAGE = (
    "This task was classified for Task Runner, but Task Runner is not enabled "
    "on this Host. Open Task Runner to enable it, then retry this task."
)


def task_runner_not_enabled_payload() -> dict[str, Any]:
    return {"error": TASK_RUNNER_NOT_ENABLED_MESSAGE, "code": "task_runner_not_enabled", "engine": "task_runner", "action": {"label": "Open Task Runner", "path": "/projects"}}
