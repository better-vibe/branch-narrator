# @better-vibe/branch-narrator

## 1.14.1

### Patch Changes

- 6b8b2aa: **Improved `pr-body` output formatting**

  Significantly reduced redundancy and improved readability of PR body output:

  1. **Eliminated duplicate blast radius information** - Blast radius details now only appear in the "Top findings" section, removing duplication from Summary bullets and Details section

  2. **Fixed risk scoring for high blast radius** - Files with high blast radius (>10 dependents) in product code now automatically increase risk score by 20 points, ensuring that files with many dependents (like `types.ts` with 41 dependents) properly elevate the overall risk to HIGH

  3. **Condensed changeset display** - Summary section now shows "X changesets added" instead of individual file listings. In the "What changed" section, only up to 5 changesets are listed individually, with the rest summarized as "...and X more"

  4. **Removed redundant dependency table** - Dependencies are now shown only once in the primary "Dependencies" section, eliminating duplication in the Details collapsible section

  5. **Cleaner Summary section** - Removed individual finding descriptions from Summary bullets; they now only appear in "Top findings" section for better organization

  These changes make the PR body output more concise and easier to scan while preserving all important information.

## 1.14.0

### Minor Changes

- 205c9d5: Add 4 new Finding types for expanded analysis support:

  - **CypressConfigFinding** - For E2E test configuration and test file changes
  - **I18nChangeFinding** - For translation key and locale changes
  - **WebSocketChangeFinding** - For WebSocket/Socket.io event and room changes
  - **CSSChangeFinding** - For CSS Module and styling changes

  These new finding types enable analyzers to report detailed information about changes in testing (Cypress), internationalization, real-time communication, and styling domains.

