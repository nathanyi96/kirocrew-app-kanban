"""Pure engine selection and Task Runner request shaping."""

from __future__ import annotations

from typing import Any


def resolve_engine(preference: str, prompt: str, execution_engines: tuple[str, ...]) -> str:
    if preference in execution_engines:
        return preference
    normalized = prompt.strip().lower()
    complex_markers = (
        "multi-step", "multiple steps", "step by step", "workflow", "pipeline",
        "implement", "build", "refactor", "migrate", "research", "compare",
        "deploy", "integration", "end to end", "e2e", "plan and", "then",
    )
    has_list = any(line.lstrip().startswith(("-", "*")) for line in prompt.splitlines())
    numbered_steps = sum(1 for line in prompt.splitlines() if line.lstrip()[:2].rstrip(".").isdigit())
    if len(prompt) > 280 or has_list or numbered_steps >= 2 or any(marker in normalized for marker in complex_markers):
        return "task_runner"
    return "chat"


def task_runner_spec(task: Any, prompt: str) -> str:
    return (
        f"# {task.title}\n\n"
        "## Goal\n"
        f"{prompt.strip() or task.title}\n\n"
        "## Steps\n"
        "1. Work through the requested goal and any required sub-tasks.\n"
        "2. Verify the result and summarize what was completed.\n"
    )


TASK_RUNNER_NOT_ENABLED_MESSAGE = (
    "This task was classified for Task Runner, but Task Runner is not enabled "
    "on this Host. Open Task Runner to enable it, then retry this task."
)


def task_runner_is_available(state: Any) -> bool:
    runner = getattr(state, "task_runner", None)
    return runner is not None and callable(getattr(runner, "start_background", None))


def task_runner_not_enabled_payload() -> dict[str, Any]:
    return {
        "error": TASK_RUNNER_NOT_ENABLED_MESSAGE,
        "code": "task_runner_not_enabled",
        "engine": "task_runner",
        "action": {"label": "Open Task Runner", "path": "/projects"},
    }
