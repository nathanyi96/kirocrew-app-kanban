"""Continue an existing KiroCrew Chat session from a Kanban task."""

from __future__ import annotations

import asyncio
from typing import Any, Callable

from aiohttp import web


async def submit_feedback(
    request: web.Request,
    ctx: Any,
    *,
    store: Any,
    state: Any,
    read_object_body: Callable[..., Any],
    str_field: Callable[..., str],
    start_execution: Callable[..., Any],
    attach_session_key: Callable[..., Any],
    settle_execution: Callable[..., Any],
    run_chat: Callable[..., Any],
    watch_execution: Callable[..., Any],
) -> web.Response:
    """Append feedback to the task's existing Chat slot and watch its turn.

    The callbacks keep this service independent of the gateway-specific board
    model while ``routes.py`` remains the compatibility entry point loaded by
    KiroCrew's isolated hook loader.
    """
    task_id = request.match_info["id"]
    body = await read_object_body(request)
    message = str_field(body, "message").strip()
    if not message:
        return web.json_response({"error": "Feedback message cannot be empty", "code": "feedback_empty"}, status=400)
    if len(message) > 8000:
        return web.json_response({"error": "Feedback message is too long", "code": "feedback_too_long"}, status=400)

    task = await asyncio.to_thread(store.get_task, task_id)
    if task is None:
        return web.json_response({"error": "Task not found", "code": "task_not_found"}, status=404)
    latest = task.executions[-1] if task.executions else None
    if latest is None or not latest.session_key:
        return web.json_response({"error": "Run this task first to create an agent session", "code": "no_agent_session"}, status=409)
    if latest.engine == "task_runner":
        return web.json_response({"error": "Task Runner feedback must be sent from the Task Runner surface", "code": "task_runner_feedback_unsupported"}, status=409)

    slot = (getattr(state, "_slots", {}) or {}).get(latest.session_key)
    if slot is None:
        return web.json_response({"error": "The agent session is no longer available", "code": "session_unavailable"}, status=409)
    if getattr(slot, "running", False) or task.status == "running":
        return web.json_response({"error": "Wait for the current agent step to finish before replying", "code": "task_already_running"}, status=409)

    claim: dict[str, Any] = {}

    def claim_feedback(current: Any) -> Any:
        if current.status == "running":
            claim["conflict"] = True
            return current
        claimed, execution = start_execution(current, latest.engine)
        claim["execution"] = execution
        return claimed

    result = await asyncio.to_thread(store.update_task, task_id, claim_feedback)
    if result is None:
        return web.json_response({"error": "Task not found", "code": "task_not_found"}, status=404)
    if claim.get("conflict"):
        return web.json_response({"error": "Task is already running", "code": "task_already_running"}, status=409)

    execution = claim["execution"]
    baseline_total = int(getattr(slot, "total_messages", 0))
    stop_gen = int(getattr(slot, "_stop_generation", 0))
    try:
        started = slot.enqueue_or_run_prompt(message, run_chat, state)
        turn = getattr(slot, "task", None) if started else None
        await asyncio.to_thread(
            store.update_task,
            task_id,
            lambda cur: attach_session_key(cur, execution.id, latest.session_key),
        )
        state.push_slots_update()
        asyncio.create_task(
            watch_execution(
                state, store, task_id, execution.id, latest.session_key, turn,
                baseline_total=baseline_total, stop_gen=stop_gen,
            )
        )
    except Exception as exc:
        error_text = str(exc)
        await asyncio.to_thread(
            store.update_task,
            task_id,
            lambda cur: settle_execution(cur, execution.id, "failed", error_text),
        )
        return web.json_response({"error": f"Failed to send feedback: {error_text}", "code": "feedback_start_failed"}, status=500)

    return web.json_response({"execution_id": execution.id, "session_key": latest.session_key, "status": "running"}, status=202)
