# @better-vibe/branch-narrator

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
