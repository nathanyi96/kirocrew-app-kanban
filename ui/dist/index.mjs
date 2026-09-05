import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { jsxs, jsx } from "react/jsx-runtime";
import { useNavigate } from "@kirocrew/app-sdk";
import lucide from "lucide-react";
const API = "/api/apps/kanban";
class KanbanApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "KanbanApiError";
    this.code = details.code || "";
    this.action = details.action || null;
  }
}
async function api(path, options) {
  const res = await fetch(API + path, { credentials: "same-origin", ...options });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let message = `${res.status}${body ? `: ${body}` : ""}`;
    let details = {};
    try {
      const parsed = JSON.parse(body);
      details = parsed && typeof parsed === "object" ? parsed : {};
      if (parsed && typeof parsed.error === "string" && parsed.error) message = parsed.error;
    } catch {
    }
    throw new KanbanApiError(message, details);
  }
  if (res.status === 204) return null;
  return res.json();
}
const jsonBody = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj)
});
const T = {
  bg: "var(--bg, #12141a)",
  card: "var(--card, #181b22)",
  elevated: "var(--bg-elevated, #1a1d25)",
  hover: "var(--bg-hover, #262a35)",
  text: "var(--text, #e4e4e7)",
  strong: "var(--text-strong, #fafafa)",
  muted: "var(--muted, #7f7f88)",
  border: "var(--border, #27272a)",
  borderStrong: "var(--border-strong, #3f3f46)",
  accent: "#7c3aed",
  accentSoft: "rgba(124,58,237,0.14)",
  ok: "var(--ok, #22c55e)",
  warn: "var(--warn, #eab308)",
  danger: "var(--danger, #ef4444)",
  info: "var(--info, #0891b2)"
};
const actionPill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "none",
  borderRadius: 7,
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};
const toneColor = (tone) => tone === "ok" ? T.ok : tone === "danger" ? T.danger : tone === "info" ? T.info : tone === "warn" ? T.warn : T.muted;
const toneSurface = (tone) => tone === "ok" ? "rgba(34,197,94,0.11)" : tone === "danger" ? "rgba(239,68,68,0.11)" : tone === "info" ? "rgba(8,145,178,0.11)" : tone === "warn" ? "rgba(234,179,8,0.11)" : "rgba(127,127,136,0.11)";
const toneBorder = (tone) => tone === "ok" ? "rgba(34,197,94,0.38)" : tone === "danger" ? "rgba(239,68,68,0.38)" : tone === "info" ? "rgba(8,145,178,0.38)" : tone === "warn" ? "rgba(234,179,8,0.38)" : "rgba(127,127,136,0.3)";
const COLUMNS = [
  { id: "backlog", label: "Backlog", accent: "var(--muted, #7f7f88)" },
  { id: "todo", label: "To do", accent: "var(--info, #0891b2)" },
  { id: "running", label: "Running", accent: "var(--warn, #eab308)" },
  { id: "done", label: "Done", accent: "var(--ok, #22c55e)" },
  { id: "failed", label: "Failed", accent: "var(--danger, #ef4444)" }
];
const DROP_TARGETS = ["backlog", "todo", "done", "failed"];
const ENGINE_OPTIONS = [
  { id: "auto", label: "Auto", help: "Chat for simple prompts; Task Runner for multi-step work" },
  { id: "chat", label: "Chat", help: "One live Chat session" },
  { id: "task_runner", label: "Task Runner", help: "Multi-step execution with progress" },
  { id: "autopilot", label: "Autopilot", help: "Plan first, then approve in a Chat session" }
];
const ENGINE_LABELS = Object.fromEntries(ENGINE_OPTIONS.map((engine) => [engine.id, engine.label]));
const GOAL_STATUS = {
  ready: { label: "Ready", tone: "muted" },
  working: { label: "Working", tone: "warn" },
  needs_input: { label: "Needs input", tone: "warn" },
  needs_review: { label: "Needs review", tone: "info" },
  achieved: { label: "Achieved", tone: "ok" },
  paused: { label: "Paused", tone: "muted" },
  blocked: { label: "Blocked", tone: "danger" },
  budget_exhausted: { label: "Budget exhausted", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" }
};
const ACTIVITY_TITLES = {
  created: "Task created",
  refined: "Task clarified",
  edited: "Task updated",
  moved: "Task moved",
  started: "Agent started a run",
  run_started: "Agent started a run",
  settled: "Agent replied",
  run_settled: "Agent replied",
  goal_updated: "Goal updated",
  accepted: "Outcome accepted"
};
const cleanLine = (value) => String(value || "").split("\n").map((line) => line.replace(/^\s*>+\s*/, "").replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s*)/, "").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`+([^`]*)`+/g, "$1").replace(/(\*\*\*|___)(.*?)\1/g, "$2").replace(/(\*\*|__)(.*?)\1/g, "$2").replace(new RegExp("(\\*|_)(?=\\S)(.*?)(?<=\\S)\\1", "g"), "$2").replace(/~~(.*?)~~/g, "$1").trim()).find(Boolean) || "";
const cleanProse = (value) => {
  const lines = String(value || "").split("\n");
  let headingFallback = "";
  for (const line of lines) {
    const isHeading = /^\s*#{1,6}\s/.test(line);
    const cleaned = cleanLine(line);
    if (!cleaned) continue;
    if (isHeading) {
      if (!headingFallback) headingFallback = cleaned;
      continue;
    }
    return cleaned;
  }
  return headingFallback;
};
function cardBody(task) {
  const latest = task.executions?.length ? task.executions[task.executions.length - 1] : null;
  const packet = taskResultPacket(task);
  if (task.status === "running") {
    return {
      text: cleanProse(latest?.progress_detail || latest?.progress || packet.summary) || "The agent is working on this task.",
      tone: "live"
    };
  }
  if (task.status === "failed") {
    return { text: cleanProse(latest?.error || packet.summary) || "The latest run needs attention.", tone: "error" };
  }
  if (task.status === "done") {
    return { text: cleanProse(packet.summary || latest?.summary) || "The run finished — review the evidence.", tone: "result" };
  }
  const intent = task.description || task.goal?.objective || task.prompt || "";
  return { text: intent, tone: "intent" };
}
function cardQualifier(task) {
  const progress = taskProgress(task);
  if (task.status === "running") return progress.determinate ? progress.label : "";
  if (task.status === "failed") return "";
  if (task.status === "done") {
    const criteria = taskVerification(task).filter((check) => check.required !== false);
    const passed = criteria.filter((check) => check.status === "passed").length;
    return criteria.length ? `${passed}/${criteria.length} verified` : "";
  }
  return "";
}
const activityStatus = (kind, summary) => {
  const normalized = `${kind || ""} ${summary || ""}`.toLowerCase();
  if (normalized.includes("fail")) return "failed";
  if (normalized.includes("settled") || normalized.includes("done") || normalized.includes("complete")) return "succeeded";
  return "running";
};
function taskEngine(task) {
  const latest = task.executions && task.executions.length ? task.executions[task.executions.length - 1] : null;
  return latest?.engine || task.active_engine || task.engine || "auto";
}
function taskActivities(task) {
  const stored = Array.isArray(task.activities) ? task.activities : Array.isArray(task.activity) ? task.activity : null;
  if (stored) {
    return [...stored].reverse().map((item, index) => ({
      ...item,
      id: item.id || `activity-${index}`,
      title: item.title || ACTIVITY_TITLES[item.kind] || "Task update",
      summary: item.summary || item.detail || "The task was updated.",
      created_at: item.created_at || item.at,
      status: item.status || activityStatus(item.kind, item.summary)
    }));
  }
  return [...task.executions || []].reverse().map((exec, index) => ({
    id: exec.id || `run-${index}`,
    execution_id: exec.id,
    title: exec.result === "succeeded" ? "Agent replied" : exec.result === "failed" ? "Agent run failed" : "Agent is working",
    summary: exec.summary || exec.progress_detail || exec.error || (exec.result === "succeeded" ? "The latest execution returned successfully." : "The agent has started processing this task."),
    created_at: exec.ended_at || exec.started_at,
    status: exec.result || "running"
  }));
}
const resourceName = (url) => {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
  } catch {
    return url;
  }
};
const resourceCategory = (resource) => {
  const value = `${resource.type || ""} ${resource.kind || ""} ${resource.title || ""} ${resource.url || resource.href || ""}`.toLowerCase();
  if (/\b(diff|patch|change|commit|branch)\b|\.(diff|patch)(?:$|[?#])/.test(value)) return "changes";
  if (/\b(markdown|note|readme)\b|\.md(?:$|[?#])/.test(value)) return "notes";
  return "files";
};
const normalizeResource = (resource, fallbackId, executionId) => {
  if (typeof resource === "string") resource = { url: resource };
  const url = resource.url || resource.href || "";
  const normalized = {
    ...resource,
    id: resource.id || fallbackId,
    title: resource.title || resource.name || (url ? resourceName(url) : "Agent artifact"),
    url,
    execution_id: resource.execution_id || executionId || null
  };
  return { ...normalized, category: resourceCategory(normalized) };
};
const linksFromText = (text, executionId) => {
  if (!text) return [];
  const links = [];
  const seen = /* @__PURE__ */ new Set();
  const markdown = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = markdown.exec(text)) !== null) {
    const url = match[2].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(normalizeResource({ title: match[1], url, type: "link" }, `link-${executionId || "task"}-${links.length}`, executionId));
  }
  const raw = /https?:\/\/[^\s<>()\]]+/g;
  while ((match = raw.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(normalizeResource({ url, type: "link" }, `link-${executionId || "task"}-${links.length}`, executionId));
  }
  return links;
};
function taskArtifacts(task) {
  const resources = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (resource) => {
    const key = resource.url || resource.href || resource.path || resource.id || resource.title;
    if (!key || seen.has(key)) return;
    seen.add(key);
    resources.push(resource);
  };
  (Array.isArray(task.artifacts) ? task.artifacts : []).forEach((resource, index) => {
    add(normalizeResource(resource, `artifact-${index}`, resource?.execution_id));
  });
  (task.executions || []).forEach((exec, executionIndex) => {
    (Array.isArray(exec.artifacts) ? exec.artifacts : []).forEach((resource, resourceIndex) => {
      add(normalizeResource(resource, `artifact-${executionIndex}-${resourceIndex}`, exec.id));
    });
    linksFromText(exec.summary, exec.id).forEach(add);
  });
  linksFromText(task.latest_result || task.final_result, null).forEach(add);
  return resources;
}
function taskResourceGroups(task) {
  const all = taskArtifacts(task);
  return {
    artifacts: all,
    files: all,
    changes: all.filter((resource) => resource.category === "changes"),
    notes: all.filter((resource) => resource.category === "notes")
  };
}
function taskSteps(task, resources = taskArtifacts(task)) {
  if (Array.isArray(task.steps) && task.steps.length) {
    return task.steps.map((step, index) => typeof step === "string" ? {
      id: `step-${index}`,
      title: step,
      summary: "",
      status: index === 0 && task.status === "running" ? "running" : "pending",
      artifacts: []
    } : {
      ...step,
      id: step.id || `step-${index}`,
      title: step.title || step.name || `Step ${index + 1}`,
      summary: step.summary || step.detail || "",
      status: step.status || "pending",
      artifacts: resources.filter((resource) => resource.step_id === step.id)
    });
  }
  const projected = (task.executions || []).flatMap((exec) => Array.isArray(exec.steps) ? exec.steps.map((step) => ({
    ...step,
    engine: exec.engine,
    started_at: exec.started_at,
    ended_at: exec.ended_at,
    artifacts: resources.filter((resource) => resource.step_id === step.id || step.artifact_ids?.includes(resource.id))
  })) : []);
  if (projected.length) return projected;
  return (task.executions || []).map((exec, index) => ({
    id: exec.id || `run-${index}`,
    title: `Run ${index + 1}`,
    summary: exec.summary || exec.progress_detail || exec.error || (exec.result ? `Execution ${exec.result}.` : "The agent is working on this run."),
    status: exec.result || "running",
    engine: exec.engine,
    started_at: exec.started_at,
    ended_at: exec.ended_at,
    artifacts: resources.filter((resource) => resource.execution_id === exec.id)
  }));
}
function taskKeyPoints(task) {
  if (Array.isArray(task.key_points) && task.key_points.length) {
    return task.key_points.map((point) => typeof point === "string" ? point : point.text || point.title).filter(Boolean).slice(0, 4);
  }
  const latest = task.executions?.[task.executions.length - 1];
  const summaryLines = String(latest?.summary || task.latest_result || task.final_result || "").split("\n").map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s*)/, "").trim()).filter((line) => line.length > 3 && !/^https?:\/\//.test(line)).map((line) => line.slice(0, 280));
  const recentActivity = taskActivities(task).filter((item) => !["created", "refined", "moved"].includes(item.kind)).map((item) => item.summary);
  return [.../* @__PURE__ */ new Set([...summaryLines, ...recentActivity])].slice(0, 4);
}
function taskProgress(task) {
  const latest = task.executions?.[task.executions.length - 1];
  const criteria = (task.goal?.criteria || task.result_packet?.verification || []).filter((check) => check.required !== false);
  if (criteria.length) {
    const passed = criteria.filter((check) => check.status === "passed").length;
    return { percent: Math.round(passed / criteria.length * 100), label: `${passed} of ${criteria.length} verified`, determinate: true };
  }
  const steps = Array.isArray(latest?.steps) ? latest.steps : [];
  if (steps.length) {
    const complete = steps.filter((step) => ["passed", "skipped", "completed", "succeeded"].includes(step.status)).length;
    return { percent: Math.round(complete / steps.length * 100), label: `${complete} of ${steps.length} checkpoints`, determinate: true };
  }
  const raw = String(latest?.progress || task.progress || "");
  const fraction = raw.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
  if (fraction && Number(fraction[2]) > 0) {
    const current = Number(fraction[1]);
    const total = Number(fraction[2]);
    return { percent: Math.min(100, Math.round(current / total * 100)), label: `${current} of ${total}`, determinate: true };
  }
  const percentage = raw.match(/(\d{1,3})\s*%/);
  if (percentage) {
    const percent = Math.min(100, Number(percentage[1]));
    return { percent, label: `${percent}%`, determinate: true };
  }
  if (task.goal?.status === "achieved" || task.result_packet?.status === "verified") return { percent: 100, label: "Verified", determinate: true };
  if (task.status === "done") return { percent: null, label: "Finished · review evidence", determinate: false };
  if (task.status === "failed") return { percent: null, label: "Needs attention", determinate: false };
  if (task.status === "running") return { percent: null, label: "Working", determinate: false };
  return { percent: 0, label: "Not started", determinate: true };
}
function taskState(task) {
  if (task.goal?.status) return task.goal.status;
  if (task.status === "running") return "working";
  if (task.status === "failed") return "blocked";
  if (task.result_packet?.status === "verified") return "achieved";
  if (task.status === "done") return "needs_review";
  return "ready";
}
function taskStateMeta(task) {
  const state = taskState(task);
  return { state, ...GOAL_STATUS[state] || GOAL_STATUS.ready };
}
function taskRunBlocker(task, now = Date.now() / 1e3) {
  const goal = task.goal;
  if (!goal || goal.mode !== "loop") return null;
  if (goal.status === "achieved") return "Goal is already achieved";
  if (goal.attempts >= goal.max_attempts) return `Goal attempt limit reached (${goal.attempts}/${goal.max_attempts})`;
  if (goal.token_budget && goal.tokens_used >= goal.token_budget) return "Goal token budget exhausted";
  if (goal.started_at && goal.max_minutes && now - goal.started_at >= goal.max_minutes * 60) return "Goal time budget exhausted";
  return null;
}
function defaultTaskTab(task) {
  const state = taskState(task);
  if (["working", "needs_input", "blocked", "budget_exhausted", "paused"].includes(state)) return "goal";
  return "outcome";
}
function taskVerification(task) {
  const latest = task.executions?.[task.executions.length - 1];
  return task.result_packet?.verification || task.goal?.criteria || latest?.verifications || [];
}
function taskResultPacket(task) {
  const latest = task.executions?.[task.executions.length - 1];
  if (task.result_packet) return task.result_packet;
  const status = task.status === "running" ? "working" : latest?.result === "failed" ? "failed" : latest?.result === "succeeded" ? "needs_review" : "pending";
  return {
    status,
    summary: latest?.summary || latest?.progress_detail || latest?.error || "",
    verification: taskVerification(task),
    artifact_ids: (latest?.artifacts || []).map((item) => item.id),
    risks: latest?.error ? [latest.error] : [],
    next_actions: task.status === "running" ? ["Wait for the next verified checkpoint"] : ["Run the task to produce an outcome"],
    changed_files: 0
  };
}
function taskAttempts(task) {
  return (task.executions || []).map((exec, index) => ({
    ...exec,
    number: index + 1,
    title: `Attempt ${index + 1}`,
    status: exec.result || (task.status === "running" && index === task.executions.length - 1 ? "running" : "pending"),
    steps: Array.isArray(exec.steps) ? exec.steps : []
  }));
}
function taskFocus(task) {
  const latest = task.executions?.[task.executions.length - 1];
  const state = taskStateMeta(task);
  const packet = taskResultPacket(task);
  const status = state.label;
  const result = packet.summary || latest?.summary || task.latest_result || task.final_result || latest?.error || "";
  const current = task.status === "running" ? latest?.progress_detail || latest?.progress || "The agent is working through the task." : task.status === "done" ? cleanLine(result) || "The latest agent run completed successfully." : task.status === "failed" ? latest?.error || "The latest run needs attention." : "Ready for the agent to start.";
  const next = task.next_step || latest?.next_step || (task.status === "running" ? "Review the next agent update when it arrives." : task.status === "done" ? "Review the result or send a follow-up instruction." : task.status === "failed" ? "Open the run, adjust the instruction, then try again." : "Run the task to begin the first agent step.");
  return { status, state: state.state, current, result, next, progress: taskProgress(task), keyPoints: taskKeyPoints(task) };
}
const VIEW_MODES = [
  {
    id: "board",
    label: "Board",
    help: "Five lanes, drag a card to change its state"
  },
  {
    id: "flat",
    label: "Flat",
    help: "Every card in one grid, coloured by state"
  },
  {
    id: "cluster",
    label: "Clusters",
    help: "Grouped by topic, proposed in the background and yours to correct"
  },
  {
    id: "project",
    label: "Projects",
    help: "Grouped by the project each card was created in"
  }
];
const VIEW_IDS = VIEW_MODES.map((view) => view.id);
const DEFAULT_VIEW = "flat";
const VIEW_KEY = "kanban:view-mode";
function readViewMode() {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY);
    return VIEW_IDS.includes(stored) ? stored : DEFAULT_VIEW;
  } catch {
    return DEFAULT_VIEW;
  }
}
function writeViewMode(view) {
  if (!VIEW_IDS.includes(view)) return;
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
  }
}
const FLAT_RANK = { running: 0, todo: 1, backlog: 2, done: 3, failed: 4 };
function flatSort(tasks) {
  return [...tasks].sort(
    (a, b) => (FLAT_RANK[a.status] ?? 9) - (FLAT_RANK[b.status] ?? 9) || b.updated_at - a.updated_at
  );
}
function useTaskPolling(tasks, refresh) {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  useEffect(() => {
    let stopped = false;
    let timer = null;
    const tick = async () => {
      await refresh();
      if (stopped) return;
      const busy = tasksRef.current.some((t) => t.refining || t.status === "running");
      timer = setTimeout(tick, busy ? 1500 : 5e3);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);
}
function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/tasks");
      setTasks(data.tasks || []);
    } catch (err) {
      console.warn("kanban: poll failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);
  useTaskPolling(tasks, refresh);
  useEffect(() => {
    const key = "kanban-reconciled";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    api("/reconcile", jsonBody({})).catch(() => {
    }).finally(refresh);
  }, [refresh]);
  return { tasks, setTasks, loading, refresh };
}
const EMPTY = { projects: [], clusters: [], assignments: {}, clusters_refreshing: false, clusters_stale: false };
function useGroups(enabled, boardRevision) {
  const [groups, setGroups] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const refresh = useCallback(async () => {
    try {
      const data = await api("/groups");
      setGroups(data || EMPTY);
      return data;
    } catch (err) {
      console.warn("kanban: groups fetch failed:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  const regroup = useCallback(async () => {
    try {
      await api("/clusters/refresh", jsonBody({}));
      setGroups((current) => ({ ...current, clusters_refreshing: true }));
    } catch (err) {
      if (err?.code) console.warn("kanban: regroup rejected:", err);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return void 0;
    setLoading(true);
    let cancelled = false;
    refresh().then((data) => {
      if (cancelled || !data?.clusters_refreshing) return;
      timer.current = window.setTimeout(() => {
        if (!cancelled) refresh();
      }, 6e3);
    });
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [enabled, boardRevision, refresh]);
  return { groups, loading, refresh, regroup };
}
function relativeTime(ts) {
  const secs = Math.max(0, Math.round(Date.now() / 1e3 - ts));
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
function formatTime(ts) {
  return new Date(ts * 1e3).toLocaleString();
}
function duration(startedAt, endedAt) {
  const end = endedAt ?? Date.now() / 1e3;
  const secs = Math.max(0, Math.round(end - startedAt));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor(secs % 3600 / 60)}m`;
}
const { AlertCircle: AlertCircle$1, Flag, Loader2: Loader2$1, MessageSquare, MoreHorizontal, Play: Play$2, RotateCw: RotateCw$1 } = lucide;
const STATE_TONE = { backlog: "muted", todo: "info", running: "warn", done: "ok", failed: "danger" };
const TINT = {
  muted: "rgba(127,127,136,0.055)",
  info: "rgba(8,145,178,0.06)",
  warn: "rgba(234,179,8,0.07)",
  ok: "rgba(34,197,94,0.06)",
  danger: "rgba(239,68,68,0.07)"
};
const EDGE = {
  muted: "rgba(127,127,136,0.30)",
  info: "rgba(8,145,178,0.34)",
  warn: "rgba(234,179,8,0.38)",
  ok: "rgba(34,197,94,0.32)",
  danger: "rgba(239,68,68,0.36)"
};
const STATE_LABEL = { backlog: "Backlog", todo: "To do", running: "Running", done: "Review", failed: "Failed" };
const bodyColor = (tone) => tone === "error" ? T.danger : T.text;
function TaskCard({ task, variant = "board", onClick, onRun, onOpenEngine, onMoveMenu, runBusy }) {
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null;
  const engine = taskEngine(task);
  const running = task.status === "running";
  const flat = variant === "flat";
  const hasTarget = Boolean(latest && (latest.session_key || latest.runner_id));
  const tone = STATE_TONE[task.status] || "muted";
  const accent = toneColor(tone);
  const goal = taskStateMeta(task);
  const progress = taskProgress(task);
  const body = cardBody(task);
  const qualifier = cardQualifier(task);
  const runBlocker = taskRunBlocker(task);
  const RESTATES_LANE = { failed: ["blocked"], running: ["working"], done: ["needs_review", "achieved"] };
  const dissent = ["needs_input", "blocked", "budget_exhausted", "paused"].includes(goal.state) && !(RESTATES_LANE[task.status] || []).includes(goal.state) ? goal : null;
  const meta = [
    ENGINE_LABELS[engine] || "Auto",
    task.tags.length ? task.tags[0] + (task.tags.length > 1 ? ` +${task.tags.length - 1}` : "") : "",
    task.executions.length ? `×${task.executions.length}` : "",
    relativeTime(task.updated_at)
  ].filter(Boolean);
  return jsxs("div", {
    "data-task-id": task.id,
    "data-variant": variant,
    className: "kanban-card",
    draggable: !running,
    onDragStart: (e) => {
      e.dataTransfer.setData("text/task-id", task.id);
      e.dataTransfer.effectAllowed = "move";
    },
    onClick: () => onClick(task),
    role: "button",
    tabIndex: 0,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(task);
      }
    },
    style: {
      position: "relative",
      borderRadius: 9,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      background: flat ? TINT[tone] : T.card,
      border: `1px solid ${flat ? EDGE[tone] : T.border}`,
      padding: flat ? "12px 13px 11px" : "11px 12px 10px 16px",
      minHeight: flat ? 132 : 0
    },
    children: [
      !flat && jsx("span", {
        "aria-hidden": true,
        style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, borderRadius: "9px 0 0 9px", background: accent }
      }),
      jsxs("div", { style: { display: "flex", alignItems: "flex-start", gap: 6 }, children: [
        jsx("h4", {
          style: {
            margin: 0,
            flex: 1,
            fontSize: flat ? 14.5 : 14,
            fontWeight: 600,
            color: T.strong,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical"
          },
          children: task.title
        }),
        // Refining is a spinner and nothing else: the old "Refining…" label
        // squeezed the title into two lines to say what the spinner says.
        task.refining && jsx(Loader2$1, {
          size: 12,
          "aria-label": "Refining",
          role: "img",
          style: { flexShrink: 0, marginTop: 3, color: T.muted, animation: "kanban-spin 1s linear infinite" }
        }),
        running && !task.refining && jsx(Loader2$1, {
          size: 12,
          "aria-hidden": true,
          style: { flexShrink: 0, marginTop: 3, color: T.warn, animation: "kanban-spin 1s linear infinite" }
        }),
        // An icon rather than the old uppercase "HIGH" chip, which cost the
        // title a whole line of width to say one bit.
        task.priority === "high" && jsx(Flag, {
          size: 12,
          "aria-label": "High priority",
          role: "img",
          style: { flexShrink: 0, marginTop: 3, color: T.danger }
        })
      ] }),
      body.text && jsxs("p", {
        style: {
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.45,
          color: bodyColor(body.tone),
          opacity: body.tone === "intent" ? 0.62 : body.tone === "error" ? 1 : 0.82,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: flat ? 3 : 2,
          WebkitBoxOrient: "vertical",
          ...body.tone === "error" ? { display: "flex", gap: 5, alignItems: "flex-start" } : {}
        },
        children: body.tone === "error" ? [jsx(AlertCircle$1, { size: 12, style: { flexShrink: 0, marginTop: 2 }, "aria-hidden": true }), jsx("span", { children: body.text })] : body.text
      }),
      jsxs("div", { style: { marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }, children: [
        // A hairline instead of a sentence. Determinate runs show real progress;
        // an indeterminate one reuses the marquee animation that already shipped
        // in the stylesheet and had no consumer.
        (running || progress.percent === 100) && jsx("div", {
          role: "progressbar",
          "aria-label": "Task progress",
          "aria-valuenow": progress.determinate ? progress.percent : void 0,
          style: { position: "relative", height: 3, borderRadius: 999, background: "rgba(255,255,255,0.07)", overflow: "hidden" },
          children: progress.determinate ? jsx("span", { style: { display: "block", height: "100%", width: `${progress.percent || 0}%`, borderRadius: 999, background: accent, transition: "width 180ms ease" } }) : jsx("span", { style: { position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 999, background: accent, animation: "kanban-indeterminate 1.5s ease-in-out infinite" } })
        }),
        jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted, fontVariantNumeric: "tabular-nums" }, children: [
          flat && jsxs("span", {
            style: { display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 5, padding: "2px 7px", fontSize: 10.5, fontWeight: 650, color: accent, background: toneSurface(tone) },
            children: [
              jsx("span", { "aria-hidden": true, style: { width: 5, height: 5, borderRadius: "50%", background: accent } }),
              STATE_LABEL[task.status] || task.status
            ]
          }),
          dissent && jsx("span", {
            style: { borderRadius: 5, padding: "2px 6px", fontSize: 10, fontWeight: 700, color: toneColor(dissent.tone), background: toneSurface(dissent.tone) },
            children: dissent.label
          }),
          qualifier && jsx("span", { style: { color: task.status === "failed" ? T.danger : task.status === "done" ? T.ok : T.muted }, children: qualifier }),
          jsx("span", { style: { marginLeft: "auto", display: "inline-flex", gap: 5 }, children: meta.join(" · ") })
        ] }),
        // Revealed by :hover and :focus-within (see the stylesheet in App), so it
        // costs no height at rest.
        jsxs("div", { className: "kanban-card-actions", style: { display: "flex", alignItems: "center", gap: 12, fontSize: 11.5 }, children: [
          hasTarget && jsxs("button", {
            type: "button",
            onClick: (e) => {
              e.stopPropagation();
              onOpenEngine(task, latest);
            },
            style: { background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.accent },
            children: [
              engine === "task_runner" ? jsx(Play$2, { size: 11 }) : jsx(MessageSquare, { size: 11 }),
              engine === "task_runner" ? "Task Runner" : running ? "Watch live" : "Open session"
            ]
          }),
          !running && onMoveMenu && jsxs("button", {
            type: "button",
            onClick: (e) => {
              e.stopPropagation();
              onMoveMenu(task);
            },
            // The word "Move" was lane-shaped language. In a grid there is no
            // lane to drag to, so this is the ONLY way to change state there —
            // it says "state", and it is never hidden in a laneless view.
            title: flat ? "Change state" : "Move to another lane",
            style: { background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.muted },
            children: [jsx(MoreHorizontal, { size: 12 }), flat ? "State" : "Move"]
          }),
          !running && !runBlocker && onRun && jsxs("button", {
            type: "button",
            disabled: runBusy,
            onClick: (e) => {
              e.stopPropagation();
              onRun(task);
            },
            title: "Run this task",
            style: { marginLeft: "auto", background: "transparent", border: "none", cursor: runBusy ? "wait" : "pointer", padding: 0, opacity: runBusy ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.muted },
            children: [
              runBusy ? jsx(Loader2$1, { size: 11, style: { animation: "kanban-spin 1s linear infinite" } }) : task.executions.length ? jsx(RotateCw$1, { size: 11 }) : jsx(Play$2, { size: 11, fill: "currentColor" }),
              task.executions.length ? "Run again" : "Run"
            ]
          })
        ] })
      ] })
    ]
  });
}
function KanbanColumn({ column, tasks, onDropTask, children }) {
  const [isOver, setIsOver] = useState(false);
  const droppable = DROP_TARGETS.includes(column.id);
  return jsxs("div", { style: { display: "flex", flexDirection: "column", minWidth: 300, width: 300, flexShrink: 0 }, children: [
    jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "8px 8px 0 0", background: T.elevated }, children: [
      jsx("span", { style: { width: 8, height: 8, borderRadius: "50%", background: column.accent }, "aria-hidden": true }),
      jsx("h3", { style: { margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: T.text }, children: column.label }),
      jsx("span", { style: { marginLeft: "auto", fontSize: 11, color: T.muted, fontVariantNumeric: "tabular-nums" }, children: String(tasks.length) })
    ] }),
    jsxs("div", {
      onDragOver: droppable ? (e) => {
        e.preventDefault();
        setIsOver(true);
      } : void 0,
      onDragLeave: droppable ? () => setIsOver(false) : void 0,
      onDrop: droppable ? (e) => {
        e.preventDefault();
        setIsOver(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) onDropTask(id, column.id);
      } : void 0,
      style: { flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: "0 0 8px 8px", border: `1px solid ${isOver ? "rgba(124,58,237,0.4)" : T.border}`, borderTop: "none", background: isOver ? T.accentSoft : T.bg, overflowY: "auto", minHeight: 200 },
      children: [children, tasks.length === 0 && jsx("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 80 }, children: jsx("p", { style: { fontSize: 11, color: T.muted, fontStyle: "italic" }, children: "No tasks" }) })]
    })
  ] });
}
const GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(316px, 1fr))",
  gap: 11,
  alignItems: "stretch"
};
function TaskGrid({ tasks, renderCard, emptyLabel = "No tasks" }) {
  if (!tasks.length) {
    return jsx("p", {
      style: { margin: "8px 2px 0", fontSize: 12, color: T.muted, fontStyle: "italic" },
      children: emptyLabel
    });
  }
  return jsx("div", { style: GRID_STYLE, children: tasks.map(renderCard) });
}
const { ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles: Sparkles$3 } = lucide;
const TALLY_ORDER = ["running", "todo", "backlog", "done", "failed"];
const TALLY_COLOR = { backlog: T.muted, todo: T.info, running: T.warn, done: T.ok, failed: T.danger };
function Tally({ tasks }) {
  return jsx("span", {
    style: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, color: T.muted },
    children: TALLY_ORDER.filter((status) => tasks.some((t) => t.status === status)).map((status) => jsxs("span", {
      style: { display: "inline-flex", alignItems: "center", gap: 4 },
      children: [
        jsx("span", { "aria-hidden": true, style: { width: 6, height: 6, borderRadius: "50%", background: TALLY_COLOR[status], display: "inline-block" } }),
        String(tasks.filter((t) => t.status === status).length)
      ]
    }, status))
  });
}
function GroupedGrid({ groups, renderCard, aiLabelled = false, refreshing = false, onRefresh, emptyLabel }) {
  const [collapsed, setCollapsed] = useState({});
  if (!groups.length) {
    return jsx("p", { style: { margin: "8px 2px 0", fontSize: 12, color: T.muted, fontStyle: "italic" }, children: emptyLabel || "No tasks" });
  }
  return jsx("div", {
    children: groups.map((group) => {
      const isCollapsed = Boolean(collapsed[group.label]);
      const Caret = isCollapsed ? ChevronRight : ChevronDown;
      return jsxs("section", { style: { marginBottom: 22 }, children: [
        jsxs("div", { style: { display: "flex", alignItems: "center", gap: 9, padding: "7px 2px 11px" }, children: [
          jsxs("button", {
            type: "button",
            "aria-expanded": !isCollapsed,
            onClick: () => setCollapsed((current) => ({ ...current, [group.label]: !current[group.label] })),
            style: { display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", border: "none", cursor: "pointer", padding: 0, color: T.strong },
            children: [
              jsx(Caret, { size: 13, style: { color: T.muted }, "aria-hidden": true }),
              jsx("span", { style: { fontSize: 13, fontWeight: 650 }, children: group.label })
            ]
          }),
          jsxs("span", { style: { fontSize: 11, color: T.muted }, children: [String(group.tasks.length), group.tasks.length === 1 ? " card" : " cards"] }),
          // The AI badge rides on the GROUP, not the card: it is the grouping
          // that was proposed, and saying so is what makes correcting it feel
          // allowed rather than like fighting the tool.
          aiLabelled && !group.ungrouped && jsxs("span", {
            style: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 650, color: T.accent, background: T.accentSoft, border: "1px solid rgba(124,58,237,0.28)", borderRadius: 5, padding: "2px 6px" },
            children: [jsx(Sparkles$3, { size: 10 }), "AI"]
          }),
          group.note && jsx("span", { style: { fontSize: 10.5, color: T.muted }, children: group.note }),
          jsx(Tally, { tasks: group.tasks }),
          jsx("span", { style: { flex: 1, height: 1, background: T.border } }),
          onRefresh && group === groups[0] && jsxs("button", {
            type: "button",
            onClick: onRefresh,
            disabled: refreshing,
            title: "Propose new groups now",
            style: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.muted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 8px", cursor: refreshing ? "wait" : "pointer" },
            children: [
              refreshing ? jsx(Loader2, { size: 11, style: { animation: "kanban-spin 1s linear infinite" } }) : jsx(RefreshCw, { size: 11 }),
              refreshing ? "Grouping…" : "Regroup"
            ]
          })
        ] }),
        !isCollapsed && jsx(TaskGrid, { tasks: group.tasks, renderCard }),
        isCollapsed && jsx("div", {
          style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px dashed ${T.borderStrong}`, borderRadius: 9, background: "rgba(0,0,0,0.14)", fontSize: 12, color: T.muted },
          children: `${group.tasks.length} ${group.tasks.length === 1 ? "card" : "cards"} hidden`
        })
      ] }, group.label);
    })
  });
}
const { Columns3, Folder, LayoutGrid, Network } = lucide;
const ICONS = { board: Columns3, flat: LayoutGrid, cluster: Network, project: Folder };
function ViewSwitcher({ view, onChange }) {
  return jsx("div", {
    // A radiogroup, not a row of buttons: these are four mutually exclusive
    // states of one control, so arrow-key navigation and the "3 of 4" screen
    // reader position come for free and match what the control looks like.
    role: "radiogroup",
    "aria-label": "Board layout",
    style: {
      display: "inline-flex",
      gap: 2,
      padding: 3,
      borderRadius: 9,
      background: T.elevated,
      border: `1px solid ${T.border}`
    },
    children: VIEW_MODES.map((mode) => {
      const Icon = ICONS[mode.id];
      const active = mode.id === view;
      return jsxs("button", {
        type: "button",
        role: "radio",
        "aria-checked": active,
        title: mode.help,
        onClick: () => onChange(mode.id),
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          borderRadius: 6,
          padding: "7px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          background: active ? T.card : "transparent",
          color: active ? T.strong : T.muted,
          boxShadow: active ? "0 1px 3px rgba(0,0,0,0.32)" : "none"
        },
        children: [Icon ? jsx(Icon, { size: 13, "aria-hidden": true }) : null, mode.label]
      }, mode.id);
    })
  });
}
function MoveMenu({ task, onMove, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return jsxs("div", { style: { position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }, children: [
    jsx("button", { type: "button", "aria-label": "Close move menu", onClick: onClose, style: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", border: "none", cursor: "default" } }),
    jsxs("div", { role: "dialog", "aria-modal": true, "aria-label": `Move "${task.title}"`, style: { position: "relative", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, width: 260, boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }, children: [
      jsx("h3", { style: { margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: T.strong }, children: "Move to" }),
      ...DROP_TARGETS.filter((s) => s !== task.status).map((status) => {
        const col = COLUMNS.find((c) => c.id === status);
        return jsxs("button", { type: "button", onClick: () => {
          onMove(task.id, status);
          onClose();
        }, style: { display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: "9px 8px", borderRadius: 8, fontSize: 13, color: T.text, textAlign: "left" }, children: [jsx("span", { style: { width: 8, height: 8, borderRadius: "50%", background: col.accent } }), col.label] }, status);
      })
    ] })
  ] });
}
const { Check, Plus: Plus$1, Repeat2, Sparkles: Sparkles$2, X: X$2 } = lucide;
function CreateTaskForm({ initialPrompt, initialEngine, initialGoal, onSubmit, onCancel }) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [engine, setEngine] = useState(initialEngine || "auto");
  const [loop, setLoop] = useState(initialGoal?.mode === "loop");
  const [criteria, setCriteria] = useState((initialGoal?.criteria || [
    "The requested outcome is implemented",
    "Relevant checks pass without regressions",
    "The final result and produced artifacts are summarized"
  ]).join("\n"));
  const [maxAttempts, setMaxAttempts] = useState(initialGoal?.max_attempts || 3);
  const [maxMinutes, setMaxMinutes] = useState(initialGoal?.max_minutes || 60);
  const [tokenBudget, setTokenBudget] = useState(initialGoal?.token_budget || 5e4);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => prompt.trim() ? setConfirmDiscard(true) : onCancel();
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return jsx("div", { style: { position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(0,0,0,0.35)" }, children: jsxs("form", { onSubmit: (e) => {
    e.preventDefault();
    if (prompt.trim()) onSubmit({ prompt: prompt.trim(), engine: loop ? "task_runner" : engine, goal: loop ? { mode: "loop", objective: prompt.trim(), criteria: criteria.split("\n").map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean), max_attempts: Number(maxAttempts), max_minutes: Number(maxMinutes), token_budget: Number(tokenBudget) } : null });
  }, style: { width: "100%", maxWidth: 560, maxHeight: "calc(100vh - 40px)", overflowY: "auto", background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }, children: [
    jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" }, children: [jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [jsx(Sparkles$2, { size: 16, style: { color: T.accent } }), jsx("h3", { style: { margin: 0, fontSize: 14, color: T.strong }, children: "New task" })] }), jsx("button", { type: "button", "aria-label": "Close", onClick: requestClose, style: { background: "transparent", border: "none", color: T.muted }, children: jsx(X$2, { size: 16 }) })] }),
    jsx("label", { style: { fontSize: 12, color: T.muted }, children: jsx("textarea", { autoFocus: true, value: prompt, onChange: (e) => setPrompt(e.target.value), placeholder: "What do you want done?", style: { display: "block", width: "100%", boxSizing: "border-box", marginTop: 8, minHeight: 120, background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontFamily: "inherit" } }) }),
    jsx("select", { value: loop ? "task_runner" : engine, disabled: loop, onChange: (e) => setEngine(e.target.value), style: { background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: 9, opacity: loop ? 0.72 : 1 }, children: ENGINE_OPTIONS.map((option) => jsx("option", { value: option.id, children: `${option.label} — ${option.help}` }, option.id)) }),
    jsxs("button", { type: "button", role: "switch", "aria-checked": loop, onClick: () => setLoop((value) => !value), style: { display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, alignItems: "center", padding: 11, borderRadius: 10, border: `1px solid ${loop ? "rgba(124,58,237,0.5)" : T.border}`, background: loop ? T.accentSoft : T.bg, color: T.text, textAlign: "left", cursor: "pointer" }, children: [
      jsx("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: loop ? T.accent : T.hover, color: loop ? "#fff" : T.muted }, children: loop ? jsx(Check, { size: 13 }) : jsx(Repeat2, { size: 13 }) }),
      jsxs("span", { children: [jsx("strong", { style: { display: "block", color: T.strong, fontSize: 11 }, children: "Continue until verified" }), jsx("span", { style: { display: "block", marginTop: 2, color: T.muted, fontSize: 10, lineHeight: 1.4 }, children: "Use bounded Task Runner attempts until the checks pass or a stop condition is reached." })] })
    ] }),
    loop && jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 11, padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg }, children: [
      jsxs("label", { style: { color: T.muted, fontSize: 10, fontWeight: 650 }, children: ["Done means", jsx("textarea", { value: criteria, onChange: (e) => setCriteria(e.target.value), "aria-label": "Goal acceptance criteria", style: { display: "block", width: "100%", minHeight: 82, boxSizing: "border-box", marginTop: 7, padding: 9, resize: "vertical", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: "inherit", fontSize: 11, lineHeight: 1.5 } })] }),
      jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }, children: [
        jsx(LimitInput, { label: "Attempts", value: maxAttempts, min: 1, max: 10, onChange: setMaxAttempts }),
        jsx(LimitInput, { label: "Minutes", value: maxMinutes, min: 5, max: 720, onChange: setMaxMinutes }),
        jsx(LimitInput, { label: "Token budget", value: tokenBudget, min: 1e3, max: 2e6, step: 1e3, onChange: setTokenBudget })
      ] }),
      jsx("p", { style: { margin: 0, color: T.muted, fontSize: 9, lineHeight: 1.45 }, children: "The loop pauses for approvals, repeated failures, or exhausted limits. It never runs without a stopping condition." })
    ] }),
    jsxs("div", { style: { display: "flex", gap: 8 }, children: [jsxs("button", { type: "submit", disabled: !prompt.trim(), style: { flex: 1, display: "inline-flex", justifyContent: "center", gap: 6, padding: 10, border: "none", borderRadius: 8, background: T.accent, color: "#fff" }, children: [jsx(Plus$1, { size: 14 }), "Create task"] }), jsx("button", { type: "button", onClick: requestClose, style: { padding: "0 14px", border: `1px solid ${T.border}`, borderRadius: 8, background: "transparent", color: T.text }, children: "Cancel" })] }),
    confirmDiscard && jsxs("div", { role: "alertdialog", style: { padding: 10, background: "rgba(234,179,8,0.1)", color: T.text }, children: ["Discard what you typed? ", jsx("button", { type: "button", onClick: () => setConfirmDiscard(false), children: "Keep editing" }), jsx("button", { type: "button", onClick: onCancel, children: "Discard" })] })
  ] }) });
}
function LimitInput({ label, value, min, max, step = 1, onChange }) {
  return jsxs("label", { style: { minWidth: 0, color: T.muted, fontSize: 9 }, children: [label, jsx("input", { type: "number", value, min, max, step, onChange: (event) => onChange(Number(event.target.value)), style: { width: "100%", boxSizing: "border-box", marginTop: 5, padding: "7px 6px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 10 } })] });
}
function IconButton({ label, onClick, children, style, disabled = false }) {
  return jsx("button", {
    type: "button",
    "aria-label": label,
    title: label,
    onClick,
    disabled,
    style: {
      background: "transparent",
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      padding: 4,
      borderRadius: 6,
      color: T.muted,
      display: "inline-flex",
      alignItems: "center",
      opacity: disabled ? 0.45 : 1,
      ...style
    },
    children
  });
}
function EngineBadge({ engine }) {
  const label = ENGINE_LABELS[engine] || "Auto";
  return jsx("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      borderRadius: 999,
      padding: "2px 7px",
      fontSize: 10,
      fontWeight: 600,
      color: T.accent,
      background: T.accentSoft,
      border: "1px solid rgba(124,58,237,0.25)"
    },
    children: label
  });
}
const { ExternalLink: ExternalLink$2, Play: Play$1, RotateCw, Trash2, X: X$1 } = lucide;
function TaskImpactHeader({ task, latest, onClose, onMove, onRun, onDelete, onOpenEngine }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const running = task.status === "running";
  const currentEngine = taskEngine(task);
  const focus = taskFocus(task);
  const state = taskStateMeta(task);
  const progress = taskProgress(task);
  const stateColor = toneColor(state.tone);
  const column = COLUMNS.find((item) => item.id === task.status);
  const canOpen = latest && (latest.session_key || latest.runner_id);
  const openLabel = currentEngine === "task_runner" ? "Open the task runner" : "Open the chat";
  const runLabel = task.executions?.length ? "Run again" : "Run";
  const runBlocker = taskRunBlocker(task);
  useEffect(() => setConfirmDelete(false), [task.id]);
  return jsxs("header", { style: { padding: "14px 16px 15px", background: "linear-gradient(145deg, rgba(124,58,237,0.16), rgba(124,58,237,0.035) 58%, transparent)", borderBottom: `1px solid ${T.border}` }, children: [
    jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      jsx("select", { "aria-label": "Move to", value: task.status, disabled: running, onChange: (event) => onMove(task.id, event.target.value), style: { maxWidth: 104, background: T.bg, color: column?.accent || T.text, border: `1px solid ${column?.accent || T.border}`, borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "4px 8px", outline: "none" }, children: (running ? COLUMNS.map((item) => item.id) : DROP_TARGETS).map((status) => jsx("option", { value: status, children: COLUMNS.find((item) => item.id === status)?.label || status }, status)) }),
      jsx(EngineBadge, { engine: currentEngine }),
      jsx("span", { style: { padding: "3px 7px", borderRadius: 999, border: `1px solid ${toneBorder(state.tone)}`, background: toneSurface(state.tone), color: stateColor, fontSize: 9, fontWeight: 750 }, children: state.label }),
      jsxs("span", { style: { color: T.muted, fontSize: 10, whiteSpace: "nowrap" }, children: ["Updated ", formatTime(task.updated_at)] }),
      jsx("div", { style: { flex: 1 } }),
      canOpen && jsx(IconButton, { label: openLabel, onClick: () => onOpenEngine(task, latest), style: { width: 28, height: 28, justifyContent: "center", color: T.accent, background: T.accentSoft }, children: jsx(ExternalLink$2, { size: 14 }) }),
      jsx(IconButton, { label: running ? "Agent is running" : runBlocker || runLabel, disabled: running || Boolean(runBlocker), onClick: () => onRun(task), style: { width: 28, height: 28, justifyContent: "center", color: running ? T.warn : runBlocker ? T.muted : T.text, background: T.hover }, children: task.executions?.length ? jsx(RotateCw, { size: 14, style: running ? { animation: "kanban-spin 1s linear infinite" } : void 0 }) : jsx(Play$1, { size: 14 }) }),
      jsx(IconButton, { label: confirmDelete ? "Confirm delete task" : "Delete task", onClick: () => {
        if (confirmDelete) onDelete(task.id);
        else setConfirmDelete(true);
      }, style: { width: 28, height: 28, justifyContent: "center", color: confirmDelete ? T.danger : T.muted, background: confirmDelete ? "rgba(239,68,68,0.12)" : "transparent" }, children: jsx(Trash2, { size: 14 }) }),
      jsx(IconButton, { label: "Close", onClick: onClose, style: { width: 28, height: 28, justifyContent: "center" }, children: jsx(X$1, { size: 16 }) })
    ] }),
    jsx("h2", { style: { margin: "18px 0 0", color: T.strong, fontSize: 20, lineHeight: 1.25, letterSpacing: "-0.018em", fontWeight: 680 }, children: task.title }),
    jsxs("div", { style: { display: "flex", alignItems: "center", gap: 9, marginTop: 9 }, children: [jsx("p", { style: { flex: 1, margin: 0, color: T.muted, fontSize: 11, lineHeight: 1.45 }, children: task.goal?.objective || focus.current }), jsx("span", { style: { flexShrink: 0, color: stateColor, fontSize: 9, fontWeight: 650 }, children: progress.label })] }),
    confirmDelete && jsx("div", { role: "status", style: { marginTop: 10, color: T.danger, fontSize: 10 }, children: "Click the trash icon again to permanently delete this task." })
  ] });
}
const { Activity, FolderOpen: FolderOpen$1, GitCompare: GitCompare$1, ListChecks: ListChecks$1, Sparkles: Sparkles$1 } = lucide;
const TABS = [
  { id: "outcome", label: "Outcome", Icon: Sparkles$1 },
  { id: "goal", label: "Goal and verification", Icon: ListChecks$1 },
  { id: "artifacts", label: "Artifacts", Icon: FolderOpen$1 },
  { id: "changes", label: "Changes and diffs", Icon: GitCompare$1 },
  { id: "audit", label: "Audit trail", Icon: Activity }
];
function TaskResourceTabs({ activeTab, onChange, counts }) {
  return jsx("div", { role: "tablist", "aria-label": "Task resources", style: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 4, padding: "8px 12px", background: T.card, borderBottom: `1px solid ${T.border}` }, children: TABS.map(({ id, label, Icon }) => {
    const active = activeTab === id;
    const count = counts[id] || 0;
    return jsx("button", { type: "button", role: "tab", "aria-selected": active, "aria-label": label, title: label, onClick: () => onChange(id), style: { position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 0, height: 34, border: `1px solid ${active ? "rgba(124,58,237,0.38)" : "transparent"}`, borderRadius: 8, background: active ? T.accentSoft : "transparent", color: active ? T.accent : T.muted, cursor: "pointer" }, children: [
      jsx(Icon, { size: 15 }, "icon"),
      count > 0 && jsx("span", { style: { position: "absolute", top: 2, right: 3, minWidth: 13, height: 13, boxSizing: "border-box", padding: "0 3px", borderRadius: 999, background: active ? T.accent : T.hover, color: active ? "#fff" : T.text, fontSize: 8, lineHeight: "13px", textAlign: "center", fontWeight: 700 }, children: count }, "count")
    ] }, id);
  }) });
}
const hostMarkdownRenderer = () => {
  if (typeof window === "undefined") return null;
  const modules = window.__kirocrew_modules;
  if (!modules) return null;
  const ui = modules["@kirocrew/ui"] || modules["@kirocrew/app-sdk/ui"];
  return ui && ui.MarkdownRenderer || null;
};
const proseBase = { color: T.strong, fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere", minWidth: 0 };
const plainBase = { ...proseBase, margin: 0, whiteSpace: "pre-wrap" };
function Markdown({ text, style }) {
  const content = typeof text === "string" ? text : "";
  if (!content) return null;
  const Renderer = hostMarkdownRenderer();
  if (!Renderer) return jsx("p", { style: { ...plainBase, ...style }, children: content });
  return jsx("div", { style: { ...proseBase, ...style }, children: jsx(Renderer, { content, softBreaks: true }) });
}
const { CheckCircle2: CheckCircle2$1, Circle, CircleHelp, LoaderCircle, XCircle } = lucide;
const metaFor = (status) => {
  if (status === "passed") return { Icon: CheckCircle2$1, color: T.ok, label: "Verified" };
  if (status === "failed") return { Icon: XCircle, color: T.danger, label: "Failed" };
  if (status === "running") return { Icon: LoaderCircle, color: T.warn, label: "Checking" };
  if (status === "unknown") return { Icon: CircleHelp, color: T.info, label: "Unknown" };
  return { Icon: Circle, color: T.muted, label: "Pending" };
};
function VerificationList({ checks = [], compact = false }) {
  if (!checks.length) return jsx("div", { style: { padding: 12, borderRadius: 9, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 11, lineHeight: 1.5 }, children: "No verification evidence has been recorded yet." });
  return jsx("div", { style: { display: "flex", flexDirection: "column", gap: compact ? 6 : 8 }, children: checks.map((check) => {
    const meta = metaFor(check.status);
    return jsxs("div", { style: { display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8, padding: compact ? "7px 8px" : "9px 10px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg }, children: [
      jsx(meta.Icon, { size: 15, style: { marginTop: 1, color: meta.color, animation: check.status === "running" ? "kanban-spin 1s linear infinite" : void 0 } }),
      jsxs("div", { style: { minWidth: 0 }, children: [
        jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [
          jsx("strong", { style: { flex: 1, color: T.text, fontSize: 11, lineHeight: 1.4 }, children: check.label }),
          jsx("span", { style: { flexShrink: 0, color: meta.color, fontSize: 8, fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.05em" }, children: meta.label })
        ] }),
        check.evidence && jsx("p", { style: { margin: "4px 0 0", color: T.muted, fontSize: 10, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }, children: check.evidence }),
        check.source && jsx("span", { style: { display: "block", marginTop: 4, color: T.muted, fontSize: 8 }, children: check.source.replaceAll("_", " ") })
      ] })
    ] }, check.id || check.label);
  }) });
}
const { AlertTriangle: AlertTriangle$1, ArrowRight, CheckCircle2, ExternalLink: ExternalLink$1, FileText: FileText$1, GitCommitHorizontal, Sparkles } = lucide;
const heading$1 = { margin: 0, color: T.muted, fontSize: 9, fontWeight: 750, letterSpacing: "0.09em", textTransform: "uppercase" };
const packetMeta = (status) => {
  if (status === "verified") return { label: "Verified outcome", color: T.ok, tone: "ok", Icon: CheckCircle2 };
  if (status === "failed") return { label: "Outcome blocked", color: T.danger, tone: "danger", Icon: AlertTriangle$1 };
  if (status === "working") return { label: "Outcome in progress", color: T.warn, tone: "warn", Icon: Sparkles };
  if (status === "pending") return { label: "Outcome pending", color: T.muted, tone: "muted", Icon: Sparkles };
  return { label: status === "paused" ? "Outcome paused" : "Review outcome", color: T.info, tone: "info", Icon: Sparkles };
};
function OutcomePane({ task, onAccept, onContinue, onRequestChanges }) {
  const packet = taskResultPacket(task);
  const state = taskStateMeta(task);
  const checks = taskVerification(task);
  const artifacts = taskArtifacts(task);
  const meta = packetMeta(packet.status);
  const featured = artifacts.filter((item) => packet.artifact_ids?.includes(item.id)).slice(0, 4);
  const outputs = featured.length ? featured : artifacts.slice(0, 4);
  const working = task.status === "running";
  const canAccept = !working && ["needs_review", "verified"].includes(packet.status) && state.state !== "achieved";
  const canContinue = !taskRunBlocker(task);
  return jsxs("div", { "aria-label": "Task outcome", style: { display: "flex", flexDirection: "column", gap: 18 }, children: [
    jsxs("section", { style: { padding: 14, borderRadius: 12, border: `1px solid ${toneBorder(meta.tone)}`, background: `linear-gradient(140deg, ${toneSurface(meta.tone)}, transparent 72%)` }, children: [
      jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7 }, children: [jsx(meta.Icon, { size: 15, style: { color: meta.color } }), jsx("span", { style: { color: meta.color, fontSize: 10, fontWeight: 750, textTransform: "uppercase", letterSpacing: "0.06em" }, children: meta.label }), packet.changed_files > 0 && jsxs("span", { style: { marginLeft: "auto", color: T.muted, fontSize: 9 }, children: [packet.changed_files, " changed outputs"] })] }),
      packet.summary ? jsx(Markdown, { text: packet.summary, style: { marginTop: 10, fontWeight: 500 } }) : jsx("p", { style: { margin: "10px 0 0", color: T.muted, fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" }, children: working ? "The agent is working toward the first verified outcome." : "Run this task to produce a result and supporting evidence." })
    ] }),
    jsxs("section", { children: [
      jsxs("div", { style: { display: "flex", alignItems: "center", marginBottom: 9 }, children: [jsx("h3", { style: heading$1, children: "Verification" }), checks.length > 0 && jsxs("span", { style: { marginLeft: "auto", color: T.muted, fontSize: 9 }, children: [checks.filter((check) => check.status === "passed").length, "/", checks.filter((check) => check.required !== false).length, " passed"] })] }),
      jsx(VerificationList, { checks })
    ] }),
    jsxs("section", { children: [
      jsxs("div", { style: { display: "flex", alignItems: "center", marginBottom: 9 }, children: [jsx("h3", { style: heading$1, children: "Outputs" }), jsxs("span", { style: { marginLeft: "auto", color: T.muted, fontSize: 9 }, children: [artifacts.length, artifacts.length === 1 ? " artifact" : " artifacts"] })] }),
      outputs.length ? jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }, children: outputs.map((item) => {
        const href = item.url || item.href;
        const Icon = item.kind === "commit" || item.kind === "branch" ? GitCommitHorizontal : FileText$1;
        return jsxs("a", { href: href || "#", target: "_blank", rel: "noreferrer", onClick: (event) => {
          if (!href) event.preventDefault();
        }, style: { minWidth: 0, display: "flex", alignItems: "center", gap: 7, padding: 9, borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: href ? T.accent : T.text, textDecoration: "none" }, children: [
          jsx(Icon, { size: 13, style: { flexShrink: 0 } }),
          jsx("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, fontWeight: 650 }, children: item.title }),
          href && jsx(ExternalLink$1, { size: 9, style: { flexShrink: 0 } })
        ] }, item.id);
      }) }) : jsx("div", { style: { padding: 12, borderRadius: 9, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 11 }, children: "Produced files, links, and commits will stay discoverable here." })
    ] }),
    packet.risks?.length > 0 && jsxs("section", { children: [jsx("h3", { style: heading$1, children: "Risks / blockers" }), jsx("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }, children: packet.risks.map((risk, index) => jsxs("div", { style: { display: "flex", gap: 7, color: T.text, fontSize: 11, lineHeight: 1.45 }, children: [jsx(AlertTriangle$1, { size: 12, style: { flexShrink: 0, marginTop: 2, color: T.warn } }), risk] }, `${index}-${risk}`)) })] }),
    packet.next_actions?.length > 0 && jsxs("section", { children: [jsx("h3", { style: heading$1, children: "Next" }), jsx("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }, children: packet.next_actions.slice(0, 3).map((action, index) => jsxs("div", { style: { display: "flex", gap: 7, color: T.text, fontSize: 11, lineHeight: 1.45 }, children: [jsx(ArrowRight, { size: 12, style: { flexShrink: 0, marginTop: 2, color: T.accent } }), action] }, `${index}-${action}`)) })] }),
    !working && task.executions?.length > 0 && jsxs("section", { style: { display: "flex", flexWrap: "wrap", gap: 7, paddingTop: 2 }, children: [
      canAccept && jsx("button", { type: "button", onClick: () => onAccept(task), style: { ...actionPill, padding: "6px 10px", background: T.ok, color: "#07150b", fontSize: 10 }, children: "Accept result" }),
      canContinue && jsx("button", { type: "button", onClick: () => onContinue(task), style: { ...actionPill, padding: "6px 10px", background: T.accentSoft, color: T.accent, fontSize: 10 }, children: task.goal ? "Continue goal" : "Run another attempt" }),
      canContinue && jsx("button", { type: "button", onClick: onRequestChanges, style: { ...actionPill, padding: "6px 10px", background: T.hover, color: T.text, fontSize: 10 }, children: "Request changes" })
    ] })
  ] });
}
const { AlertTriangle, CircleDot, Clock3, Coins, Pause, Play, RotateCcw, Target } = lucide;
const heading = { margin: 0, color: T.muted, fontSize: 9, fontWeight: 750, letterSpacing: "0.09em", textTransform: "uppercase" };
function GoalPane({ task, onConfigureGoal, onContinue, onPause }) {
  const goal = task.goal;
  const state = taskStateMeta(task);
  const progress = taskProgress(task);
  const attempts = taskAttempts(task);
  const latest = attempts[attempts.length - 1];
  const activeStep = latest?.steps?.find((step) => ["running", "in_progress", "reviewing"].includes(step.status));
  const stateColor = toneColor(state.tone);
  const runBlocker = taskRunBlocker(task);
  if (!goal) return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, children: [
    jsxs("section", { style: { padding: 15, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bg }, children: [
      jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7 }, children: [jsx(Target, { size: 15, style: { color: T.accent } }), jsx("strong", { style: { color: T.strong, fontSize: 12 }, children: "One-run task" })] }),
      jsx("p", { style: { margin: "8px 0 0", color: T.muted, fontSize: 11, lineHeight: 1.55 }, children: "Enable a bounded goal loop to keep working through retries until explicit checks pass." }),
      jsx("button", { type: "button", onClick: () => onConfigureGoal(task), style: { ...actionPill, marginTop: 12, padding: "7px 10px", background: T.accent, color: "#fff", fontSize: 10 }, children: "Continue until verified" })
    ] }),
    attempts.length > 0 && jsx(AttemptList, { attempts })
  ] });
  return jsxs("div", { "aria-label": "Goal control", style: { display: "flex", flexDirection: "column", gap: 18 }, children: [
    jsxs("section", { style: { padding: 14, borderRadius: 12, border: `1px solid ${toneBorder(state.tone)}`, background: `linear-gradient(140deg, ${toneSurface(state.tone)}, transparent 70%)` }, children: [
      jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7 }, children: [jsx(CircleDot, { size: 14, style: { color: stateColor } }), jsx("span", { style: { color: stateColor, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase" }, children: state.label }), jsx("span", { style: { marginLeft: "auto", color: T.muted, fontSize: 9 }, children: progress.label })] }),
      jsx("p", { style: { margin: "9px 0 0", color: T.strong, fontSize: 13, lineHeight: 1.55, fontWeight: 560 }, children: goal.objective }),
      progress.determinate ? jsx("div", { style: { height: 5, marginTop: 12, overflow: "hidden", borderRadius: 999, background: T.hover }, children: jsx("div", { style: { width: `${progress.percent || 0}%`, height: "100%", borderRadius: 999, background: stateColor, transition: "width 180ms ease" } }) }) : jsx("div", { style: { position: "relative", height: 4, marginTop: 12, overflow: "hidden", borderRadius: 999, background: T.hover }, children: jsx("span", { style: { position: "absolute", width: "38%", height: "100%", borderRadius: 999, background: stateColor, animation: "kanban-indeterminate 1.35s ease-in-out infinite" } }) }),
      goal.stop_reason && jsxs("div", { style: { display: "flex", gap: 7, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, color: state.tone === "danger" ? T.danger : T.muted, fontSize: 10, lineHeight: 1.45 }, children: [jsx(AlertTriangle, { size: 12, style: { flexShrink: 0, marginTop: 1 } }), goal.stop_reason] })
    ] }),
    jsx("section", { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 7 }, children: [
      jsx(Metric, { Icon: RotateCcw, value: `${goal.attempts}/${goal.max_attempts}`, label: "attempts" }),
      jsx(Metric, { Icon: Clock3, value: `${goal.max_minutes}m`, label: "time limit" }),
      jsx(Metric, { Icon: Coins, value: `${Math.round((goal.tokens_used || 0) / 1e3)}k/${Math.round(goal.token_budget / 1e3)}k`, label: "tokens" })
    ] }),
    activeStep && jsxs("section", { children: [jsx("h3", { style: heading, children: "Current checkpoint" }), jsxs("div", { style: { marginTop: 8, padding: 11, borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg }, children: [jsx("strong", { style: { display: "block", color: T.text, fontSize: 11 }, children: activeStep.title }), activeStep.summary && jsx("p", { style: { margin: "5px 0 0", color: T.muted, fontSize: 10, lineHeight: 1.45 }, children: activeStep.summary })] })] }),
    jsxs("section", { children: [jsx("h3", { style: { ...heading, marginBottom: 9 }, children: "Done means" }), jsx(VerificationList, { checks: goal.criteria })] }),
    attempts.length > 0 && jsx(AttemptList, { attempts }),
    jsxs("section", { style: { display: "flex", flexWrap: "wrap", gap: 7 }, children: [
      task.status === "running" && jsxs("button", { type: "button", onClick: () => onPause(task), style: { ...actionPill, padding: "6px 10px", background: T.hover, color: T.text, fontSize: 10 }, children: [jsx(Pause, { size: 11 }), "Pause loop"] }),
      task.status !== "running" && state.state !== "achieved" && !runBlocker && jsxs("button", { type: "button", onClick: () => onContinue(task), style: { ...actionPill, padding: "6px 10px", background: T.accent, color: "#fff", fontSize: 10 }, children: [jsx(Play, { size: 11 }), "Continue goal"] }),
      task.status !== "running" && runBlocker && jsx("span", { role: "status", style: { color: T.muted, fontSize: 10, lineHeight: 1.45 }, children: `${runBlocker}. Update the goal contract before another attempt.` })
    ] })
  ] });
}
function Metric({ Icon, value, label }) {
  return jsxs("div", { style: { minWidth: 0, padding: "9px 8px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, textAlign: "center" }, children: [jsx(Icon, { size: 12, style: { color: T.accent } }), jsx("strong", { style: { display: "block", marginTop: 4, color: T.text, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis" }, children: value }), jsx("span", { style: { display: "block", marginTop: 2, color: T.muted, fontSize: 8 }, children: label })] });
}
function AttemptList({ attempts }) {
  return jsxs("section", { children: [jsxs("div", { style: { display: "flex", alignItems: "center" }, children: [jsx("h3", { style: heading, children: "Attempts" }), jsx("span", { style: { marginLeft: "auto", color: T.muted, fontSize: 9 }, children: attempts.length })] }), jsx("div", { style: { display: "flex", flexDirection: "column", gap: 7, marginTop: 9 }, children: [...attempts].reverse().map((attempt) => {
    const color = attempt.status === "succeeded" ? T.ok : attempt.status === "failed" ? T.danger : attempt.status === "running" ? T.warn : T.muted;
    const complete = attempt.steps.filter((step) => ["passed", "skipped"].includes(step.status)).length;
    return jsxs("div", { style: { display: "grid", gridTemplateColumns: "9px minmax(0, 1fr) auto", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg }, children: [
      jsx("span", { style: { width: 7, height: 7, borderRadius: "50%", background: color } }),
      jsxs("div", { style: { minWidth: 0 }, children: [jsx("strong", { style: { display: "block", color: T.text, fontSize: 10 }, children: attempt.title }), jsx("span", { style: { display: "block", marginTop: 2, color: T.muted, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: attempt.summary || attempt.progress_detail || attempt.error || `${complete}/${attempt.steps.length || 0} checkpoints` })] }),
      jsx("span", { style: { color: T.muted, fontSize: 8 }, children: attempt.ended_at ? duration(attempt.started_at, attempt.ended_at) : "live" })
    ] }, attempt.id);
  }) })] });
}
const { ExternalLink, FileText, FolderOpen, GitCompare, Link2 } = lucide;
const META = {
  artifacts: { title: "Artifacts", empty: "No files, links, or commits have been produced yet.", Icon: FolderOpen },
  files: { title: "Files and artifacts", empty: "No files or links have been produced yet.", Icon: FolderOpen },
  changes: { title: "Changes and diffs", empty: "No diff or patch links have been reported yet.", Icon: GitCompare },
  notes: { title: "Markdown and notes", empty: "No Markdown notes have been reported yet.", Icon: FileText }
};
function TaskResourcePane({ kind, resources }) {
  const meta = META[kind];
  return jsxs("section", { "aria-label": meta.title, children: [
    jsxs("div", { style: { display: "flex", alignItems: "center", gap: 7 }, children: [jsx(meta.Icon, { size: 14, style: { color: T.accent } }), jsx("h3", { style: { margin: 0, color: T.strong, fontSize: 14 }, children: meta.title }), jsx("span", { style: { marginLeft: "auto", color: T.muted, fontSize: 10 }, children: resources.length })] }),
    resources.length ? jsx("div", { style: { display: "flex", flexDirection: "column", gap: 7, marginTop: 13 }, children: resources.map((resource) => {
      const href = resource.url || resource.href;
      return jsxs("a", { href: href || "#", target: "_blank", rel: "noreferrer", onClick: (event) => {
        if (!href) event.preventDefault();
      }, style: { display: "grid", gridTemplateColumns: "26px minmax(0, 1fr) 14px", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: href ? T.accent : T.text, textDecoration: "none" }, children: [
        jsx("span", { style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 7, background: T.accentSoft }, children: jsx(Link2, { size: 12 }) }),
        jsxs("span", { style: { minWidth: 0 }, children: [jsx("span", { style: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, fontWeight: 600 }, children: resource.title }), resource.kind && jsx("span", { style: { display: "block", marginTop: 2, color: T.muted, fontSize: 9 }, children: resource.kind })] }),
        href && jsx(ExternalLink, { size: 11 })
      ] }, resource.id);
    }) }) : jsx("div", { style: { marginTop: 14, padding: 18, borderRadius: 10, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 12, lineHeight: 1.55, textAlign: "center" }, children: meta.empty })
  ] });
}
const { ListChecks } = lucide;
function ActivityTimeline({ activities, artifacts = [], label }) {
  return jsxs("div", { children: [
    jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }, children: [jsx(ListChecks, { size: 13, style: { color: T.accent } }), jsx("span", { style: label, children: "Activity" })] }),
    activities.length ? jsx("div", { style: { display: "flex", flexDirection: "column", gap: 7 }, children: activities.map((item) => {
      const linked = artifacts.filter((artifact) => artifact.execution_id && artifact.execution_id === item.execution_id);
      return jsxs("div", { style: { display: "flex", gap: 8, padding: "8px 10px", background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }, children: [jsx("span", { style: { width: 7, height: 7, marginTop: 4, borderRadius: "50%", background: item.status === "succeeded" ? T.ok : item.status === "failed" ? T.danger : T.warn, flexShrink: 0 } }), jsxs("div", { style: { minWidth: 0 }, children: [jsx("div", { style: { fontSize: 11, fontWeight: 600, color: T.text }, children: item.title }), jsx("div", { style: { marginTop: 3, fontSize: 11, lineHeight: 1.4, color: T.muted }, children: item.summary }), linked.length > 0 && jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }, children: linked.map((artifact) => jsx("a", { href: artifact.url || "#", target: "_blank", rel: "noreferrer", onClick: (event) => {
        if (!artifact.url) event.preventDefault();
      }, style: { maxWidth: "100%", padding: "2px 5px", borderRadius: 5, background: T.accentSoft, color: T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none", fontSize: 9 }, children: artifact.title }, artifact.id)) }), item.created_at && jsx("div", { style: { marginTop: 4, fontSize: 10, color: T.muted }, children: relativeTime(item.created_at) })] })] }, item.id);
    }) }) : jsx("div", { style: { padding: 10, borderRadius: 8, background: T.bg, color: T.muted, fontSize: 11 }, children: "No activity yet. Agent updates will appear here after each step." })
  ] });
}
const { Send } = lucide;
function FeedbackComposer({ task, latest, onFeedback, onOpenEngine }) {
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(false);
  const engine = taskEngine(task);
  const taskRunner = engine === "task_runner";
  const hasChat = Boolean(latest?.session_key);
  const hasExecution = taskRunner ? Boolean(latest?.runner_id) : hasChat;
  const running = task.status === "running";
  const runBlocker = taskRunBlocker(task);
  const enabled = hasExecution && !running && !runBlocker;
  useEffect(() => {
    setFeedback("");
    setSent(false);
  }, [task.id]);
  const placeholder = running ? "Agent is working…" : runBlocker ? `${runBlocker}…` : hasExecution ? taskRunner ? "Give the goal a corrective instruction…" : "Give the agent a next instruction…" : "Run the task to start an agent execution…";
  return jsxs("form", { onSubmit: async (event) => {
    event.preventDefault();
    if (!enabled || !feedback.trim()) return;
    const ok = await onFeedback(task, feedback.trim());
    if (ok) {
      setFeedback("");
      setSent(true);
      setTimeout(() => setSent(false), 2200);
    }
  }, children: [
    jsxs("div", { style: { display: "flex", gap: 7, padding: 6, borderRadius: 11, background: T.bg, border: `1px solid ${enabled && feedback.trim() ? "rgba(124,58,237,0.55)" : T.border}` }, children: [
      jsx("input", { id: `kanban-feedback-${task.id}`, "aria-label": taskRunner ? "Give instruction for next goal attempt" : "Reply to agent", value: feedback, disabled: !enabled, onChange: (event) => setFeedback(event.target.value), placeholder, style: { minWidth: 0, flex: 1, padding: "6px 7px", border: "none", outline: "none", background: "transparent", color: T.strong, fontSize: 12, fontFamily: "inherit", opacity: enabled ? 1 : 0.66 } }),
      jsx("button", { type: "submit", "aria-label": "Send feedback", title: "Send feedback", disabled: !enabled || !feedback.trim(), style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, flexShrink: 0, border: "none", borderRadius: 8, background: T.accent, color: "#fff", cursor: enabled && feedback.trim() ? "pointer" : "not-allowed", opacity: enabled && feedback.trim() ? 1 : 0.38 }, children: jsx(Send, { size: 13 }) })
    ] }),
    sent && jsx("div", { role: "status", style: { marginTop: 5, color: T.ok, fontSize: 9 }, children: "Instruction sent to the agent." })
  ] });
}
const activityLabel = { display: "block", fontSize: 11, fontWeight: 650, color: T.strong };
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 620;
const WIDTH_KEY = "kanban:drawer-width";
const WIDTH_VAR = "--kanban-drawer-w";
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(920, Math.round(window.innerWidth * 0.92)));
const clampWidth = (value) => Math.min(Math.max(Math.round(value), MIN_WIDTH), maxWidth());
const readWidth = () => {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return clampWidth(stored > 0 ? stored : DEFAULT_WIDTH);
  } catch {
    return clampWidth(DEFAULT_WIDTH);
  }
};
const writeWidth = (value) => {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(value));
  } catch {
  }
};
const handleStyle = {
  position: "absolute",
  left: -3,
  top: 0,
  bottom: 0,
  width: 10,
  cursor: "col-resize",
  pointerEvents: "auto",
  zIndex: 1,
  // touchAction none is what makes a touch drag resize instead of scrolling the
  // page under the drawer.
  touchAction: "none",
  background: "transparent",
  border: "none",
  padding: 0
};
function TaskDetailDrawer({ task, onClose, onMove, onRun, onDelete, onOpenEngine, onFeedback, onConfigureGoal, onGoalAction }) {
  const [activeTab, setActiveTab] = useState(() => defaultTaskTab(task));
  const [width, setWidth] = useState(readWidth);
  const widthRef = useRef(width);
  const dragging = useRef(false);
  const previousState = useRef(task.goal?.status || task.status);
  const latest = task.executions?.length ? task.executions[task.executions.length - 1] : null;
  const activities = useMemo(() => taskActivities(task), [task]);
  const artifacts = useMemo(() => taskArtifacts(task), [task]);
  const resources = useMemo(() => taskResourceGroups(task), [task]);
  const steps = useMemo(() => taskSteps(task, artifacts), [task, artifacts]);
  useEffect(() => setActiveTab(defaultTaskTab(task)), [task.id]);
  useEffect(() => {
    const currentState = task.goal?.status || task.status;
    if (previousState.current !== currentState) setActiveTab(defaultTaskTab(task));
    previousState.current = currentState;
  }, [task.goal?.status, task.status]);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const applyWidth = (value, persist = false) => {
    const next = clampWidth(value);
    widthRef.current = next;
    setWidth(next);
    try {
      document.documentElement.style.setProperty(WIDTH_VAR, `${next}px`);
    } catch {
    }
    if (persist) writeWidth(next);
  };
  useEffect(() => {
    try {
      document.documentElement.style.setProperty(WIDTH_VAR, `${widthRef.current}px`);
    } catch {
    }
    return () => {
      try {
        document.documentElement.style.removeProperty(WIDTH_VAR);
      } catch {
      }
    };
  }, []);
  useEffect(() => {
    const onResize = () => applyWidth(widthRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const startDrag = (event) => {
    event.preventDefault();
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.style.userSelect = "none";
  };
  const onDrag = (event) => {
    if (!dragging.current) return;
    applyWidth(window.innerWidth - event.clientX);
  };
  const endDrag = (event) => {
    if (!dragging.current) return;
    dragging.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    document.body.style.userSelect = "";
    writeWidth(widthRef.current);
  };
  const onHandleKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyWidth(widthRef.current + 24, true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applyWidth(widthRef.current - 24, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyWidth(maxWidth(), true);
    } else if (event.key === "End") {
      event.preventDefault();
      applyWidth(MIN_WIDTH, true);
    }
  };
  const counts = {
    goal: task.goal?.criteria?.length || steps.length,
    artifacts: artifacts.length,
    changes: resources.changes.length,
    audit: activities.length
  };
  const focusComposer = () => document.getElementById(`kanban-feedback-${task.id}`)?.focus();
  const panel = activeTab === "goal" ? jsx(GoalPane, { task, onConfigureGoal, onContinue: onRun, onPause: (current) => onGoalAction(current, "pause") }) : activeTab === "artifacts" ? jsx(TaskResourcePane, { kind: "artifacts", resources: artifacts }) : activeTab === "changes" ? jsx(TaskResourcePane, { kind: "changes", resources: resources.changes }) : activeTab === "audit" ? jsx(ActivityTimeline, { activities, artifacts, label: activityLabel }) : jsx(OutcomePane, { task, onAccept: (current) => onGoalAction(current, "accept"), onContinue: onRun, onRequestChanges: focusComposer });
  return jsx("div", { style: { position: "fixed", top: 0, right: 0, bottom: 0, width, zIndex: 50, display: "flex", flexDirection: "column", pointerEvents: "none" }, children: [
    jsx("div", {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize task detail",
      "aria-valuenow": width,
      "aria-valuemin": MIN_WIDTH,
      "aria-valuemax": maxWidth(),
      tabIndex: 0,
      onPointerDown: startDrag,
      onPointerMove: onDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown: onHandleKeyDown,
      onDoubleClick: () => applyWidth(DEFAULT_WIDTH, true),
      style: handleStyle
    }, "resize"),
    jsx("div", { role: "dialog", "aria-modal": false, "aria-label": "Task detail", style: { pointerEvents: "auto", width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: T.elevated, borderLeft: `1px solid ${T.borderStrong}`, borderRadius: "14px 0 0 14px", boxShadow: "-12px 0 36px rgba(0,0,0,0.18)", animation: "kanban-drawer-in 180ms ease-out" }, children: [
      jsx(TaskImpactHeader, { task, latest, onClose, onMove, onRun, onDelete, onOpenEngine }, "header"),
      jsx(TaskResourceTabs, { activeTab, onChange: setActiveTab, counts }, "tabs"),
      jsx("div", { role: "tabpanel", style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 18px 24px" }, children: panel }, "panel"),
      jsx("footer", { style: { padding: "10px 12px 12px", borderTop: `1px solid ${T.border}`, background: T.card }, children: jsx(FeedbackComposer, { task, latest, onFeedback, onOpenEngine }) }, "composer")
    ] }, "panel")
  ] });
}
const { AlertCircle, KanbanSquare, Plus, Search, X } = lucide;
function App() {
  const navigate = useNavigate();
  const { tasks, loading, refresh } = useTasks();
  const [view, setView] = useState(readViewMode);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftEngine, setDraftEngine] = useState("auto");
  const [draftGoal, setDraftGoal] = useState(null);
  const [moveMenuTask, setMoveMenuTask] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [taskRunnerPrompt, setTaskRunnerPrompt] = useState(null);
  const [runBusyId, setRunBusyId] = useState(null);
  const onError = useCallback((err) => setActionError(err instanceof Error ? err.message : String(err)), []);
  const handleMove = useCallback((taskId, status) => api(`/tasks/${taskId}/move`, jsonBody({ status })).then(refresh).catch(onError), [refresh, onError]);
  const handleRun = useCallback((task) => {
    setRunBusyId(task.id);
    api(`/tasks/${task.id}/run`, jsonBody({})).then(refresh).catch((err) => {
      if (err?.code === "task_runner_not_enabled") {
        setTaskRunnerPrompt({ task, message: err.message, action: err.action });
        return;
      }
      onError(err);
    }).finally(() => setRunBusyId(null));
  }, [refresh, onError]);
  const handleCreate = useCallback(({ prompt, engine, goal }) => {
    setShowCreateForm(false);
    api("/tasks", jsonBody({ prompt, status: "todo", engine, goal })).then(() => {
      setDraftPrompt("");
      setDraftEngine("auto");
      setDraftGoal(null);
      refresh();
    }).catch((err) => {
      setDraftPrompt(prompt);
      setDraftEngine(engine);
      setDraftGoal(goal || null);
      setShowCreateForm(true);
      onError(err);
    });
  }, [refresh, onError]);
  const handleDelete = useCallback((id) => api(`/tasks/${id}`, { method: "DELETE" }).then(() => {
    setSelectedId(null);
    refresh();
  }).catch(onError), [refresh, onError]);
  const handleOpenEngine = useCallback((task, execution) => {
    const engine = execution?.engine || task.active_engine || task.engine || "auto";
    if (engine === "task_runner") {
      navigate("/projects");
      return;
    }
    if (execution?.session_key) {
      navigate(`/chat?sid=${encodeURIComponent(execution.session_key)}`);
      return;
    }
    setActionError("This task has not started an engine session yet.");
  }, [navigate]);
  const handleFeedback = useCallback((task, message) => {
    const latest = task.executions?.[task.executions.length - 1];
    if (!latest?.session_key && !latest?.runner_id) {
      setActionError("Run this task first to create an agent execution.");
      return false;
    }
    return api(`/tasks/${task.id}/feedback`, jsonBody({ message })).then(() => {
      refresh();
      return true;
    }).catch((err) => {
      onError(err);
      return false;
    });
  }, [refresh, onError]);
  const handleConfigureGoal = useCallback((task) => api(`/tasks/${task.id}/goal`, jsonBody({ goal: {
    mode: "loop",
    objective: task.prompt || task.title,
    criteria: [
      "The requested outcome is implemented",
      "Relevant checks pass without regressions",
      "The final result and produced artifacts are summarized"
    ],
    max_attempts: 3,
    max_minutes: 60,
    token_budget: 5e4
  } })).then(refresh).catch(onError), [refresh, onError]);
  const handleGoalAction = useCallback((task, action) => api(`/tasks/${task.id}/goal/action`, jsonBody({ action })).then(refresh).catch(onError), [refresh, onError]);
  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => needle ? tasks.filter((t) => t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle) || t.prompt.toLowerCase().includes(needle) || t.tags.some((tag) => tag.toLowerCase().includes(needle))) : tasks, [tasks, needle]);
  const selectedTask = tasks.find((t) => t.id === selectedId) || null;
  const byColumn = (status) => filtered.filter((t) => t.status === status).sort((a, b) => b.updated_at - a.updated_at);
  const grouping = view === "cluster" || view === "project";
  const boardRevision = useMemo(() => tasks.map((t) => t.id).sort().join(","), [tasks]);
  const { groups, regroup } = useGroups(grouping, boardRevision);
  const renderCard = (variant) => (task) => jsx(TaskCard, {
    task,
    variant,
    onClick: (t) => setSelectedId(t.id),
    onRun: task.status === "running" ? void 0 : handleRun,
    onOpenEngine: handleOpenEngine,
    onMoveMenu: setMoveMenuTask,
    runBusy: runBusyId === task.id
  }, task.id);
  const resolveGroups = (source) => (source || []).map((group) => ({
    ...group,
    tasks: flatSort(group.task_ids.map((id) => filtered.find((t) => t.id === id)).filter(Boolean))
  })).filter((group) => group.tasks.length);
  const boardBody = () => {
    if (view === "flat") {
      return jsx(TaskGrid, { tasks: flatSort(filtered), renderCard: renderCard("flat"), emptyLabel: needle ? "No tasks match your search" : "No tasks yet" });
    }
    if (view === "cluster") {
      return jsx(GroupedGrid, {
        groups: resolveGroups(groups.clusters),
        renderCard: renderCard("flat"),
        aiLabelled: true,
        refreshing: Boolean(groups.clusters_refreshing),
        onRefresh: regroup,
        emptyLabel: "No groups yet — the first pass runs in the background."
      });
    }
    if (view === "project") {
      return jsx(GroupedGrid, {
        groups: resolveGroups(groups.projects),
        renderCard: renderCard("flat"),
        emptyLabel: "No projects yet"
      });
    }
    return jsx("div", { style: { display: "flex", gap: 12, height: "100%", minWidth: "min-content" }, children: COLUMNS.map((column) => jsx(KanbanColumn, { column, tasks: byColumn(column.id), onDropTask: handleMove, children: byColumn(column.id).map(renderCard("board")) }, column.id)) });
  };
  return jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", paddingRight: selectedTask ? "min(var(--kanban-drawer-w, 620px), 92vw)" : 0, transition: "padding-right 180ms ease-out", color: T.text, fontSize: 14 }, children: [
    jsx("style", { children: "@keyframes kanban-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } } @keyframes kanban-drawer-in { from { transform: translateX(18px) } to { transform: translateX(0) } } @keyframes kanban-indeterminate { from { transform: translateX(-120%) } to { transform: translateX(330%) } } .kanban-card-actions { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 140ms ease-out, opacity 140ms ease-out } .kanban-card:hover .kanban-card-actions, .kanban-card:focus-within .kanban-card-actions, .kanban-card:focus-visible .kanban-card-actions { max-height: 26px; opacity: 1 } @media (prefers-reduced-motion: reduce) { .kanban-card-actions { transition: none } }" }),
    jsxs("div", { style: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 16px 12px" }, children: [
      jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8 }, children: [jsx("h1", { style: { margin: 0, fontSize: 19, fontWeight: 600, color: T.strong }, children: "Kanban" }), jsxs("span", { style: { fontSize: 12, color: T.muted }, children: [String(tasks.length), " tasks"] })] }),
      jsx(ViewSwitcher, { view, onChange: (nextView) => {
        setView(nextView);
        writeViewMode(nextView);
      } }),
      jsxs("button", { type: "button", onClick: () => setShowCreateForm(true), style: { display: "inline-flex", alignItems: "center", gap: 6, background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, cursor: "pointer" }, children: [jsx(Plus, { size: 14 }), "New task"] }),
      jsxs("div", { style: { position: "relative", display: "inline-flex", alignItems: "center" }, children: [jsx(Search, { size: 14, style: { position: "absolute", left: 10, color: T.muted, pointerEvents: "none" } }), jsx("input", { "aria-label": "Search tasks", placeholder: "Search tasks…", value: search, onChange: (e) => setSearch(e.target.value), style: { background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 12px 7px 32px", fontSize: 12, width: 200, outline: "none" } })] }),
      needle && jsxs("span", { style: { fontSize: 11, color: T.muted }, children: [String(filtered.length), " matches"] })
    ] }),
    actionError && jsxs("div", { role: "alert", style: { display: "flex", alignItems: "flex-start", gap: 8, margin: "0 16px 12px", padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.5)", background: "rgba(239,68,68,0.08)", fontSize: 12, color: T.danger }, children: [jsx("span", { style: { flex: 1 }, children: actionError }), jsx("button", { type: "button", "aria-label": "Dismiss error", onClick: () => setActionError(null), style: { background: "transparent", border: "none", color: T.danger }, children: jsx(X, { size: 14 }) })] }),
    taskRunnerPrompt && jsx("div", { role: "dialog", "aria-modal": true, "aria-label": "Enable Task Runner", style: { position: "fixed", inset: 0, zIndex: 1e3, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(0,0,0,0.46)" }, children: jsxs("div", { style: { width: "min(460px, 100%)", background: T.card, color: T.text, border: `1px solid ${T.borderStrong}`, borderRadius: 12, padding: 20 }, children: [jsxs("div", { style: { display: "flex", gap: 10 }, children: [jsx(AlertCircle, { size: 18, style: { color: T.warn } }), jsxs("div", { style: { flex: 1 }, children: [jsx("h2", { style: { margin: 0, fontSize: 16, color: T.strong }, children: "Enable Task Runner" }), jsx("p", { style: { margin: "10px 0 0", fontSize: 13, lineHeight: 1.5 }, children: taskRunnerPrompt.message }), jsx("p", { style: { margin: "8px 0 0", fontSize: 12, color: T.muted }, children: "Nothing was started and this task remains ready to run." })] }), jsx("button", { type: "button", "aria-label": "Close enable prompt", onClick: () => setTaskRunnerPrompt(null), style: { background: "transparent", border: "none", color: T.muted }, children: jsx(X, { size: 15 }) })] }), jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }, children: [jsx("button", { type: "button", onClick: () => setTaskRunnerPrompt(null), style: { ...actionPill, background: T.hover, color: T.text }, children: "Not now" }), jsx("button", { type: "button", onClick: () => {
      setTaskRunnerPrompt(null);
      navigate(taskRunnerPrompt.action?.path || "/projects");
    }, style: { ...actionPill, background: T.accent, color: "#fff" }, children: taskRunnerPrompt.action?.label || "Open Task Runner" })] })] }) }),
    jsx("div", { style: { flex: 1, overflow: "auto", padding: "0 16px 16px" }, children: loading ? jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.muted }, children: [jsx(KanbanSquare, { size: 20 }), jsx("span", { style: { marginLeft: 8, fontSize: 13 }, children: "Loading board…" })] }) : boardBody() }),
    selectedTask && jsx(TaskDetailDrawer, { task: selectedTask, onClose: () => setSelectedId(null), onMove: handleMove, onRun: handleRun, onDelete: handleDelete, onOpenEngine: handleOpenEngine, onFeedback: handleFeedback, onConfigureGoal: handleConfigureGoal, onGoalAction: handleGoalAction }),
    moveMenuTask && jsx(MoveMenu, { task: moveMenuTask, onMove: handleMove, onClose: () => setMoveMenuTask(null) }),
    showCreateForm && jsx(CreateTaskForm, { initialPrompt: draftPrompt, initialEngine: draftEngine, initialGoal: draftGoal, onSubmit: handleCreate, onCancel: () => {
      setDraftPrompt("");
      setDraftEngine("auto");
      setDraftGoal(null);
      setShowCreateForm(false);
    } })
  ] });
}
export {
  App as default
};
