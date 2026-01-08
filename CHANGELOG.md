# @better-vibe/branch-narrator

## 1.5.0

### Minor Changes

- 43b3677: Add Next.js profile with App Router support

  - New `next` profile for Next.js 13+ App Router projects
  - Route detection for `app/` directory (pages, layouts, loading, error, not-found)
  - API route detection (`route.ts`) with HTTP method extraction (GET, POST, etc.)
  - Middleware change detection flagged as security-sensitive
  - Support for route groups `(name)` and dynamic segments `[slug]`, `[...slug]`, `[[...slug]]`
  - Auto-detection based on `next` dependency and `app/` directory presence

## 1.4.3

### Patch Changes

- 8ecb5d0: refactor actions array

## 1.4.2

### Patch Changes

- 3750c0e: ## Breaking Changes

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

## 1.4.1

### Patch Changes

- 55d20d2: Add 'artifacts' file category for build outputs like .tgz, .tar.gz, .zip, .wasm, .exe, and other binary/archive files. These are now categorized as "Build Artifacts" instead of "other".

## 1.4.0

### Minor Changes

- bacbd62: Add `stencil` profile for StencilJS support

  Added a new `stencil` profile that automatically detects StencilJS projects. It includes:

  - AST-based analyzer for Stencil components (tag, shadow, props, events, methods, slots).
  - Risk reporting for breaking API changes (removed props, changed tags, etc.).
  - Auto-detection based on `package.json` dependencies or `stencil.config.*`.

  Use it with `branch-narrator facts --profile stencil` or rely on auto-detection.

- fa5791e: Change default behavior: `unstaged` mode now includes untracked files

  The `--mode unstaged` (default) now includes untracked files in addition to modified tracked files. This matches the typical working state of AI coding agents where new files are created but not yet staged.

  Previously, only `--mode all` included untracked files. Now both `unstaged` and `all` include them by default.

  To exclude untracked files, use `--mode staged` or pass `--no-untracked` (where available).

## 1.3.1

### Patch Changes

- 51dfc4a: fix --version flag

## 1.3.0

### Minor Changes

- a38794e: Improve detection coverage and package manager support:

  - **Fix `bun.lock` detection**: The lockfile analyzer now correctly recognizes `bun.lock` (text format) in addition to `bun.lockb` (binary format)
  - **Add `database` file category**: New category for database-related files including Supabase, Prisma, Drizzle migrations, and SQL files
  - **Smart package manager detection**: Suggested actions (test, check) now detect and use the correct package manager (bun/pnpm/yarn/npm) based on lockfiles in the changeset
  - **Improved test file detection**: Test files under `src/tests/` and similar nested paths are now correctly categorized
  - **Archive files excluded by default**: `.tgz`, `.tar.gz`, and `.zip` files are now excluded from analysis by default

## 1.2.0

### Minor Changes

- ca7fa34: Add `--since` flag for iteration-friendly delta comparison in `facts` and `risk-report` commands

  This feature enables comparing current analysis output to a previous run, showing added/removed/changed findings or flags. Useful for interactive agent loops where you want to verify specific issues are resolved.

  **New flags:**

  - `--since <path>` - Compare to a previous JSON file
  - `--since-strict` - Exit with code 1 on scope mismatch

  **Delta output includes:**

  - Added/removed/changed IDs (deterministic, sorted)
  - Risk score delta (risk-report only)
  - Scope mismatch warnings
  - Full before/after objects for changed items

  **Usage:**

  ```bash
  # Save baseline
  branch-narrator facts --out .ai/prev-facts.json
  branch-narrator risk-report --out .ai/prev-risk.json

  # Make changes...

  # Compare
  branch-narrator facts --since .ai/prev-facts.json
  branch-narrator risk-report --since .ai/prev-risk.json
  ```

## 1.1.0

### Minor Changes

- 0f01789: Add zoom command for targeted drill-down by findingId or flagId

## 1.0.0

### Major Changes

- e1039f1: BREAKING: Add stable IDs to findings and risk flags for deterministic references

  - All findings now include an optional `findingId` field (format: "finding.<type>#<hash>")
  - Risk flags now include `flagId`, `ruleKey`, and `relatedFindingIds` fields
  - New finding types added to support risk detection patterns
  - Facts builder automatically assigns findingIds to all findings

### Minor Changes

- c9e6d1e: feat: change default mode to unstaged and add branch auto-detection

## 0.15.2

### Patch Changes

- a62a306: Optimize facts command performance by reducing git subprocess calls and avoiding unnecessary evidence processing

## 0.15.1

### Patch Changes

- 4b7c6e9: Improve dump-diff performance by reducing git calls and batching work

  - Use single git diff call for all tracked files instead of per-file calls
  - Batch binary detection using git diff --numstat for tracked files
  - Limit concurrency for untracked file operations (binary checks and diffs)
  - Add diff splitting utility to parse full diff into per-file chunks
  - Add concurrency limiting utility for parallel operations
  - Maintain identical output for all existing modes (full, --name-only, --stat, --patch-for)

## 0.15.0

### Minor Changes

- 5d617b7: Add deterministic benchmarks with configurable temporary git repositories

  Benchmarks now generate isolated, reproducible git repositories with committed, staged, and unstaged changes. This ensures consistent, meaningful benchmark results across different machines and environments.

  **Features:**

  - Configurable benchmark sizes (small/medium/large) via `--size` CLI flag
  - Temporary git repositories with realistic file variety (TypeScript, JavaScript, Markdown, JSON)
  - Support for all diff modes (branch, staged, unstaged, all)
  - Automatic cleanup after benchmark completion
  - GitHub Actions workflow with manual dispatch inputs for size and iterations

  **Usage:**

  ```bash
  # Run benchmarks with default settings (medium, 5 iterations)
  bun run benchmark

  # Run with specific size and iterations
  bun run benchmark --size large --iterations 10

  # View help
  bun run benchmark --help
  ```

  **GitHub Actions:**
  Use workflow_dispatch to manually trigger benchmarks with custom configuration in the Actions tab.