- fb4a219: ## New Analyzers

  Added 5 new analyzers for modern web framework detection:

  ### Drizzle ORM Analyzer

  - Detects changes to Drizzle schema files (`*.schema.ts`, `schema/**/*.ts`)
  - Detects Drizzle migration SQL files
  - Identifies breaking changes like removed tables, columns, or constraints
  - Added to: default, next, react, vue, astro, sveltekit, vite, library profiles

  ### TanStack Query Analyzer

  - Detects changes to React Query hooks (`useQuery`, `useMutation`, `useInfiniteQuery`)
  - Identifies cache-affecting changes (query keys, staleTime, gcTime)
  - Flags removed hooks as breaking changes
  - Added to: next, react profiles

  ### tRPC v11 Router Analyzer

  - Detects changes to tRPC v11 routers and procedures
  - Identifies procedure additions, removals, and modifications
  - Detects breaking changes in input/output schemas
  - Added to: next, react, vue, sveltekit profiles

  ### Svelte 5 Runes Analyzer

  - Detects changes to Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`, `$inspect`, `$bindable`)
  - Identifies Svelte 4 to 5 migration patterns
  - Detects breaking rune changes
  - Added to: sveltekit profile

  ### Next.js RSC Boundary Analyzer

  - Detects changes to React Server Components boundaries
  - Monitors "use client" and "use server" directive changes
  - Identifies breaking changes when removing directives from browser-dependent code
  - Added to: next profile

  All analyzers include comprehensive test suites with 100+ test cases combined.

## 1.13.0

### Minor Changes

- c25196b: Add six new analyzers: Prisma schema, Jest config, linter config (ESLint/Biome/Prettier/Stylelint/oxlint), Playwright config, Docker (Dockerfile/compose/dockerignore), and Turborepo config. All analyzers detect breaking changes and are included in the default profile.

## 1.12.0

### Minor Changes

- e53b6ea: Comprehensively improve Angular analyzers with richer metadata extraction and feature detection

  **Angular Routes Analyzer:**

  - Add route guard detection (canActivate, canDeactivate, canMatch, canLoad, canActivateChild)
  - Add route resolver detection
  - Add route data and title extraction
  - Add loadComponent detection for standalone lazy components
  - Add route modification detection (guards, resolvers, lazy loading changes)
  - Add named outlet detection
  - Add feature tags from diff content (standalone API features, navigation patterns, route events)
  - Add wildcard catch-all route detection

  **Angular Components Analyzer:**

  - Add @Input() and @Output() property extraction via AST and regex
  - Add signal-based input()/output()/model() detection (Angular 17+)
  - Add change detection strategy detection (OnPush/Default)
  - Add resolver file type detection
  - Add companion template/style file co-change detection
  - Add feature tags: lifecycle hooks, DI patterns, RxJS, signals, forms, HTTP, view queries, control flow, defer blocks
  - Improve rendering with richer details table (inputs, outputs, CD strategy)

  **Highlights:**

  - Add Angular component changes to highlights system

## 1.11.0

### Minor Changes

- 135d2c4: Comprehensively improve Vue/Nuxt routes analyzer with expanded detection capabilities:

  - Detect Nuxt app-level middleware files (middleware/\*.ts) as route metadata
  - Detect Nuxt error page (error.vue) as error route type
  - Detect Nuxt app-level files (app.vue, app.config.ts) as template route type
  - Distinguish default layout from named layouts (route type "default" vs "layout")
  - Convert server route file paths to proper API paths (e.g., server/api/users.get.ts → /api/users)
  - Support optional dynamic segments (pages/users/[[id]].vue → /users/:id?)
  - Extract feature tags from diff content: definePageMeta, useFetch, useAsyncData, useRoute, useRouter, navigateTo, defineEventHandler, defineCachedEventHandler, defineWebSocketHandler, readValidatedBody, setResponseStatus, and more
  - Parse Vue Router config diffs to extract individual route paths (added/removed)
  - Detect Vue Router config features: createRouter, navigation guards, scroll behavior, lazy loading, route meta, nested routes, redirects, aliases
  - Add deduplication and deterministic sorting of findings
  - Add router/routes.ts to recognized Vue Router config patterns

## 1.10.0

### Minor Changes

- 8b89454: Comprehensively improve React Router analyzer with route type detection (page, layout, error), feature tags (loader, action, lazy, error-boundary, catch-all, handle, shouldRevalidate, Component, HydrateFallback), createRoutesFromElements support, and richer evidence output

## 1.9.0

### Minor Changes

- 7d89783: Comprehensively improve Next.js analyzers with full App Router convention support

  - Add missing route file types: template, default, global-error (all JS/TS extensions)
  - Add proper RouteType values: "loading", "template", "default", "metadata"
  - Detect Next.js metadata file conventions: sitemap, robots, manifest, opengraph-image, twitter-image, icon, apple-icon
  - Generate findings for next.config changes (new NextConfigChangeFinding type with feature detection)
  - Support next.config.cjs
  - Detect instrumentation.ts as security-sensitive file
  - Handle parallel routes (@folder convention) with tags
  - Handle intercepting routes ((.)folder convention) with tags
  - Detect Server Actions ("use server" directive) as route tags
  - Detect generateStaticParams and generateMetadata exports as route tags
  - Enrich route highlights with page/endpoint/layout breakdown
  - Add next.config change highlights with experimental/routing feature awareness
  - Add risk scoring for next.config changes

## 1.8.0

### Minor Changes

- bd70225: Improve pr-body and pretty output for human readability

  - Add no-changes short-circuit: both renderers return a single "No changes detected" line when the diff is empty with no findings
  - Promote dependency change summaries to primary output area (before test plan) with concise overview showing counts by prod/dev, major updates, and new/removed packages
  - Trim impact analysis in pr-body details: only show high/medium blast radius (skip low), cap entries at 5 with 3 dependents each
  - Omit Notes section when risk is low with no evidence bullets (reduces noise)
  - Full dependency tables remain available in the Details block for reviewers who want version details

## 1.7.0

### Minor Changes

- 15721e9: feat: replace parse-diff with high-performance DOD parser

  **BREAKING INTERNAL CHANGE**: Removed the `parse-diff` dependency entirely. All diff parsing now uses the built-in Data-Oriented Design (DOD) parser for significantly improved performance.

  ## What Changed

  - **Removed `parse-diff` dependency** - No longer needed as external dependency
  - **All analyzers now use DOD parser** - Unified parsing pipeline
  - **Updated `buildChangeSet()`** - Now accepts `unifiedDiff` string instead of pre-parsed diffs
  - **New `buildChangeSetMerged()`** - For combining tracked and untracked file diffs

  ## Performance Benefits

  - **60-80% memory reduction** for large diffs (TypedArray storage vs object allocation)
  - **Zero GC pressure** during parsing (no intermediate string/object creation)
  - **Near-instant startup** through deferred string decoding
  - **Cache-friendly** sequential memory access pattern

  ## DOD Parser Architecture

  - **DiffArena**: TypedArray-based Struct of Arrays (SoA) storage
  - **DiffScanner**: Zero-copy byte-level tokenization
  - **StringInternPool**: FNV-1a hash-based filename deduplication
  - **StreamingDiffParser**: Single-pass state machine
  - **Adapter layer**: Full backward compatibility with FileDiff/Hunk types

  ## Migration

  No API changes for external users. The `ChangeSet` structure remains identical.
  Internal code that was using `ParseDiffFile` types should now use `FileDiff` directly.

- 7faa035: Add global caching system for improved performance

  This release introduces a comprehensive caching system that persists intermediate results across CLI executions:

  **Cache Features:**

  - **ChangeSet caching**: Parsed git diff output is cached based on git state
  - **Per-analyzer caching**: Individual analyzer findings are cached with file-pattern-aware invalidation
  - **Git ref caching**: SHA lookups are cached and invalidated when HEAD changes

  **New CLI Options:**

  - `--no-cache`: Disable caching entirely (bypass lookup and don't store)
  - `--clear-cache`: Clear the cache before running the command

  **New `cache` Command:**

  - `cache stats [--pretty]`: Show cache statistics (hits, misses, hit rate, size)
  - `cache clear`: Remove all cache data
  - `cache prune [--max-age <days>]`: Remove entries older than N days (default: 30)

  **Cache Location:**
  All cache data is stored in `.branch-narrator/cache/` within your project directory.

  **Cache Invalidation:**

  - Content-addressed caching with SHA-256 hashes
  - Automatic invalidation on CLI version change
  - Mode-specific invalidation strategies for different git states
  - Two-entry limit policy (current + previous) prevents unbounded growth

  The caching system is enabled by default and works transparently. Use `--no-cache` when you need fresh results.

### Patch Changes

- 7faa035: Fix impact analyzer caching so clean reruns reuse the same cache entry instead of creating duplicates.
- 60c8f60: docs: align CLI/docs with current profiles, outputs, and public API export
- 7faa035: perf: optimize DOD diff parser with indexed hunk line access

  ## What Changed

  - **Hunk line indexing**: Added `hunkFirstLineIndex` and `hunkLineCount` to `DiffArena`, enabling O(1) range lookups for hunk lines instead of O(totalLines) full scans
  - **Range-based materialization**: Adapter `materializeHunk()` (both lazy and eager paths) now iterates only the hunk's line range
  - **Context line skip**: Context lines are no longer decoded during hunk materialization since only additions and deletions are collected
  - **Zero-copy file status detection**: `determineFileStatus()` now compares path bytes directly instead of allocating a `TextDecoder` per file
  - **Optimized `getChangeStats()`**: File paths are precomputed by index once, eliminating per-line path decoding

  ## Performance Impact

  For a diff with F files, H hunks, and L total lines:

  - **Hunk materialization**: O(L \* H) → O(L) (each line visited once via its hunk range)
  - **File additions/deletions generators**: O(L) full scan → O(file_lines) range scan
  - **`getChangeStats()`**: O(L) path decodings → O(F) path decodings
  - **`determineFileStatus()`**: Eliminates TextDecoder allocation per file

## 1.6.0

### Minor Changes

- dae31e8: Improve human-facing output for `pretty` and `pr-body` commands

  - Remove emojis from all human-facing output for cleaner, professional display
  - Summary section now shows explicit diffstat (e.g., "Files: 3 changed (1 added, 2 modified)")
  - Add "Review attention" indicator based on blast radius, separate from risk score
  - Add findings-by-category summary (e.g., "code=1, tests=1, docs=1")
  - Replace separate "Key highlights" and "Impact analysis" sections with unified "Top findings" (max 5 items)
  - Top findings include capped example file lists with "(+N more)" suffix
  - "What changed" section separates Changesets from Documentation category
  - "What changed" shows "Primary files" for small changes (1-3 code files)
  - Suggested test plan includes rationales (e.g., "(SvelteKit profile)", "(targeted)")
  - Notes section shows only new information or "No elevated risks detected"
  - PR body (`pr-body` command) now uses a collapsible `<details>` block for extended information

### Patch Changes

- dae31e8: fix summary rendering logic for added files in pr-body command

## 1.5.0

### Minor Changes

- 43a717a: Improve pr-body and pretty command output

  **pr-body improvements:**

  - Add Security-Sensitive Files section showing files that touch auth, permissions, or security-critical code
  - Add Vite Config rendering in Configuration Changes section
  - Improve Summary section using prioritized highlights system for consistent, impact-ordered bullets
  - Remove redundant Tests section (tests already shown in "What Changed" and "Suggested Test Plan")

  **pretty command improvements:**

  - Add dedicated KEY HIGHLIGHTS section with categorized display (Risks & Breaking Changes, Changes, Info)
  - Simplify Summary box to focus on file counts, profile, and risk level
  - Highlights now shown in their own section with appropriate styling

  **Other fixes:**

  - Fix emoji consistency: use ⚡ only for KEY HIGHLIGHTS header, ℹ️ for informational risk bullets
  - Remove deprecated --uncommitted flag (use --mode unstaged instead)

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
