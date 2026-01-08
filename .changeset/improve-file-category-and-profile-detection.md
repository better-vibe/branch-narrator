---
"@better-vibe/branch-narrator": patch
---

## Breaking Changes

### Schema Version 2.0: Restructured `facts` output

Meta-findings are no longer in the `findings` array. They now appear in a new `changeset` structure:

**Before (schema 1.0):**
```json
{
  "findings": [
    { "type": "file-summary", "added": [...], "modified": [...] },
    { "type": "file-category", "categories": {...} },
    { "type": "large-diff", "filesChanged": 50, "linesChanged": 5000 },
    { "type": "route-change", ... }
  ]
}
```

**After (schema 2.0):**
```json
{
  "changeset": {
    "files": { "added": [...], "modified": [...], "deleted": [...], "renamed": [...] },
    "byCategory": { "product": [...], "tests": [...], ... },
    "categorySummary": [{ "category": "product", "count": 5 }, ...],
    "warnings": [
      { "type": "large-diff", "filesChanged": 50, "linesChanged": 5000 }
    ]
  },
  "findings": [
    { "type": "route-change", ... }
  ]
}
```

**Migration:**
- `file-summary` → `changeset.files`
- `file-category` → `changeset.byCategory` + `changeset.categorySummary`
- `large-diff` → `changeset.warnings`
- `lockfile-mismatch` → `changeset.warnings`

The `findings` array now only contains domain-specific findings with meaningful `category` values.

## Other Changes

- Add 'artifacts' file category for build outputs (.tgz, .tar.gz, .zip, .wasm, .exe, etc.)
- Improve profile detection reasons to explain WHY a profile was detected
