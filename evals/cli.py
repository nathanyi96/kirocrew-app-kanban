"""Command-line entry point for external Kanban harness evaluations."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from .commands import command_plan, shell_command
from .dataset import load_suite_instances, materialize_suite
from .evaluator import run_official_evaluator
from .manifest import load_manifest, load_suite
from .models import EvalConfigError
from .reporting import compare_reports, load_normalized, normalize_report
from .runner import run_suite


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m evals",
        description="Run and score pinned external evals for the Kanban agent harness.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List pinned benchmark suites.")
    validate = subparsers.add_parser("validate", help="Validate the local manifest.")
    validate.add_argument(
        "--upstream",
        action="store_true",
        help="Load each pinned dataset revision and verify all selected rows.",
    )

    plan = subparsers.add_parser("plan", help="Print exact official evaluator commands.")
    plan.add_argument("--suite", required=True)
    plan.add_argument("--output-dir", type=Path, default=Path("eval-runs"))
    plan.add_argument("--predictions", type=Path)
    plan.add_argument("--run-id", default="kanban")
    plan.add_argument("--modal", action="store_true", help="Use Modal for SWE-bench evaluation.")

    materialize = subparsers.add_parser(
        "materialize",
        help="Download a revision-pinned dataset for an official evaluator.",
    )
    materialize.add_argument("--suite", required=True)
    materialize.add_argument("--output-dir", type=Path, default=Path("eval-runs"))

    run = subparsers.add_parser(
        "run",
        help="Prepare repositories, run Kanban TaskRunner, and write official predictions.",
    )
    run.add_argument("--suite", required=True)
    run.add_argument("--output-dir", type=Path, default=Path("eval-runs"))
    run.add_argument(
        "--base-url",
        default=os.environ.get("KANBAN_BASE_URL", "http://127.0.0.1:7777"),
    )
    run.add_argument("--label", default="kirocrew-kanban")
    run.add_argument("--loop-attempts", type=int, default=1)
    run.add_argument("--token-budget", type=int, default=100_000)
    run.add_argument("--timeout", type=int)
    run.add_argument("--poll-seconds", type=float, default=2.0)
    run.add_argument("--resume", action="store_true")

    evaluate = subparsers.add_parser(
        "evaluate",
        help="Execute an official gold or candidate evaluator command.",
    )
    evaluate.add_argument("--suite", required=True)
    evaluate.add_argument("--output-dir", type=Path, default=Path("eval-runs"))
    evaluate.add_argument("--predictions", type=Path)
    evaluate.add_argument("--gold", action="store_true")
    evaluate.add_argument("--run-id", default="kanban")
    evaluate.add_argument("--modal", action="store_true")

    normalize = subparsers.add_parser("normalize", help="Normalize an official report.")
    normalize.add_argument("--suite", required=True)
    normalize.add_argument("--report", type=Path, required=True)
    normalize.add_argument("--output", type=Path, required=True)

    compare = subparsers.add_parser("compare", help="Compare two normalized reports.")
    compare.add_argument("--baseline", type=Path, required=True)
    compare.add_argument("--candidate", type=Path, required=True)
    compare.add_argument("--output", type=Path)
    return parser


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "list":
            _print(
                [
                    {
                        "id": suite.id,
                        "benchmark": suite.benchmark,
                        "dataset": suite.dataset,
                        "revision": suite.revision,
                        "split": suite.split,
                        "task_count": len(suite.task_ids),
                        "selection": suite.selection,
                    }
                    for suite in load_manifest()
                ]
            )
            return 0
        if args.command == "validate":
            suites = load_manifest()
            upstream = None
            if args.upstream:
                upstream = {
                    suite.id: len(load_suite_instances(suite)) for suite in suites
                }
            _print(
                {
                    "valid": True,
                    "suite_count": len(suites),
                    "task_count": sum(len(suite.task_ids) for suite in suites),
                    "upstream_task_counts": upstream,
                }
            )
            return 0

        if args.command == "compare":
            result = compare_reports(
                load_normalized(args.baseline),
                load_normalized(args.candidate),
            )
            if args.output:
                _write_json(args.output, result)
            _print(result)
            return 0

        suite = load_suite(args.suite)
        if args.command == "plan":
            plan = command_plan(
                suite,
                args.output_dir,
                args.predictions,
                run_id=args.run_id,
                modal=args.modal,
            )
            display = {
                **plan,
                "commands": {
                    "materialize": shell_command(plan["materialize"]),
                    "gold": shell_command(plan["gold"]),
                    "candidate": shell_command(plan["candidate"]),
                },
            }
            _print(display)
            return 0
        if args.command == "materialize":
            path = materialize_suite(suite, args.output_dir)
            _print({"suite": suite.id, "dataset_path": str(path.resolve())})
            return 0
        if args.command == "run":
            result = run_suite(
                suite,
                args.output_dir,
                base_url=args.base_url,
                label=args.label,
                loop_attempts=args.loop_attempts,
                token_budget=args.token_budget,
                timeout_seconds=args.timeout,
                poll_seconds=args.poll_seconds,
                resume=args.resume,
            )
            _print(result)
            return 0
        if args.command == "evaluate":
            predictions = args.predictions
            if not args.gold and predictions is None:
                predictions = suite.predictions_path(args.output_dir)
            result = run_official_evaluator(
                suite,
                args.output_dir,
                gold=args.gold,
                predictions=predictions,
                run_id=args.run_id,
                modal=args.modal,
            )
            _print(result)
            return 0
        if args.command == "normalize":
            result = normalize_report(suite, args.report)
            _write_json(args.output, result)
            _print(result)
            return 0
    except (EvalConfigError, RuntimeError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 2
