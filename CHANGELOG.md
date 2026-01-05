# @better-vibe/branch-narrator

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
