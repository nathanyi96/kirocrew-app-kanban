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
screenshots must show the actual app. Review evidence belongs in the pull
request or its CI artifact, not in the installed app repository.

Every pull request that changes the app must be backed by a green `E2E / e2e`
run, and the review evidence must come from that exact run. The Playwright
journey is part of the review surface: it should show the user path, not only a
unit or API check.

### Evidence lives in the PR or CI artifact

The `E2E / e2e` job uploads every frame it captures as the `e2e-evidence`
artifact. Link that exact successful run and artifact in the PR description.
For a small inline walkthrough, upload selected frames or a GIF directly to
the PR description with GitHub's attachment flow. GitHub CLI 2.99 or newer can
do this without adding files to the repository:

```bash
gh pr edit <number> --attach ./path/to/journey.gif
```

Use `--body-file` with local Markdown image references when the attachment must
appear at a specific location. GitHub rewrites those references to its
user-attachment URLs. Do not place screenshots, GIFs, or videos under `docs/`
or any other repository path; `ui/store/` is reserved for shipped product
artwork referenced by `app.json`.

### Before requesting review

1. Wait for the `E2E / e2e` workflow to finish successfully.
2. Link the exact successful workflow run and its `e2e-evidence` artifact.
3. Attach only the frames or GIF needed to explain the changed user path.
4. Describe the journey the run exercised, naming each path it covered — for
   an engine-routing change, that means Chat, Task Runner, and Autopilot.
5. Call out any known limitation or path that is not covered.

Required PR description checklist:

- [ ] The required `E2E / e2e` check is green.
- [ ] The successful workflow run and `e2e-evidence` artifact are linked.
- [ ] The description names the user paths covered end to end.
- [ ] Any inline image/GIF attachment comes from the exact successful run.
- [ ] Any known limitation or failed path is called out explicitly.

Do not describe evidence as passing unless it comes from a successful E2E run.
If the workflow fails, fix the failure, rerun it, and link the new run.
