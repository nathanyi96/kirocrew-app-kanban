import unittest

from backend.services.engine_routing import resolve_engine


class EngineRoutingTests(unittest.TestCase):
    engines = ("chat", "task_runner", "autopilot")

    def test_simple_prompt_uses_chat(self):
        self.assertEqual(resolve_engine("auto", "Summarize this note", self.engines), "chat")

    def test_multi_step_prompt_uses_task_runner(self):
        self.assertEqual(resolve_engine("auto", "Implement a multi-step workflow", self.engines), "task_runner")


if __name__ == "__main__":
    unittest.main()
