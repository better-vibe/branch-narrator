# AGENTS.md

This file contains instructions for AI agents (Jules) working on the `branch-narrator` repository. **You must read and follow these instructions for every task.**

## 🚨 Critical Directives (MUST FOLLOW)

1.  **Package Manager**: ALWAYS use **`bun`**.
    *   Install: `bun install` (or `bun i`)
    *   Test: `bun test`
    *   Build: `bun run build`
    *   Run: `bun run dev`
    *   **NEVER** use `npm` or `yarn`.

2.  **Versioning & Release**:
    *   **User-Facing Changes**: You **MUST** create a changeset for any user-facing change (features, bug fixes, docs).
        *   Command: `bun run changeset:add`
        *   Select `patch` (fix), `minor` (feature), or `major` (breaking).
        *   Write a user-centric description.
    *   **Internal Changes**: Refactors or tests do not require a changeset.

3.  **Testing**:
    *   **Mandatory**: ALL code changes must be accompanied by tests.
    *   **Framework**: Vitest (`tests/` directory).
    *   **Pattern**: Create `{name}.test.ts` for every source file `{name}.ts`.
    *   **Verify**: Run `bun test` to verify your changes pass before submitting.

4.  **Documentation**:
    *   **Mandatory Updates**: If you change functionality, you **MUST** update the corresponding documentation in `docs/`.
    *   **Source of Truth**: The `docs/` folder is the comprehensive reference. Keep it up to date.

## 🏗️ Project Architecture

`branch-narrator` is a local-first, deterministic CLI tool.
*   **No LLMs**: Analysis is heuristic-based only.
*   **No Network**: All operations are local.

### Directory Structure

| Path | Purpose |
| :--- | :--- |
| `src/analyzers/` | **Core Logic.** Pure functions that analyze `ChangeSet` -> `Finding[]`. |
| `src/profiles/` | **Configuration.** Sets of analyzers enabled for specific project types (e.g., SvelteKit). |
| `src/core/types.ts` | **Types.** Central definitions. All shared types live here. |
| `src/render/` | **Output.** Converts `Finding[]` to Markdown, JSON, etc. |
| `tests/` | **Verification.** Vitest tests and fixtures. |
| `docs/` | **Knowledge Base.** Detailed documentation. |

## 🧩 Common Workflows

### 1. Adding a New Analyzer
1.  **Create File**: `src/analyzers/{name}.ts`
2.  **Implement**: Follow the `Analyzer` interface (pure function).
3.  **Test**: Create `tests/{name}.test.ts`. Use `createChangeSet()` fixtures.
4.  **Register**: Export from `src/analyzers/index.ts`.
5.  **Profile**: Add to relevant profiles in `src/profiles/`.
6.  **Document**: Create `docs/03-analyzers/{name}.md`.

### 2. Adding a New Finding Type
1.  **Define**: Add interface to `src/core/types.ts`.
2.  **Union**: Add to `Finding` discriminated union in `src/core/types.ts`.
3.  **Render**: Update `src/render/markdown.ts` (and others) to handle the new type.
4.  **Document**: Update `docs/04-types/findings.md`.

### 3. Modifying CLI Options
1.  **Update Code**: `src/cli.ts`.
2.  **Document**: Update `docs/05-cli/options.md` and `docs/05-cli/commands.md`.

## 📚 Documentation Quick Reference

| Task | Update File(s) |
| :--- | :--- |
| **New Analyzer** | `docs/03-analyzers/{name}.md`, `docs/07-profiles/` |
| **New Finding** | `docs/04-types/findings.md` |
| **CLI Change** | `docs/05-cli/options.md`, `docs/05-cli/commands.md` |
| **Profile Change** | `docs/07-profiles/{profile}.md` |
| **Risk Logic** | `docs/08-rendering/risk-scoring.md` |

## ✅ Verification Checklist

Before submitting any plan step or final change:

1.  [ ] **Lint/Typecheck**: `bun run typecheck`
2.  [ ] **Test**: `bun test` (Ensure no regressions)
3.  [ ] **Build**: `bun run build` (Ensure build succeeds)
4.  [ ] **Docs**: Did I update `docs/` if I changed behavior?
5.  [ ] **Changeset**: Did I run `bun run changeset:add` if this is user-facing?

## 💻 Coding Patterns

### Analyzer Implementation
```typescript
import type { Analyzer, ChangeSet, Finding } from "../core/types.js";

export const myAnalyzer: Analyzer = {
  name: "my-analyzer",
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    // ... pure functional logic ...
    return findings;
  },
};
```

### Imports
*   Use `.js` extensions for local imports: `import { x } from "./utils.js";`
*   Order: Node built-ins -> External -> Internal.
