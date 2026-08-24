"""End-to-end Kanban inference runner for a pinned external benchmark suite."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .dataset import load_suite_instances
from .kanban_adapter import KanbanClient, build_task_payload, run_prepared_task
from .models import BenchmarkSuite
from .workspace import collect_patch, prepare_workspace


def _read_jsonl(path: Path) -> dict[str, dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    if not path.exists():
        return records
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        value = json.loads(line)
        if isinstance(value, dict) and isinstance(value.get("instance_id"), str):
            records[value["instance_id"]] = value
    return records


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _write_jsonl(path: Path, records: dict[str, dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    ordered = "".join(
        json.dumps(records[key], sort_keys=True) + "\n" for key in sorted(records)
    )
    temporary.write_text(ordered, encoding="utf-8")
    os.replace(temporary, path)


def prediction_record(
    suite: BenchmarkSuite,
    instance: dict[str, Any],
    patch: str,
    *,
    label: str,
    success: bool,
    error: str,
) -> dict[str, Any]:
    instance_id = str(instance["instance_id"])
    if suite.benchmark == "swebench":
        return {
            "instance_id": instance_id,
            "model_patch": patch,
            "model_name_or_path": label,
        }
    return {
        "instance_id": instance_id,
        "n_attempt": 1,
        "model_patch": patch,
        "agent": "kirocrew_kanban",
        "model": label,
        "task_metadata": {
            "repo": str(instance.get("repo", "")),
            "base_commit": str(instance.get("base_commit", "")),
            "dataset_revision": suite.revision,
        },
        "success": success,
        "error": error or None,
    }


def _run_report(
    suite: BenchmarkSuite,
    prediction_path: Path,
    label: str,
    started_at: float,
    task_reports: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "suite": suite.id,
        "benchmark": suite.benchmark,
        "dataset": suite.dataset,
        "revision": suite.revision,
        "label": label,
        "predictions": str(prediction_path),
        "started_at": started_at,
        "updated_at": time.time(),
        "tasks": [task_reports[key] for key in suite.task_ids if key in task_reports],
    }


def run_suite(
    suite: BenchmarkSuite,
    output_root: Path,
    *,
    base_url: str,
    cookie: str | None = None,
    label: str = "kirocrew-kanban",
    loop_attempts: int = 1,
    token_budget: int = 100_000,
    timeout_seconds: int | None = None,
    poll_seconds: float = 2.0,
    resume: bool = False,
) -> dict[str, Any]:
    """Run selected tasks serially and persist official-format predictions."""
    run_dir = output_root.expanduser().resolve() / suite.id
    if run_dir.exists() and any(run_dir.iterdir()) and not resume:
        raise RuntimeError(
            f"eval run directory is not empty: {run_dir}; use --resume or choose a new output directory"
        )
    run_dir.mkdir(parents=True, exist_ok=True)
    prediction_path = suite.predictions_path(output_root.expanduser().resolve())
    predictions = _read_jsonl(prediction_path) if resume else {}
    report_path = run_dir / "kanban-run.json"
    existing_report: dict[str, Any] = {}
    if resume and report_path.exists():
        loaded = json.loads(report_path.read_text(encoding="utf-8"))
        existing_report = loaded if isinstance(loaded, dict) else {}
    task_reports = {
        item["instance_id"]: item
        for item in existing_report.get("tasks", [])
        if isinstance(item, dict) and isinstance(item.get("instance_id"), str)
    }

    client = KanbanClient(base_url, cookie=cookie)
    client.preflight()
    instances = load_suite_instances(suite)
    started_at = time.time()
    first_started_at = float(existing_report.get("started_at", started_at))
    effective_timeout = timeout_seconds or suite.timeout_seconds
    workspace_root = run_dir / "workspaces"

    for instance in instances:
        instance_id = str(instance["instance_id"])
        if resume and instance_id in predictions:
            continue
        patch = ""
        adapter_success = False
        error = ""
        task_id = ""
        task_status = "not_started"
        goal_status = ""
        attempts = 0
        tokens_used = 0
        duration = 0.0
        workspace: Path | None = None
        try:
            workspace = prepare_workspace(instance, workspace_root, resume=resume)
            payload = build_task_payload(
                suite,
                instance,
                workspace,
                loop_attempts=loop_attempts,
                token_budget=token_budget,
            )
            result = run_prepared_task(
                client,
                payload,
                timeout_seconds=effective_timeout,
                poll_seconds=poll_seconds,
            )
            task_id = result.task_id
            task_status = result.status
            goal_status = result.goal_status
            adapter_success = result.success
            error = result.error
            attempts = result.attempts
            tokens_used = result.tokens_used
            duration = result.duration_seconds
            patch = collect_patch(workspace, str(instance["base_commit"]))
        except Exception as exc:
            error = str(exc)[:4000]
            if workspace is not None and (workspace / ".git").is_dir():
                try:
                    patch = collect_patch(workspace, str(instance["base_commit"]))
                except Exception:
                    patch = ""

        predictions[instance_id] = prediction_record(
            suite,
            instance,
            patch,
            label=label,
            success=adapter_success,
            error=error,
        )
        task_reports[instance_id] = {
            "instance_id": instance_id,
            "task_id": task_id,
            "workspace": str(workspace) if workspace else "",
            "task_status": task_status,
            "goal_status": goal_status,
            "adapter_success": adapter_success,
            "error": error,
            "attempts": attempts,
            "tokens_used": tokens_used,
            "duration_seconds": round(duration, 3),
            "patch_bytes": len(patch.encode("utf-8")),
        }
        _write_jsonl(prediction_path, predictions)
        _write_json(
            report_path,
            _run_report(suite, prediction_path, label, first_started_at, task_reports),
        )

    _write_json(
        report_path,
        _run_report(suite, prediction_path, label, first_started_at, task_reports),
    )
    return json.loads(report_path.read_text(encoding="utf-8"))
