# SQL Risks Analyzer

**File:** `src/analyzers/sql-risks.ts`
**Finding Type:** `sql-risk`

## Purpose

Detects risky SQL patterns in migration and SQL files.

## Finding Type

```typescript
type SQLRisk =
  | "destructive"
  | "schema_change"
  | "unscoped_modification";

interface SQLRiskFinding {
  type: "sql-risk";
  file: string;
  riskType: SQLRisk;
  details: string;
}
```

## Detection Rules

| Trigger | riskType |
|---------|----------|
| `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` | `destructive` |
| `ALTER TABLE ... ALTER COLUMN/TYPE` | `schema_change` |
| `UPDATE`/`DELETE` without `WHERE` | `unscoped_modification` |

**Files analyzed:**
- Any file under `**/migrations/**` or `**/migrate/**`
- `*.sql` files

## Example Output

```json
{
  "type": "sql-risk",
  "file": "migrations/20240101_drop_users.sql",
  "riskType": "destructive",
  "details": "Contains DROP TABLE/COLUMN or TRUNCATE"
}
```

## Usage in Markdown

```markdown
### SQL Risk

**destructive**
- File: `migrations/20240101_drop_users.sql`
- Contains DROP TABLE/COLUMN or TRUNCATE
```
