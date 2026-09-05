"""Static checks: validate app.json against the real KiroCrew manifest schema
and byte-compile the backend. Runs against the installed kirocrew wheel, so a
schema change in a new KiroCrew release fails here rather than at install time.

Also enforces that review media is isolated under ``docs/e2e/``: this
repository is an installable app, so product assets and temporary review
evidence must remain distinguishable.
"""

import json
import py_compile
import re
import struct
import subprocess
import sys
from pathlib import Path
from typing import Any

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
_ART_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}


def _asset_dimensions(path: Path) -> tuple[int, int] | None:
    """Read dimensions without optional image libraries (CI only has stdlib)."""
    raw = path.read_bytes()
    if raw.startswith(b"\x89PNG\r\n\x1a\n") and len(raw) >= 24:
        return struct.unpack(">II", raw[16:24])
    if path.suffix.lower() == ".svg":
        opening = raw.decode("utf-8", errors="strict").split(">", 1)[0]
        width = re.search(r'\bwidth=["\']([0-9]+)(?:px)?["\']', opening)
        height = re.search(r'\bheight=["\']([0-9]+)(?:px)?["\']', opening)
        if width and height:
            return int(width.group(1)), int(height.group(1))
        view_box = re.search(r'\bviewBox=["\'][^"\']+ [^"\']+ ([0-9.]+) ([0-9.]+)["\']', opening)
        if view_box:
            return round(float(view_box.group(1))), round(float(view_box.group(2)))
    return None


def _check_store_art(manifest: dict[str, Any]) -> list[str]:
    """Validate the guide's repo-relative, sized store artwork contract."""
    errors: list[str] = []
    root = ROOT.resolve()
    fields = {
        "iconPath": manifest.get("iconPath"),
        "heroImage": manifest.get("heroImage"),
        "heroImageDetail": manifest.get("heroImageDetail"),
    }
    screenshots = manifest.get("screenshots") or []
    if not screenshots:
        errors.append("screenshots: at least one real product screenshot is required")
    fields["screenshots[0]"] = screenshots[0] if screenshots else None
    resolved: dict[str, tuple[Path, int, int]] = {}
    for label, raw_path in fields.items():
        if not isinstance(raw_path, str) or not raw_path:
            errors.append(f"{label}: missing store asset path")
            continue
        if raw_path.startswith(("/", "\\")) or "\\" in raw_path or ".." in Path(raw_path).parts:
            errors.append(f"{label}: path must be repo-relative and contain no traversal: {raw_path!r}")
            continue
        path = (ROOT / raw_path).resolve()
        if not path.is_relative_to(root):
            errors.append(f"{label}: path escapes the repository: {raw_path!r}")
            continue
        if path.suffix.lower() not in _ART_EXTENSIONS:
            errors.append(f"{label}: unsupported artwork extension: {raw_path!r}")
            continue
        if not path.is_file():
            errors.append(f"{label}: missing shipped store asset: {raw_path!r}")
            continue
        dimensions = _asset_dimensions(path)
        if dimensions is None:
            errors.append(f"{label}: could not read image dimensions: {raw_path!r}")
            continue
        resolved[label] = (path, *dimensions)

    if "iconPath" in resolved:
        path, width, height = resolved["iconPath"]
        if width != height or width < 512:
            errors.append(f"iconPath: must be square and at least 512x512, got {width}x{height}")
        if path.suffix.lower() == ".svg":
            source = path.read_text(encoding="utf-8")
            if "fill-opacity" in source or re.search(r"\bopacity=", source):
                errors.append("iconPath: SVG must not declare transparency")
            if not re.search(r'<rect\b[^>]*\bwidth=["\'](?:100%|512)["\'][^>]*\bfill=["\'][^"\']+["\']', source):
                errors.append("iconPath: SVG must include an opaque background tile")

    for label, ratio in (("heroImage", 16 / 9), ("heroImageDetail", 25 / 6)):
        if label in resolved:
            _, width, height = resolved[label]
            if abs(width / height - ratio) > 0.03:
                errors.append(f"{label}: expected approximately {ratio:.3f}:1, got {width}:{height}")
    if "screenshots[0]" in resolved:
        _, width, height = resolved["screenshots[0]"]
        if width <= height:
            errors.append(f"screenshots[0]: must be landscape, got {width}x{height}")
    return errors


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
listing = json.loads((ROOT / "app.json").read_text())
entry = listing.get("ui", {}).get("entry", "")
if not isinstance(entry, str) or not entry or not (ROOT / "ui" / entry).is_file():
    errors.append(f"Missing shipped UI bundle: {entry!r}")
errors.extend(_check_store_art(listing))
print(f"manifest: name={manifest.name} version={manifest.version}")
if errors:
    for e in errors:
        print(f"  ERROR: {e}")
    sys.exit(1)

for backend_file in sorted((ROOT / "backend").rglob("*.py")):
    if "__pycache__" not in backend_file.parts:
        py_compile.compile(str(backend_file), doraise=True)

evidence = check_no_unscoped_media()
if evidence:
    print("  ERROR: media must be under ui/ or docs/e2e/.")
    for path in evidence:
        print(f"    {path}")
    sys.exit(1)

print("static checks: PASS")
