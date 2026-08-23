# Contributing

## Commit history

Each pull request must contain exactly one commit. Before requesting review,
squash the entire feature branch into one clear, self-contained commit. Keep
the protected `main` branch history intact; rewrite only the PR branch when
using `git push --force-with-lease` to update it.

## Pull request guidance

Every pull request that changes the app must be backed by a green `E2E / e2e`
run, and the review evidence must come from that exact run. The Playwright
journey is part of the review surface: it should show the user path, not only a
unit or API check.

### Evidence lives in the workflow run, never in the repository

The `E2E / e2e` job uploads every frame it captures as the `e2e-evidence`
artifact. That artifact is the evidence store. A pull request describes what the
journey covered and links the run; it does not carry a copy of the frames into
git.

**Never commit screenshots, GIFs, or videos to this repository.** This is
enforced by `.github/ci/static_checks.py`, which fails the build on a tracked
image or video file outside `ui/`. Three reasons it is not negotiable:

1. This repository is an installable KiroCrew app. `kirocrew app install` copies
   the whole app directory into `~/.kiro/crew/apps/kanban/`, so committed
   screenshots ship to every user who installs the board.
2. Evidence accumulates and cannot be reclaimed. Deleting a committed PNG leaves
   the blob in history forever, so the clone cost is permanent.
3. Raw links into a PR branch break on merge. The branch is deleted, the raw
   URL 404s, and the gallery the reviewer approved is gone — which is exactly
   what happened to the inline images in pull requests #1 and #2.

If a reviewer wants images inline in the description, upload them through the
GitHub web editor (drag and drop into the description box). GitHub stores them
on its own attachment host, outside the repository, and the link survives branch
deletion. Only a human can do this upload; an agent links the artifact instead.

### Before requesting review

1. Wait for the `E2E / e2e` workflow to finish successfully.
2. Link that exact successful run in the description.
3. Describe the journey the run exercised, naming each path it covered — for an
   engine-routing change, that means Chat, Task Runner, and Autopilot.
4. Call out any known limitation or path that is not covered.

Required PR description checklist:

- [ ] The required `E2E / e2e` check is green.
- [ ] The successful workflow run is linked, so its `e2e-evidence` artifact is
      one click away.
- [ ] The description names the user paths the journey covered, end to end.
- [ ] No screenshot, GIF, or video is added to the repository.
- [ ] Any known limitation or failed path is called out explicitly.

Do not describe evidence as passing unless it comes from a successful E2E run.
If the workflow fails, fix the failure, rerun it, and link the new run.
