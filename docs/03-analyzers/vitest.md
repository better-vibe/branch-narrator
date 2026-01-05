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
  files: string[];
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
    "vitest.config.ts"
  ]
}
```

## Usage in Markdown

### Summary Section

```markdown
## Summary

- Test files changed
```

### Suggested Test Plan

When tests change, adds to test plan:

```markdown
## Suggested Test Plan

- [ ] `bun run test` - Run test suite
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

