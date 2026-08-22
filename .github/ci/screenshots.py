"""Screenshot evidence: walk the complete user journey in a real browser.

The screenshots intentionally tell the story a reviewer needs to see:
entering the app from the KiroCrew dashboard, opening the create form, creating
a card, opening its detail, running it, following the live chat session, and
opening that same session again after the card settles in Done.

The browser is authed by injecting the mc_token cookie directly (cookie-path
validation needs no in-process nonce), never by a login flow.
"""

import json
import os
import sys
import time
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


def get_task(task_id: str) -> dict:
    req = urllib.request.Request(f"{BASE}/api/apps/kanban/tasks")
    req.add_header("Cookie", f"mc_token_{PORT}={cred}")
    with urllib.request.urlopen(req) as resp:
        tasks = json.loads(resp.read().decode()).get("tasks", [])
    return next(task for task in tasks if task.get("id") == task_id)


def wait_for_task(task_id: str, predicate, timeout: float = 30) -> dict:
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        last = get_task(task_id)
        if predicate(last):
            return last
        time.sleep(0.5)
    raise AssertionError(f"task did not reach expected state: {last}")


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
    page.goto(BASE, wait_until="domcontentloaded")

    # A fresh home is a real first run: setup/onboarding dialogs mount over the
    # page and intercept pointer events. Dismiss them before interacting.
    for _ in range(20):
        page.wait_for_timeout(500)
        skip_all = page.get_by_text("Skip all", exact=True)
        if skip_all.count() > 0 and skip_all.first.is_visible():
            skip_all.first.click()
            continue
        dialogs = page.locator('[role="dialog"]')
        if dialogs.count() == 0 or not dialogs.first.is_visible():
            break
        page.keyboard.press("Escape")
        close = page.locator('[role="dialog"] [aria-label="Close"]')
        if close.count() > 0 and close.first.is_visible():
            close.first.click()

    # Step 1: show how a user enters the installed app from the host dashboard.
    app_link = page.get_by_role("button", name="Kanban", exact=True)
    page.screenshot(path=str(OUT / "01-host-dashboard.png"), full_page=True)
    expect(app_link).to_be_visible(timeout=15000)
    app_link.click()
    page.wait_for_url("**/apps/kanban", timeout=15000)

    for lane in LANES:
        expect(page.get_by_text(lane, exact=True).first).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "02-kanban-board.png"), full_page=True)

    # Step 2: use the actual New task form, rather than creating the card via
    # the API as the smoke test does.
    page.get_by_role("button", name="New task", exact=True).click()
    expect(page.locator("#kanban-new-prompt")).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "03-new-task-form.png"), full_page=True)

    prompt = "Create an E2E journey proof task and report the result."
    page.locator("#kanban-new-prompt").fill(prompt)
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith("/api/apps/kanban/tasks")
    ) as create_response:
        page.get_by_role("button", name="Create task", exact=True).click()
    created = create_response.value.json()
    task_id = created["id"]
    expect(page.locator("#kanban-new-prompt")).not_to_be_visible(timeout=15000)

    # The new card is newest and therefore first in the To do column. Selecting
    # the card shape instead of its title keeps this stable while the background
    # namer replaces the provisional title.
    task_card = page.locator('[role="button"][draggable="true"]').first
    expect(task_card).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "04-task-created.png"), full_page=True)

    # Step 3: open the card and show the detail/edit surface before execution.
    task_card.click()
    detail = page.get_by_role("dialog", name="Task detail")
    expect(detail).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "05-task-detail-before-run.png"), full_page=True)

    # Step 4: run from the detail view. This creates a real named dashboard
    # session; it is not a hidden/background-only execution.
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/api/apps/kanban/tasks/{task_id}/run")
    ) as run_response:
        detail.get_by_role("button", name="Run", exact=True).click()
    assert run_response.value.status == 202, f"run returned {run_response.value.status}"
    page.screenshot(path=str(OUT / "06-task-running.png"), full_page=True)

    # Step 5: follow the live session link from the running card into KiroCrew
    # chat and prove the original prompt is present in that transcript.
    expect(page.get_by_role("button", name="Open agent session")).to_be_visible(
        timeout=15000
    )
    page.get_by_role("button", name="Open agent session").click()
    page.wait_for_url("**/chat?sid=*", timeout=15000)
    expect(page.locator("body")).to_contain_text(prompt, timeout=15000)
    page.screenshot(path=str(OUT / "07-chat-live.png"), full_page=True)

    # Step 6: return through the host navigation, wait for the real turn to
    # settle, and capture the Done card plus its finished execution detail.
    kanban_link = page.get_by_role("button", name="Kanban", exact=True)
    expect(kanban_link).to_be_visible(timeout=15000)
    kanban_link.click()
    page.wait_for_url("**/apps/kanban", timeout=15000)
    finished = wait_for_task(
        task_id,
        lambda task: task.get("status") in {"done", "failed"}
        and bool(task.get("executions"))
        and task["executions"][-1].get("result"),
    )
    assert finished["status"] == "done", f"task did not succeed: {finished}"

    final_card = page.locator('[role="button"]').filter(has_text=finished["title"]).first
    expect(final_card).to_be_visible(timeout=15000)
    expect(page.get_by_text("Done", exact=True).first).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "08-task-done.png"), full_page=True)

    final_card.click()
    detail = page.get_by_role("dialog", name="Task detail")
    expect(detail).to_be_visible(timeout=15000)
    expect(detail.get_by_text("Succeeded", exact=True)).to_be_visible(timeout=15000)
    expect(detail.get_by_role("button", name="Open agent session")).to_be_visible(
        timeout=15000
    )
    page.screenshot(path=str(OUT / "09-completed-task-detail.png"), full_page=True)

    # Step 7: after completion, the session action still opens the same chat
    # transcript rather than a new feature-specific detail page.
    detail.get_by_role("button", name="Open agent session").click()
    page.wait_for_url("**/chat?sid=*", timeout=15000)
    expect(page.locator("body")).to_contain_text(prompt, timeout=15000)
    page.screenshot(path=str(OUT / "10-chat-transcript.png"), full_page=True)

    browser.close()

expected_shots = [f"{index:02d}-{name}.png" for index, name in enumerate([
    "host-dashboard",
    "kanban-board",
    "new-task-form",
    "task-created",
    "task-detail-before-run",
    "task-running",
    "chat-live",
    "task-done",
    "completed-task-detail",
    "chat-transcript",
], start=1)]
shots = sorted(f.name for f in OUT.glob("*.png"))
missing = sorted(set(expected_shots) - set(shots))
if missing:
    print(f"SCREENSHOTS: FAIL (missing {missing}; found {shots})")
    sys.exit(1)
print(f"SCREENSHOTS: PASS ({', '.join(expected_shots)})")
