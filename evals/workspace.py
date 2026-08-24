"""Prepare disposable benchmark checkouts and collect complete git patches."""

from __future__ import annotations

import hashlib
import re
import subprocess
from pathlib import Path
from typing import Any

from .models import EvalConfigError


_REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def workspace_name(instance_id: str) -> str:
    readable = re.sub(r"[^A-Za-z0-9_.-]+", "_", instance_id).strip("._")[:80]
    digest = hashlib.sha256(instance_id.encode("utf-8")).hexdigest()[:10]
    return f"{readable}-{digest}"


def _run_git(arguments: list[str], *, cwd: Path | None = None) -> str:
    try:
        completed = subprocess.run(
            ["git", *arguments],
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        detail = ""
        if isinstance(exc, subprocess.CalledProcessError):
            detail = (exc.stderr or exc.stdout or "").strip()[-2000:]
        raise RuntimeError(f"git {' '.join(arguments[:3])} failed: {detail or exc}") from exc
    return completed.stdout


def prepare_workspace(
    instance: dict[str, Any],
    workspace_root: Path,
    *,
    resume: bool = False,
) -> Path:
    instance_id = instance.get("instance_id")
    repository = instance.get("repo")
    base_commit = instance.get("base_commit")
    if not isinstance(instance_id, str) or not instance_id:
        raise EvalConfigError("benchmark row has no instance_id")
    if not isinstance(repository, str) or not _REPOSITORY.fullmatch(repository):
        raise EvalConfigError(f"benchmark task {instance_id} has an unsafe repo field")
    if not isinstance(base_commit, str) or not base_commit.strip():
        raise EvalConfigError(f"benchmark task {instance_id} has no base_commit")

    root = workspace_root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = root / workspace_name(instance_id)
    if target.exists():
        if not resume:
            raise RuntimeError(
                f"workspace already exists: {target}; use --resume or choose a new output directory"
            )
        if not (target / ".git").is_dir():
            raise RuntimeError(f"resume target is not a git checkout: {target}")
        _run_git(["cat-file", "-e", f"{base_commit}^{{commit}}"], cwd=target)
        return target

    clone_url = f"https://github.com/{repository}.git"
    _run_git(["clone", "--filter=blob:none", "--no-checkout", clone_url, str(target)])
    _run_git(["checkout", "--detach", base_commit], cwd=target)
    return target


def collect_patch(workspace: Path, base_commit: str) -> str:
    """Return staged, unstaged, and untracked files as one evaluator patch."""
    if not (workspace / ".git").is_dir():
        raise RuntimeError(f"workspace is not a git checkout: {workspace}")
    # Intent-to-add makes untracked files visible to `git diff` without staging
    # their contents. Comparing to the pinned base also includes already staged
    # edits and commits the agent may have created during the run.
    _run_git(["add", "--intent-to-add", "--all", "--"], cwd=workspace)
    return _run_git(
        ["-c", "core.fileMode=false", "diff", "--binary", base_commit, "--"],
        cwd=workspace,
    )
