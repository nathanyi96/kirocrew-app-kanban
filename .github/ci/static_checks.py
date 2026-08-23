"""Static checks: validate app.json against the real KiroCrew manifest schema
and byte-compile the backend. Runs against the installed kirocrew wheel, so a
schema change in a new KiroCrew release fails here rather than at install time.

Also enforces that review evidence stays out of git: this repository is an
installable app, so anything tracked here is copied into every user's
``~/.kiro/crew/apps/kanban/`` by ``kirocrew app install``.
"""

import py_compile
import subprocess
import sys
from pathlib import Path

from kiro_crew.apps.manifest import AppManifest

ROOT = Path(__file__).resolve().parents[2]

# Raster and video formats only. ``ui/`` is exempt because the app's own icon
# and any future UI asset are shipped product, not review evidence.
_EVIDENCE_SUFFIXES = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".avif",
    ".apng",
    ".mp4",
    ".mov",
    ".webm",
}
_SHIPPED_ASSET_DIRS = ("ui/",)


def check_no_committed_evidence() -> list[str]:
    """Return tracked screenshot/video paths that must not be in the repo.

    Evidence belongs to the ``e2e-evidence`` workflow artifact (see
    CONTRIBUTING.md). Committing it ships megabytes to every installed copy,
    can never be reclaimed from history, and 404s once the PR branch is
    deleted.
    """
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as exc:
        # A source tarball has no git metadata. The guard is a policy check,
        # not a security control, so degrade to a warning rather than failing
        # a build that has nothing to check.
        print(f"  WARN: cannot list tracked files, skipping evidence check ({exc})")
        return []
    offenders = []
    for path in out.split("\0"):
        if not path:
            continue
        if path.startswith(_SHIPPED_ASSET_DIRS):
            continue
        if Path(path).suffix.lower() in _EVIDENCE_SUFFIXES:
            offenders.append(path)
    return sorted(offenders)


manifest = AppManifest.from_json_file(ROOT / "app.json")
errors = manifest.validate(app_root=ROOT)
print(f"manifest: name={manifest.name} version={manifest.version}")
if errors:
    for e in errors:
        print(f"  ERROR: {e}")
    sys.exit(1)

py_compile.compile(str(ROOT / "backend" / "routes.py"), doraise=True)

evidence = check_no_committed_evidence()
if evidence:
    print("  ERROR: review evidence must not be committed to this repository.")
    print("  Link the run's e2e-evidence artifact instead (see CONTRIBUTING.md).")
    for path in evidence:
        print(f"    {path}")
    sys.exit(1)

print("static checks: PASS")
