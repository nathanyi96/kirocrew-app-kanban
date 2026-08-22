# Kanban — a task board for KiroCrew

A board where **each card is a prompt an agent runs for you**. Say what you want
in one field, choose an engine, and the board writes the card. Press Run and it
starts the selected Host engine; opening the card takes you to the matching
Chat, Task Runner, or Autopilot surface.

Inspired by [dsh-web-ui](https://github.com/zhu1090093659/dsh-web-ui)'s task
board, rebuilt on KiroCrew's own chat sessions and cron service.

## What it does

- **One field to create.** You describe the task; the board derives a title and a
  short summary and drops the card in **To do** so you can look it over before it
  runs. Nothing runs until you say so.
- **Engine routing.** Choose **Chat** for a focused request, **Task Runner** for
  multi-step execution, or **Autopilot** when you want a plan-and-approval Chat
  session. **Auto** sends short requests to Chat and structured or multi-step
  prompts to Task Runner.
- **Engine-aware navigation.** The card detail shows the resolved engine for its
  latest run. Chat and Autopilot open their named Chat session; Task Runner opens
  the host's Tasks page.
- **Five columns, drag to move.** Backlog → To do → Running → Done → Failed.
  `Running` is not a drop target: a card enters it by running and leaves it by
  settling, so the board can't lie about what is actually happening.
- **Cards settle themselves.** When the agent's turn ends the card lands in Done
  or Failed, carrying the failure reason where there is one — including across
  gateway stall-recovery, where a turn survives its own recovery notice.
- **Restart-safe.** A run orphaned by a gateway restart is reconciled on the next
  page load rather than left stuck in Running forever.

Need a card to run on a schedule? Use KiroCrew's own **Schedule** tab
(`kirocrew cron add`) with the card's prompt — this app deliberately does not
duplicate the host's cron surface.

## Install

```bash
git clone https://github.com/nathanyi96/kirocrew-app-kanban
kirocrew app install ./kirocrew-app-kanban
kirocrew config set agent.apps_trusted '["kanban"]'
kirocrew app enable kanban
kirocrew restart
```

`kirocrew app install` takes a **local directory** (anything containing an
`app.json`) — clone first, then install the checkout. Installing straight from
a git URL is the App Store's job, not the CLI's.

Three things about that sequence are easy to get wrong:

- **The trust grant is required.** This app ships a Python backend, and
  third-party app code runs in-process with full gateway privileges, so KiroCrew
  refuses to load it until you say so. Prefer the narrow grant above
  (`agent.apps_trusted`, this app only) over
  `agent.apps_allow_third_party=true`, which opens the door for every
  third-party app.
- **Grant trust *after* installing, not before.** `app uninstall` revokes an
  app's trust grant, so a trust → uninstall → reinstall sequence leaves you
  untrusted again and the enable fails.
- **Set config with no gateway running,** or restart right after. A running
  gateway can write `config.json` back from its own in-memory copy and drop a
  change made underneath it.

Then open **Kanban** in the sidebar. The page lives at `/apps/kanban` — an
installed app is mounted by the app host under `/apps/<name>`, whatever route its
manifest declares.

The restart matters: **backend hooks load at gateway start**, so a freshly
installed or updated backend is not serving until the gateway comes back. An app
disable→enable cycle also works. UI-only changes reload without either.

## Publishing this to the KiroCrew App Store

1. **Push this directory as its own git repository** (any git host).
   Include `app.json`, `ui/`, `backend/`, `README.md`. The `.gitignore` already
   excludes the install artifacts (`data/`, `.app_secret`, `installed.json`, …) —
   committing those causes stale-version and path bugs for everyone else.

2. **Submit it to the official catalog** — the App Store is published from the
   separate [kirodotdev/KiroCrewApps](https://github.com/kirodotdev/KiroCrewApps)
   repo (served at `apps.crew.kiro.dev/official-registry.json`). Follow its
   `docs/distribution.md` to add an entry pointing at this repo:

   ```json
   {
     "name": "kanban",
     "gitUrl": "https://github.com/nathanyi96/kirocrew-app-kanban",
     "branch": "main",
     "resources": [],
     "lifecycle": "stable"
   }
   ```

   Display metadata — description, tags, highlights, author — is read from the
   `app.json` in *this* repo and cached for 24h, so it does not go in the
   registry entry.

3. **Ship updates by bumping `version` in `app.json`** and pushing. The App Store
   compares semver and offers the update.

## How it is put together

```
app.json            manifest — routes hook, permissions, sidebar page
backend/
  routes.py         the model, the board file, the route table, the run logic
ui/
  index.mjs         the whole UI: one ESM module, no build step
  icon.svg          sidebar icon
```

### Backend

`register_routes(ctx)` returns a `list[AppRoute]` whose paths are relative to
`/api/apps/kanban`; each handler takes `(request, ctx)`. Registering on the
aiohttp router directly — the pattern builtin apps use — would silently never
dispatch, because the app RouteRegistry catch-all shadows it.

**It is one file on purpose.** The app module loader gives a hook exactly one
module, loaded by file path under a synthetic name with no parent package and no
`sys.path` entry, so `from .store import …` fails at load with
`No module named '_kirocrew_app_kanban'` — and a failed route module is only
visible as a 404 on every endpoint. A single module is the shape the loader
actually supports.

The board lives in the app's own writable data directory
(`ctx.data_dir/board/board.json`), written with a temp-file rename so a crash
mid-write cannot truncate it, and guarded by an advisory file lock so the gateway
and a CLI cannot interleave writes.

The model and store half of the file imports nothing from `kiro_crew`, so it keeps
working across gateway versions. The route half touches gateway internals on
purpose, each with a fallback:

- `request.app["state"]` to create the chat session — the `AppContext` exposes
  scoped SDKs but not gateway state. Turns are dispatched through
  `state.run_background_turn`, which enforces the host's per-app turn cap and
  unattended-approval window (calling `_run_chat` directly would bypass both).
- `state._slots` to notice when a session's turn has ended. If that private name
  ever moves, the watcher degrades to leaving the card running for `/reconcile`
  to settle, rather than crashing.

### Two deliberate choices about the session

- **The session is not hidden.** Worker slots are normally stamped `_app` to keep
  them out of the Sessions list; this app does the opposite, because being able to
  open the session *is* the feature.
- **The session is not auto-trusted.** Tool-approval prompts render in the main
  chat UI, which is exactly where this session lives, so you approve there.
  Blanket-trusting these runs would exempt them from the approval layer for no
  gain.

### UI

One ESM module against the host import map (`react`, `react/jsx-runtime`,
`@kirocrew/app-sdk`). That means no Tailwind and no `@dnd-kit`, so styling is
inline against the theme tokens (`var(--bg)`, `var(--text)`, `var(--border)`, …
each with a fallback) and dragging uses native HTML5 drag events. The board polls
every 5s, which is how a card that settles in the background updates on its own.

Modals use `position: absolute` inside a `position: relative` root — an app UI
mounts directly into the dashboard DOM, so `position: fixed` would cover the
sidebar and header too.

## Requirements

- KiroCrew ≥ 0.3.0
- A trust grant for this app (see **Install**). Backend code runs unsandboxed with
  gateway privileges — the app permission system gates the SDK surface, not
  arbitrary Python — so this is a real decision, not a formality.

## License

MIT
