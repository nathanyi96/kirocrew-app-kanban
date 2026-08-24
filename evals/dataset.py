"""Pinned Hugging Face dataset loading and task selection."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Iterable

from .models import BenchmarkSuite, EvalConfigError


def _datasets_module() -> Any:
    try:
        import datasets  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "The optional 'datasets' package is required. Install the official "
            "benchmark dependencies first (SWE-bench or FeatureBench includes it)."
        ) from exc
    return datasets


def load_pinned_dataset(suite: BenchmarkSuite) -> Any:
    datasets = _datasets_module()
    return datasets.load_dataset(
        suite.dataset,
        split=suite.split,
        revision=suite.revision,
    )


def select_instances(
    suite: BenchmarkSuite,
    rows: Iterable[dict[str, Any]],
) -> list[dict[str, Any]]:
    wanted = set(suite.task_ids)
    selected: dict[str, dict[str, Any]] = {}
    for row in rows:
        instance_id = row.get("instance_id") if isinstance(row, dict) else None
        if instance_id in wanted:
            selected[str(instance_id)] = dict(row)
    missing = [task_id for task_id in suite.task_ids if task_id not in selected]
    if missing:
        raise EvalConfigError(
            f"pinned dataset is missing {len(missing)} configured task(s): "
            + ", ".join(missing)
        )
    return [selected[task_id] for task_id in suite.task_ids]


def load_suite_instances(suite: BenchmarkSuite) -> list[dict[str, Any]]:
    dataset = load_pinned_dataset(suite)
    return validate_instances(suite, select_instances(suite, (dict(row) for row in dataset)))


def validate_instances(
    suite: BenchmarkSuite,
    instances: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Verify the pinned rows still expose everything the adapter/evaluator needs."""
    for instance in instances:
        instance_id = str(instance.get("instance_id", ""))
        for field in ("repo", "base_commit", "problem_statement"):
            value = instance.get(field)
            if not isinstance(value, str) or not value.strip():
                raise EvalConfigError(f"benchmark task {instance_id} has no usable {field}")
        for field in ("FAIL_TO_PASS", "PASS_TO_PASS"):
            value = instance.get(field)
            if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
                raise EvalConfigError(f"benchmark task {instance_id} has malformed {field}")
        if not isinstance(instance.get("patch"), str):
            raise EvalConfigError(f"benchmark task {instance_id} has no gold patch")
    return instances


def materialize_suite(suite: BenchmarkSuite, output_root: Path) -> Path:
    """Save a revision-pinned dataset for evaluators lacking a revision flag."""
    target = suite.materialized_dataset_path(output_root)
    marker = target.parent / f"{target.name}.source.json"
    expected_source = {
        "schema_version": 1,
        "suite": suite.id,
        "dataset": suite.dataset,
        "revision": suite.revision,
        "split": suite.split,
    }
    if target.exists():
        try:
            actual_source = json.loads(marker.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                f"dataset path exists without a valid revision marker: {target}; "
                "choose a new output directory"
            ) from exc
        if actual_source != expected_source:
            raise RuntimeError(
                f"dataset path {target} was materialized from a different source; "
                "choose a new output directory"
            )
        return target
    if marker.exists():
        raise RuntimeError(
            f"dataset revision marker exists without its dataset: {marker}; "
            "choose a new output directory"
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    dataset = load_pinned_dataset(suite)
    dataset.save_to_disk(str(target))
    temporary = marker.with_suffix(marker.suffix + ".tmp")
    temporary.write_text(
        json.dumps(expected_source, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, marker)
    return target
