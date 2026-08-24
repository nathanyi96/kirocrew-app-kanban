"""Kanban application services.

Route handlers stay in ``backend.routes`` because KiroCrew loads that module
from the manifest. Feature orchestration lives here so the hook entry does not
become the only place where domain behavior can be tested or reused.
"""
