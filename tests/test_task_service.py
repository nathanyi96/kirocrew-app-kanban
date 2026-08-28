import unittest
from dataclasses import asdict

from backend.models import TaskRecord
from backend.services.task_service import (
    create_task,
    move_task,
    settle_execution,
    start_execution,
    update_execution_progress,
)


class TaskServiceTests(unittest.TestCase):
    def test_a_card_defaults_to_chat_not_auto(self):
        # `auto` re-routes a prompt to Task Runner behind the user's back, so it
        # must be asked for, never inherited from a missing field.
        self.assertEqual(TaskRecord(id="task", title="Example").engine, "chat")
        self.assertEqual(create_task(title="Example").engine, "chat")
        self.assertEqual(create_task(title="Example", engine="nonsense").engine, "chat")
        self.assertEqual(create_task(title="Example", engine="auto").engine, "auto")

    def test_start_and_settle_preserve_creation_time(self):
        task = TaskRecord(id="task", title="Example", created_at=10, updated_at=10)
        running, execution = start_execution(task, "chat")
        self.assertEqual(running.status, "running")
        self.assertEqual(running.created_at, 10)
        done = settle_execution(running, execution.id, "succeeded")
        self.assertEqual(done.status, "done")
        self.assertEqual(done.created_at, 10)

    def test_a_card_defaults_to_asking_permission(self):
        # A card that never chose gets the Host's safe mode, and the field is
        # part of the serialized record so a board file carries it forward.
        task = TaskRecord(id="task", title="Example")
        self.assertEqual(task.approval_mode, "normal")
        self.assertEqual(asdict(task)["approval_mode"], "normal")
        self.assertEqual(create_task(title="Example").approval_mode, "normal")

    def test_move_preserves_creation_time(self):
        task = TaskRecord(id="task", title="Example", created_at=10, updated_at=10)
        moved = move_task(task, "backlog")
        self.assertEqual(moved.status, "backlog")
        self.assertEqual(moved.created_at, 10)

    def test_progress_and_agent_summary_are_persisted(self):
        task = TaskRecord(id="task", title="Example", created_at=10, updated_at=10)
        running, execution = start_execution(task, "task_runner")
        progressing = update_execution_progress(running, execution.id, "2 of 3", "Verifying output")
        self.assertEqual(progressing.executions[-1].progress, "2 of 3")
        self.assertEqual(progressing.executions[-1].progress_detail, "Verifying output")

        done = settle_execution(
            progressing,
            execution.id,
            "succeeded",
            summary="Created the report.\nhttps://example.com/report.md",
        )
        self.assertEqual(
            done.executions[-1].summary,
            "Created the report.\nhttps://example.com/report.md",
        )
        self.assertEqual(done.activity[-1].summary, "Created the report.")


if __name__ == "__main__":
    unittest.main()
