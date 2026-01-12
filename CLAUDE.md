# Claude.md - AI Agent Instructions for branch-narrator

This file contains comprehensive instructions for Claude Code when working on the `branch-narrator` repository. **Read and follow these instructions for every task.**

## 🚨 Critical Rules (MUST FOLLOW)

### 1. Package Manager: ALWAYS use `bun`
```bash
bun install          # Install dependencies
bun run test         # Run tests
bun run typecheck    # Type checking
bun run build        # Build project
bun run dev          # Development mode
```
**NEVER** use `npm` or `yarn`.

### 2. Pre-Commit Verification Checklist

Before committing or creating a PR, **ALWAYS** run:

1. ✅ **Type Check**: `bun run typecheck` - Ensure no TypeScript errors
2. ✅ **Tests**: `bun run test` - All tests must pass
3. ✅ **Build**: `bun run build` - Ensure build succeeds
4. ✅ **Docs**: Update relevant documentation in `docs/`
5. ✅ **Changeset**: Run `bun run changeset:add` for user-facing changes

### 3. Changesets: Required for User-Facing Changes

**ALWAYS** create a changeset for:
- ✅ New features
- ✅ Bug fixes
- ✅ Documentation updates
- ✅ Dependency updates
- ✅ Breaking changes

**NOT required** for:
- ❌ Internal refactoring (no behavior change)
- ❌ Test-only changes
- ❌ CI/CD configuration

**How to create a changeset:**
```bash
bun run changeset:add
# Select version: patch (fix), minor (feature), major (breaking)
# Write user-centric description
```

**Version selection guide:**
- `patch` (0.0.x): Bug fixes, docs, minor improvements
- `minor` (0.x.0): New features, new analyzers, new CLI options
- `major` (x.0.0): Breaking changes, removed features, changed APIs

### 4. Testing: Mandatory for ALL Code Changes

- **Framework**: Bun's test framework (`bun:test`)
- **Location**: `tests/` directory
- **Pattern**: Create `{name}.test.ts` for every `{name}.ts`
- **Verify**: `bun run test` before committing
- Test both success and error cases

### 5. Documentation: Keep `docs/` Up to Date

When you change functionality, **MUST** update corresponding docs:

| Change Type | Update These Docs |
|-------------|-------------------|
| New analyzer | `docs/03-analyzers/{name}.md`, `docs/07-profiles/` |
| New finding type | `docs/04-types/findings.md` |
| CLI option | `docs/05-cli/options.md`, `docs/05-cli/commands.md` |
| Profile change | `docs/07-profiles/{profile}.md` |
| Risk scoring | `docs/08-rendering/risk-scoring.md` |
| Architecture | `docs/02-architecture/overview.md` |

---

## 🏗️ Project Architecture

### Core Principles
1. **No LLM/AI calls** - Deterministic, heuristic-based analysis only
2. **No network calls** - Fully offline, local-first
3. **Evidence-based** - Never invent "why", only report what changed
4. **Extensible** - Profile-based analyzer architecture

### Data Flow
```
CLI → Git Collector → ChangeSet → Profile → Analyzers → Findings → Renderer → Output
```

### Directory Structure

| Path | Purpose |
|------|---------|
| `src/core/` | Types, errors, utilities (single source of truth) |
| `src/git/` | Git command execution and diff parsing |
| `src/analyzers/` | Individual analyzers (one per file, pure functions) |
| `src/profiles/` | Profile configurations (sets of analyzers) |
| `src/render/` | Output renderers (Markdown, JSON, SARIF) |
| `src/commands/` | CLI command implementations |
| `tests/` | Vitest tests with fixtures |
| `docs/` | Comprehensive documentation (40+ files) |

---

## 💻 Coding Standards & Patterns

### TypeScript Rules

```typescript
// ✅ ALWAYS use explicit types for parameters and returns
function analyze(changeSet: ChangeSet): Finding[] {
  return [];
}

// ❌ NEVER use implicit types
function analyze(changeSet) {
  return [];
}
```

**Type vs Interface:**
- Use `interface` for object shapes
- Use `type` for unions and primitives
- Use discriminated unions with `type` field as discriminator

