"""Execute the benchmark authors' evaluator CLIs without a shell."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any

from .commands import candidate_command, gold_command
from .dataset import materialize_suite
from .models import BenchmarkSuite


def run_official_evaluator(
    suite: BenchmarkSuite,
    output_root: Path,
    *,
    gold: bool,
    predictions: Path | None = None,
    run_id: str = "kanban",
    modal: bool = False,
) -> dict[str, Any]:
    """Run one official evaluator and return its command and report location."""
    root = output_root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    candidate_path = (
        predictions.expanduser().resolve()
        if predictions is not None
        else suite.predictions_path(root)
    )
    command = (
        gold_command(suite, root, modal=modal)
        if gold
        else candidate_command(
            suite,
            root,
            candidate_path,
            run_id=run_id,
            modal=modal,
        )
    )
    if shutil.which(command[0]) is None:
        package = "SWE-bench" if suite.benchmark == "swebench" else "FeatureBench"
        raise RuntimeError(f"{command[0]!r} is not installed; install the official {package} CLI")
    if not gold and not candidate_path.is_file():
        raise RuntimeError(f"candidate predictions do not exist: {candidate_path}")
    if suite.benchmark == "swebench":
        materialize_suite(suite, root)

    working_directory = root
    if suite.benchmark == "featurebench" and gold:
        working_directory = root / "official-reports" / suite.id / "gold"
        working_directory.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(command, cwd=working_directory, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"official {suite.benchmark} evaluator exited with status {completed.returncode}"
        )

    if suite.benchmark == "featurebench":
        report_location = (
            working_directory / "runs" / "gold" / "report.json"
            if gold
            else candidate_path.parent / "report.json"
        )
    else:
        report_location = (
            root
            / "official-reports"
            / suite.id
            / ("gold" if gold else "candidate")
        )
    return {
        "suite": suite.id,
        "benchmark": suite.benchmark,
        "mode": "gold" if gold else "candidate",
        "command": command,
        "report_location": str(report_location),
    }
