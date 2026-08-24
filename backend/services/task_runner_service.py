"""Task Runner request shaping and host capability checks."""

from __future__ import annotations

from typing import Any


def task_runner_spec(task: Any, prompt: str) -> str:
    goal = getattr(task, "goal", None)
    objective = getattr(goal, "objective", "") or prompt.strip() or task.title
    latest_instruction = ""
    if goal is not None and prompt.strip() and prompt.strip() != objective.strip():
        latest_instruction = f"\n## Latest user instruction\n{prompt.strip()[:8000]}\n"
    criteria = list(getattr(goal, "criteria", []) or [])
    checks = "\n".join(
        f"- {getattr(check, 'label', str(check))}" for check in criteria
    ) or "- The requested outcome is complete and relevant checks pass"
    previous = ""
    executions = list(getattr(task, "executions", []) or [])
    if len(executions) > 1:
        prior = executions[-2]
        prior_text = getattr(prior, "error", None) or getattr(prior, "summary", None)
        if prior_text:
            previous = (
                "\n## Previous attempt\n"
                f"The prior bounded attempt ended with:\n{str(prior_text)[:2000]}\n"
                "Address that evidence; do not repeat the same failing approach.\n"
            )
    limits = ""
    if goal is not None:
        limits = (
            "\n## Run contract\n"
            f"This is bounded attempt {getattr(goal, 'attempts', 0)} of {getattr(goal, 'max_attempts', 3)}. "
            f"The overall goal budget is {getattr(goal, 'max_minutes', 60)} minutes and "
            f"{getattr(goal, 'token_budget', 50000)} tokens.\n"
        )
    return (
        f"# {task.title}\n\n"
        "## Goal\n"
        f"{objective}\n\n"
        "## Done means\n"
        f"{checks}\n"
        f"{limits}{previous}{latest_instruction}\n"
        "## Required execution plan\n"
        "1. Inspect the current state and choose the smallest safe plan that can satisfy the goal.\n"
        "2. Implement the requested outcome in bounded, reviewable steps.\n"
        "3. Verify every acceptance criterion with deterministic checks where possible.\n"
        "4. Collect produced files, links, commits, and other artifacts.\n"
        "5. Finish only when the criteria are supported by evidence; otherwise report the blocker.\n"
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
