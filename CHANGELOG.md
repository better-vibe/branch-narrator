# @better-vibe/branch-narrator

## 1.4.1

### Patch Changes

- d0d14af: Improve test analyzer to differentiate between added, modified, and deleted test files.

  - `TestChangeFinding` now includes `added`, `modified`, and `deleted` arrays for granular status tracking
  - Highlights show test file counts by status (e.g., "Test files: 2 added, 1 modified")
  - Markdown test plan includes counts of new and updated test files

## 1.4.0

### Minor Changes

- d68808e: Add Vite profile with vite-config analyzer

  - Added new `vite` profile for generic Vite-based projects
  - Added `vite-config` analyzer to detect Vite configuration changes
  - Detects breaking changes in Vite config (base path, build target, output directory, etc.)
  - Detects common Vite plugins (React, Vue, Svelte, PWA, etc.)
  - Auto-detects Vite projects when `vite` dependency is present
  - Added documentation for vite profile and vite-config analyzer

## 1.3.0

### Minor Changes

- 28870aa: Add Angular framework support with routes and components analyzers

  This release adds comprehensive Angular framework support to branch-narrator:

  - **New Analyzers:**

    - `angular-routes` - Detects Angular Router configuration changes (RouterModule.forRoot/forChild, provideRouter)
    - `angular-components` - Tracks Angular components, modules, services, directives, pipes, guards, and interceptors

  - **New Profile:**

    - `angular` - Auto-detected Angular profile with all Angular-specific analyzers
    - Detects Angular projects via @angular/core dependency or angular.json config

  - **Features:**

    - Full support for Angular 2-17+ routing patterns
    - Support for both NgModule-based and standalone components
    - Lazy route detection (loadChildren)
    - Redirect route tracking
    - Nested route hierarchy support
    - Component decorator extraction (selector, standalone, providers)

  - **Documentation:**

    - Added `docs/03-analyzers/angular-routes.md`
    - Added `docs/03-analyzers/angular-components.md`
    - Added `docs/07-profiles/angular.md`

  - **Tests:**
    - Comprehensive test coverage for both analyzers
    - 100+ test cases covering various Angular patterns

## 1.2.2

### Patch Changes

- c66dbb9: Fix pretty command profile-specific test suggestions and modernize terminal output

  - Replace hardcoded SvelteKit test suggestion with profile-aware system (fixes incorrect suggestion for library/other profiles)
  - Integrate buildHighlights() for consistent, prioritized summary bullets
  - Display detected profile name in summary box
  - Add rendering for new finding types: Impact Analysis, Infrastructure, CI/CD Workflows, SQL Risks, Lockfile Mismatch, Stencil Components, Config Changes, Large Diff warnings
  - Update test plan section to show test gaps and profile-specific commands

## 1.2.1

### Patch Changes

- c536ea0: Fix lockfile mismatch detection to only flag when dependencies change, not scripts or metadata

  The lockfile analyzer now checks the actual diff content to determine if dependency-related fields changed. Previously, any change to package.json would trigger a lockfile mismatch warning. Now it only flags when:

  - Dependency field names (dependencies, devDependencies, peerDependencies, etc.) are modified
  - Individual package version entries are added, removed, or changed

  Changes to scripts, name, version, description, repository, and other metadata fields no longer trigger false lockfile mismatch warnings.

## 1.2.0

### Minor Changes

- 057ffa3: improve build to make it 57% smaller

## 1.1.0

### Minor Changes

- 5131feb: Add Python analyzers and profile for Python project analysis

  - **Python Dependencies Analyzer**: Detects changes to requirements.txt, pyproject.toml, setup.py, Pipfile, and poetry.lock with risky package categorization (auth, database, native, payment)

  - **Python Routes Analyzer**: Detects route/endpoint changes in FastAPI, Django, and Flask frameworks

    - FastAPI: `@app.get()`, `@router.post()` decorators
    - Django: `path()`, `re_path()`, `url()` patterns
    - Flask: `@app.route()`, `@blueprint.route()` decorators

  - **Python Migrations Analyzer**: Detects database migration changes with risk assessment

    - Alembic: `alembic/versions/*.py` files
    - Django: `*/migrations/*.py` files
    - High-risk detection for `drop_table`, `drop_column`, `DeleteModel`, `RemoveField`

  - **Python Config Analyzer**: Detects changes to Python configuration files

    - Build: pyproject.toml, setup.py, setup.cfg
    - Testing: tox.ini, pytest.ini, conftest.py
    - Typing: mypy.ini, pyrightconfig.json
    - Linting: .flake8, .pylintrc, ruff.toml

  - **Python Profile**: New profile that auto-detects Python projects and applies all Python-specific analyzers

  New finding types:

  - `PythonMigrationFinding` for database migrations
  - `PythonConfigFinding` for configuration changes

