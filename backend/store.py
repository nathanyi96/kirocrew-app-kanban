"""File-backed board persistence with atomic writes and advisory locking."""

from __future__ import annotations

import contextlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from kiro_crew.atomic_write import atomic_write
from kiro_crew.platform_compat import file_lock


class BoardStore:
    def __init__(self, root: Path, *, from_dict: Callable[[dict[str, Any]], Any], to_dict: Callable[[Any], dict[str, Any]]):
        self._root = root.expanduser()
        self._root.mkdir(parents=True, exist_ok=True)
        self._board_path = self._root / 'board.json'
        self._lock_path = self._root / '.lock'
        self._from_dict = from_dict
        self._to_dict = to_dict

    def load(self) -> list[Any]:
        with self._locked():
            return self._read()

    def get_task(self, task_id: str) -> Any | None:
        return next((task for task in self.load() if task.id == task_id), None)

    def update_task(self, task_id: str, updater: Callable[[Any], Any]) -> Any | None:
        with self._locked():
            tasks = self._read()
            result = None
            new_tasks = []
            for task in tasks:
                if task.id == task_id:
                    result = updater(task)
                    if result is not None:
                        new_tasks.append(result)
                else:
                    new_tasks.append(task)
            self._write(new_tasks)
            return result

    def add_task(self, task: Any) -> None:
        with self._locked():
            tasks = self._read()
            tasks.append(task)
            self._write(tasks)

    def delete_task(self, task_id: str) -> bool:
        with self._locked():
            tasks = self._read()
            new_tasks = [task for task in tasks if task.id != task_id]
            if len(new_tasks) == len(tasks):
                return False
            self._write(new_tasks)
            return True

    def _read(self) -> list[Any]:
        if not self._board_path.exists():
            return []
        raw = json.loads(self._board_path.read_text(encoding='utf-8'))
        return [self._from_dict(item) for item in raw.get('tasks', [])]

    def _write(self, tasks: list[Any]) -> None:
        atomic_write(self._board_path, json.dumps({'version': 1, 'tasks': [self._to_dict(task) for task in tasks]}, indent=2, ensure_ascii=False))

    @contextlib.contextmanager
    def _locked(self):
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        if not self._lock_path.exists():
            self._lock_path.touch()
        fd = self._lock_path.open('r+')
        try:
            with file_lock(fd.fileno()):
                yield
        finally:
            fd.close()
