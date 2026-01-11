# Test Parity Analyzer

The Test Parity Analyzer enforces the convention that every modified or added source file should have a corresponding test file. This ensures that code changes are accompanied by verification steps, which is critical for autonomous agents and healthy codebases.

## Opt-In Only

**Important:** This analyzer is not included in any profile by default. It must be explicitly enabled using the `--test-parity` CLI flag, as it requires git file system operations which can be resource-intensive on large repositories.

```bash
# Enable test parity checking
branch-narrator facts --mode branch --base main --test-parity
branch-narrator risk-report --mode branch --base main --test-parity
```

## How it works

1.  **Scope**: Scans all `modified` or `added` files in the change set.
2.  **Filtering**:
    *   Ignores non-code files (images, docs, config).
    *   Ignores existing test files (files ending in `.test.ts`, `.spec.ts`, etc.).
    *   Ignores type definitions (`.d.ts`).
    *   Ignores index/barrel files.
    *   Ignores files in test directories.
    *   Ignores deleted files.
3.  **Mapping Strategy**:
    For a source file `src/utils/math.ts`, it looks for a test file in the following locations:
    *   `src/utils/math.test.ts` (Colocation)
    *   `tests/utils/math.test.ts` (Mirrored structure)
    *   `tests/math.test.ts` (Flat structure)
    *   `tests/src/utils/math.test.ts` (Mirrored with src root)
    *   `tests/utils-math.test.ts` (Hyphenated parent-basename pattern)
4.  **Change Set Check**:
    If no *existing* test file is found on disk, it checks if a *new* test file is being added in the current change set (e.g., `src/utils/math.test.ts` is `added`).

## Findings

### `test-parity-violation`

Emits **one finding per source file** that lacks test coverage. This makes results actionable and allows integration with the `zoom` command for detailed investigation.

*   **Category**: `tests`
*   **Confidence**: Varies based on file characteristics
    *   `high`: Core business logic (services, handlers, commands)
    *   `medium`: Utilities, helpers
    *   `low`: Small changes, edge cases

**TypeScript Interface:**

```typescript
interface TestParityViolationFinding {
  type: "test-parity-violation";
  kind: "test-parity-violation";
  category: "tests";
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  sourceFile: string;
  expectedTestLocations: string[];
  findingId?: string;
}
```

**Example Output (Markdown):**

```markdown
## Test Coverage Gaps

Found 2 source file(s) without corresponding tests:

- (high) `src/services/auth.ts`
- (medium) `src/utils/helpers.ts`
```

## Risk Flags

When test parity violations are detected, they are converted to a risk flag:

| Flag ID | Category | Score | Confidence | Description |
|---------|----------|-------|------------|-------------|
| `tests.missing_parity` | tests | 12-25 | 0.7-0.85 | Source files modified without corresponding tests |

The score scales based on the number and confidence of violations.

## Configuration (Programmatic)

The analyzer supports custom configuration via the `createTestParityAnalyzer` factory function:

```typescript
import { createTestParityAnalyzer } from "branch-narrator/analyzers";

const customAnalyzer = createTestParityAnalyzer({
  // Custom test file extensions
  testPatterns: [".test.ts", ".spec.tsx", ".test.e2e.ts"],
  
  // Additional exclusion patterns
  excludePatterns: [/^src\/generated\//, /\.stories\.tsx$/],
  
  // Custom test directories
  testDirectories: ["tests", "__tests__", "spec"],
  
  // Source directories to check
  sourceDirectories: ["src", "lib", "packages"],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `testPatterns` | `string[]` | `[".test.ts", ".spec.ts", ...]` | Test file extensions to search for |
| `excludePatterns` | `RegExp[]` | See below | Additional patterns to exclude |
| `testDirectories` | `string[]` | `["tests", "test", "__tests__", "spec"]` | Directories where test files are located |
| `sourceDirectories` | `string[]` | `["src", "lib", "app"]` | Source directories to check |

### Default Exclusions

The following patterns are excluded by default:
- `.d.ts` - Type definitions
- `.config.ts/.js` - Config files
- `index.ts/.js` - Barrel/index files
- `docs/` - Documentation
- `tests/`, `test/`, `__tests__/` - Test directories themselves
- `scripts/` - Build scripts
- `dist/`, `build/` - Build artifacts
- Dotfiles and directories
- `types.ts`, `constants.ts` - Type-only and constants files

## Performance Considerations

The test parity analyzer uses optimized git operations:

1. **Targeted directory queries**: Only queries files in directories relevant to the changeset, rather than the entire repository.
2. **Per-directory caching**: Caches file lists per directory for efficient lookups within a single run.
3. **Lazy discovery**: First checks if tests exist in the changeset before querying the file system.

Despite these optimizations, the analyzer can still be slow on very large repositories, which is why it's opt-in only.
