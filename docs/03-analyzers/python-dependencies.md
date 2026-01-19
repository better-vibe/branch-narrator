# Python Dependencies Analyzer

Detects changes to Python dependency files and flags risky package changes.

## File Location

`src/analyzers/python-dependencies.ts`

## Finding Type

`DependencyChangeFinding`

## Supported Files

- `requirements.txt` (and variants like `requirements-dev.txt`, `requirements-test.txt`)
- `pyproject.toml`
- `setup.py` / `setup.cfg`
- `Pipfile` / `Pipfile.lock`
- `poetry.lock`

## Detection Rules

1. **Added packages**: New dependencies added to any supported file
2. **Removed packages**: Dependencies that were deleted
3. **Version changes**: Dependencies with version updates (major/minor/patch detection)
4. **Risky packages**: Flags packages in sensitive categories

## Risky Package Categories

| Category | Examples |
|----------|----------|
| `auth` | django-allauth, pyjwt, passlib, bcrypt, authlib |
| `database` | django, sqlalchemy, alembic, psycopg2, pymongo, redis |
| `native` | numpy, pandas, tensorflow, torch, cryptography |
| `payment` | stripe, braintree, paypalrestsdk |

## Example Output

```json
{
  "type": "dependency-change",
  "kind": "dependency-change",
  "category": "dependencies",
  "confidence": "high",
  "evidence": [
    {
      "file": "requirements.txt",
      "excerpt": "django==5.0.0"
    }
  ],
  "name": "django",
  "section": "dependencies",
  "from": "4.2.0",
  "to": "5.0.0",
  "impact": "major",
  "riskCategory": "database"
}
```

## Version Parsing

The analyzer parses version specifiers from:

- `package==1.0.0` (exact)
- `package>=1.0.0` (minimum)
- `package~=1.0.0` (compatible)
- `package[extra]>=1.0.0` (with extras)

## Profile Inclusion

- Python profile (primary)
- Default profile (generic)
