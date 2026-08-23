"""Static checks: validate app.json against the real KiroCrew manifest schema
and byte-compile the backend. Runs against the installed kirocrew wheel, so a
schema change in a new KiroCrew release fails here rather than at install time.

Also enforces that review media is isolated under ``docs/e2e/``: this
repository is an installable app, so product assets and temporary review
evidence must remain distinguishable.
"""

import py_compile
import subprocess
import sys
from pathlib import Path

from kiro_crew.apps.manifest import AppManifest

ROOT = Path(__file__).resolve().parents[2]

# Raster and video formats only. ``ui/`` contains shipped product assets and
# ``docs/e2e/`` contains temporary review evidence.
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
_ALLOWED_MEDIA_DIRS = ("ui/", "docs/e2e/")


def check_no_unscoped_media() -> list[str]:
    """Return tracked screenshot/video paths outside allowed media dirs."""
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
        if path.startswith(_ALLOWED_MEDIA_DIRS):
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

evidence = check_no_unscoped_media()
if evidence:
    print("  ERROR: media must be under ui/ or docs/e2e/.")
    for path in evidence:
        print(f"    {path}")
    sys.exit(1)

print("static checks: PASS")
