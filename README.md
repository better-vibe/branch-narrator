# branch-narrator

A local-first CLI that reads `git diff` and generates structured **PR descriptions** (Markdown) and **machine-readable facts** (JSON).

## Features

- **Heuristics-only**: No LLM calls, no network calls. Fully deterministic and grounded in git diff.
- **Agent-grade reliability**: JSON outputs are deterministic, parseable, and pipe-safe (e.g., `branch-narrator facts | jq .`). Global `--quiet` and `--debug` flags control diagnostics.
- **Risk Analysis**: Framework-agnostic security and quality risk scoring (0-100) with evidence-backed flags.
- **SvelteKit-aware**: Detects routes, layouts, endpoints, and HTTP methods.
- **React Router support**: Detects route changes in React apps (JSX `<Route>` and data routers like `createBrowserRouter`).
- **Supabase integration**: Scans migrations for destructive SQL patterns.
- **Environment variable detection**: Finds `process.env`, SvelteKit `$env` imports, Vite `import.meta.env`, React App `REACT_APP_*`, and Next.js `NEXT_PUBLIC_*`.
- **Cloudflare detection**: Detects wrangler config and CI changes.
- **Dependency analysis**: Tracks package.json changes with semver impact.
- **CI/CD security**: Detects workflow permission changes, pull_request_target, remote script execution.
- **Infrastructure changes**: Tracks Dockerfile, Terraform, and Kubernetes manifest changes.

## Installation

```bash
bun add -D branch-narrator
# or
npm install -D branch-narrator
```

## Common Use Cases

### For AI Agents
Agents need grounded, hallucination-free context to work effectively. `branch-narrator` provides the "ground truth" of what actually changed in the codebase.
- **Context Gathering**: Use `facts` to get a structured JSON summary of changes (routes, dependencies, risks) to understand the "what" before generating code.
- **Diff Understanding**: Use `dump-diff` to get a clean, token-optimized git diff that handles exclusions smartly (ignoring lockfiles, minified files, etc.).
- **Self-Verification**: Use `zoom` to verify specific findings or check if a requested change (e.g., "add a route") was actually implemented correctly.

### For Developers
Streamline your daily workflow without context switching.
- **Fast Code Review**: Run `branch-narrator pretty` to see a high-level summary of your uncommitted changes in the terminal.
- **PR Descriptions**: Generate a consistent, comprehensive PR description with `branch-narrator pr-body` and pipe it directly to `gh pr create` or your clipboard.

### For CI/CD Pipelines
Automate quality and security checks.
- **Risk Gating**: Use `branch-narrator risk-report --fail-on-score 60` in your CI pipeline to automatically block merges that introduce high-risk changes (like destructive migrations or dangerous permissions) until they are reviewed.

## Usage

### Global Flags

All commands support the following global flags:

```bash
# Suppress non-fatal diagnostic output (warnings, info messages)
branch-narrator --quiet facts

# Show debug diagnostics on stderr (timings, detector counts, etc.)
branch-narrator --debug risk-report

# Combine flags (--quiet overrides --debug)
branch-narrator --quiet --debug facts
```

**Note:** In JSON mode (`facts`, `risk-report --format json`, `dump-diff --format json`), all diagnostic output goes to stderr to ensure stdout contains only valid JSON. This makes the output safe for piping to `jq` or other JSON parsers.

### Preview Changes (for Humans)

```bash
# Colorized summary of unstaged changes (default)
branch-narrator pretty

# Compare specific branches
branch-narrator pretty --mode branch --base develop --head feature/auth

# Review all uncommitted changes (staged + unstaged + untracked)
branch-narrator pretty --mode all
```

### Generate PR Description

```bash
# Analyze unstaged changes (default)
branch-narrator pr-body

# Compare branches for PR
branch-narrator pr-body --mode branch --base develop --head feature/my-feature

# Interactive mode (prompts for context)
branch-narrator pr-body --interactive

# Pipe to clipboard (macOS)
branch-narrator pr-body | pbcopy
```

### Generate JSON Facts (Agent-Grade)

```bash
# Analyze unstaged changes (default)
branch-narrator facts

# Compare branches for PR
branch-narrator facts --mode branch --base develop --head feature/auth

# Pretty-printed JSON
branch-narrator facts --pretty

# Redact secrets in evidence excerpts
branch-narrator facts --redact

# Limit output
branch-narrator facts --max-findings 50

# Filter files
branch-narrator facts --exclude "**/test/**" --include "src/**"

# Parse with jq
branch-narrator facts | jq '.risk.level'
branch-narrator facts | jq '.categories[] | select(.id == "database")'
branch-narrator facts | jq '.actions[] | select(.blocking == true)'

# Delta mode: compare to previous run
branch-narrator facts --out .ai/baseline.json
# ... make changes ...
branch-narrator facts --since .ai/baseline.json --pretty
```

