import unittest

from backend.models import TaskRecord
from backend.services.task_runner_service import task_runner_start_kwargs
from backend.services.task_service import create_task


class TaskRunnerServiceTests(unittest.TestCase):
    def test_create_task_preserves_eval_metadata(self):
        task = create_task(
            "External eval",
            metadata={"workspace_dir": "/tmp/eval", "eval_suite": "smoke"},
        )
        self.assertEqual(task.metadata["workspace_dir"], "/tmp/eval")

    def test_workspace_is_passed_only_when_host_supports_it(self):
        task = TaskRecord(
            id="task",
            title="External eval",
            metadata={"workspace_dir": "/tmp/eval"},
        )

        async def modern(spec, *, workspace_dir="", **kwargs):
            return workspace_dir

        options = task_runner_start_kwargs(task, modern)
        self.assertEqual(options["workspace_dir"], "/tmp/eval")
        self.assertFalse(options["auto_approve"])

        async def legacy(spec, *, name="", source="", auto_approve=False):
            return name

        with self.assertRaisesRegex(RuntimeError, "upgrade KiroCrew"):
            task_runner_start_kwargs(task, legacy)

    def test_regular_task_keeps_host_compatible_options(self):
        task = TaskRecord(id="task", title="Normal task")

        async def legacy(spec, *, name="", source="", auto_approve=False):
            return name

        options = task_runner_start_kwargs(task, legacy)
        self.assertEqual(
            options,
            {"name": "Normal task", "source": "dashboard", "auto_approve": False},
        )


if __name__ == "__main__":
    unittest.main()
