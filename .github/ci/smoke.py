"""Drive the app's real HTTP surface on the CI gateway and assert the contract.

Auth uses the dashboard's cookie path: a credential minted with the same
KIROCREW_HOME signs with the gateway's own HMAC secret, and cookie validation
does not require the in-process link nonce, so cross-process minting works.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

PORT = int(os.environ.get("KC_PORT", "7891"))
BASE = f"http://127.0.0.1:{PORT}"

from kiro_crew.dashboard.token_auth import generate_token  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.routes import (  # noqa: E402
    _resolve_engine,
    _task_runner_is_available,
    _task_runner_not_enabled_payload,
)

COOKIE = f"mc_token_{PORT}={generate_token('ci', ttl_seconds=1800, register_nonce=False)}"


def call(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Cookie", COOKIE)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'}  {label}  {detail}")
    if not ok:
        failures.append(label)


s, body = call("GET", "/api/apps/kanban/tasks")
check("list -> 200", s == 200, f"status={s}")
check("board shape", isinstance(body, dict) and "tasks" in body, str(body)[:100])
taskrunner_status, taskrunner_body = call("GET", "/api/taskrunner")
check(
    "task runner is installed and available",
    taskrunner_status == 200 and isinstance(taskrunner_body, dict) and taskrunner_body.get("available") is True,
    f"status={taskrunner_status} {str(taskrunner_body)[:100]}",
)
check("auto routes simple prompt to chat", _resolve_engine("auto", "Summarize this note") == "chat")
check(
    "auto routes multi-step prompt to task runner",
    _resolve_engine("auto", "Implement a multi-step release workflow") == "task_runner",
)


class _HostWithoutTaskRunner:
    task_runner = None


not_enabled = _task_runner_not_enabled_payload()
check(
    "missing task runner prompts for enablement",
    not _task_runner_is_available(_HostWithoutTaskRunner())
    and not_enabled.get("code") == "task_runner_not_enabled"
    and not_enabled.get("action", {}).get("path") == "/projects",
    str(not_enabled),
)

s, body = call(
    "POST",
    "/api/apps/kanban/tasks",
    {"prompt": "Invalid eval metadata", "metadata": {"workspace_dir": 42}},
)
check(
    "create rejects non-string workspace metadata",
    s == 400 and body.get("code") == "metadata_invalid",
    f"status={s} {str(body)[:120]}",
)

s, body = call(
    "POST",
    "/api/apps/kanban/tasks",
    {"prompt": "Plan a multi-step release workflow", "engine": "task_runner"},
)
engine_tid = body.get("id", "") if isinstance(body, dict) else ""
check("create with engine -> 201", s == 201, f"status={s}")
check(
    "engine preference persists",
    body.get("engine") == "task_runner" if isinstance(body, dict) else False,
    str(body)[:120],
)

s, body = call(
    "POST",
    "/api/apps/kanban/tasks",
    {
        "prompt": "Build a verified outcome",
        "engine": "auto",
        "goal": {
            "mode": "loop",
            "criteria": ["The outcome works", "Checks pass"],
            "max_attempts": 3,
            "max_minutes": 30,
            "token_budget": 25000,
        },
        "metadata": {
            "workspace_dir": "/tmp/kanban-eval-smoke",
            "eval_suite": "ci-smoke",
        },
    },
)
goal_tid = body.get("id", "") if isinstance(body, dict) else ""
check("create bounded goal -> 201", s == 201, f"status={s}")
check("goal loop forces task runner", body.get("engine") == "task_runner", str(body)[:160])
check("goal criteria persist", len(body.get("goal", {}).get("criteria", [])) == 2, str(body)[:160])
check(
    "prepared workspace metadata persists",
    body.get("metadata", {}).get("workspace_dir") == "/tmp/kanban-eval-smoke",
    str(body)[:160],
)

s, body = call("POST", "/api/apps/kanban/tasks", {"prompt": "CI smoke task"})
tid = body.get("id", "") if isinstance(body, dict) else ""
check("create -> 201", s == 201, f"status={s}")
check("created in todo", body.get("status") == "todo" if isinstance(body, dict) else False, f"id={tid[:8]}")

s, body = call("GET", "/api/apps/kanban/tasks")
ids = [t.get("id") for t in body.get("tasks", [])] if isinstance(body, dict) else []
check("appears in list", tid in ids)

s, _ = call("POST", f"/api/apps/kanban/tasks/{tid}/move", {"status": "backlog"})
check("move -> 200", s == 200, f"status={s}")

s, body = call("POST", f"/api/apps/kanban/tasks/{tid}/feedback", {"message": "Please continue"})
check("feedback without session -> 409", s == 409, f"status={s} {str(body)[:100]}")

s, body = call("PATCH", f"/api/apps/kanban/tasks/{tid}", {"prompt": "CI smoke task (edited)", "assignee": "CI", "metadata": {"source": "smoke"}})
check("patch -> 200", s == 200, f"status={s}")
check("assignee persists", body.get("assignee") == "CI" if isinstance(body, dict) else False)
check("metadata persists", body.get("metadata") == {"source": "smoke"} if isinstance(body, dict) else False)

s, body = call("POST", "/api/apps/kanban/reconcile", {})
check("reconcile -> 200", s == 200, f"status={s} {str(body)[:60]}")

s, _ = call("DELETE", f"/api/apps/kanban/tasks/{tid}")
check("delete -> 200", s == 200, f"status={s}")
s, _ = call("DELETE", f"/api/apps/kanban/tasks/{engine_tid}")
check("delete engine task -> 200", s == 200, f"status={s}")
s, _ = call("DELETE", f"/api/apps/kanban/tasks/{goal_tid}")
check("delete goal task -> 200", s == 200, f"status={s}")

s, body = call("GET", "/api/apps/kanban/tasks")
ids = [t.get("id") for t in body.get("tasks", [])] if isinstance(body, dict) else []
check("gone after delete", tid not in ids)

s, _ = call("GET", "/api/apps/kanban/definitely-not-a-route")
check("unknown route -> 404", s == 404, f"status={s}")

print("---")
if failures:
    print(f"API SMOKE: {len(failures)} FAILURE(S): {failures}")
    sys.exit(1)
print("API SMOKE: ALL PASS")
