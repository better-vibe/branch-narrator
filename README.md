# branch-narrator

A local-first CLI that reads `git diff` and generates structured **PR descriptions** (Markdown) and **machine-readable facts** (JSON).

## Features

- **Heuristics-only**: No LLM calls, no network calls. Fully deterministic and grounded in git diff.
- **Risk Analysis**: Framework-agnostic security and quality risk scoring (0-100) with evidence-backed flags.
- **SvelteKit-aware**: Detects routes, layouts, endpoints, and HTTP methods.
- **Supabase integration**: Scans migrations for destructive SQL patterns.
- **Environment variable detection**: Finds `process.env`, SvelteKit `$env` imports.
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

## Usage

### Preview Changes (for Humans)

```bash
# Colorized summary of changes
branch-narrator pretty

# Include uncommitted work
branch-narrator pretty -u

# Compare specific branches
branch-narrator pretty --base develop --head feature/auth
```

### Generate PR Description

```bash
# Raw markdown for GitHub PRs
branch-narrator pr-body

# With custom refs
branch-narrator pr-body --base develop --head feature/my-feature

# Interactive mode (prompts for context)
branch-narrator pr-body --interactive

# Pipe to clipboard (macOS)
branch-narrator pr-body | pbcopy
```

### Generate JSON Facts (Agent-Grade)

```bash
# Machine-readable structured output
branch-narrator facts

# Pretty-printed JSON
branch-narrator facts --pretty

# Redact secrets in evidence excerpts
branch-narrator facts --redact

# Custom git refs
branch-narrator facts --base develop --head feature/auth

# Limit output
branch-narrator facts --max-findings 50

# Filter files
branch-narrator facts --exclude "**/test/**" --include "src/**"

# Parse with jq
branch-narrator facts | jq '.risk.level'
branch-narrator facts | jq '.categories[] | select(.id == "database")'
branch-narrator facts | jq '.actions[] | select(.blocking == true)'
```

### Risk Report (General-Purpose Security & Quality Analysis)

```bash
# Generate risk report with JSON output (default)
branch-narrator risk-report

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

# Custom git refs
branch-narrator risk-report --base develop --head feature/auth

# Parse with jq
branch-narrator risk-report | jq '.riskScore'
branch-narrator risk-report | jq '.flags[] | select(.category == "security")'
branch-narrator risk-report | jq '.categoryScores.db'
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
# Output prompt-ready diff to stdout (branch mode, default)
branch-narrator dump-diff

# Write to file
branch-narrator dump-diff --out .ai/diff.txt

# Unstaged changes (working tree vs index)
branch-narrator dump-diff --mode unstaged --out .ai/diff.txt

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

## CLI Commands

### `pretty` Command

Display a colorized summary of changes in the terminal.

| Option | Default | Description |
|--------|---------|-------------|
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `-u, --uncommitted` | `false` | Include uncommitted changes |
| `--profile <name>` | `auto` | Profile: `auto` or `sveltekit` |

### `pr-body` Command

Generate a raw Markdown PR description.

| Option | Default | Description |
|--------|---------|-------------|
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `-u, --uncommitted` | `false` | Include uncommitted changes |
| `--profile <name>` | `auto` | Profile: `auto` or `sveltekit` |
| `--interactive` | `false` | Prompt for additional context |

### `facts` Command

Output JSON findings for programmatic use.

| Option | Default | Description |
|--------|---------|-------------|
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `-u, --uncommitted` | `false` | Include uncommitted changes |
| `--profile <name>` | `auto` | Profile: `auto` or `sveltekit` |

### `dump-diff` Command

Output prompt-ready git diff with smart exclusions. Designed for AI agents.

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `branch` | Mode: `branch`, `unstaged`, `staged`, or `all` |
| `--base <ref>` | `main` | Base git reference (branch mode only) |
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
- `branch` (default): Compare `--base` to `--head` refs
- `unstaged`: Working tree vs index (uncommitted changes)
- `staged`: Index vs HEAD (staged changes)
- `all`: Working tree vs HEAD (all uncommitted changes)

**Default exclusions:** lockfiles, `.d.ts`, logs, `dist/`, `build/`, `.svelte-kit/`, `.next/`, minified files, sourcemaps, binaries.

### `risk-report` Command

Analyze git diff and emit a risk score (0-100) with evidence-backed flags. Framework-agnostic security and quality analysis.

| Option | Default | Description |
|--------|---------|-------------|
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
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
| `1` | Expected errors (not a git repo, bad ref) |
| `2` | Risk score >= `--fail-on-score` threshold |

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

- [ ] `bun test` - Run test suite
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

1. Checking for `src/routes` directory
2. Checking for `@sveltejs/kit` in package.json

### SvelteKit Profile

Runs all analyzers optimized for SvelteKit projects.

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
bun test

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

