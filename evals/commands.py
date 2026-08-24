"""Construct exact, shell-free commands for the official benchmark evaluators."""

from __future__ import annotations

import shlex
import sys
from pathlib import Path

from .models import BenchmarkSuite


def _instances(task_ids: tuple[str, ...]) -> list[str]:
    values: list[str] = []
    for task_id in task_ids:
        values.extend(("-i", task_id))
    return values


def materialize_command(suite: BenchmarkSuite, output_root: Path) -> list[str] | None:
    """Return the local-dataset command needed for an immutable SWE-bench pin."""
    if suite.benchmark != "swebench":
        return None
    return [
        sys.executable,
        "-m",
        "evals",
        "materialize",
        "--suite",
        suite.id,
        "--output-dir",
        str(output_root),
    ]


def gold_command(
    suite: BenchmarkSuite,
    output_root: Path,
    *,
    modal: bool = False,
) -> list[str]:
    if suite.benchmark == "swebench":
        command = [
            "swebench",
            "eval",
            str(suite.materialized_dataset_path(output_root)),
            "--gold",
            "--run-id",
            f"{suite.id}-gold",
            "--workers",
            str(suite.workers),
            "--timeout",
            str(suite.timeout_seconds),
            "--report-dir",
            str(output_root / "official-reports" / suite.id / "gold"),
            *_instances(suite.task_ids),
        ]
        if modal:
            command.append("--modal")
        return command
    return [
        "fb",
        "eval",
        "--predictions-path",
        "gold",
        "--dataset",
        suite.dataset,
        "--data-version",
        suite.revision,
        "--split",
        suite.split,
        "--n-concurrent",
        str(suite.workers),
        "--timeout",
        str(suite.timeout_seconds),
        "--task-id",
        *suite.task_ids,
    ]


def candidate_command(
    suite: BenchmarkSuite,
    output_root: Path,
    predictions: Path | None = None,
    *,
    run_id: str = "kanban",
    modal: bool = False,
) -> list[str]:
    prediction_path = predictions or suite.predictions_path(output_root)
    if suite.benchmark == "swebench":
        command = [
            "swebench",
            "eval",
            str(suite.materialized_dataset_path(output_root)),
            "--predictions",
            str(prediction_path),
            "--run-id",
            run_id,
            "--workers",
            str(suite.workers),
            "--timeout",
            str(suite.timeout_seconds),
            "--report-dir",
            str(output_root / "official-reports" / suite.id / "candidate"),
            *_instances(suite.task_ids),
        ]
        if modal:
            command.append("--modal")
        return command
    return [
        "fb",
        "eval",
        "--predictions-path",
        str(prediction_path),
        "--dataset",
        suite.dataset,
        "--data-version",
        suite.revision,
        "--split",
        suite.split,
        "--n-concurrent",
        str(suite.workers),
        "--timeout",
        str(suite.timeout_seconds),
        "--include-failed",
        "--task-id",
        *suite.task_ids,
    ]


def command_plan(
    suite: BenchmarkSuite,
    output_root: Path,
    predictions: Path | None = None,
    *,
    run_id: str = "kanban",
    modal: bool = False,
) -> dict[str, object]:
    prepare = materialize_command(suite, output_root)
    report_paths = (
        {
            "gold": str(output_root / "official-reports" / suite.id / "gold"),
            "candidate": str(output_root / "official-reports" / suite.id / "candidate"),
        }
        if suite.benchmark == "swebench"
        else {
            "gold": str(
                output_root
                / "official-reports"
                / suite.id
                / "gold"
                / "runs"
                / "gold"
                / "report.json"
            ),
            "candidate": str((predictions or suite.predictions_path(output_root)).parent / "report.json"),
        }
    )
    working_directories = {
        "gold": str(
            output_root / "official-reports" / suite.id / "gold"
            if suite.benchmark == "featurebench"
            else Path(".")
        ),
        "candidate": ".",
    }
    return {
        "suite": suite.id,
        "benchmark": suite.benchmark,
        "dataset": suite.dataset,
        "revision": suite.revision,
        "task_count": len(suite.task_ids),
        "report_paths": report_paths,
        "working_directories": working_directories,
        "materialize": prepare,
        "gold": gold_command(suite, output_root, modal=modal),
        "candidate": candidate_command(
            suite,
            output_root,
            predictions,
            run_id=run_id,
            modal=modal,
        ),
    }


def shell_command(command: list[str] | None) -> str | None:
    """Render a display-only command; execution always uses argv directly."""
    return shlex.join(command) if command else None
