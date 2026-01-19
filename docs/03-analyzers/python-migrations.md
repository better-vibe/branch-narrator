# Python Migrations Analyzer

Detects database migration changes in Python projects with risk assessment.

## File Location

`src/analyzers/python-migrations.ts`

## Finding Type

`PythonMigrationFinding`

## Supported Tools

### Alembic

Migration file patterns:
- `alembic/versions/*.py`
- `migrations/versions/*.py`
- `db/versions/*.py`

### Django

Migration file pattern:
- `*/migrations/0001_*.py` (numbered migration files)

## Risk Assessment

### High Risk (Destructive Operations)

**Alembic patterns:**
- `op.drop_table()`
- `op.drop_column()`
- `op.drop_index()`
- `op.drop_constraint()`
- Raw SQL with `DROP`, `TRUNCATE`, or `DELETE` without `WHERE`

**Django patterns:**
- `DeleteModel()`
- `RemoveField()`
- `AlterField(..., null=False)` (making field non-nullable)
- `RunSQL()` with destructive SQL

### Medium Risk (Schema Changes)

**Alembic patterns:**
- `op.alter_column()`
- `op.create_table()`
- `op.add_column()`
- `op.create_index()`
- `op.create_foreign_key()`

**Django patterns:**
- `CreateModel()`
- `AddField()`
- `AlterField()`
- `RenameField()`
- `RenameModel()`
- `AddIndex()`
- `AddConstraint()`

### Low Risk

Migration files changed without detected patterns.

## Example Output

```json
{
  "type": "python-migration",
  "kind": "python-migration",
  "category": "database",
  "confidence": "high",
  "evidence": [
    {
      "file": "alembic/versions/abc123_drop_legacy.py",
      "excerpt": "op.drop_table('old_users')"
    }
  ],
  "tool": "alembic",
  "files": ["alembic/versions/abc123_drop_legacy.py"],
  "risk": "high",
  "reasons": ["drop_table detected in alembic/versions/abc123_drop_legacy.py"]
}
```

## Risk Flag Generation

High-risk migrations automatically generate an additional `RiskFlagFinding`:

```json
{
  "type": "risk-flag",
  "kind": "risk-flag",
  "category": "database",
  "confidence": "high",
  "risk": "high",
  "evidenceText": "Destructive migration detected: drop_table detected in ..."
}
```

## Profile Inclusion

- Python profile (primary)