## 1.0.1

### Patch Changes

- 0e78eed: Refresh the root README structure and CLI reference for new contributors.

## 1.0.0

### Major Changes

- 274c841: first public version

## 0.9.0

- d7db090: Add integrate auto-detection for existing agent guides and new targets (Claude, opencode, Jules rules).

- ef9c7b9: Improve time efficiency of core functiones

- 221ed3e: Improve highlights system with priority-based ordering and lockfile mismatch coverage

  - Add lockfile mismatch highlights when package.json or lockfile changes independently
  - Implement impact-first priority ordering for highlights (blast radius > breaking changes > risk/security > general changes > tests)
  - Highlights now show both high and medium blast radius findings (previously only showed one)
  - Ordering is deterministic and stable across runs

- 1fcd2cc: BREAKING: risk-report schema v2 (derived flags, deterministic traceability)

  - `risk-report` now outputs `schemaVersion: "2.0"` and all flags include deterministic `flagId` plus `relatedFindingIds` links to the triggering findings.
  - `RiskFlag` now requires `ruleKey`, `flagId`, and non-empty `relatedFindingIds` (legacy `id` field removed).
  - Legacy risk detector implementation under `src/commands/risk/detectors/` has been removed; flags are derived from analyzer findings via `findingsToFlags()`.

- d399dfd: Add new analyzers and profiles for enhanced framework detection

  **New Analyzers:**

  - `graphql`: Detect GraphQL schema changes with breaking change detection
  - `typescript-config`: Detect tsconfig.json changes and strictness modifications
  - `tailwind`: Detect Tailwind CSS and PostCSS configuration changes
  - `monorepo`: Detect monorepo config changes (Turborepo, pnpm, Lerna, Nx, Yarn, Changesets)
  - `package-exports`: Detect package.json exports field changes for library authors
  - `vue-routes`: Detect Vue Router and Nuxt file-based route changes
  - `astro-routes`: Detect Astro page, endpoint, and content collection changes

  **New Profiles:**

  - `vue`: Profile for Vue.js and Nuxt projects
  - `astro`: Profile for Astro projects
  - `library`: Profile for npm package/library development focused on API surface changes

  **New Finding Types:**

  - `graphql-change`: GraphQL schema modifications
  - `typescript-config`: TypeScript configuration changes
  - `tailwind-config`: Tailwind CSS configuration changes
  - `monorepo-config`: Monorepo tool configuration changes
  - `package-exports`: Package entry point changes

- 7fa0134: Normalize analyzer coverage across all profiles for consistent analysis capabilities.

  **React profile** now includes all core analyzers:

  - Added: impactAnalyzer, tailwindAnalyzer, typescriptConfigAnalyzer
  - Added: analyzeLargeDiff, analyzeLockfiles, analyzeTestGaps
  - Added: analyzeSQLRisks, analyzeCIWorkflows, analyzeInfra, analyzeAPIContracts

  **Stencil profile** expanded from 5 to 17 analyzers:

  - Added: envVarAnalyzer, cloudflareAnalyzer, vitestAnalyzer, securityFilesAnalyzer
  - Added: typescriptConfigAnalyzer and all risk analyzers

  **SvelteKit profile** enhanced:

  - Added: impactAnalyzer, tailwindAnalyzer

  **Next.js profile** enhanced:

  - Added: impactAnalyzer, analyzeSQLRisks, tailwindAnalyzer

  **Default profile** enhanced:

  - Added: graphqlAnalyzer for automatic GraphQL schema change detection

  **Quality improvements:**

  - Test-gap findings now categorized as "quality" instead of "tests" for clarity
  - Test-gap evidence now shows specific files changed without tests
  - Removed redundant `isTestFile` field from impact-analysis findings

  **Improved test-gap reporting:**

  - Test-gap findings now show in a new "quality" category instead of "tests"
  - Added clear evidence showing which production files changed without tests
  - Prevents confusion between actual test changes and test coverage warnings

- 8aebcc9: improve file-summary for changeDescription

- a8a7710: Add SARIF 2.1.0 output format for GitHub Code Scanning integration

  **New Features:**

  - Add `--format sarif` option to `facts` command for SARIF 2.1.0 output
  - Enhance diff parsing to track line numbers for added lines (enables precise location reporting)
  - Map findings to stable SARIF rules (BNR001-BNR006):
    - BNR001: Dangerous SQL in migration (error level)
    - BNR002: Non-destructive migration changed (warning level)
    - BNR003: Major dependency bump in critical frameworks (warning level)
    - BNR004: New environment variable reference (warning level)
    - BNR005: Cloudflare configuration changed (note level)
    - BNR006: API endpoint changed (note level)

  **Use Cases:**

  - Upload findings to GitHub Code Scanning for PR annotations
  - Integrate with CI/CD pipelines using standard SARIF tooling
  - Export findings to any SARIF-compatible analysis platform

  **Implementation Details:**

  - Deterministic and offline (no LLM calls, no network requests)
  - Line numbers included when evidence is based on added diff lines
  - Stable ordering of rules and results for reproducibility
  - Full SARIF 2.1.0 compliance with tool metadata and location tracking

