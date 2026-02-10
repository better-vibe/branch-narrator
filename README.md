# branch-narrator

[![npm version](https://img.shields.io/npm/v/@better-vibe/branch-narrator)](https://www.npmjs.com/package/@better-vibe/branch-narrator)
[![CI](https://github.com/@better-vibe/branch-narrator/actions/workflows/ci.yml/badge.svg)](https://github.com/@better-vibe/branch-narrator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local-first, deterministic CLI that analyzes `git diff` and provides
structured context for AI coding agents and human code review.

## Quick Start

```bash
# Install as dev dependency (recommended)
bun add -D @better-vibe/branch-narrator

# Or run without installing
bunx @better-vibe/branch-narrator facts --pretty
```

### Common Commands

```bash
# Generate a PR description for current changes
branch-narrator pr-body

# Colorized summary for humans
branch-narrator pretty

# Structured JSON facts for automation
branch-narrator facts --pretty

# Risk report for review
branch-narrator risk-report --format md

# Prompt-ready diff with smart filtering
branch-narrator dump-diff --out .ai/diff.txt

# Zoom into a specific finding
branch-narrator zoom --finding finding.env-var#abc123

# Save workspace snapshot for agent iteration
branch-narrator snap save "before-refactor"

# Cache stats for performance debugging
branch-narrator cache stats --pretty

# SARIF output for GitHub Code Scanning
branch-narrator facts --format sarif --out results.sarif

# Compare changes since last run (delta mode)
branch-narrator facts --since .ai/baseline.json
```

## Table of Contents

- [Quick Start](#quick-start)
- [Why branch-narrator](#why-branch-narrator)
- [Key Capabilities](#key-capabilities)
- [Documentation](#documentation)
- [CLI Reference](#cli-reference)
- [CI/CD Integration](#cicd-integration)
- [Programmatic API](#programmatic-api)
- [Example Output](#example-output)
- [Development](#development)
- [Contributing](#contributing)
- [Requirements](#requirements)
- [License](#license)

## Why branch-narrator

- Deterministic and offline: no LLMs, no network calls.
- Evidence-based output: summaries and risk flags are tied to diff evidence.
- Profile-aware analysis across frameworks and libraries.
- Output for humans (Markdown) and automation (JSON/SARIF).

## Key Capabilities

### Output Formats
- **Markdown PR descriptions** (`pr-body`) with consistent sections.
- **JSON facts** (`facts`) for pipelines and automation.
- **Prompt-ready diffs** (`dump-diff`) with smart filtering for AI context windows.
- **SARIF output** (`--format sarif`) for GitHub Code Scanning integration.
- **Risk scoring** (`risk-report`) with evidence-backed flags and categories.
- **Workspace snapshots** (`snap`) for saving and comparing workspace state.

### Analysis Features
- Route and API change detection for SvelteKit, Next.js App Router, React Router,
  Vue/Nuxt, Astro, Angular, and Python (FastAPI/Django/Flask).
- Dependency and package surface analysis (semver impact, exports, lockfile
  mismatches).
- Environment variables, security-sensitive files, CI workflows, and
  infrastructure changes.
- Migration safety checks (Supabase and Python migrations, SQL risk patterns).

### Agent Workflows
- **Delta mode** (`--since`) for comparing runs and tracking changes over time.
- **Stable IDs** for deterministic finding/flag references across runs.
- **Snapshot workflows** (`snap`) for saving and restoring workspace state.
- **Drill-down** (`zoom`) for detailed context on specific findings or flags.
- **AI assistant integration** (`integrate`) to generate provider rules for
  Cursor, Claude, Jules, and OpenCode.

## Documentation

Start with the docs index: [`docs/README.md`](docs/README.md). The `docs/`
folder is the source of truth for detailed technical documentation.

Key sections:

- Product overview and roadmap: [`docs/01-product/`](docs/01-product/)
- CLI commands and options: [`docs/05-cli/`](docs/05-cli/)
- Analyzer catalog: [`docs/03-analyzers/`](docs/03-analyzers/)
- Profiles and detection: [`docs/07-profiles/`](docs/07-profiles/)
- Rendering formats and risk scoring: [`docs/08-rendering/`](docs/08-rendering/)
- Stable IDs and traceability: [`docs/09-stable-ids/`](docs/09-stable-ids/)
- Snapshots: [`docs/10-snapshots/`](docs/10-snapshots/)
- Delta mode: [`docs/11-delta-mode/`](docs/11-delta-mode/)
- Development guides: [`docs/06-development/`](docs/06-development/)

See [`CHANGELOG.md`](CHANGELOG.md) for version history and release notes.

## CLI Reference

### Global behavior

- JSON outputs (`facts`, `risk-report --format json`, `dump-diff --format json`)
  write diagnostics to stderr so stdout is parse-safe.
- `--quiet` suppresses non-fatal diagnostics; `--debug` enables timing and
  detector logs.
- `DEBUG=1` prints stack traces for debugging.
- Cache and snapshots are stored under `<cwd>/.branch-narrator/` (current
  working directory), regardless of where the CLI binary is installed.

### Global flags

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress non-fatal diagnostics (warnings, info) |
| `--debug` | Print debug diagnostics to stderr |
| `--no-cache` | Disable caching entirely |
| `--clear-cache` | Clear cache before running |

### Diff modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files (default) | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | All changes vs HEAD (staged + unstaged + untracked) | `git diff HEAD` + `git ls-files --others` |

### Profiles

Use `--profile <name>` to override auto-detection.

| Profile | Description | Auto-detect signals |
|---------|-------------|--------------------|
| `auto` | Default profile selection | Framework detection fallback |
| `sveltekit` | SvelteKit fullstack apps | `src/routes/` or `@sveltejs/kit` |
| `next` | Next.js App Router apps | `next` dependency + `app/` or `src/app/` |
| `react` | React apps using React Router | `react` + `react-router` |
| `vue` | Vue/Nuxt apps | `nuxt` or `vue` + `pages/` |
| `astro` | Astro projects | `astro` dependency or `astro.config.*` |
| `stencil` | StencilJS projects | `@stencil/core` or `stencil.config.*` |
| `angular` | Angular apps | `@angular/core` or `angular.json` |
| `python` | Python apps | `pyproject.toml` or `requirements.txt` |
| `vite` | Vite projects | `vite` dependency or `vite.config.*` |
| `library` | npm packages/libraries | `exports`, `publishConfig`, `bin`, `private: false` |

### Commands

#### pretty

Display a colorized summary of changes in the terminal.

```bash
branch-narrator pretty [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `angular`, `library`, `python`, `vite` |

Examples:

```bash
# Review unstaged changes (default)
branch-narrator pretty

# Compare branches
branch-narrator pretty --mode branch --base develop --head feature/auth

# Review all local changes
branch-narrator pretty --mode all
```

#### pr-body

Generate a raw Markdown PR description.

```bash
branch-narrator pr-body [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `library` |
| `--interactive` | `false` | Prompt for context and test notes |

Examples:

```bash
# Analyze unstaged changes (default)
branch-narrator pr-body

# Compare branches for PR
branch-narrator pr-body --mode branch --base develop --head feature/auth

# Interactive mode (prompts for context)
branch-narrator pr-body --interactive
```

#### facts

Output JSON findings for programmatic use.

```bash
branch-narrator facts [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `library` |
| `--format <type>` | `json` | Output format: `json`, `sarif` |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--redact` | `false` | Redact obvious secrets in evidence |
| `--exclude <glob>` | (none) | Exclude files matching glob (repeatable) |
| `--include <glob>` | (none) | Include only files matching glob (repeatable) |
| `--max-file-bytes <n>` | `1048576` | Max file size to analyze |
| `--max-diff-bytes <n>` | `5242880` | Max diff size to analyze |
| `--max-findings <n>` | (none) | Max findings to include |
| `--out <path>` | (stdout) | Write output to file |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |
| `--since <path>` | (none) | Compare current output to a previous JSON file |
| `--since-strict` | `false` | Exit with code 1 on scope mismatch |

Examples:

```bash
# Analyze unstaged changes (default)
branch-narrator facts

# Compare branches for PR
branch-narrator facts --mode branch --base develop --head feature/auth

# Pretty-printed JSON
branch-narrator facts --pretty

# SARIF output for code scanning
branch-narrator facts --format sarif --out branch-narrator.sarif

# Delta mode
branch-narrator facts --out .ai/baseline.json
branch-narrator facts --since .ai/baseline.json --pretty
```

SARIF output details (rule mappings, schema, limitations) are documented in
[`docs/08-rendering/sarif.md`](docs/08-rendering/sarif.md).
Delta mode details are documented in
[`docs/11-delta-mode/11-delta-mode.md`](docs/11-delta-mode/11-delta-mode.md).

#### dump-diff

Output a prompt-ready git diff with smart exclusions.

```bash
branch-narrator dump-diff [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--no-untracked` | (off) | Exclude untracked files (non-branch modes) |
| `--out <path>` | stdout | Write output to file |
| `--format <type>` | `text` | Output format: `text`, `md`, `json` |
| `--unified <n>` | `0` | Lines of unified context |
| `--include <glob>` | (none) | Include only matching files (repeatable) |
| `--exclude <glob>` | (none) | Additional exclusion globs |
| `--max-chars <n>` | (none) | Chunk output if it exceeds this size |
| `--chunk-dir <path>` | `.ai/diff-chunks` | Directory for chunk files |
| `--name <prefix>` | `diff` | Chunk file name prefix |
| `--dry-run` | `false` | Preview what would be included/excluded |
| `--name-only` | `false` | Output only file list (no diff content) |
| `--stat` | `false` | Output file statistics |
| `--patch-for <path>` | (none) | Output diff for a specific file or folder |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |

Notes:

- `--name-only`, `--stat`, and `--patch-for` are mutually exclusive.
- Default exclusions include lockfiles, build artifacts, sourcemaps, and
  minified files (see docs for the full list).

Examples:

```bash
# Output unstaged changes to stdout (default)
branch-narrator dump-diff

# Compare branches for PR
branch-narrator dump-diff --mode branch --base main --head feature/auth --out .ai/diff.txt

# Chunk large diffs
branch-narrator dump-diff --max-chars 25000 --chunk-dir .ai/diff-chunks

# JSON output with metadata
branch-narrator dump-diff --format json --pretty --out .ai/diff.json
```

#### risk-report

Analyze diffs and emit a risk score with evidence-backed flags.

```bash
branch-narrator risk-report [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--format <type>` | `json` | Output format: `json`, `md`, `text` |
| `--out <path>` | (stdout) | Write output to file |
| `--fail-on-score <n>` | (none) | Exit with code 2 if risk score >= threshold |
| `--only <categories>` | (all) | Only include these categories (comma-separated) |
| `--exclude <categories>` | (none) | Exclude these categories (comma-separated) |
| `--max-evidence-lines <n>` | `5` | Max evidence lines per flag |
| `--redact` | `false` | Redact secret values in evidence |
| `--explain-score` | `false` | Include score breakdown |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |
| `--since <path>` | (none) | Compare current output to a previous JSON file |
| `--since-strict` | `false` | Exit with code 1 on scope mismatch |

Risk levels:

- `low` (0-20)
- `moderate` (21-40)
- `elevated` (41-60)
- `high` (61-80)
- `critical` (81-100)

Examples:

```bash
# Analyze unstaged changes (default)
branch-narrator risk-report

# Markdown format for human review
branch-narrator risk-report --format md

# Fail CI if risk score >= threshold
branch-narrator risk-report --fail-on-score 50

# Delta mode
branch-narrator risk-report --out .ai/baseline-risk.json
branch-narrator risk-report --since .ai/baseline-risk.json --pretty
```

Risk scoring details are documented in
[`docs/08-rendering/risk-scoring.md`](docs/08-rendering/risk-scoring.md).

#### zoom

Zoom into a specific finding or risk flag for detailed context.

```bash
branch-narrator zoom [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--finding <id>` | (none) | Finding ID to zoom into |
| `--flag <id>` | (none) | Flag ID to zoom into |
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `library` |
| `--format <type>` | `json` | Output format: `json`, `md`, `text` |
| `--unified <n>` | `3` | Lines of unified context |
| `--no-patch` | `false` | Exclude patch context (evidence only) |
| `--max-evidence-lines <n>` | `8` | Max evidence excerpt lines |
| `--redact` | `false` | Redact obvious secret values |
| `--out <path>` | stdout | Write output to file |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |

Examples:

```bash
# Zoom into a finding
branch-narrator zoom --finding finding.env-var#abc123

# Zoom into a risk flag
branch-narrator zoom --flag flag.db.destructive_sql#def456 --format md

# Zoom without patch context
branch-narrator zoom --finding finding.dependency-change#c0ffee --no-patch
```

#### integrate

Generate provider-specific rules for AI coding assistants.

```bash
branch-narrator integrate [target] [options]
```

Options:

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview without writing files |
| `--force` | `false` | Overwrite existing files |

Targets:

- `cursor` -> `.cursor/rules/branch-narrator.md` and `.cursor/rules/pr-description.md`
- `jules` -> `AGENTS.md`
- `claude` -> `CLAUDE.md`
- `jules-rules` -> `.jules/rules/branch-narrator.md`
- `opencode` -> `OPENCODE.md` / `.opencode/branch-narrator.md`

When `target` is omitted, `integrate` auto-detects existing guide locations and
applies matching integrations.

Examples:

```bash
branch-narrator integrate cursor
branch-narrator integrate --dry-run
branch-narrator integrate opencode --force
```

#### snap

Manage local workspace snapshots.

```bash
branch-narrator snap <subcommand> [options]
```

Subcommands:

- `snap save [label]` -- Save a snapshot.
  - Options: `--out <path>`
- `snap list` -- List snapshots.
  - Options: `--pretty`
- `snap show <snapshotId>` -- Show snapshot details.
  - Options: `--pretty`
- `snap diff <idA> <idB>` -- Compare two snapshots.
  - Options: `--pretty`
- `snap restore <snapshotId>` -- Restore workspace to a snapshot.

Snapshots are stored under `.branch-narrator/`. Add it to `.gitignore` to keep
snapshots local.

Examples:

```bash
# Save a snapshot
branch-narrator snap save "before-refactor"

# Compare two snapshots
branch-narrator snap diff abc123def456 def456abc789 --pretty
```

### Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Expected failures (not a git repo, invalid refs) |
| `2` | Risk score threshold exceeded (`risk-report --fail-on-score`) |

## CI/CD Integration

### GitHub Actions with SARIF

Upload findings to GitHub Code Scanning:

```yaml
name: Code Analysis

on:
  pull_request:
    branches: [main]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Generate SARIF report
        run: bunx @better-vibe/branch-narrator facts --mode branch --base origin/main --format sarif --out results.sarif

      - name: Upload SARIF to GitHub
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

### Risk Gate

Fail CI if risk score exceeds threshold:

```yaml
- name: Check risk score
  run: branch-narrator risk-report --mode branch --base origin/main --fail-on-score 60
```

## Programmatic API

Use branch-narrator as a library for custom integrations:

```typescript
import {
  collectChangeSet,
  getProfile,
  resolveProfileName,
  runAnalyzersInParallel,
  computeRiskScore,
} from "@better-vibe/branch-narrator";

// Collect git changes
const changeSet = await collectChangeSet({
  mode: "branch",
  base: "main",
  head: "HEAD",
});

// Resolve and run profile analyzers
const profileName = resolveProfileName("auto", changeSet, process.cwd());
const profile = getProfile(profileName);
const findings = await runAnalyzersInParallel(profile.analyzers, changeSet);

// Compute risk
const riskScore = computeRiskScore(findings);

console.log(`Risk: ${riskScore.level} (${riskScore.score}/100)`);
console.log(`Findings: ${findings.length}`);
```

## Example Output

Sample `facts` output (truncated):

```json
{
  "schemaVersion": "2.1",
  "git": {
    "base": "main",
    "head": "HEAD",
    "range": "main..HEAD",
    "mode": "branch"
  },
  "profile": {
    "requested": "auto",
    "detected": "sveltekit",
    "confidence": "high",
    "reasons": ["Found src/routes/ directory (SvelteKit file-based routing)"]
  },
  "stats": {
    "filesChanged": 12,
    "insertions": 245,
    "deletions": 89,
    "skippedFilesCount": 0
  },
  "summary": {
    "byArea": { "routes": 1, "dependencies": 1 },
    "highlights": ["2 route(s) changed"]
  },
  "changeset": {
    "files": {
      "added": ["src/routes/api/users/+server.ts"],
      "modified": ["package.json"],
      "deleted": [],
      "renamed": []
    },
    "warnings": []
  },
  "risk": {
    "score": 35,
    "level": "medium",
    "factors": [
      {
        "kind": "route-added",
        "weight": 5,
        "explanation": "Route added: /api/users",
        "evidence": []
      }
    ]
  },
  "findings": [
    {
      "type": "route-change",
      "findingId": "finding.route-change#a1b2c3d4",
      "routeId": "/api/users",
      "change": "added",
      "routeType": "endpoint",
      "methods": ["GET", "POST"],
      "evidence": [...]
    }
  ]
}
```

See [`docs/04-types/findings.md`](docs/04-types/findings.md) for the complete
schema and all finding types.

## Development

See [`docs/06-development/getting-started.md`](docs/06-development/getting-started.md)
and [`docs/06-development/testing.md`](docs/06-development/testing.md).

Quick commands:

```bash
bun install
bun run test
bun run build
bun run typecheck
```

## Contributing

Contributions are welcome! Please read the development guides before submitting
a pull request:

- [Getting Started](docs/06-development/getting-started.md) - Setup and workflow
- [Coding Standards](docs/06-development/coding-standards.md) - Code style and conventions
- [Testing](docs/06-development/testing.md) - Test requirements

For bug reports and feature requests, please open an issue.

## Requirements

- Node.js >= 18
- Git repository

## License

MIT
