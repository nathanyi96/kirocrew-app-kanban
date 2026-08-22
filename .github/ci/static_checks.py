"""Static checks: validate app.json against the real KiroCrew manifest schema
and byte-compile the backend. Runs against the installed kirocrew wheel, so a
schema change in a new KiroCrew release fails here rather than at install time.
"""

import py_compile
import sys
from pathlib import Path

from kiro_crew.apps.manifest import AppManifest

ROOT = Path(__file__).resolve().parents[2]

manifest = AppManifest.from_json_file(ROOT / "app.json")
errors = manifest.validate(app_root=ROOT)
print(f"manifest: name={manifest.name} version={manifest.version}")
if errors:
    for e in errors:
        print(f"  ERROR: {e}")
    sys.exit(1)

py_compile.compile(str(ROOT / "backend" / "routes.py"), doraise=True)
print("static checks: PASS")
