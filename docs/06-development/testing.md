# Testing

Guide to testing branch-narrator.

## Test Framework

We use **Bun's built-in test framework** (`bun:test`) for testing.

```bash
# Run all tests
bun test

# Watch mode
bun run test:watch

# Run specific file
bun test tests/route-mapping.test.ts

# Run matching pattern
bun test -t "should detect"
```

## Test Structure

```
tests/
├── fixtures/
│   └── index.ts              # Test helpers
├── route-mapping.test.ts     # Route detector
├── sql-risk.test.ts          # Supabase analyzer
├── env-var.test.ts           # Env var analyzer
├── dependencies.test.ts      # Dependency analyzer
├── file-category.test.ts     # File category analyzer
├── security-files.test.ts    # Security files analyzer
├── markdown-render.test.ts   # Markdown renderer
└── untracked-files.test.ts   # Git integration
```

## Test Fixtures

### Creating a ChangeSet

```typescript
import { createChangeSet, createFileChange } from "./fixtures/index.js";

const changeSet = createChangeSet({
  files: [
    createFileChange("src/lib/auth.ts", "added"),
    createFileChange("package.json", "modified"),
  ],
});
```

### Creating a FileDiff

```typescript
import { createFileDiff } from "./fixtures/index.js";

const diff = createFileDiff(
  "src/routes/api/users/+server.ts",
  [
    "export const GET = async () => {",
    "  return json({ users: [] });",
    "};",
  ],
  [],  // deletions
  "added"
);
```

### Sample Data

```typescript
import {
  sampleRouteDiffs,
  sampleMigrations,
  sampleEnvVarContent,
  samplePackageJson,
} from "./fixtures/index.js";

// Use in tests
const changeSet = createChangeSet({
  diffs: [sampleRouteDiffs.pageAdded],
});
```

## Writing Tests

### Basic Pattern

```typescript
import { describe, expect, it } from "bun:test";
import { myAnalyzer } from "../src/analyzers/my-analyzer.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("myAnalyzer", () => {
  it("should detect something", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/file.ts", "added")],
    });

    const findings = myAnalyzer.analyze(changeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("my-finding");
  });
});
```

### Testing Helper Functions

```typescript
describe("helperFunction", () => {
  it("should return expected value", () => {
    expect(helperFunction("input")).toBe("expected");
  });

  it("should handle edge case", () => {
    expect(helperFunction("")).toBe(null);
  });
});
```

### Testing Analyzers

```typescript
describe("dependencyAnalyzer", () => {
  it("should detect added dependencies", () => {
    const changeSet = createChangeSet({
      basePackageJson: { dependencies: {} },
      headPackageJson: {
        dependencies: { lodash: "^4.17.21" },
      },
    });

    const findings = dependencyAnalyzer.analyze(changeSet);
    const depFinding = findings.find(f => f.type === "dependency-change");

    expect(depFinding).toBeDefined();
    expect(depFinding.name).toBe("lodash");
    expect(depFinding.impact).toBe("new");
  });
});
```

## Test Coverage

### Current Stats

- **117 tests** across 8 files
- **304 expect()** calls

### Running with Coverage

```bash
bun test --coverage
```

## Common Assertions

```typescript
// Array length
expect(findings).toHaveLength(1);

// Array contains
expect(findings).toContainEqual({ type: "route-change", ... });

// Object properties
expect(finding.type).toBe("env-var");
expect(finding.name).toBeDefined();

// Array includes
expect(finding.files).toContain("src/lib/auth.ts");

// Truthy/Falsy
expect(finding).toBeDefined();
expect(result).toBeTruthy();

// String contains
expect(markdown).toContain("## Summary");
```

## Debugging Tests

### Console Output

```typescript
it("should work", () => {
  const findings = analyzer.analyze(changeSet);
  console.log("Findings:", JSON.stringify(findings, null, 2));
  expect(findings).toHaveLength(1);
});
```

### Focus Single Test

```typescript
it.only("should work", () => {
  // Only this test runs
});
```

### Skip Test

```typescript
it.skip("broken test", () => {
  // Skipped
});
```

