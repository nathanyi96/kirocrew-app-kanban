import unittest

from backend.models import TaskRecord
from backend.services.outcome_service import build_goal, goal_run_blocker, should_continue_goal
from backend.services.task_runner_service import task_runner_spec
from backend.services.task_service import (
    settle_execution,
    start_execution,
    update_execution_snapshot,
)


class OutcomeServiceTests(unittest.TestCase):
    def test_completed_task_runner_run_creates_verified_result_packet(self):
        goal = build_goal(
            "Ship the outcome",
            criteria=["Feature works", "Checks pass"],
            max_attempts=3,
        )
        task = TaskRecord(id="task", title="Ship it", prompt="Ship it", goal=goal)
        running, execution = start_execution(task, "task_runner")
        projected = update_execution_snapshot(
            running,
            execution.id,
            {
                "status": "completed",
                "tokens_used": 4200,
                "replan_count": 1,
                "branch_name": "kirocrew/task/ship-it",
                "commit_hashes": ["abc123def456"],
                "step_details": [
                    {
                        "index": 1,
                        "title": "Implement feature",
                        "status": "passed",
                        "attempts": 2,
                        "result": "Created `src/feature.py` and https://example.com/result",
                    },
                    {
                        "index": 2,
                        "title": "Run checks",
                        "status": "passed",
                        "attempts": 1,
                        "result": "All checks passed",
                    },
                ],
            },
        )

        self.assertEqual(projected.goal.tokens_used, 4200)
        self.assertTrue(all(check.status == "passed" for check in projected.goal.criteria))
        self.assertEqual(len(projected.executions[-1].steps), 2)
        self.assertTrue(any(artifact.kind == "file" for artifact in projected.artifacts))
        self.assertTrue(any(artifact.kind == "link" for artifact in projected.artifacts))
        self.assertTrue(any(artifact.kind == "commit" for artifact in projected.artifacts))

        done = settle_execution(projected, execution.id, "succeeded")
        self.assertEqual(done.status, "done")
        self.assertEqual(done.goal.status, "achieved")
        self.assertEqual(done.result_packet.status, "verified")
        self.assertEqual(len(done.result_packet.verification), 2)

    def test_repeated_failure_stops_bounded_loop(self):
        task = TaskRecord(
            id="task",
            title="Loop safely",
            goal=build_goal("Loop safely", criteria=["Outcome verified"], max_attempts=3),
        )
        first, first_execution = start_execution(task, "task_runner")
        first_failed = settle_execution(first, first_execution.id, "failed", "same failure")
        self.assertEqual(first_failed.goal.status, "working")
        self.assertTrue(should_continue_goal(first_failed))

        second, second_execution = start_execution(first_failed, "task_runner")
        second_failed = settle_execution(second, second_execution.id, "failed", "same failure")
        self.assertEqual(second_failed.goal.status, "blocked")
        self.assertEqual(second_failed.goal.repeated_failures, 2)
        self.assertTrue(all(check.status == "unknown" for check in second_failed.goal.criteria))
        self.assertFalse(should_continue_goal(second_failed))

    def test_goal_limits_are_bounded(self):
        goal = build_goal(
            "Bound me",
            max_attempts=100,
            max_minutes=9999,
            token_budget=99999999,
        )
        self.assertEqual(goal.max_attempts, 10)
        self.assertEqual(goal.max_minutes, 720)
        self.assertEqual(goal.token_budget, 2_000_000)

    def test_manual_attempts_cannot_cross_goal_limits(self):
        task = TaskRecord(
            id="task",
            title="Stay bounded",
            goal=build_goal("Stay bounded", max_attempts=1),
        )
        running, execution = start_execution(task, "task_runner")
        failed = settle_execution(running, execution.id, "failed", "Needs a correction")
        self.assertEqual(goal_run_blocker(failed), "Goal attempt limit reached (1/1)")

        failed.goal.tokens_used = failed.goal.token_budget
        failed.goal.attempts = 0
        self.assertIn("token budget exhausted", goal_run_blocker(failed))

        failed.goal.status = "achieved"
        self.assertEqual(goal_run_blocker(failed), "This goal is already achieved")

    def test_task_runner_spec_contains_goal_contract_and_prior_evidence(self):
        task = TaskRecord(
            id="task",
            title="Outcome first",
            prompt="Implement it",
            goal=build_goal("Implement it", criteria=["Tests pass"]),
        )
        running, execution = start_execution(task, "task_runner")
        failed = settle_execution(running, execution.id, "failed", "Tests failed")
        next_run, _ = start_execution(failed, "task_runner")
        spec = task_runner_spec(next_run, "Use the smaller fix")
        self.assertIn("## Done means", spec)
        self.assertIn("Tests pass", spec)
        self.assertIn("## Previous attempt", spec)
        self.assertIn("Tests failed", spec)
        self.assertIn("## Latest user instruction", spec)
        self.assertIn("Use the smaller fix", spec)


if __name__ == "__main__":
    unittest.main()
