# Impact Radius Analyzer

The Impact Radius Analyzer determines the "blast radius" of a change by identifying which files in the codebase import the modified files. This helps agents and humans understand the potential ripple effects of a change.

## How it works

1.  **Scope**: Scans all `modified` or `renamed` source files in the change set.
2.  **Scanning**:
    *   Uses **batched `git grep`** for high-performance searching across the codebase.
    *   Searches for the modified file's name (basename) in other files.
    *   Verifies matches to reduce false positives (checking if the line likely contains an import).
3.  **Blast Radius Calculation**:
    *   **Low**: 1-3 dependent files.
    *   **Medium**: 4-10 dependent files.
    *   **High**: >10 dependent files.

## Findings

### `impact-analysis`

*   **Category**: `tests` (or general quality)
*   **Confidence**: `medium` (due to heuristic regex scanning)
*   **Evidence**: Lists the files that import the modified file.

**Example Output:**

```markdown
## 🧨 Impact Analysis

### `src/utils/shared-config.ts` 🔴

**Blast Radius:** HIGH (15 files)

Affected files:
- `src/features/login.ts`
- `src/features/dashboard.ts`
- `src/api/client.ts`
- ...and 12 more
```
