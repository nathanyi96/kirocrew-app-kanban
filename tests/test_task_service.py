import unittest

from backend.models import TaskRecord
from backend.services.task_service import move_task, settle_execution, start_execution


class TaskServiceTests(unittest.TestCase):
    def test_start_and_settle_preserve_creation_time(self):
        task = TaskRecord(id="task", title="Example", created_at=10, updated_at=10)
        running, execution = start_execution(task, "chat")
        self.assertEqual(running.status, "running")
        self.assertEqual(running.created_at, 10)
        done = settle_execution(running, execution.id, "succeeded")
        self.assertEqual(done.status, "done")
        self.assertEqual(done.created_at, 10)

    def test_move_preserves_creation_time(self):
        task = TaskRecord(id="task", title="Example", created_at=10, updated_at=10)
        moved = move_task(task, "backlog")
        self.assertEqual(moved.status, "backlog")
        self.assertEqual(moved.created_at, 10)


if __name__ == "__main__":
    unittest.main()