- 4bb84fd: BREAKING CHANGE: Unified dump-diff JSON schema to v2.0

  - All `dump-diff --format json` output now uses schema v2.0 regardless of flags
  - Removed legacy v1.1 schema (used for default full-diff mode)
  - All modes (--name-only, --stat, --patch-for, default) now share the same structure
  - New schema includes: command metadata, git context with isDirty, options including includeUntracked
  - Files now use `patch.text` for raw diff content (instead of `diff` field)
  - Hunks are only included in `patch.hunks` when using --patch-for
  - Skip reasons now in `skippedFiles` array (was `skipped`)
  - Summary counts now in `summary` object (was `stats`)

  Migration:

  - Update JSON parsing to expect `schemaVersion: "2.0"`
  - Access diff content via `files[].patch.text` instead of `files[].diff` or `included[].diff`
  - Access skipped files via `skippedFiles` instead of `skipped`
  - Access counts via `summary` instead of `stats`

## 0.14.1

### Patch Changes

- d2aa296: add babel-parser as dependency

## 0.14.0

### Minor Changes

- 400b16d: Add modular benchmarking workflow for performance testing

## 0.13.0

### Minor Changes

- b4bad62: Add agent-grade structured output to dump-diff command

  Implement RFC Issue #4 upgrades for dump-diff command:

  - **New JSON schema v1.0**: Structured diff output with hunks, lines, and metadata
  - **Selective retrieval modes**:
    - `--name-only`: List changed files only (no diff content)
    - `--stat`: Show file statistics (additions/deletions)
    - `--patch-for <path>`: Get diff for a single file (supports renamed files)
  - **Enhanced exclusion reporting**: Excluded files appear in `skippedFiles` with reasons
  - **Deterministic output**: Files and skippedFiles sorted alphabetically
  - **Agent-friendly**: JSON-only stdout in JSON mode, all metadata included

  This enables AI agents to efficiently retrieve diffs in stages: first get the file list, then fetch only relevant diffs.

## 0.12.0

### Minor Changes

- 89af6eb: Implement agent-facing reliability guarantees for JSON output and CLI behavior

  This release implements comprehensive reliability guarantees for AI coding agents that pipe CLI output into JSON parsers:

  **JSON-only stdout in JSON mode:**

  - `facts`, `risk-report --format json`, and `dump-diff --format json` commands now output pure JSON to stdout
  - All diagnostics, warnings, and info messages are sent to stderr
  - Errors are reported on stderr with appropriate exit codes

  **Global logging flags:**

  - `--quiet`: suppresses all non-fatal stderr output (warnings, info) while preserving fatal errors
  - `--debug`: increases diagnostic information to stderr (timings, detector counts, etc.)
  - `--quiet` overrides `--debug` when both are specified

  **Deterministic output ordering:**

  - File paths sorted lexicographically with POSIX normalization
  - Risk flags sorted by: category (asc), effectiveScore (desc), id (asc)
  - Findings sorted by: type (asc), file (asc), location (asc)
  - Evidence sorted by: file (asc), line number (asc)
  - JSON object keys are stable and predictable

  **Agent-grade reliability:**

  - `branch-narrator facts | jq .` works reliably even when warnings occur
  - `branch-narrator risk-report --format json | jq .` works reliably
  - Running the same command twice produces identical JSON output (excluding timestamps)
  - No ANSI color codes in JSON mode

  These changes ensure that AI coding agents can safely parse and cache CLI output without encountering JSON parsing errors or output churn.

## 0.11.0

### Minor Changes

- 11ff7fe: Migrate test suite from Vitest to bun test for improved performance and compatibility

## 0.10.0

### Minor Changes

- 7839c77: Enhance impact analysis with symbol-level tracking and test detection.

## 0.9.0

### Minor Changes

- 9ccbb1f: Added two new analyzers for enhanced verification:
  - `TestParityAnalyzer`: Enforces that modified source files have corresponding test files.
  - `ImpactAnalyzer`: Calculates the dependency "blast radius" of changes.

## 0.8.0

### Minor Changes

- f8d3d97: Added `branch-narrator integrate` command with support for `cursor` and `jules` providers.
  Refactored integration logic to use a provider registry and support appending to existing files by default.

## 0.7.1

### Patch Changes

- 527e35f: Performance: Optimized `findAdditionMatches` by hoisting RegExp creation out of loops, improving performance for large diffs.

## 0.7.0

### Minor Changes

- fe8510e: Add React profile with React Router route detection and enhanced env var support for Vite and React App

## 0.6.0

### Minor Changes

- 6c15af3: Add `integrate cursor` command to generate Cursor AI rules that instruct Cursor on how to use branch-narrator for PR descriptions

## 0.5.0

### Minor Changes

- ae1186b: Add mode support to facts and risk-report commands

  Both commands now support `--mode` option with `branch|unstaged|staged|all` modes, enabling analysis of working tree changes in addition to branch comparisons. The `--base` and `--head` options are now only used in branch mode.

## 0.4.0

### Minor Changes

- d6b06f8: Add risk-report command for framework-agnostic security and quality analysis

## 0.3.0

### Minor Changes

- f18b443: Add dump-diff command
