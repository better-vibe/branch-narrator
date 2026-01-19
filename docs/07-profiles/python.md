# Python Profile

The Python profile provides specialized analysis for Python projects, including support for FastAPI, Django, Flask, and other Python frameworks.

## Profile Name

`python`

## Included Analyzers

### Python-Specific Analyzers

| Analyzer | Description |
|----------|-------------|
| `pythonDependenciesAnalyzer` | Detects changes to requirements.txt, pyproject.toml, setup.py |
| `pythonRoutesAnalyzer` | Detects FastAPI, Django, and Flask route changes |
| `pythonMigrationsAnalyzer` | Detects Alembic and Django migration changes |
| `pythonConfigAnalyzer` | Detects Python config file changes (mypy, ruff, pytest) |

### General Analyzers

| Analyzer | Description |
|----------|-------------|
| `fileSummaryAnalyzer` | File-level change summary |
| `fileCategoryAnalyzer` | Categorizes files by type |
| `envVarAnalyzer` | Detects environment variable usage |
| `securityFilesAnalyzer` | Detects security-sensitive file changes |
| `impactAnalyzer` | Blast radius analysis |
| `analyzeLargeDiff` | Large change detection |
| `analyzeLockfiles` | Lock file analysis |
| `analyzeTestGaps` | Missing test coverage detection |
| `analyzeSQLRisks` | Destructive SQL pattern detection |
| `analyzeCIWorkflows` | GitHub Actions security analysis |
| `analyzeInfra` | Infrastructure as code detection |
| `analyzeAPIContracts` | API endpoint change detection |

## Auto-Detection

The Python profile is automatically detected when:

1. **Project files exist:**
   - `pyproject.toml`
   - `setup.py`
   - `setup.cfg`
   - `requirements.txt`
   - `Pipfile`
   - `poetry.lock`

2. **Framework markers exist:**
   - `manage.py` (Django)
   - `app/main.py` or `src/main.py` (FastAPI)
   - `app/__init__.py` (Flask)

3. **Changed files indicate framework:**
   - Migration files (`*/migrations/*.py`)
   - URL configuration files (`urls.py`)
   - Router files (`routers/`, `endpoints/`)

## Manual Selection

```bash
branch-narrator integrate --profile python
branch-narrator facts --profile python
```

## Example Use Cases

### FastAPI API Project

```bash
# Auto-detected from pyproject.toml and app/main.py
branch-narrator facts
```

Detects:
- Route changes in `routers/*.py`
- Dependency changes in `pyproject.toml`
- Alembic migration risks

### Django Web Application

```bash
# Auto-detected from manage.py
branch-narrator integrate
```

Detects:
- URL pattern changes in `urls.py`
- Django migration risks
- Model changes affecting the database

### Flask Microservice

```bash
# Auto-detected from requirements.txt and app structure
branch-narrator risk-report
```

Detects:
- Route decorator changes
- Configuration changes
- Dependency updates

## Supported Frameworks

| Framework | Route Detection | Migration Detection | Config Detection |
|-----------|-----------------|---------------------|------------------|
| FastAPI | `@app.get()`, `@router.post()` | Alembic | pyproject.toml |
| Django | `path()`, `re_path()`, `url()` | Django migrations | settings.py |
| Flask | `@app.route()`, `@blueprint.route()` | Alembic | config.py |

## Finding Types Generated

- `DependencyChangeFinding` - Python package changes
- `RouteChangeFinding` - API route changes
- `PythonMigrationFinding` - Database migration changes
- `PythonConfigFinding` - Configuration file changes
- `RiskFlagFinding` - High-risk operation warnings
