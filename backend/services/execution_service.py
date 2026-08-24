"""Small execution lifecycle predicates shared by board services."""

from __future__ import annotations

from typing import Any


def result_label(result: str | None) -> str:
    return {"succeeded": "Succeeded", "failed": "Failed", "cancelled": "Cancelled"}.get(result or "", "Running")


def is_terminal(execution: Any) -> bool:
    return bool(getattr(execution, "result", None))
