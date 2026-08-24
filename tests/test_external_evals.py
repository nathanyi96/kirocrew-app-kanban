import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from evals.commands import candidate_command, command_plan, gold_command
from evals.dataset import materialize_suite, select_instances, validate_instances
from evals.evaluator import run_official_evaluator
from evals.kanban_adapter import build_task_payload
from evals.manifest import load_manifest, load_suite
from evals.models import EvalConfigError
from evals.reporting import compare_reports, normalize_report
from evals.runner import prediction_record
from evals.workspace import collect_patch, workspace_name


class ExternalEvalManifestTests(unittest.TestCase):
    def test_manifest_is_small_unique_and_revision_pinned(self):
        suites = load_manifest()
        self.assertEqual([len(suite.task_ids) for suite in suites], [6, 4])
        self.assertEqual(sum(len(suite.task_ids) for suite in suites), 10)
        for suite in suites:
            self.assertEqual(len(suite.revision), 40)
            self.assertEqual(len(suite.task_ids), len(set(suite.task_ids)))

    def test_select_instances_preserves_manifest_order_and_refuses_drift(self):
        suite = load_suite("swe-bench-verified-smoke-v1")
        rows = [{"instance_id": task_id} for task_id in reversed(suite.task_ids)]
        selected = select_instances(suite, rows)
        self.assertEqual([row["instance_id"] for row in selected], list(suite.task_ids))
        with self.assertRaises(EvalConfigError):
            select_instances(suite, rows[:-1])

    def test_existing_materialized_dataset_requires_matching_revision_marker(self):
        suite = load_suite("swe-bench-verified-smoke-v1")
        with tempfile.TemporaryDirectory() as temporary:
            target = suite.materialized_dataset_path(Path(temporary))
            target.mkdir(parents=True)
            with self.assertRaisesRegex(RuntimeError, "revision marker"):
                materialize_suite(suite, Path(temporary))

    def test_upstream_contract_rejects_rows_missing_evaluator_fields(self):
        suite = load_suite("swe-bench-verified-smoke-v1")
        row = {
            "instance_id": suite.task_ids[0],
            "repo": "owner/repo",
            "base_commit": "abc123",
            "problem_statement": "Fix it",
            "patch": "diff --git",
            "FAIL_TO_PASS": ["test_new"],
            "PASS_TO_PASS": ["test_old"],
        }
        self.assertEqual(validate_instances(suite, [row]), [row])
        with self.assertRaisesRegex(EvalConfigError, "PASS_TO_PASS"):
            validate_instances(suite, [{**row, "PASS_TO_PASS": "test_old"}])


class ExternalEvalCommandTests(unittest.TestCase):
    def test_swebench_plan_materializes_pin_and_filters_every_task(self):
        suite = load_suite("swe-bench-verified-smoke-v1")
        plan = command_plan(suite, Path("eval-runs"))
        self.assertIn("materialize", plan)
        candidate = plan["candidate"]
        self.assertEqual(candidate.count("-i"), len(suite.task_ids))
        self.assertIn(str(suite.materialized_dataset_path(Path("eval-runs"))), candidate)
        self.assertIn("--predictions", candidate)
        self.assertIn("official-reports", plan["report_paths"]["candidate"])

    def test_featurebench_commands_pin_revision_and_score_failed_outputs(self):
        suite = load_suite("featurebench-lite-smoke-v1")
        gold = gold_command(suite, Path("eval-runs"))
        candidate = candidate_command(suite, Path("eval-runs"))
        self.assertIn(suite.revision, gold)
        self.assertNotIn("--include-failed", gold)
        self.assertIn("--include-failed", candidate)
        task_index = candidate.index("--task-id") + 1
        self.assertEqual(candidate[task_index:], list(suite.task_ids))

    def test_official_featurebench_gold_isolated_under_output_root(self):
        suite = load_suite("featurebench-lite-smoke-v1")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with mock.patch("evals.evaluator.shutil.which", return_value="/usr/bin/fb"), mock.patch(
                "evals.evaluator.subprocess.run",
                return_value=subprocess.CompletedProcess(["fb"], 0),
            ) as run:
                result = run_official_evaluator(suite, root, gold=True)
            expected_cwd = root.resolve() / "official-reports" / suite.id / "gold"
            self.assertEqual(run.call_args.kwargs["cwd"], expected_cwd)
            self.assertEqual(
                result["report_location"],
                str(expected_cwd / "runs" / "gold" / "report.json"),
            )