### Generate SARIF Output (for CI/Code Scanning)

[SARIF (Static Analysis Results Interchange Format)](https://sarifweb.azurewebsites.net/) is a standardized JSON format for static analysis tools. Use `--format sarif` to output findings in a format compatible with GitHub Code Scanning and other SARIF consumers.

```bash
# Generate SARIF output for GitHub Code Scanning
branch-narrator facts --mode branch --base main --head HEAD --format sarif

# Save to file for upload
branch-narrator facts --format sarif --out branch-narrator.sarif

# Pretty-printed SARIF
branch-narrator facts --format sarif --pretty
```

For detailed technical documentation on the SARIF renderer—including the output schema, rule mappings (BNR001–BNR006), how line number tracking works, and known limitations—see [`docs/08-rendering/sarif.md`](docs/08-rendering/sarif.md).

**SARIF Rule Mapping:**

The following findings are mapped to stable SARIF rules:

- **BNR001**: Dangerous SQL in migration (DROP, TRUNCATE, ALTER TYPE, etc.) - `error`
- **BNR002**: Non-destructive migration changed - `warning`
- **BNR003**: Major version bump in critical dependencies (@sveltejs/kit, svelte, vite, react, next) - `warning`
- **BNR004**: New environment variable reference detected - `warning`
- **BNR005**: Cloudflare configuration changed - `note`
- **BNR006**: API endpoint changed (added/modified/deleted) - `note`

**GitHub Actions Example:**

```yaml
name: Code Scanning

on:
  pull_request:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Fetch full history for diff analysis

      - name: Install branch-narrator
        run: npm install -g @better-vibe/branch-narrator

      - name: Generate SARIF
        run: |
          branch-narrator facts \
            --mode branch \
            --base ${{ github.event.pull_request.base.sha }} \
            --head ${{ github.event.pull_request.head.sha }} \
            --format sarif \
            --out branch-narrator.sarif

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: branch-narrator.sarif
          category: branch-narrator
```

**Limitations:**
- SARIF output is deterministic and based on heuristics only (no LLM calls)
- Line numbers are included when evidence is based on added diff lines
- Not all finding types are mapped to SARIF rules (see mapping above for covered types)
- No autofix suggestions in MVP (SARIF `fixes` field not populated)

### Risk Report (General-Purpose Security & Quality Analysis)

```bash
# Analyze unstaged changes (default)
branch-narrator risk-report

# Compare branches for PR
branch-narrator risk-report --mode branch --base develop --head feature/auth

# Markdown format for human review
branch-narrator risk-report --format md

# Text format for terminal
branch-narrator risk-report --format text

# Fail CI if risk score >= threshold
branch-narrator risk-report --fail-on-score 50

# Focus on specific categories
branch-narrator risk-report --only security,deps,db

# Exclude certain categories
branch-narrator risk-report --exclude tests,churn

# Show score breakdown
branch-narrator risk-report --explain-score

# Redact secrets in evidence
branch-narrator risk-report --redact

# Limit evidence lines per flag
branch-narrator risk-report --max-evidence-lines 3

# Write to file
branch-narrator risk-report --format md --out .ai/risk-report.md

# Parse with jq
branch-narrator risk-report | jq '.riskScore'
branch-narrator risk-report | jq '.flags[] | select(.category == "security")'
branch-narrator risk-report | jq '.categoryScores.db'

# Delta mode: track risk improvement
branch-narrator risk-report --out .ai/baseline-risk.json
# ... make changes ...
branch-narrator risk-report --since .ai/baseline-risk.json --pretty
# Shows: risk score change, added/removed/changed flags
```

**Risk Categories:**
- `security`: Workflow permissions, pull_request_target, remote script execution
- `ci`: CI/CD pipeline configuration changes
- `deps`: New dependencies, major version bumps, lockfile inconsistencies
- `db`: Database migrations, destructive SQL, schema changes
- `infra`: Dockerfile, Terraform, Kubernetes manifests
- `api`: OpenAPI, GraphQL, Protocol Buffer schema changes
- `tests`: Test coverage gaps, test file changes
- `churn`: Large changesets (>50 files or >1500 lines)

**Risk Levels:** (based on 0-100 score)
- `low` (0-20): Minimal risk, safe to merge
- `moderate` (21-40): Some risk, review recommended
- `elevated` (41-60): Moderate risk, careful review needed
- `high` (61-80): High risk, thorough review required
- `critical` (81-100): Critical risk, requires security review

**Output Schema (v1.0):**
- `schemaVersion`: Schema version identifier
- `generatedAt`: ISO timestamp
- `git`: Git metadata (base, head, range, isDirty)
- `profile`: Detected project profile with confidence
- `stats`: File change statistics
- `filters`: Applied filtering configuration
- `summary`: High-level summary with highlights
- `categories`: Findings aggregated by category with risk weights
- `risk`: Structured risk score with factors and evidence
- `findings`: Detailed findings array (typed discriminated union)
- `actions`: Actionable recommendations (blocking/non-blocking)
- `skippedFiles`: Files excluded from analysis with reasons
- `warnings`: Any warnings encountered during analysis

**Example categories output:**
```json
{
  "categories": [
    {
      "id": "database",
      "count": 2,
      "riskWeight": 45,
      "topEvidence": [
        {
          "file": "supabase/migrations/002_users.sql",
          "excerpt": "DROP TABLE IF EXISTS old_users;"
        }
      ]
    }
  ]
}
```

### Dump Diff for AI Agents

```bash
# Output unstaged changes (default)
branch-narrator dump-diff

# Write to file
branch-narrator dump-diff --out .ai/diff.txt

# Compare branches for PR
branch-narrator dump-diff --mode branch --base main --head feature/auth --out .ai/diff.txt

# Staged changes only (index vs HEAD)
branch-narrator dump-diff --mode staged --format md --out .ai/staged.md

# All changes since HEAD (staged + unstaged + untracked)
branch-narrator dump-diff --mode all --out .ai/all-changes.txt

# Exclude untracked files
branch-narrator dump-diff --mode all --no-untracked --out .ai/diff.txt

# Chunk large diffs for context windows
branch-narrator dump-diff --max-chars 25000 --chunk-dir .ai/diff-chunks

# JSON format with metadata
branch-narrator dump-diff --format json --out .ai/diff.json

# Include only specific files
branch-narrator dump-diff --include "src/**" --include "tests/**"
```

### Zoom Command

Drill down into a specific finding or risk flag to get detailed, isolated context. Useful for AI agents to verify specific issues or changes without processing the entire diff.

```bash
# Zoom into a specific finding by ID (from 'facts' output)
branch-narrator zoom --finding finding-123

# Zoom into a risk flag by ID (from 'risk-report' output)
branch-narrator zoom --flag flag-456

# Output as Markdown (default is markdown, can be json or text)
branch-narrator zoom --finding finding-123 --format md

# Get JSON output for machine parsing
branch-narrator zoom --flag flag-456 --format json --pretty

# Exclude patch context (show only evidence metadata)
branch-narrator zoom --finding finding-123 --no-patch

# Adjust context lines
branch-narrator zoom --finding finding-123 --unified 5
```

### AI Agent Integration

Generate provider-specific rules for AI coding assistants (Cursor, Jules, etc.).

```bash
# Generate Cursor rules
branch-narrator integrate cursor

# Generate Jules rules
branch-narrator integrate jules

# Preview what would be created without writing files
branch-narrator integrate cursor --dry-run

# Overwrite existing rule files
branch-narrator integrate cursor --force
```

**What it does:**
- Creates provider-specific rule files (e.g., `.cursor/rules/branch-narrator.md`)
- Instructs the AI on when and how to use `branch-narrator` commands
- Provides consistent workflows for PR descriptions and analysis

**Why use this:**
- AI assistants will automatically read these rules when working in your repository
- Ensures the AI uses branch-narrator to ground PR descriptions in actual git diffs instead of guessing
- Provides consistent PR description templates across your team

**Exit codes:**
- `0`: Success
- `1`: Expected failure (unknown target, files exist without --force, etc.)

## CLI Commands

### `pretty` Command

Display a colorized summary of changes in the terminal.

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `stencil`, `next`, or `react` |

### `pr-body` Command

Generate a raw Markdown PR description.

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `-u, --uncommitted` | `false` | **[DEPRECATED]** Use `--mode unstaged` instead |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `stencil`, `next`, or `react` |
| `--interactive` | `false` | Prompt for additional context |

### `facts` Command

Output JSON findings for programmatic use.

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `stencil`, `next`, or `react` |

### `dump-diff` Command

Output prompt-ready git diff with smart exclusions. Designed for AI agents.

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--no-untracked` | (off) | Exclude untracked files (non-branch modes) |
| `--out <path>` | stdout | Write output to file |
| `--format <type>` | `text` | Format: `text`, `md`, or `json` |
| `--unified <n>` | `0` | Lines of unified context |
| `--include <glob>` | (none) | Include only matching files |
| `--exclude <glob>` | (none) | Additional exclusion globs |
| `--max-chars <n>` | (none) | Chunk if output exceeds size |
| `--chunk-dir <path>` | `.ai/diff-chunks` | Directory for chunks |
| `--name <prefix>` | `diff` | Chunk file prefix |
| `--dry-run` | `false` | Preview without writing |

**Modes:**
- `unstaged` (default): Working tree vs index (uncommitted changes)
- `branch`: Compare `--base` to `--head` refs
- `staged`: Index vs HEAD (staged changes)
- `all`: Working tree vs HEAD (all uncommitted changes)

**Default exclusions:** lockfiles, `.d.ts`, logs, `dist/`, `build/`, `.svelte-kit/`, `.next/`, minified files, sourcemaps, binaries.

### `integrate` Command

Generate provider-specific rules for AI coding assistants.

| Option | Default | Description |
|--------|---------|-------------|
| `<target>` | (required) | Integration target: `cursor`, `jules` |
| `--dry-run` | `false` | Preview what would be written without creating files |
| `--force` | `false` | Overwrite existing files |

**Supported targets:**
- `cursor`: Generates `.cursor/rules/branch-narrator.md` and `.cursor/rules/pr-description.md`
- `jules`: Generates `AGENTS.md` in the repository root with Branch Narrator rules for Jules

**Behavior:**
- Creates rules directory if it doesn't exist
- Fails with exit code 1 if files already exist (use `--force` to overwrite)
- Outputs exact file paths and contents in `--dry-run` mode

### `risk-report` Command

Analyze git diff and emit a risk score (0-100) with evidence-backed flags. Framework-agnostic security and quality analysis.

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--format <type>` | `json` | Output format: `json`, `md`, or `text` |
| `--out <path>` | stdout | Write output to file |
| `--fail-on-score <n>` | (none) | Exit with code 2 if risk score >= threshold |
| `--only <categories>` | (none) | Only include these categories (comma-separated) |
| `--exclude <categories>` | (none) | Exclude these categories (comma-separated) |
| `--max-evidence-lines <n>` | `5` | Max evidence lines per flag |
| `--redact` | `false` | Redact secret values in evidence |
| `--explain-score` | `false` | Include score breakdown in output |

**Output Schema (v1.0):**
- `schemaVersion`: "1.0"
- `range`: { base, head }
- `riskScore`: 0-100 computed score
- `riskLevel`: "low" | "moderate" | "elevated" | "high" | "critical"
- `categoryScores`: Scores per category (0-100)
- `flags`: Array of risk flags with evidence
- `skippedFiles`: Files excluded from analysis
- `scoreBreakdown`: (optional) Score computation details

**Exit Codes:**
| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Expected errors (not a git repo, invalid refs, etc.) |
| `2` | Risk score >= `--fail-on-score` threshold |

### `zoom` Command

Zoom into a specific finding or flag for detailed context.

| Option | Default | Description |
|--------|---------|-------------|
| `--finding <id>` | (optional) | Finding ID to zoom into (mutually exclusive with `--flag`) |
| `--flag <id>` | (optional) | Flag ID to zoom into (mutually exclusive with `--finding`) |
| `--format <type>` | `md` | Output format: `json`, `md`, `text` |
| `--no-patch` | `false` | Exclude patch context, only show evidence |
| `--unified <n>` | `3` | Lines of unified context for patch hunks |
| `--max-evidence-lines <n>` | `8` | Max evidence excerpt lines to show |
| `--redact` | `false` | Redact obvious secret values |
| `--out <path>` | stdout | Write output to file |

## Sample Output

### Markdown PR Body

```markdown
## Summary

- 5 file(s) changed
- 2 file(s) added
- 1 new route(s)
- Database migrations detected

## Routes / API

| Route | Type | Change | Methods |
|-------|------|--------|---------|
| `/dashboard` | page | added | - |
| `/api/users` | endpoint | added | GET, POST |

## Database (Supabase)

**Risk Level:** 🟡 MEDIUM

**Files:**
- `supabase/migrations/20240101_add_users.sql`

## Config / Env

| Variable | Status | Evidence |
|----------|--------|----------|
| `PUBLIC_API_URL` | added | src/lib/config.ts |
| `DATABASE_URL` | added | src/hooks.server.ts |

## Dependencies

### Production

| Package | From | To | Impact |
|---------|------|-----|--------|
| `@sveltejs/kit` | ^1.0.0 | ^2.0.0 | major |

## Suggested Test Plan

- [ ] `bun run test` - Run test suite
- [ ] `bun run check` - Run SvelteKit type check
- [ ] Test `GET/POST /api/users` endpoint
- [ ] Verify `/dashboard` page renders correctly

## Risks / Notes

**Overall Risk:** 🟡 MEDIUM (score: 35/100)

- ⚠️ Major version bump: @sveltejs/kit ^1.0.0 → ^2.0.0
- ℹ️ New env var: PUBLIC_API_URL
```

### JSON Facts

```json
{
  "profile": "sveltekit",
  "riskScore": {
    "score": 35,
    "level": "medium",
    "evidenceBullets": [
      "⚠️ Major version bump: @sveltejs/kit ^1.0.0 → ^2.0.0"
    ]
  },
  "findings": [
    {
      "type": "file-summary",
      "added": ["src/routes/dashboard/+page.svelte"],
      "modified": ["package.json"],
      "deleted": [],
      "renamed": []
    },
    {
      "type": "route-change",
      "routeId": "/dashboard",
      "file": "src/routes/dashboard/+page.svelte",
      "change": "added",
      "routeType": "page"
    },
    {
      "type": "dependency-change",
      "name": "@sveltejs/kit",
      "section": "dependencies",
      "from": "^1.0.0",
      "to": "^2.0.0",
      "impact": "major"
    }
  ]
}
```

## Analyzers

### Route Detector

Detects changes under `src/routes/**`:

- Maps filesystem paths to SvelteKit route IDs
- Identifies page, layout, endpoint, and error types
- Extracts HTTP methods from endpoint exports
- Preserves param notation (`[slug]`, `[[id]]`, `[...rest]`)

### Supabase Migration Detector

Scans `supabase/migrations/*.sql` for:

- **High risk**: `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `ALTER TYPE`, `DELETE` without `WHERE`
- **Medium risk**: Migrations without destructive patterns
- **Low risk**: Only seed/config files changed

### Environment Variable Detector

Extracts env vars from:

- `process.env.VAR_NAME`
- `PUBLIC_*` patterns
- SvelteKit `$env/static/public` imports
- SvelteKit `$env/static/private` imports

### Cloudflare Detector

Detects:

- `wrangler.toml` / `wrangler.json` changes
- GitHub workflow changes mentioning Cloudflare/wrangler

### Vitest Detector

Detects:

- `*.test.ts`, `*.spec.ts` files
- `tests/` directory changes
- `vitest.config.*` changes

### Dependency Analyzer

Compares `package.json`:

- Additions, removals, and version bumps
- Semver impact classification (major/minor/patch)
- Risk flags for critical package major bumps

## Profiles

### Auto Detection

When `--profile auto` (default), the profile is detected by:

1. **SvelteKit**: Checking for `src/routes` directory or `@sveltejs/kit` in package.json
2. **React**: Checking for `react`, `react-dom`, and `react-router-dom` in package.json (only when Next.js is not detected)
3. **Default**: Generic profile for all other projects

### SvelteKit Profile

Runs all analyzers optimized for SvelteKit projects, including:
- SvelteKit route detection (`src/routes/`)
- SvelteKit env var patterns (`$env/static/public`, `$env/static/private`)

### React Profile

Runs all analyzers optimized for React projects, including:
- React Router route detection (JSX `<Route>` components and data routers)
- Vite env var patterns (`import.meta.env.VITE_*`)
- React App env var patterns (`process.env.REACT_APP_*`)

**Note**: React Router detection requires `react-router` or `react-router-dom` in package.json.

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Expected failures (not a git repo, invalid refs, etc.) |
| `2` | Risk score threshold exceeded (when using `risk-report --fail-on-score`) |

## Development

```bash
# Install dependencies
bun install

# Run tests
bun run test

# Build
bun run build

# Type check
bun run typecheck

# Run locally
bun src/cli.ts pretty -u
bun src/cli.ts pr-body --base main --head HEAD
bun src/cli.ts facts -u | jq '.riskScore'
```

## Requirements

- Node.js >= 18
- Git repository

## License

MIT