**Imports:**
- Always use `.js` extensions for local imports (ESM requirement)
- Import order: Node built-ins → External packages → Internal modules

```typescript
// ✅ Correct import with .js extension
import { foo } from "./bar.js";
import type { Analyzer, ChangeSet } from "../core/types.js";

// ❌ Wrong - missing .js extension
import { foo } from "./bar";
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `route-detector.ts` |
| Types/Interfaces | PascalCase | `RouteChangeFinding` |
| Functions | camelCase | `detectMethods()` |
| Constants | UPPER_SNAKE | `CRITICAL_PACKAGES` |
| Analyzers | camelCase + Analyzer | `routeDetectorAnalyzer` |

### Analyzer Pattern (Template)

```typescript
import type { Analyzer, ChangeSet, Finding } from "../core/types.js";

export const myAnalyzer: Analyzer = {
  name: "my-analyzer",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      // Detection logic here
      if (matchesPattern(file.path)) {
        findings.push({
          type: "my-finding",
          // ... finding properties
        });
      }
    }

    return findings;
  },
};
```

**Key principles:**
- Analyzers are **pure functions**: `(changeSet: ChangeSet) => Finding[]`
- Analyzers must be **deterministic** and **stateless**
- Return empty array if no findings (never null/undefined)
- Include evidence in findings (file paths, reasons, etc.)

### Finding Type Pattern

```typescript
// 1. Define interface in src/core/types.ts
export interface MyFinding {
  type: "my-finding";  // Discriminator
  files: string[];
  reason: string;
}

// 2. Add to Finding union in src/core/types.ts
export type Finding =
  | FileSummaryFinding
  | RouteChangeFinding
  // ... existing
  | MyFinding;
```

### Error Handling

```typescript
import { BranchNarratorError } from "./core/errors.js";

// Use custom error classes
if (!isGitRepo) {
  throw new NotAGitRepoError();
}
```

All errors extend `BranchNarratorError` with an `exitCode` property.

### JSDoc Comments

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

Use JSDoc for:
- File-level module description
- Public functions
- Complex logic that needs explanation

---

## 🧩 Common Workflows

### Adding a New Analyzer

1. **Create file**: `src/analyzers/{name}.ts`
2. **Implement**: Follow `Analyzer` interface (pure function)
3. **Define finding type**: Add to `src/core/types.ts`
4. **Export**: Add to `src/analyzers/index.ts`
5. **Add to profile**: Update `src/profiles/` (sveltekit.ts, default.ts, etc.)
6. **Update renderer**: Modify `src/render/markdown.ts` if new rendering needed
7. **Write tests**: Create `tests/{name}.test.ts` using `createChangeSet()` fixtures
8. **Document**: Create `docs/03-analyzers/{name}.md`
9. **Changeset**: Run `bun run changeset:add`

### Adding a New Finding Type

1. **Define interface**: Add to `src/core/types.ts`
2. **Add to union**: Update `Finding` discriminated union in `src/core/types.ts`
3. **Update renderers**: Modify `src/render/markdown.ts`, `json.ts`, etc. to handle new type
4. **Risk scoring**: Update `src/render/risk-score.ts` if needed
5. **Document**: Update `docs/04-types/findings.md`
6. **Changeset**: Run `bun run changeset:add`

### Modifying CLI Options

1. **Update code**: Modify `src/cli.ts`
2. **Document**: Update `docs/05-cli/options.md` and `docs/05-cli/commands.md`
3. **Add examples**: Update `docs/05-cli/examples.md`
4. **Test**: Add tests in `tests/`
5. **Changeset**: Run `bun run changeset:add`

### Adding a New Profile

1. **Create file**: `src/profiles/{name}.ts`
2. **Add to type**: Update `ProfileName` type in `src/core/types.ts`
3. **Detection logic**: Add to `detectProfile()` in `src/profiles/index.ts`
4. **Export**: Add to `src/profiles/index.ts`
5. **CLI help**: Update help text in `src/cli.ts`
6. **Document**: Create `docs/07-profiles/{name}.md`
7. **Changeset**: Run `bun run changeset:add`

---

## 🧪 Testing Guide

### Running Tests

```bash
bun run test              # All unit tests
bun run test:e2e          # End-to-end tests
bun run test:watch        # Watch mode
bun run test:all          # All tests (unit + e2e)
bun run test:benchmarks   # Performance benchmarks
```

### Test Conventions

- Use fixtures from `tests/fixtures/index.ts`
- Test file names match source: `{name}.test.ts`
- Group tests with `describe()` by function/feature
- Use `createChangeSet()` and `createFileDiff()` helpers
- Test both success and error cases
- Use descriptive test names explaining expected behavior

### Test Pattern Example

```typescript
import { describe, it, expect } from "bun:test";
import { myAnalyzer } from "../src/analyzers/my-analyzer.js";
import { createChangeSet } from "./fixtures/index.js";

