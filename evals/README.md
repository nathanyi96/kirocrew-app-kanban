# External harness evals

This directory measures the Kanban + KiroCrew harness on public coding tasks
with the benchmark authors' own evaluators. It complements product-specific
journeys and human review; it does not replace them.

## Pinned smoke suites

- `swe-bench-verified-smoke-v1`: six short, human-verified tasks across Django,
  pytest, Flask, Requests, Sphinx, and SymPy.
- `featurebench-lite-smoke-v1`: four CPU-oriented level-1 feature tasks across
  Pydantic, SymPy, Seaborn, and Sphinx.

`manifest.json` pins full Hugging Face commit SHAs, split names, exact task IDs,
attempt count, timeout, and evaluator concurrency. The repositories and
datasets are not vendored. Each task repository retains its own license.

Validate the manifest and inspect the exact official commands:

```bash
python -m evals validate
python -m evals validate --upstream
python -m evals list
python -m evals plan --suite swe-bench-verified-smoke-v1
python -m evals plan --suite featurebench-lite-smoke-v1
```

The plan includes a gold-patch preflight. Run that first when setting up a new
machine: a failed gold run means the evaluator or environment is broken, so a
candidate score from that machine is not trustworthy.

`validate --upstream` loads the exact pinned dataset revisions and checks that
every selected row still has a repository, base commit, problem statement,
gold patch, and pass/fail test contract. It is intentionally opt-in so ordinary
CI does not depend on Hugging Face availability.

## Generate Kanban predictions

Install and enable this checkout in KiroCrew, enable Task Runner, and start the
gateway. Then run one suite from the repository root:

```bash
python -m evals run \
  --suite swe-bench-verified-smoke-v1 \
  --output-dir eval-runs \
  --base-url http://127.0.0.1:7777
```

The runner uses the official Hugging Face `datasets` package to load the pinned
rows. SWE-bench and FeatureBench both install that dependency. For each task it:

1. clones the source repository and checks out the task's exact `base_commit`;
2. creates a Kanban card whose metadata points Task Runner at that checkout;
3. waits for the bounded goal to settle while leaving the card visible for
   progress and result inspection;
4. captures staged, unstaged, committed, and new files as one git patch; and
5. writes the benchmark's official prediction schema plus `kanban-run.json`.

Use `--resume` after an interrupted run. Existing prediction rows are retained,
and existing workspaces are never deleted. The default is one bounded Kanban
attempt so pass@1 comparisons remain fair. `--loop-attempts 3` evaluates the
product's loop-until-verified behavior as a separate harness configuration.

Authentication is minted locally from the same `KIROCREW_HOME` as the gateway.
For a different environment, set `KANBAN_AUTH_COOKIE` to the full dashboard
cookie value. Do not put credentials in CLI arguments or committed output.

The adapter does not auto-approve tools. Benchmark repositories are untrusted
code; run autonomous experiments only in a disposable VM or container with the
Host approval policy you explicitly chose.

## Score and compare

Run the `gold` and `candidate` commands printed by `plan`. SWE-bench first
materializes the pinned dataset because its official CLI has no revision flag;
FeatureBench receives the commit directly through `--data-version`.
The plan's `report_paths` field shows where each evaluator writes its report;
the wrapper isolates FeatureBench's otherwise fixed `runs/gold/report.json`
under `eval-runs/official-reports/`.

The same commands can be executed without copy/paste (Docker is required by
both official evaluators):

```bash
python -m evals evaluate --suite swe-bench-verified-smoke-v1 --gold
python -m evals evaluate --suite swe-bench-verified-smoke-v1
python -m evals evaluate --suite featurebench-lite-smoke-v1 --gold
python -m evals evaluate --suite featurebench-lite-smoke-v1
```

Normalize the resulting official report:

```bash
python -m evals normalize \
  --suite featurebench-lite-smoke-v1 \
  --report eval-runs/featurebench-lite-smoke-v1/report.json \
  --output eval-runs/featurebench-lite-smoke-v1/normalized.json
```

Compare two normalized harness configurations:

```bash
python -m evals compare \
  --baseline eval-runs/baseline.json \
  --candidate eval-runs/candidate.json \
  --output eval-runs/comparison.json
```

The common report keeps coverage, resolved count/rate, errors, and empty
patches. FeatureBench also keeps its partial-credit F2P pass rate. Always compare
the same suite revision and disclose model, Host version, approval policy,
attempt limit, token budget, and hardware alongside the score.

Because the task IDs are public, repeated prompt tuning can overfit this smoke
set. Treat it as a stable regression gate, disclose every harness setting, and
use separate production-derived holdouts plus human review for product
decisions.
