# Test Parity Analyzer

The Test Parity Analyzer enforces the convention that every modified or added source file should have a corresponding test file. This ensures that code changes are accompanied by verification steps, which is critical for autonomous agents and healthy codebases.

## How it works

1.  **Scope**: Scans all `modified` or `added` files in the change set.
2.  **Filtering**:
    *   Ignores non-code files (images, docs, config).
    *   Ignores existing test files (files ending in `.test.ts`, `.spec.ts`, etc.).
    *   Ignores type definitions (`.d.ts`).
3.  **Mapping Strategy**:
    For a source file `src/utils/math.ts`, it looks for a test file in the following locations:
    *   `src/utils/math.test.ts` (Colocation)
    *   `tests/utils/math.test.ts` (Mirrored structure)
    *   `tests/math.test.ts` (Flat structure)
    *   `tests/src/utils/math.test.ts` (Mirrored with src root)
4.  **Change Set Check**:
    If no *existing* test file is found on disk, it checks if a *new* test file is being added in the current change set (e.g., `src/utils/math.test.ts` is `added`).

## Findings

### `convention-violation`

*   **Category**: `tests`
*   **Confidence**: `high`
*   **Risk**: If ignored, this indicates untested code is entering the codebase.

**Example Output:**

```markdown
## ⚠️ Conventions

- **Found 1 source file(s) without corresponding tests.**
  - `src/utils/complex-logic.ts`
```