describe("myAnalyzer", () => {
  it("should detect pattern in modified files", () => {
    const changeSet = createChangeSet({
      files: [{ path: "src/routes/+page.svelte", status: "modified" }],
    });

    const findings = myAnalyzer.analyze(changeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("my-finding");
  });
});
```

---

## 📚 Documentation Structure

```
docs/
├── 01-product/          # Overview, vision, roadmap
├── 02-architecture/     # System design, data flow, structure
├── 03-analyzers/        # Individual analyzer docs (19 files)
├── 04-types/            # TypeScript types and schemas
├── 05-cli/              # Commands, options, examples
├── 06-development/      # Contributing, testing, standards
├── 07-profiles/         # Framework profiles (SvelteKit, Next.js, etc.)
├── 08-rendering/        # Output formats (Markdown, JSON, SARIF), risk
├── 09-delta-mode.md     # Delta mode documentation
├── 09-stable-ids.md     # Stable identifier system
└── 10-snapshots/        # Workspace snapshot functionality
```

**Documentation Best Practices:**
- Code examples must be accurate
- Type definitions must match actual code
- Use Mermaid diagrams for visualizations
- Keep cross-references up to date
- Update docs in the same PR as code changes

---

## 🔐 Security & Best Practices

1. **Never execute arbitrary code** from git diffs
2. **Sanitize file paths** before using in git commands
3. **Don't expose sensitive data** in error messages
4. **Validate all user inputs** (refs, file paths, options)
5. **Prefer false negatives** over false positives in analysis
6. **Keep dependencies minimal** - avoid unnecessary packages
7. **Use TypeScript's type system** to catch errors at compile time

---

## 🚀 Development Commands Reference

```bash
# Core Development
bun install               # Install dependencies
bun run dev               # Watch mode (rebuild on changes)
bun run build             # Production build
bun run typecheck         # Type checking only

# Testing
bun run test              # Run unit tests
bun run test:e2e          # Run end-to-end tests
bun run test:watch        # Watch mode for tests
bun run test:all          # All tests
bun run test:benchmarks   # Performance benchmarks

# Versioning
bun run changeset:add     # Add a changeset (interactive)
bun run changeset         # Same as above
bun run version           # Bump versions from changesets
bun run release           # Build and publish

# Package Management
bun add {pkg}             # Add dependency
bun add -D {pkg}          # Add dev dependency
```

---

## 📋 Complete Workflow Example: Adding a New Analyzer

Let's walk through a complete example of adding a Tailwind CSS analyzer:

### Step 1: Create the Analyzer
```typescript
// src/analyzers/tailwind.ts
import type { Analyzer, ChangeSet, Finding } from "../core/types.js";

export const tailwindAnalyzer: Analyzer = {
  name: "tailwind-analyzer",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      if (file.path === "tailwind.config.js" || file.path === "tailwind.config.ts") {
        findings.push({
          type: "tailwind-config-change",
          file: file.path,
          status: file.status,
        });
      }
    }

    return findings;
  },
};
```

### Step 2: Add Finding Type
```typescript
// In src/core/types.ts - add interface
export interface TailwindConfigChangeFinding {
  type: "tailwind-config-change";
  file: string;
  status: FileStatus;
}

// In src/core/types.ts - add to union
export type Finding =
  | FileSummaryFinding
  | RouteChangeFinding
  // ... existing
  | TailwindConfigChangeFinding;
