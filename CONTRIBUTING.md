# Contributing

## Commit history

Each pull request must contain exactly one commit. Before requesting review,
squash the entire feature branch into one clear, self-contained commit. Keep
the protected `main` branch history intact; rewrite only the PR branch when
using `git push --force-with-lease` to update it.

## Pull request guidance

Every pull request that changes the app must include evidence from the real
Playwright end-to-end journey. The screenshots are part of the review surface:
they should show the user path, not only a unit or API check.

Every app-changing pull request must embed at least one GIF generated from the
successful Playwright E2E evidence. The GIF must show the feature or fix
introduced by the PR in operation. If the change has no isolated user path, the
GIF must show the complete end-to-end flow from entering the app through the
final outcome. Static PNG frames supplement the GIF; they do not replace it.

For multi-step or multi-engine journeys, use a short GIF or video walkthrough
for each relevant path, then keep the exact PNG frames in a collapsible
`<details>` section. GitHub PR descriptions do not support JavaScript
carousels, so a lightweight animated overview plus the original frames is the
supported presentation format.

Before requesting review:

1. Wait for the `E2E / e2e` workflow to finish successfully.
2. Use the screenshots from that exact successful run's `e2e-evidence` artifact.
3. Compose a GIF from the exact successful run's frames that shows the changed
   feature/fix or the complete end-to-end flow.
4. Add the GIF and screenshot gallery to the PR description and link the
   workflow run.
5. Keep the API/static checks and the E2E result visible in the description.

The current workflow uploads the screenshots as an artifact and exposes the run
in the Actions summary. GitHub Actions does not have a supported built-in step
that uploads local PNGs as inline PR-description attachments or edits the PR
body. Until that changes, the PR agent owns the final handoff: download the
passing artifact, add the images to the description, and include the artifact
link. For a durable inline gallery, the agent may place the passing images under
`docs/e2e/<pr-number>/` and reference their raw GitHub URLs in the description.

Required PR description checklist:

- [ ] The required `E2E / e2e` check is green.
- [ ] The successful workflow run is linked.
- [ ] A GIF generated from the successful E2E evidence is embedded in this PR.
- [ ] The GIF shows the changed feature/fix, or the complete end-to-end flow
      when there is no isolated user path.
- [ ] Playwright screenshots cover the journey from entering the app through the
      task detail and engine destination; engine-routing PRs must show Chat,
      Task Runner, and Autopilot paths.
- [ ] The screenshot gallery is included in this PR description.
- [ ] For multi-step journeys, exact PNG frames are retained below the GIF for
      detailed review.
- [ ] Any known limitation or failed path is called out explicitly.

Do not describe a screenshot as passing until it comes from a successful E2E
run. If the workflow fails, fix the failure, rerun it, and use the new artifact.
