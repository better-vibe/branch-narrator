# File Summary Analyzer

**File:** `src/analyzers/file-summary.ts`
**Finding Type:** `file-summary`

## Purpose

Produces a summary of all file changes, grouped by status.

## Finding Type

```typescript
interface FileSummaryFinding {
  type: "file-summary";
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}
```

## Behavior

1. Iterates through `changeSet.files`
2. Groups files by status (added, modified, deleted, renamed)
3. Filters out excluded files (dist/, node_modules/, etc.)

## Example Output

```json
{
  "type": "file-summary",
  "added": [
    "src/routes/dashboard/+page.svelte",
    "src/lib/auth.ts"
  ],
  "modified": [
    "package.json",
    "src/app.html"
  ],
  "deleted": [],
  "renamed": [
    { "from": "src/old.ts", "to": "src/new.ts" }
  ]
}
```

## File Filtering

The following patterns are excluded:

| Pattern | Reason |
|---------|--------|
| `dist/` | Build output |
| `build/` | Build output |
| `.next/` | Next.js build |
| `.svelte-kit/` | SvelteKit build |
| `node_modules/` | Dependencies |
| `*.map` | Source maps |
| `*.d.ts` | Type declarations |

## Usage in Markdown

The file summary populates the **Summary** section:

```markdown
## Summary

- 14 file(s) changed
- 4 file(s) added
- 2 file(s) deleted
```

