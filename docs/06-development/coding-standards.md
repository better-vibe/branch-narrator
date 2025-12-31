# Coding Standards

Code style and conventions for branch-narrator.

## TypeScript

### Explicit Types

Always use explicit types for function parameters and returns:

```typescript
// ✅ Good
function analyze(changeSet: ChangeSet): Finding[] {
  return [];
}

// ❌ Bad
function analyze(changeSet) {
  return [];
}
```

### Interface vs Type

Prefer `interface` for object shapes:

```typescript
// ✅ Good
interface MyFinding {
  type: "my-finding";
  files: string[];
}

// ❌ Avoid for objects
type MyFinding = {
  type: "my-finding";
  files: string[];
};
```

Use `type` for unions and primitives:

```typescript
// ✅ Good
type FileStatus = "added" | "modified" | "deleted" | "renamed";
type RiskLevel = "high" | "medium" | "low";
```

### Discriminated Unions

Use `type` field as discriminator:

```typescript
interface PageRoute {
  type: "page";
  path: string;
}

interface EndpointRoute {
  type: "endpoint";
  path: string;
  methods: string[];
}

type Route = PageRoute | EndpointRoute;
```

---

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `route-detector.ts` |
| Types/Interfaces | PascalCase | `RouteChangeFinding` |
| Functions | camelCase | `detectMethods()` |
| Constants | UPPER_SNAKE | `CRITICAL_PACKAGES` |
| Analyzers | camelCase + Analyzer | `routeDetectorAnalyzer` |
| Variables | camelCase | `riskScore` |

---

## File Organization

### Imports

```typescript
// 1. External packages
import { Command } from "commander";
import { execa } from "execa";

// 2. Internal - core
import type { Analyzer, ChangeSet, Finding } from "../core/types.js";

// 3. Internal - siblings
import { routeIdToUrlPath } from "./route-detector.js";
```

### ESM Extensions

Always use `.js` extension for local imports:

```typescript
// ✅ Good
import { foo } from "./bar.js";

// ❌ Bad
import { foo } from "./bar";
import { foo } from "./bar.ts";
```

### Exports

Export from index files:

```typescript
// src/analyzers/index.ts
export * from "./file-summary.js";
export * from "./route-detector.js";
// ...
```

---

## Analyzer Pattern

```typescript
import type { Analyzer, ChangeSet, Finding } from "../core/types.js";

export const myAnalyzer: Analyzer = {
  name: "my-analyzer",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      // Detection logic
      if (matchesPattern(file.path)) {
        findings.push({
          type: "my-finding",
          // ...
        });
      }
    }

    return findings;
  },
};
```

---

## Error Handling

### Custom Errors

```typescript
import { BranchNarratorError } from "./core/errors.js";

if (!isGitRepo) {
  throw new NotAGitRepoError();
}
```

### Exit Codes

- `0`: Success
- `1`: Expected failure (user error)

---

## Comments

### JSDoc for Public APIs

```typescript
/**
 * Compute aggregate risk score from findings.
 * @param findings - Array of findings from analyzers
 * @returns Risk score with level and evidence
 */
export function computeRiskScore(findings: Finding[]): RiskScore {
  // ...
}
```

### Inline for Complex Logic

```typescript
// Route groups like (app) should be removed from URL
// but preserved in route ID for accuracy
const urlPath = routeId.replace(/\([^)]+\)\/?/g, "");
```

---

## Constants

```typescript
// Define at module level
const CRITICAL_PACKAGES = ["@sveltejs/kit", "svelte", "vite"];

const RISKY_PACKAGES: Record<RiskyCategory, string[]> = {
  auth: ["passport", "jsonwebtoken", ...],
  database: ["prisma", "drizzle-orm", ...],
};
```

---

## Formatting

We rely on editor formatting. Key rules:

- 2-space indentation
- No semicolons (configured in tsconfig)
- Single quotes for strings
- Trailing commas in multiline

---

## Git Commits

### Message Format

```
type: description

[optional body]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation |
| `refactor` | Code refactoring |
| `test` | Add/update tests |
| `chore` | Maintenance |

### Examples

```
feat: add security files analyzer
fix: correct vitest config pattern matching
docs: update analyzer documentation
refactor: extract risk scoring logic
test: add risky packages test cases
chore: bump version to 0.2.0
```

