"""Screenshot evidence: load the board in a real browser, assert the five
lanes rendered with a seeded card, and save PNGs as CI artifacts.

The browser is authed by injecting the mc_token cookie directly (cookie-path
validation needs no in-process nonce), never by a login flow.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

PORT = int(os.environ.get("KC_PORT", "7891"))
# localhost, NOT 127.0.0.1: Chromium refuses to apply an injected cookie to a
# bare-IP origin (it sits in the jar but never reaches the request), which
# strands the SPA unauthenticated behind the session-expired banner.
BASE = f"http://localhost:{PORT}"
OUT = Path("/tmp/e2e-shots")
OUT.mkdir(parents=True, exist_ok=True)

# KC_CRED lets a local run mint the credential in a different interpreter
# (one that has kiro_crew but not playwright); CI leaves it unset.
cred = os.environ.get("KC_CRED", "")
if not cred:
    from kiro_crew.dashboard.token_auth import generate_token

    cred = generate_token("ci", ttl_seconds=1800, register_nonce=False)


def seed_card(prompt: str) -> str:
    req = urllib.request.Request(f"{BASE}/api/apps/kanban/tasks", method="POST")
    req.add_header("Cookie", f"mc_token_{PORT}={cred}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=json.dumps({"prompt": prompt}).encode()) as resp:
        return json.loads(resp.read().decode())["id"]


seed_card("Summarize this week's merged PRs")
seed_card("Draft release notes for v2.0.0")

LANES = ["Backlog", "To do", "Running", "Done", "Failed"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_cookies([{"name": f"mc_token_{PORT}", "value": cred, "url": BASE}])
    # Pre-seed the first-run flags the SPA gates its onboarding wizards on
    # (same keys upstream's own tests set), so no modal ever mounts over the board.
    ctx.add_init_script(
        "try { localStorage.setItem('mc-onboarded', '1');"
        " localStorage.setItem('mc-import-onboarded', '1');"
        " localStorage.setItem('mc-privacy-acked', '1'); } catch (e) {}"
    )
    page = ctx.new_page()
    # The board polls every 5s, so "networkidle" never fires; the expect()
    # assertions below carry their own auto-retrying waits.
    page.goto(f"{BASE}/apps/kanban", wait_until="domcontentloaded")

    # A fresh home is a real first run: setup/onboarding dialogs mount over the
    # page and intercept pointer events. Dismiss them before interacting.
    for _ in range(4):
        page.wait_for_timeout(500)
        dialogs = page.locator('[role="dialog"]')
        if dialogs.count() == 0 or not dialogs.first.is_visible():
            break
        page.keyboard.press("Escape")
        close = page.locator('[role="dialog"] [aria-label="Close"]')
        if close.count() > 0 and close.first.is_visible():
            close.first.click()

    for lane in LANES:
        expect(page.get_by_text(lane, exact=True).first).to_be_visible(timeout=15000)
    expect(page.get_by_text("Summarize this week's merged PRs").first).to_be_visible(
        timeout=15000
    )
    page.screenshot(path=str(OUT / "board.png"), full_page=True)

    page.get_by_text("Summarize this week's merged PRs").first.click()
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "task-detail.png"), full_page=True)

    browser.close()

shots = sorted(f.name for f in OUT.glob("*.png"))
if len(shots) < 2:
    print(f"SCREENSHOTS: FAIL (only {shots})")
    sys.exit(1)
print(f"SCREENSHOTS: PASS ({', '.join(shots)})")
