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
from PIL import Image
import urllib.error
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


def api_call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(f"{BASE}{path}", method=method)
    req.add_header("Cookie", f"mc_token_{PORT}={cred}")
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}")


def create_card(prompt: str, engine: str = "auto") -> dict:
    req = urllib.request.Request(f"{BASE}/api/apps/kanban/tasks", method="POST")
    req.add_header("Cookie", f"mc_token_{PORT}={cred}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=json.dumps({"prompt": prompt, "engine": engine}).encode()) as resp:
        return json.loads(resp.read().decode())


def seed_card(prompt: str) -> str:
    return create_card(prompt)["id"]


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
        skip_all = page.get_by_role("button", name="Skip all", exact=True)
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
    # Keep this evidence path deterministic: it proves the Chat route while
    # the separate engine contract smoke covers selecting Task Runner.
    page.locator("#kanban-new-engine").select_option("chat")
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
    expect(detail.get_by_text("Chat", exact=True)).to_be_visible(timeout=15000)
    # The drawer leads with issue-like state and next actions. The raw prompt
    # remains collapsed context instead of taking over the primary layout.
    expect(detail.get_by_text("Not started", exact=True)).to_be_visible(timeout=15000)
    expect(detail.get_by_text("Properties", exact=True)).to_be_visible(timeout=15000)
    expect(detail.get_by_text("Original request", exact=True)).to_be_visible(timeout=15000)
    expect(detail.get_by_text("Execution prompt", exact=True)).not_to_be_visible()
    # The drawer intentionally animates in; assert its final geometry after
    # the transition instead of sampling the panel halfway through the slide.
    page.wait_for_timeout(250)
    drawer_box = detail.bounding_box()
    viewport = page.evaluate("() => ({ innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })")
    print(f"drawer geometry: box={drawer_box} viewport={viewport}")
    assert drawer_box and drawer_box["x"] >= 0 and drawer_box["x"] + drawer_box["width"] <= viewport["innerWidth"] + 1, (
        f"task detail drawer escapes viewport: box={drawer_box} viewport={viewport}"
    )
    page.screenshot(path=str(OUT / "05-task-detail-before-run.png"), full_page=True)
    # The side page has two independent dismissal paths and must preserve the board.
    page.keyboard.press("Escape")
    expect(detail).not_to_be_visible(timeout=5000)
    task_card.click()
    detail = page.get_by_role("dialog", name="Task detail")
    page.get_by_role("button", name="Close task detail").click()
    expect(detail).not_to_be_visible(timeout=5000)
    task_card.click()
    detail = page.get_by_role("dialog", name="Task detail")

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
    expect(page.get_by_role("textbox", name="Message input")).to_be_visible(timeout=15000)
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
    expect(detail.get_by_label("Current execution").get_by_text("Succeeded", exact=True)).to_be_visible(timeout=15000)
    expect(detail.get_by_text("Execution history", exact=True)).to_be_visible(timeout=15000)
    expect(detail.get_by_role("button", name="Open agent session")).to_be_visible(
        timeout=15000
    )
    page.screenshot(path=str(OUT / "09-completed-task-detail.png"), full_page=True)

    # Evidence GIF is generated from this exact successful journey and remains
    # in the workflow artifact directory, never in the repository.
    gif_frames = []
    for index in range(4):
        frame_path = OUT / f"gif-{index}.png"
        page.screenshot(path=str(frame_path), full_page=True)
        gif_frames.append(Image.open(frame_path).convert("RGB"))
        page.wait_for_timeout(250)
    gif_frames[0].save(OUT / "kanban-task-detail-journey.gif", save_all=True, append_images=gif_frames[1:], duration=250, loop=0)

    # Step 7: after completion, the session action still opens the same chat
    # transcript rather than a new feature-specific detail page.
    detail.get_by_role("button", name="Open agent session").click()
    page.wait_for_url("**/chat?sid=*", timeout=15000)
    expect(page.get_by_role("textbox", name="Message input")).to_be_visible(timeout=15000)
    expect(page.locator("body")).to_contain_text(prompt, timeout=15000)
    page.screenshot(path=str(OUT / "10-chat-transcript.png"), full_page=True)

    def open_kanban() -> None:
        page.goto(f"{BASE}/apps/kanban", wait_until="domcontentloaded")
        page.wait_for_url("**/apps/kanban", timeout=15000)
        expect(page.get_by_text("Kanban", exact=True).first).to_be_visible(timeout=15000)

    def create_ui_task(task_prompt: str, engine: str) -> dict:
        open_kanban()
        page.get_by_role("button", name="New task", exact=True).click()
        expect(page.locator("#kanban-new-prompt")).to_be_visible(timeout=15000)
        page.locator("#kanban-new-prompt").fill(task_prompt)
        page.locator("#kanban-new-engine").select_option(engine)
        with page.expect_response(
            lambda response: response.request.method == "POST"
            and response.url.endswith("/api/apps/kanban/tasks")
        ) as response_info:
            page.get_by_role("button", name="Create task", exact=True).click()
        return response_info.value.json()

    # Step 8: exercise the real Task Runner engine. This is deliberately an
    # explicit selection so the screenshot proves the engine selector and the
    # resolved engine badge, rather than only testing Auto's heuristic.
    task_runner_prompt = "Task Runner E2E: complete multiple steps and report the result."
    task_runner_created = create_ui_task(task_runner_prompt, "task_runner")
    task_runner_id = task_runner_created["id"]
    task_runner_card = page.locator("[role=\"button\"]").filter(has_text=task_runner_prompt).first
    expect(task_runner_card).to_be_visible(timeout=15000)
    task_runner_card.click()
    task_runner_detail = page.get_by_role("dialog", name="Task detail")
    expect(task_runner_detail.get_by_text("Task Runner", exact=True)).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "11-task-runner-detail.png"), full_page=True)

    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/api/apps/kanban/tasks/{task_runner_id}/run")
    ) as task_runner_run_response:
        task_runner_detail.get_by_role("button", name="Run", exact=True).click()
    assert task_runner_run_response.value.status == 202, (
        f"Task Runner run returned {task_runner_run_response.value.status}"
    )
    task_runner_started = wait_for_task(
        task_runner_id,
        lambda task: bool(task.get("executions"))
        and task["executions"][-1].get("runner_id")
        and task["executions"][-1].get("engine") == "task_runner",
        timeout=30,
    )
    task_runner_run_id = task_runner_started["executions"][-1]["runner_id"]
    open_kanban()
    task_runner_card = page.locator("[role=\"button\"]").filter(has_text=task_runner_prompt).first
    task_runner_card.click()
    task_runner_detail = page.get_by_role("dialog", name="Task detail")
    expect(task_runner_detail.get_by_role("button", name="Open Task Runner")).to_be_visible(
        timeout=15000
    )
    page.screenshot(path=str(OUT / "12-task-runner-running.png"), full_page=True)
    task_runner_detail.get_by_role("button", name="Open Task Runner").click()
    page.wait_for_url("**/projects*", timeout=15000)
    expect(page.locator("body")).to_contain_text("Task Runner", timeout=15000)
    page.screenshot(path=str(OUT / "13-task-runner-host.png"), full_page=True)
    cancel_status, _cancel_body = api_call(
        "POST", "/api/taskrunner/cancel", {"task_id": task_runner_run_id}
    )
    assert cancel_status == 200, f"Task Runner cancel returned {cancel_status}"
    wait_for_task(
        task_runner_id,
        lambda task: bool(task.get("executions"))
        and task["executions"][-1].get("result") is not None,
        timeout=30,
    )

    # Step 9: exercise Autopilot. Autopilot is part of the Host Chat surface;
    # the Kanban backend creates the session in orchestrator mode, so the
    # destination is still /chat?sid=... but visibly carries the plan/approval UI.
    autopilot_prompt = "Autopilot E2E: plan a concise two-step review and show the approval plan."
    autopilot_created = create_ui_task(autopilot_prompt, "autopilot")
    autopilot_id = autopilot_created["id"]
    autopilot_card = page.locator("[role=\"button\"]").filter(has_text=autopilot_prompt).first
    expect(autopilot_card).to_be_visible(timeout=15000)
    autopilot_card.click()
    autopilot_detail = page.get_by_role("dialog", name="Task detail")
    expect(autopilot_detail.get_by_text("Autopilot", exact=True).first).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "14-autopilot-detail.png"), full_page=True)

    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/api/apps/kanban/tasks/{autopilot_id}/run")
    ) as autopilot_run_response:
        autopilot_detail.get_by_role("button", name="Run", exact=True).click()
    assert autopilot_run_response.value.status == 202, (
        f"Autopilot run returned {autopilot_run_response.value.status}"
    )
    autopilot_started = wait_for_task(
        autopilot_id,
        lambda task: bool(task.get("executions"))
        and task["executions"][-1].get("session_key")
        and task["executions"][-1].get("engine") == "autopilot",
        timeout=30,
    )
    open_kanban()
    autopilot_card = page.locator("[role=\"button\"]").filter(has_text=autopilot_prompt).first
    autopilot_card.click()
    autopilot_detail = page.get_by_role("dialog", name="Task detail")
    expect(autopilot_detail.get_by_role("button", name="Open agent session")).to_be_visible(
        timeout=15000
    )
    page.screenshot(path=str(OUT / "15-autopilot-running.png"), full_page=True)
    autopilot_detail.get_by_role("button", name="Open agent session").click()
    page.wait_for_url("**/chat?sid=*", timeout=15000)
    expect(page.get_by_role("textbox", name="Message input")).to_be_visible(timeout=15000)
    expect(page.locator("body")).to_contain_text("Autopilot", timeout=15000)
    expect(page.locator("body")).to_contain_text(autopilot_prompt, timeout=15000)
    page.screenshot(path=str(OUT / "16-autopilot-session.png"), full_page=True)

    open_kanban()
    autopilot_finished = wait_for_task(
        autopilot_id,
        lambda task: bool(task.get("executions"))
        and task["executions"][-1].get("result") is not None,
        timeout=30,
    )
    assert autopilot_finished["executions"][-1].get("engine") == "autopilot"
    autopilot_card = page.locator("[role=\"button\"]").filter(has_text=autopilot_prompt).first
    autopilot_card.click()
    autopilot_detail = page.get_by_role("dialog", name="Task detail")
    expect(autopilot_detail.get_by_text("Autopilot", exact=True).first).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "17-autopilot-completed-detail.png"), full_page=True)

    # Step 10: prove the user-facing prerequisite prompt. CI's Host has Task
    # Runner enabled, so intercept this one run response with the same
    # structured 409 the backend returns when the Host does not expose it.
    enable_prompt_text = "Task Runner E2E: prompt before enablement."
    enable_prompt_created = create_ui_task(enable_prompt_text, "task_runner")
    enable_prompt_id = enable_prompt_created["id"]
    enable_prompt_card = page.locator("[role=\"button\"]").filter(has_text=enable_prompt_text).first
    expect(enable_prompt_card).to_be_visible(timeout=15000)
    enable_prompt_card.click()
    enable_prompt_detail = page.get_by_role("dialog", name="Task detail")
    expect(enable_prompt_detail.get_by_text("Task Runner", exact=True)).to_be_visible(timeout=15000)
    page.screenshot(path=str(OUT / "18-task-runner-enable-before.png"), full_page=True)
    page.route(
        f"**/api/apps/kanban/tasks/{enable_prompt_id}/run",
        lambda route: route.fulfill(
            status=409,
            content_type="application/json",
            body=json.dumps({
                "error": "This task was classified for Task Runner, but Task Runner is not enabled on this Host. Open Task Runner to enable it, then retry this task.",
                "code": "task_runner_not_enabled",
                "engine": "task_runner",
                "action": {"label": "Open Task Runner", "path": "/projects"},
            }),
        ),
    )
    enable_prompt_detail.get_by_role("button", name="Run", exact=True).click()
    enable_prompt_dialog = page.get_by_role("dialog", name="Enable Task Runner")
    expect(enable_prompt_dialog).to_be_visible(timeout=15000)
    expect(enable_prompt_dialog).to_contain_text("Task Runner is not enabled", timeout=15000)
    page.screenshot(path=str(OUT / "19-task-runner-enable-prompt.png"), full_page=True)
    enable_prompt_dialog.get_by_role("button", name="Not now", exact=True).click()
    page.unroute(f"**/api/apps/kanban/tasks/{enable_prompt_id}/run")

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
    "task-runner-detail",
    "task-runner-running",
    "task-runner-host",
    "autopilot-detail",
    "autopilot-running",
    "autopilot-session",
    "autopilot-completed-detail",
    "task-runner-enable-before",
    "task-runner-enable-prompt",
], start=1)]
shots = sorted(f.name for f in OUT.glob("*.png"))
missing = sorted(set(expected_shots) - set(shots))
if missing:
    print(f"SCREENSHOTS: FAIL (missing {missing}; found {shots})")
    sys.exit(1)
print(f"SCREENSHOTS: PASS ({', '.join(expected_shots)})")
