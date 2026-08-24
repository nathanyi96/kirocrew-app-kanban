"""Normalize official evaluator reports and compare harness runs."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import BenchmarkSuite, EvalConfigError


def _load_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise EvalConfigError(f"could not read report {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise EvalConfigError(f"report {path} is not valid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise EvalConfigError(f"report {path} must contain an object")
    return value


def normalize_report(suite: BenchmarkSuite, source: Path) -> dict[str, Any]:
    raw = _load_object(source)
    expected = len(suite.task_ids)
    if suite.benchmark == "swebench":
        resolved_ids = raw.get("resolved_ids", [])
        unresolved_ids = raw.get("unresolved_ids", [])
        error_ids = raw.get("error_ids", [])
        empty_ids = raw.get("empty_patch_ids", [])
        for label, values in (
            ("resolved_ids", resolved_ids),
            ("unresolved_ids", unresolved_ids),
            ("error_ids", error_ids),
            ("empty_patch_ids", empty_ids),
        ):
            if not isinstance(values, list):
                raise EvalConfigError(f"SWE-bench report has malformed {label}")
        resolved = len(set(resolved_ids).intersection(suite.task_ids))
        submitted_ids = raw.get("submitted_ids", [])
        submitted = (
            len(set(submitted_ids).intersection(suite.task_ids))
            if isinstance(submitted_ids, list)
            else int(raw.get("submitted_instances", 0) or 0)
        )
        attempts = [
            {
                "attempt": 1,
                "expected": expected,
                "submitted": submitted,
                "completed": int(raw.get("completed_instances", 0) or 0),
                "resolved": resolved,
                "errors": len(error_ids),
                "empty_patches": len(empty_ids),
                "resolved_rate": round(resolved / expected, 4),
                "pass_rate": None,
            }
        ]
    else:
        attempts = []
        for key in sorted(raw):
            item = raw[key]
            if not key.startswith("attempt_") or not isinstance(item, dict):
                continue
            attempt = int(item.get("n_attempt", key.removeprefix("attempt_")) or 1)
            resolved = int(item.get("resolved_instances", 0) or 0)
            attempts.append(
                {
                    "attempt": attempt,
                    "expected": expected,
                    "submitted": int(item.get("submitted_instances", 0) or 0),
                    "completed": int(item.get("completed_instances", 0) or 0),
                    "resolved": resolved,
                    "errors": int(item.get("error_instances", 0) or 0),
                    "empty_patches": int(
                        item.get("not_applied_patch_empty_instances", 0) or 0
                    ),
                    "resolved_rate": round(resolved / expected, 4),
                    "pass_rate": float(item.get("pass_rate", 0.0) or 0.0),
                }
            )
        if not attempts:
            raise EvalConfigError("FeatureBench report has no attempt summaries")

    return {
        "schema_version": 1,
        "suite": suite.id,
        "benchmark": suite.benchmark,
        "dataset": suite.dataset,
        "revision": suite.revision,
        "source_report": str(source.resolve()),
        "attempts": attempts,
    }


def compare_reports(baseline: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    for field in ("suite", "benchmark", "dataset", "revision"):
        if baseline.get(field) != candidate.get(field):
            raise EvalConfigError(f"baseline and candidate must use the same {field}")
    baseline_attempts = baseline.get("attempts")
    candidate_attempts = candidate.get("attempts")
    if not isinstance(baseline_attempts, list) or not baseline_attempts:
        raise EvalConfigError("baseline has no normalized attempts")
    if not isinstance(candidate_attempts, list) or not candidate_attempts:
        raise EvalConfigError("candidate has no normalized attempts")
    before = baseline_attempts[0]
    after = candidate_attempts[0]
    if not isinstance(before, dict) or not isinstance(after, dict):
        raise EvalConfigError("normalized attempt entries must be objects")

    def delta(field: str) -> float | None:
        left = before.get(field)
        right = after.get(field)
        if not isinstance(left, (int, float)) or not isinstance(right, (int, float)):
            return None
        return round(float(right) - float(left), 4)

    return {
        "schema_version": 1,
        "suite": candidate.get("suite"),
        "baseline": before,
        "candidate": after,
        "delta": {
            "resolved": delta("resolved"),
            "resolved_rate": delta("resolved_rate"),
            "pass_rate": delta("pass_rate"),
            "errors": delta("errors"),
            "empty_patches": delta("empty_patches"),
        },
    }


def load_normalized(path: Path) -> dict[str, Any]:
    value = _load_object(path)
    if value.get("schema_version") != 1 or not isinstance(value.get("attempts"), list):
        raise EvalConfigError(f"{path} is not a normalized eval report")
    return value
