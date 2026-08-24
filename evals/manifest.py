"""Load and validate the pinned external benchmark manifest."""

from __future__ import annotations

import json
from pathlib import Path

from .models import BenchmarkSuite, EvalConfigError


DEFAULT_MANIFEST = Path(__file__).with_name("manifest.json")


def load_manifest(path: Path | None = None) -> tuple[BenchmarkSuite, ...]:
    manifest_path = (path or DEFAULT_MANIFEST).resolve()
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise EvalConfigError(f"could not read manifest {manifest_path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise EvalConfigError(f"manifest is not valid JSON: {exc}") from exc
    if not isinstance(raw, dict) or raw.get("schema_version") != 1:
        raise EvalConfigError("manifest schema_version must be 1")
    suites_raw = raw.get("suites")
    if not isinstance(suites_raw, list) or not suites_raw:
        raise EvalConfigError("manifest suites must be a non-empty array")
    suites = tuple(BenchmarkSuite.from_dict(item) for item in suites_raw)
    suite_ids = [suite.id for suite in suites]
    if len(set(suite_ids)) != len(suite_ids):
        raise EvalConfigError("manifest suite ids must be unique")
    return suites


def load_suite(suite_id: str, path: Path | None = None) -> BenchmarkSuite:
    for suite in load_manifest(path):
        if suite.id == suite_id:
            return suite
    available = ", ".join(suite.id for suite in load_manifest(path))
    raise EvalConfigError(f"unknown suite {suite_id!r}; choose one of: {available}")