```

### Step 3: Export Analyzer
```typescript
// In src/analyzers/index.ts
export * from "./tailwind.js";
```

### Step 4: Add to Profile
```typescript
// In src/profiles/default.ts
import { tailwindAnalyzer } from "../analyzers/tailwind.js";

export const defaultProfile: Profile = {
  name: "default",
  analyzers: [
    // ... existing
    tailwindAnalyzer,
  ],
};
```

### Step 5: Update Renderer (if needed)
```typescript
// In src/render/markdown.ts - add case for new finding type
if (finding.type === "tailwind-config-change") {
  // Render finding...
}
```

### Step 6: Write Tests
```typescript
// tests/tailwind.test.ts
import { describe, it, expect } from "bun:test";
import { tailwindAnalyzer } from "../src/analyzers/tailwind.js";
import { createChangeSet } from "./fixtures/index.js";

describe("tailwindAnalyzer", () => {
  it("should detect tailwind config changes", () => {
    const changeSet = createChangeSet({
      files: [{ path: "tailwind.config.js", status: "modified" }],
    });

    const findings = tailwindAnalyzer.analyze(changeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("tailwind-config-change");
  });
});
```

### Step 7: Run Verification
```bash
bun run typecheck    # Check types
bun run test         # Run tests
bun run build        # Verify build
```

### Step 8: Create Documentation
```markdown
<!-- docs/03-analyzers/tailwind.md -->
# Tailwind CSS Analyzer

Detects changes to Tailwind CSS configuration files.

## File Location
`src/analyzers/tailwind.ts`

## Finding Type
`TailwindConfigChangeFinding`

## Detection Rules
- Detects `tailwind.config.js` or `tailwind.config.ts` changes

## Example Output
\`\`\`json
{
  "type": "tailwind-config-change",
  "file": "tailwind.config.js",
  "status": "modified"
}
\`\`\`
```

### Step 9: Create Changeset
```bash
bun run changeset:add
# Select: minor (new feature)
# Summary: "Add Tailwind CSS configuration analyzer"
```

### Step 10: Commit
```bash
git add .
git commit -m "feat: add Tailwind CSS analyzer"
git push
```

---

## 🎯 Quick Tips for Claude Code

1. **Before making changes**: Read relevant files and docs first
2. **Type safety**: Always use explicit types, leverage TypeScript
3. **Pure functions**: Keep analyzers side-effect free
4. **Test first**: Write tests before or alongside implementation
5. **Document as you go**: Update docs in the same PR
6. **Verify before committing**: Run the full verification checklist
7. **Changesets**: Don't forget them for user-facing changes
8. **Follow patterns**: Look at existing code for consistency
9. **Keep it simple**: Avoid over-engineering and premature abstractions
10. **Evidence-based**: Report what changed, not why (no speculation)

---

## 🔍 Finding Help

- **Architecture questions**: See `docs/02-architecture/`
- **Type definitions**: See `docs/04-types/` or `src/core/types.ts`
- **Existing analyzers**: Browse `docs/03-analyzers/` for examples
- **CLI usage**: See `docs/05-cli/`
- **Testing patterns**: See existing tests in `tests/`
- **All docs**: Start at `docs/README.md`

---

## ⚠️ Common Pitfalls to Avoid

1. ❌ Using `npm` instead of `bun`
2. ❌ Forgetting `.js` extensions in imports
3. ❌ Skipping type checking before committing
4. ❌ Not creating changesets for user-facing changes
5. ❌ Not writing tests for new code
6. ❌ Not updating documentation
7. ❌ Adding side effects to analyzers
8. ❌ Duplicating type definitions (use `src/core/types.ts`)
9. ❌ Inventing reasons for changes (only report facts)
10. ❌ Forgetting to export from `index.ts` files

---

## 📝 Git Commit Message Format

```
type: description

[optional body]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Add/update tests
- `chore`: Maintenance

**Examples:**
```
feat: add security files analyzer
fix: correct vitest config pattern matching
docs: update analyzer documentation
refactor: extract risk scoring logic
test: add risky packages test cases
chore: bump version to 1.6.0
```

---

**Remember: Quality over speed. Always verify, test, document, and create changesets!**
