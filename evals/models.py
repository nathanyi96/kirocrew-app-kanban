"""Typed contracts shared by the external eval CLI and adapters."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


class EvalConfigError(ValueError):
    """An eval manifest or command input is invalid."""


@dataclass(frozen=True)
class BenchmarkSuite:
    id: str
    benchmark: str
    dataset: str
    revision: str
    split: str
    task_ids: tuple[str, ...]
    attempts: int
    timeout_seconds: int
    workers: int
    source_url: str
    license: str
    selection: str

    @classmethod
    def from_dict(cls, raw: Any) -> "BenchmarkSuite":
        if not isinstance(raw, dict):
            raise EvalConfigError("each suite must be an object")
        required_strings = (
            "id",
            "benchmark",
            "dataset",
            "revision",
            "split",
            "source_url",
            "license",
            "selection",
        )
        strings: dict[str, str] = {}
        for key in required_strings:
            value = raw.get(key)
            if not isinstance(value, str) or not value.strip():
                raise EvalConfigError(f"suite field {key!r} must be a non-empty string")
            strings[key] = value.strip()

        task_ids = raw.get("task_ids")
        if (
            not isinstance(task_ids, list)
            or not task_ids
            or not all(isinstance(item, str) and item.strip() for item in task_ids)
        ):
            raise EvalConfigError("suite task_ids must be a non-empty string list")
        clean_ids = tuple(item.strip() for item in task_ids)
        if len(set(clean_ids)) != len(clean_ids):
            raise EvalConfigError(f"suite {strings['id']!r} repeats a task id")

        limits = raw.get("limits")
        if not isinstance(limits, dict):
            raise EvalConfigError("suite limits must be an object")
        numbers: dict[str, int] = {}
        for key in ("attempts", "timeout_seconds", "workers"):
            value = limits.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                raise EvalConfigError(f"suite limit {key!r} must be a positive integer")
            numbers[key] = value

        benchmark = strings["benchmark"]
        if benchmark not in ("swebench", "featurebench"):
            raise EvalConfigError(f"unsupported benchmark {benchmark!r}")
        revision = strings["revision"]
        if len(revision) != 40 or any(char not in "0123456789abcdef" for char in revision):
            raise EvalConfigError(
                f"suite {strings['id']!r} must pin an immutable 40-character revision"
            )
        if benchmark == "featurebench" and any(
            not task_id.endswith(".lv1") for task_id in clean_ids
        ):
            raise EvalConfigError("FeatureBench gold validation currently requires lv1 tasks")

        return cls(
            **strings,
            task_ids=clean_ids,
            **numbers,
        )

    def materialized_dataset_path(self, root: Path) -> Path:
        return root / "datasets" / self.id

    def predictions_path(self, root: Path) -> Path:
        filename = "predictions.jsonl" if self.benchmark == "swebench" else "output.jsonl"
        return root / self.id / filename
