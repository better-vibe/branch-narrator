---
"@better-vibe/branch-narrator": minor
---

Add Python analyzers and profile for Python project analysis

- **Python Dependencies Analyzer**: Detects changes to requirements.txt, pyproject.toml, setup.py, Pipfile, and poetry.lock with risky package categorization (auth, database, native, payment)

- **Python Routes Analyzer**: Detects route/endpoint changes in FastAPI, Django, and Flask frameworks
  - FastAPI: `@app.get()`, `@router.post()` decorators
  - Django: `path()`, `re_path()`, `url()` patterns
  - Flask: `@app.route()`, `@blueprint.route()` decorators

- **Python Migrations Analyzer**: Detects database migration changes with risk assessment
  - Alembic: `alembic/versions/*.py` files
  - Django: `*/migrations/*.py` files
  - High-risk detection for `drop_table`, `drop_column`, `DeleteModel`, `RemoveField`

- **Python Config Analyzer**: Detects changes to Python configuration files
  - Build: pyproject.toml, setup.py, setup.cfg
  - Testing: tox.ini, pytest.ini, conftest.py
  - Typing: mypy.ini, pyrightconfig.json
  - Linting: .flake8, .pylintrc, ruff.toml

- **Python Profile**: New profile that auto-detects Python projects and applies all Python-specific analyzers

New finding types:
- `PythonMigrationFinding` for database migrations
- `PythonConfigFinding` for configuration changes