- 12ad85d: add snapshot command feature

- 4fb6570: fix --no-timestamp flag

- 43b3677: Add Next.js profile with App Router support

  - New `next` profile for Next.js 13+ App Router projects
  - Route detection for `app/` directory (pages, layouts, loading, error, not-found)
  - API route detection (`route.ts`) with HTTP method extraction (GET, POST, etc.)
  - Middleware change detection flagged as security-sensitive
  - Support for route groups `(name)` and dynamic segments `[slug]`, `[...slug]`, `[[...slug]]`
  - Auto-detection based on `next` dependency and `app/` directory presence

- 8ecb5d0: refactor actions array

- 3750c0e:

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

  - Add 'artifacts' file category for build outputs (.tgz, .tar.gz, .zip, .wasm, .exe, etc.)
  - Improve profile detection reasons to explain WHY a profile was detected

- 55d20d2: Add 'artifacts' file category for build outputs like .tgz, .tar.gz, .zip, .wasm, .exe, and other binary/archive files. These are now categorized as "Build Artifacts" instead of "other".

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

- 51dfc4a: fix --version flag

- a38794e: Improve detection coverage and package manager support:

  - **Fix `bun.lock` detection**: The lockfile analyzer now correctly recognizes `bun.lock` (text format) in addition to `bun.lockb` (binary format)
  - **Add `database` file category**: New category for database-related files including Supabase, Prisma, Drizzle migrations, and SQL files
  - **Smart package manager detection**: Suggested actions (test, check) now detect and use the correct package manager (bun/pnpm/yarn/npm) based on lockfiles in the changeset
  - **Improved test file detection**: Test files under `src/tests/` and similar nested paths are now correctly categorized
  - **Archive files excluded by default**: `.tgz`, `.tar.gz`, and `.zip` files are now excluded from analysis by default

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

- 0f01789: Add zoom command for targeted drill-down by findingId or flagId

- e1039f1: BREAKING: Add stable IDs to findings and risk flags for deterministic references

  - All findings now include an optional `findingId` field (format: "finding.<type>#<hash>")
  - Risk flags now include `flagId`, `ruleKey`, and `relatedFindingIds` fields
  - New finding types added to support risk detection patterns
  - Facts builder automatically assigns findingIds to all findings

- c9e6d1e: feat: change default mode to unstaged and add branch auto-detection

- a62a306: Optimize facts command performance by reducing git subprocess calls and avoiding unnecessary evidence processing

- 4b7c6e9: Improve dump-diff performance by reducing git calls and batching work

  - Use single git diff call for all tracked files instead of per-file calls
  - Batch binary detection using git diff --numstat for tracked files
  - Limit concurrency for untracked file operations (binary checks and diffs)
  - Add diff splitting utility to parse full diff into per-file chunks
  - Add concurrency limiting utility for parallel operations
  - Maintain identical output for all existing modes (full, --name-only, --stat, --patch-for)

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

- d2aa296: add babel-parser as dependency

- 400b16d: Add modular benchmarking workflow for performance testing

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

- 11ff7fe: Migrate test suite from Vitest to bun test for improved performance and compatibility

- 7839c77: Enhance impact analysis with symbol-level tracking and test detection.

- 9ccbb1f: Added two new analyzers for enhanced verification:

  - `TestParityAnalyzer`: Enforces that modified source files have corresponding test files.
  - `ImpactAnalyzer`: Calculates the dependency "blast radius" of changes.

- f8d3d97: Added `branch-narrator integrate` command with support for `cursor` and `jules` providers.
  Refactored integration logic to use a provider registry and support appending to existing files by default.

- 527e35f: Performance: Optimized `findAdditionMatches` by hoisting RegExp creation out of loops, improving performance for large diffs.

- fe8510e: Add React profile with React Router route detection and enhanced env var support for Vite and React App

- 6c15af3: Add `integrate cursor` command to generate Cursor AI rules that instruct Cursor on how to use branch-narrator for PR descriptions

- ae1186b: Add mode support to facts and risk-report commands

  Both commands now support `--mode` option with `branch|unstaged|staged|all` modes, enabling analysis of working tree changes in addition to branch comparisons. The `--base` and `--head` options are now only used in branch mode.

- d6b06f8: Add risk-report command for framework-agnostic security and quality analysis

- f18b443: Add dump-diff command
