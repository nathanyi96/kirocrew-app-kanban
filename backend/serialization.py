"""JSON boundary helpers for Kanban records."""

from dataclasses import asdict
from typing import Any


def task_to_dict(task: Any) -> dict[str, Any]:
    return asdict(task)
