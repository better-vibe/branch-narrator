# Vitest Analyzer

**File:** `src/analyzers/vitest.ts`
**Finding Type:** `test-change`

## Purpose

Detects test file and configuration changes.

## Finding Type

```typescript
interface TestChangeFinding {
  type: "test-change";
  framework: "vitest";
  /** All test files changed (added + modified + deleted) */
  files: string[];
  /** Test files that were added */
  added: string[];
  /** Test files that were modified */
  modified: string[];
  /** Test files that were deleted */
  deleted: string[];
}
```

## Detection Patterns

### Test Files

| Pattern | Example |
|---------|---------|
| `*.test.ts` | `src/lib/utils.test.ts` |
| `*.spec.ts` | `src/lib/utils.spec.ts` |
| `*.test.tsx` | `src/components/Button.test.tsx` |
| `*.spec.tsx` | `src/components/Button.spec.tsx` |
| `tests/**` | `tests/integration/auth.ts` |
| `__tests__/**` | `__tests__/utils.ts` |

### Config Files

| Pattern | Example |
|---------|---------|
| `vitest.config.ts` | Root config |
| `vitest.config.js` | JavaScript config |
| `vitest.config.e2e.ts` | E2E config variant |
| `vitest.config.*.ts` | Any variant config |
| `vite.config.ts` | Vite config (may include vitest) |

## Example Output

```json
{
  "type": "test-change",
  "framework": "vitest",
  "files": [
    "tests/auth.test.ts",
    "tests/login.test.ts",
    "tests/new-feature.test.ts",
    "vitest.config.ts"
  ],
  "added": ["tests/new-feature.test.ts"],
  "modified": ["tests/auth.test.ts", "vitest.config.ts"],
  "deleted": ["tests/login.test.ts"]
}
```

## Usage in Markdown

### Summary Section (Highlights)

Test changes are summarized with status breakdown:

```markdown
Test files: 1 added, 2 modified
```

### Suggested Test Plan

When tests change, adds to test plan with counts:

```markdown
## Suggested Test Plan

- [ ] `bun run test` - Run test suite (1 new, 2 updated test file(s))
```

## E2E Config Detection

The analyzer correctly detects variant configs:

```
vitest.config.ts       ✅
vitest.config.e2e.ts   ✅
vitest.config.unit.ts  ✅
vitest.workspace.ts    ❌ (not currently detected)
```

## Future Enhancements

Planned:
- Detect Jest test files
- Detect Playwright tests
- Detect Cypress tests
- Parse test file for coverage changes