class KanbanEvalAdapterTests(unittest.TestCase):
    def test_payload_targets_workspace_without_leaking_gold_fields(self):
        suite = load_suite("swe-bench-verified-smoke-v1")
        instance = {
            "instance_id": suite.task_ids[0],
            "problem_statement": "Implement the requested behavior",
            "repo": "example/repo",
            "base_commit": "abc123",
            "patch": "SECRET GOLD PATCH",
            "FAIL_TO_PASS": ["hidden test"],
        }
        payload = build_task_payload(
            suite,
            instance,
            Path("/tmp/prepared-workspace"),
            loop_attempts=1,
            token_budget=50000,
        )
        encoded = json.dumps(payload)
        self.assertEqual(payload["engine"], "task_runner")
        self.assertEqual(payload["goal"]["mode"], "loop")
        self.assertEqual(
            payload["metadata"]["workspace_dir"],
            str(Path("/tmp/prepared-workspace").resolve()),
        )
        self.assertNotIn("SECRET GOLD PATCH", encoded)
        self.assertNotIn("hidden test", encoded)

    def test_prediction_records_match_official_schemas(self):
        swe = load_suite("swe-bench-verified-smoke-v1")
        feature = load_suite("featurebench-lite-smoke-v1")
        instance = {
            "instance_id": "task-id",
            "repo": "owner/repo",
            "base_commit": "abc",
        }
        swe_record = prediction_record(
            swe, instance, "diff --git", label="kanban", success=True, error=""
        )
        self.assertEqual(
            set(swe_record), {"instance_id", "model_patch", "model_name_or_path"}
        )
        feature_record = prediction_record(
            feature, instance, "diff --git", label="kanban", success=False, error="failed"
        )
        self.assertEqual(feature_record["n_attempt"], 1)
        self.assertEqual(feature_record["agent"], "kirocrew_kanban")
        self.assertFalse(feature_record["success"])


class ExternalEvalReportTests(unittest.TestCase):
    def test_normalizes_swebench_and_featurebench_without_hiding_coverage(self):
        swe = load_suite("swe-bench-verified-smoke-v1")
        feature = load_suite("featurebench-lite-smoke-v1")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            swe_report = root / "swe.json"
            swe_report.write_text(
                json.dumps(
                    {
                        "submitted_ids": list(swe.task_ids),
                        "completed_instances": 6,
                        "resolved_ids": list(swe.task_ids[:2]),
                        "unresolved_ids": list(swe.task_ids[2:]),
                        "error_ids": [],
                        "empty_patch_ids": [swe.task_ids[-1]],
                    }
                ),
                encoding="utf-8",
            )
            normalized_swe = normalize_report(swe, swe_report)
            self.assertEqual(normalized_swe["attempts"][0]["resolved"], 2)
            self.assertEqual(normalized_swe["attempts"][0]["resolved_rate"], 0.3333)

            feature_report = root / "feature.json"
            feature_report.write_text(
                json.dumps(
                    {
                        "attempt_1": {
                            "n_attempt": 1,
                            "submitted_instances": 4,
                            "completed_instances": 4,
                            "resolved_instances": 1,
                            "error_instances": 1,
                            "not_applied_patch_empty_instances": 1,
                            "pass_rate": 0.625,
                        }
                    }
                ),
                encoding="utf-8",
            )
            normalized_feature = normalize_report(feature, feature_report)
            attempt = normalized_feature["attempts"][0]
            self.assertEqual(attempt["resolved_rate"], 0.25)
            self.assertEqual(attempt["pass_rate"], 0.625)

            comparison = compare_reports(
                normalized_feature,
                {
                    **normalized_feature,
                    "attempts": [{**attempt, "resolved": 2, "resolved_rate": 0.5}],
                },
            )
            self.assertEqual(comparison["delta"]["resolved"], 1.0)
            self.assertEqual(comparison["delta"]["resolved_rate"], 0.25)


class ExternalEvalWorkspaceTests(unittest.TestCase):
    def test_collect_patch_includes_modified_and_untracked_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            workspace = Path(temporary)
            subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
            subprocess.run(
                ["git", "config", "user.email", "eval@example.com"],
                cwd=workspace,
                check=True,
            )
            subprocess.run(
                ["git", "config", "user.name", "Eval Test"],
                cwd=workspace,
                check=True,
            )
            source = workspace / "source.py"
            source.write_text("value = 1\n", encoding="utf-8")
            subprocess.run(["git", "add", "source.py"], cwd=workspace, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=workspace, check=True)
            base = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=workspace,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            source.write_text("value = 2\n", encoding="utf-8")
            (workspace / "new.py").write_text("created = True\n", encoding="utf-8")
            patch = collect_patch(workspace, base)
            self.assertIn("value = 2", patch)
            self.assertIn("new.py", patch)
            self.assertIn("created = True", patch)

    def test_workspace_names_are_bounded_and_collision_resistant(self):
        first = workspace_name("repo__task/with unsafe characters" * 10)
        second = workspace_name("repo__task/with unsafe characters" * 10 + "x")
        self.assertLessEqual(len(first), 91)
        self.assertNotEqual(first, second)


if __name__ == "__main__":
    unittest.main()
