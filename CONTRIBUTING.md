# Contributing

## Commit history

Each pull request must contain exactly one commit. Before requesting review,
squash the entire feature branch into one clear, self-contained commit. Keep
the protected `main` branch history intact; rewrite only the PR branch when
using `git push --force-with-lease` to update it.

## Pull request guidance

The UI bundle is a shipped artifact. After changing UI source, run `npm ci`
and `npm run build` in `ui/`, then commit `ui/dist/index.mjs` with the source.
CI rebuilds and rejects a missing or stale committed bundle. Registry installs
do not run the build script in the nested `ui/package.json`.

Keep store artwork under `ui/store/` and its paths in `app.json`. Store
screenshots must show the actual app; review evidence stays under `docs/e2e/`.

Every pull request that changes the app must be backed by a green `E2E / e2e`
run, and the review evidence must come from that exact run. The Playwright
journey is part of the review surface: it should show the user path, not only a
unit or API check.

### Evidence is committed under `docs/e2e` for now

The `E2E / e2e` job uploads every frame it captures as the `e2e-evidence`
artifact. For now, the passing GIF and PNG frames are also copied into
`docs/e2e/<pr-number>/` so the pull request can display them through raw GitHub
URLs. This is a temporary compromise until a durable PR attachment/evidence
publisher is adopted.

Do not place screenshots, GIFs, or videos anywhere else in the repository. The
static check allows media only under `ui/` (shipped product assets) or
`docs/e2e/` (review evidence). Keep the evidence directory scoped to the PR
number and use frames from the exact successful E2E run.

This remains temporary because:

1. Committed evidence increases clone and install size. This repository is an
   installable KiroCrew app, and `kirocrew app install` copies the whole app
   directory into `~/.kiro/crew/apps/kanban/`.
2. Evidence accumulates in git history even after old files are deleted.
3. Raw links to a PR branch can break after that branch is deleted.

### Before requesting review

1. Wait for the `E2E / e2e` workflow to finish successfully.
2. Copy the exact successful run's PNG frames into `docs/e2e/<pr-number>/` and
   generate the review GIF there.
3. Embed the GIF/PNG gallery using raw URLs from the PR branch, and link that
   exact successful run in the description.
4. Describe the journey the run exercised, naming each path it covered — for an
   engine-routing change, that means Chat, Task Runner, and Autopilot.
5. Call out any known limitation or path that is not covered.

Required PR description checklist:

- [ ] The required `E2E / e2e` check is green.
- [ ] The successful workflow run is linked, so its `e2e-evidence` artifact is
      one click away.
- [ ] The description names the user paths the journey covered, end to end.
- [ ] GIF and PNG frames from that exact run are under
      `docs/e2e/<pr-number>/`.
- [ ] The GIF and PNG gallery is embedded in the description.
- [ ] Any known limitation or failed path is called out explicitly.

Do not describe evidence as passing unless it comes from a successful E2E run.
If the workflow fails, fix the failure, rerun it, and link the new run.
