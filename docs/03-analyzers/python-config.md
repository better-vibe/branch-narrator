# Python Configuration Analyzer

Detects changes to Python configuration files with breaking change detection.

## File Location

`src/analyzers/python-config.ts`

## Finding Type

`PythonConfigFinding`

## Supported Configuration Files

### Build / Package Config

| File | Config Type | Category |
|------|-------------|----------|
| `pyproject.toml` | pyproject | build |
| `setup.cfg` | setup | build |
| `setup.py` | setup | build |
| `MANIFEST.in` | manifest | build |

### Testing Config

| File | Config Type | Category |
|------|-------------|----------|
| `tox.ini` | tox | testing |
| `pytest.ini` | pytest | testing |
| `conftest.py` | pytest | testing |
| `.coveragerc` | coverage | testing |
| `.noxfile.py` | nox | testing |

### Type Checking Config

| File | Config Type | Category |
|------|-------------|----------|
| `mypy.ini` / `.mypy.ini` | mypy | typing |
| `pyrightconfig.json` | pyright | typing |

### Linting Config

| File | Config Type | Category |
|------|-------------|----------|
| `.flake8` | flake8 | linting |
| `.pylintrc` | pylint | linting |
| `ruff.toml` / `.ruff.toml` | ruff | linting |
| `.isort.cfg` | isort | linting |
| `.bandit` | bandit | security |

### Formatting & Hooks

| File | Config Type | Category |
|------|-------------|----------|
| `.black` | black | formatting |
| `.editorconfig` | editorconfig | formatting |
| `.pre-commit-config.yaml` | pre-commit | hooks |

### Environment Config

| File | Config Type | Category |
|------|-------------|----------|
| `.python-version` | python-version | environment |
| `runtime.txt` | runtime | environment |

## Breaking Change Detection

The analyzer detects potentially breaking changes in `pyproject.toml`:

- Python version constraint changes (`requires-python`)
- Build system configuration changes (`[build-system]`)
- Dependency section changes (`[project.dependencies]`, `[tool.poetry.dependencies]`)
- CLI scripts changes (`[project.scripts]`)
- Entry points changes (`[project.entry-points]`)

## Example Output

```json
{
  "type": "python-config",
  "kind": "python-config",
  "category": "config_env",
  "confidence": "high",
  "evidence": [
    {
      "file": "pyproject.toml",
      "excerpt": "requires-python = \">=3.10\""
    }
  ],
  "file": "pyproject.toml",
  "status": "modified",
  "configType": "pyproject",
  "configCategory": "build",
  "isBreaking": true,
  "affectedSections": ["project", "build-system"],
  "breakingReasons": [
    "requires-python changed",
    "[build-system] section modified"
  ]
}
```

## Profile Inclusion

- Python profile (primary)
