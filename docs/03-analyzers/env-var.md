# Environment Variable Analyzer

**File:** `src/analyzers/env-var.ts`
**Finding Type:** `env-var`

## Purpose

Extracts environment variable references from code changes.

## Finding Type

```typescript
type EnvVarChange = "added" | "touched";

interface EnvVarFinding {
  type: "env-var";
  name: string;
  change: EnvVarChange;
  evidenceFiles: string[];
}
```

## Detection Patterns

| Pattern | Example | Extracted |
|---------|---------|-----------|
| `process.env.VAR` | `process.env.DATABASE_URL` | `DATABASE_URL` |
| `PUBLIC_*` prefix | `PUBLIC_SUPABASE_URL` | `PUBLIC_SUPABASE_URL` |
| SvelteKit public import | `import { X } from '$env/static/public'` | `X` |
| SvelteKit private import | `import { Y } from '$env/static/private'` | `Y` |

## SvelteKit Import Parsing

```typescript
// Simple import
import { PUBLIC_API_URL } from '$env/static/public';
// Extracts: PUBLIC_API_URL

// Multiple imports
import { PUBLIC_API_URL, PUBLIC_APP_NAME } from '$env/static/public';
// Extracts: PUBLIC_API_URL, PUBLIC_APP_NAME

// Aliased import
import { DATABASE_URL as dbUrl } from '$env/static/private';
// Extracts: DATABASE_URL (original name)
```

## Example Output

```json
{
  "type": "env-var",
  "name": "PUBLIC_SUPABASE_URL",
  "change": "added",
  "evidenceFiles": [
    "src/lib/supabase.ts",
    "src/hooks.server.ts"
  ]
}
```

## Change Detection

| Status | Meaning |
|--------|---------|
| `added` | First appearance in diff additions |
| `touched` | Already exists, referenced in changes |

## File Filtering

Excluded from env var scanning:
- `dist/` - Build artifacts
- `node_modules/` - Dependencies
- `*.map` - Source maps

## Usage in Markdown

```markdown
## Config / Env

| Variable | Status | Evidence |
|----------|--------|----------|
| `PUBLIC_SUPABASE_URL` | added | src/lib/supabase.ts |
| `DATABASE_URL` | added | src/hooks.server.ts |
```

## Risk Impact

New env vars add +5 to risk score with evidence bullet:

```
ℹ️ New env var: PUBLIC_SUPABASE_URL
```

