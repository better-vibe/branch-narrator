# CLI Commands

branch-narrator provides nine commands for different use cases.

## pretty

Display a colorized summary of changes in the terminal. This is the primary command for humans to review changes.

```bash
branch-narrator pretty [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `angular`, `library`, `python`, `vite` |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files - **default** | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | All changes vs HEAD (staged + unstaged + untracked) | `git diff HEAD` + `git ls-files --others` |

### Features

- **Summary Box** with prioritized highlights and detected profile
- **Profile-specific test suggestions** (e.g., `bun run check` for SvelteKit, `bun run build` for library)
- Colorized output with risk indicators
- Formatted tables for routes, dependencies, env vars
- Section boxes and visual separators
- Progress spinner during analysis
- File status colors (green=added, red=deleted, cyan=modified)

### Output Sections

The pretty command renders the following sections when relevant findings are detected:

| Section | Description |
|---------|-------------|
| **Summary** | Diffstat, profile, risk level, review attention (blast radius), and findings by category |
| **Top findings** | Prioritized list of significant findings (max 5 items) with examples |
| **Large changes** | Warning for diffs exceeding 500 lines |
| **What changed** | Files grouped by category with Primary files for small changes; Changesets separated from Documentation |
| **Routes / API** | Route changes with methods and types |
| **Database** | Supabase migrations with risk levels |
| **SQL Risks** | Destructive SQL pattern warnings |
| **Config / Env** | Environment variable changes |
| **Config Changes** | TypeScript, Tailwind, GraphQL, Package Exports, Monorepo config |
| **Stencil Components** | Component API changes (props, events, methods, slots) |
| **Infrastructure** | Docker, Terraform, Kubernetes changes |
| **CI/CD Workflows** | GitHub Actions security warnings |
| **Cloudflare** | Wrangler configuration changes |
| **Dependencies** | Concise overview of package changes (counts by prod/dev, major updates, new/removed packages) |
| **Suggested test plan** | Profile-specific commands with rationales and targeted test suggestions |
| **Notes** | Risk evidence (omitted entirely when risk is low with no evidence) |

**Conditional Rendering:**
- When no changes are detected (empty diff with no findings), the output is a single "No changes detected" line.
- The Notes section is omitted when risk is low and there are no evidence bullets.
- All sections with no relevant findings are automatically omitted.

**Note:** All output is emoji-free for clean, professional terminal output.

### Examples

```bash
# Review unstaged changes (default)
branch-narrator pretty

# Review staged changes only
branch-narrator pretty --mode staged

# Review all local changes (staged + unstaged + untracked)
branch-narrator pretty --mode all

# Compare specific branches
branch-narrator pretty --mode branch --base develop --head feature/auth

# Force library profile for npm packages
branch-narrator pretty --profile library
```

---

## pr-body

Generate a raw Markdown PR description. Use this to create GitHub PR descriptions.

```bash
branch-narrator pr-body [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `angular`, `library`, `python`, `vite` |
| `--interactive` | `false` | Prompt for context |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files - **default** | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | All changes vs HEAD (staged + unstaged + untracked) | `git diff HEAD` + `git ls-files --others` |

### Output Structure

The PR body is organized into compact primary sections with extended information in a collapsible Details block:

**No-Changes Short-Circuit:**

When no changes are detected (empty diff with no findings and no interactive context), the output is a single line:
```
No changes detected.
```
(Plus the hidden metadata comment.)

**Primary Sections:**

| Section | Description |
|---------|-------------|
| **Summary** | Diffstat, review attention, and key highlights |
| **Top findings** | Prioritized list of significant findings (max 5 items) |
| **What changed** | Files grouped by category with Primary files for small changes |
| **Dependencies** | Concise overview of package changes (counts by prod/dev, major updates, new/removed packages) |
| **Suggested test plan** | Profile-specific commands with rationales |
| **Notes** | Risk level and evidence bullets (omitted when low risk with no evidence) |

**Details Block (collapsible):**

Extended information is placed in a `<details>` block for reviewer convenience:

- Impact Analysis (high/medium blast radius only, capped at 5 entries with 3 dependents each)
- Routes / API tables
- API Contracts
- GraphQL Schema changes
- Database migrations
- SQL Risks
- Config / Env tables
- Configuration Changes (TypeScript, Tailwind, Vite, Monorepo)
- Cloudflare changes
- Dependencies tables (full version details)
- Package API exports
- Component API (Stencil, Angular)
- CI / Infrastructure
- Security-Sensitive Files
- Convention Violations
- Warnings

**Conditional Rendering:**
- Sections with no relevant findings are automatically omitted.
- The Notes section is skipped when risk is low and there are no evidence bullets.
- The Details block is only rendered if there is extended content to show.
- Impact Analysis only shows high and medium blast radius entries (low is omitted).

**Note:** All output is emoji-free for clean, professional PR descriptions.

### Examples

```bash
# Analyze unstaged changes (default)
branch-narrator pr-body

# Compare branches for PR
branch-narrator pr-body --mode branch --base develop --head feature/auth

# Analyze staged changes only
branch-narrator pr-body --mode staged

# Interactive mode
branch-narrator pr-body --interactive

# Force SvelteKit profile
branch-narrator pr-body --profile sveltekit

# Pipe to clipboard (macOS)
branch-narrator pr-body | pbcopy
```

---

## facts

Output JSON findings for programmatic use. Pipe to other tools like `jq`.

```bash
branch-narrator facts [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `angular`, `library`, `python`, `vite` |
| `--format <type>` | `json` | Output format: `json`, `sarif` |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--redact` | `false` | Redact obvious secret values in evidence excerpts |
| `--exclude <glob>` | (none) | Additional exclusion glob (repeatable) |
| `--include <glob>` | (none) | Include only files matching glob (repeatable) |
| `--max-file-bytes <n>` | `1048576` | Maximum file size in bytes to analyze |
| `--max-diff-bytes <n>` | `5242880` | Maximum diff size in bytes to analyze |
| `--max-findings <n>` | (none) | Maximum number of findings to include |
| `--out <path>` | (stdout) | Write output to file instead of stdout |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |
| `--since <path>` | (none) | Compare current output to a previous JSON file |
| `--since-strict` | `false` | Exit with code 1 on scope/tool/schema mismatch |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files - **default** | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | All changes vs HEAD (staged + unstaged + untracked) | `git diff HEAD` + `git ls-files --others` |

### Examples

```bash
# Analyze unstaged changes (default)
branch-narrator facts

# Compare branches for PR
branch-narrator facts --mode branch --base develop --head feature/auth

# Analyze staged changes
branch-narrator facts --mode staged

# Analyze all local changes
branch-narrator facts --mode all

# Parse with jq
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'

# Get risk level
branch-narrator facts | jq -r '.risk.level'

# Write to file
branch-narrator facts --out facts.json

# Pretty-print JSON
branch-narrator facts --pretty

# Deterministic output (omit timestamp)
branch-narrator facts --no-timestamp

# Compare to previous run (delta mode)
branch-narrator facts --out .ai/prev-facts.json
# ... make code changes ...
branch-narrator facts --since .ai/prev-facts.json

# Strict delta mode (fail on scope mismatch)
branch-narrator facts --since .ai/prev-facts.json --since-strict
```

### Delta Mode (`--since`)

When `--since <path>` is provided, the output is a **delta** instead of the full facts output. This is useful for iteration loops where you want to see what changed since your last run.

#### Delta Output Schema

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-01-06T12:00:00.000Z",
  "command": {
    "name": "facts",
    "args": ["--mode", "unstaged", "--since", ".ai/prev-facts.json"]
  },
  "since": {
    "path": ".ai/prev-facts.json",
    "schemaVersion": "1.0"
  },
  "current": {
    "schemaVersion": "1.0"
  },
  "scope": {
    "mode": "unstaged",
    "base": null,
    "head": null,
    "profile": "auto",
    "include": [],
    "exclude": []
  },
  "warnings": [
    {
      "code": "scope-mismatch",
      "message": "Previous run used profile=sveltekit, current is profile=auto"
    }
  ],
  "delta": {
    "added": ["finding.env-var#abc123", "finding.route-change#def456"],
    "removed": ["finding.db-migration#789xyz"],
    "changed": [
      {
        "findingId": "finding.dependency-change#c0ffee",
        "before": { "...": "previous finding object..." },
        "after": { "...": "current finding object..." }
      }
    ]
  },
  "summary": {
    "addedCount": 2,
    "removedCount": 1,
    "changedCount": 1
  }
}
```

#### Scope Mismatch Warnings

Delta mode compares scope metadata (mode, base, head, profile, filters) between runs. If they differ, warnings are included in the output. Use `--since-strict` to exit with code 1 on mismatch instead of continuing with warnings.

#### Example Workflow

```bash
# 1. Save baseline
branch-narrator facts --out .ai/baseline.json

# 2. Make code changes...
# (edit files)

# 3. Compare to baseline
branch-narrator facts --since .ai/baseline.json --pretty

# Output shows only added/removed/changed findings
```

---

## dump-diff

Output a prompt-ready git diff with smart exclusions. Designed for AI agents.

```bash
branch-narrator dump-diff [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--no-untracked` | (off) | Exclude untracked files (non-branch modes) |
| `--out <path>` | stdout | Write output to file |
| `--format <type>` | `text` | Output format: `text`, `md`, or `json` |
| `--unified <n>` | `0` | Lines of unified context |
| `--include <glob>` | (none) | Include only matching files (repeatable) |
| `--exclude <glob>` | (none) | Additional exclusion globs (repeatable) |
| `--max-chars <n>` | (none) | Chunk output if it exceeds this size |
| `--chunk-dir <path>` | `.ai/diff-chunks` | Directory for chunk files |
| `--name <prefix>` | `diff` | Chunk file name prefix |
| `--dry-run` | `false` | Preview what would be included/excluded |
| `--name-only` | `false` | Output only file list (no diff content) |
| `--stat` | `false` | Output file statistics (additions/deletions) |
| `--patch-for <path>` | (none) | Output diff for a specific file or folder |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |

**Note:** `--name-only`, `--stat`, and `--patch-for` are mutually exclusive.

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files - **default** | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | Working tree vs HEAD (all local changes) | `git diff HEAD` |

### Default Exclusions

The following patterns are excluded by default (unless `--include` overrides):

- Lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`
- Type declarations: `*.d.ts`
- Logs: `*.log`, `*.logs`
- Build/cache: `dist/`, `build/`, `.svelte-kit/`, `.next/`, `.turbo/`, `coverage/`, `.cache/`
- Minified: `*.min.*`
- Sourcemaps: `*.map`
- Binary files (detected automatically)

### Examples

```bash
# Output unstaged changes to stdout (default)
branch-narrator dump-diff

# Write to file
branch-narrator dump-diff --out .ai/diff.txt

# Compare branches for PR
branch-narrator dump-diff --mode branch --base main --head feature/auth --out .ai/diff.txt

# Staged changes only
branch-narrator dump-diff --mode staged --format md --out .ai/staged.md

# Everything since HEAD (untracked included by default)
branch-narrator dump-diff --mode all \
  --max-chars 25000 --chunk-dir .ai/diff-chunks

# Exclude untracked files
branch-narrator dump-diff --mode all --no-untracked

# Markdown format with header
branch-narrator dump-diff --format md --out .ai/diff.md

# JSON format for programmatic use
branch-narrator dump-diff --format json --out .ai/diff.json

# Chunk large diffs
branch-narrator dump-diff --max-chars 25000 --chunk-dir .ai/diff-chunks

# Include only specific files
branch-narrator dump-diff --include "src/**" --include "tests/**"

# Exclude additional patterns
branch-narrator dump-diff --exclude "**/generated/**"

# Preview without writing
branch-narrator dump-diff --dry-run

# More context lines
branch-narrator dump-diff --unified 3

# Agent workflows - list files first
branch-narrator dump-diff --name-only --format json > files.json

# Agent workflows - get stats for all files
branch-narrator dump-diff --stat --format json > stats.json

# Agent workflows - retrieve specific file diff
branch-narrator dump-diff --patch-for src/index.ts --format json --unified 3

# Agent workflows - get structured hunks for a file
branch-narrator dump-diff --patch-for src/app.ts --format json

# Agent workflows - get diffs for all changed files in a folder
branch-narrator dump-diff --patch-for src/ --format json

# Markdown table of file statistics
branch-narrator dump-diff --stat --format md

# Plain text file list
branch-narrator dump-diff --name-only

# Pretty-print JSON output
branch-narrator dump-diff --format json --pretty

# Deterministic output (omit timestamp)
branch-narrator dump-diff --format json --no-timestamp
```

### JSON Output Schema (v2.0)

All `--format json` output uses a unified schema v2.0, regardless of which flags are used:

```json
{
  "schemaVersion": "2.0",
  "generatedAt": "2026-01-05T12:34:56.789Z",
  "command": {
    "name": "dump-diff",
    "args": ["--mode", "branch", "--base", "main", "--head", "HEAD", "--format", "json"]
  },
  "git": {
    "mode": "branch",
    "base": "main",
    "head": "HEAD",
    "isDirty": false
  },
  "options": {
    "unified": 0,
    "include": [],
    "exclude": [],
    "includeUntracked": true,
    "nameOnly": false,
    "stat": false,
    "patchFor": null
  },
  "files": [
    {
      "path": "src/index.ts",
      "status": "M",
      "stats": { "added": 10, "removed": 5 },
      "patch": {
        "text": "diff --git a/src/index.ts b/src/index.ts\n..."
      }
    }
  ],
  "skippedFiles": [
    {
      "path": "pnpm-lock.yaml",
      "status": "M",
      "reason": "excluded-by-default"
    }
  ],
  "summary": {
    "changedFileCount": 5,
    "includedFileCount": 4,
    "skippedFileCount": 1
  }
}
```

**Schema v2.0 fields:**
- `schemaVersion`: Always `"2.0"`
- `generatedAt`: ISO timestamp (omitted when `--no-timestamp` is used)
- `command`: Command metadata (name and args)
- `git`: Git context
  - `mode`: Diff mode used
  - `base`: Base ref (`null` for non-branch modes)
  - `head`: Head ref (`null` for non-branch modes)
  - `isDirty`: `true` for unstaged/staged/all modes, `false` for branch mode
- `options`: Options used for this run
- `files`: Array of changed files
- `skippedFiles`: Array of excluded files with reasons
- `summary`: Aggregated counts

**File object fields:**
- `path`: Current file path
- `oldPath`: Previous path (for renames, otherwise omitted)
- `status`: File status (`A`, `M`, `D`, `R`, `C`, `T`, `U`, `?`)
- `untracked`: `true` for untracked files (omitted if false)
- `binary`: `true` if file is binary (omitted if false)
- `stats`: `{ added, removed }` - present with `--stat` or `--patch-for`
- `patch`: Diff content object (see below)

**Patch object (varies by mode):**
- Default full diff: `{ "text": "..." }` - raw diff text
- `--name-only`: `patch` field is omitted
- `--stat`: `patch` field is omitted
- `--patch-for`: `{ "text": "...", "hunks": [...] }` - includes structured hunks

**Hunk object (only with `--patch-for`):**
- `header`: Hunk header line (e.g., `@@ -1,4 +1,6 @@`)
- `oldStart`, `oldLines`: Old file position/length
- `newStart`, `newLines`: New file position/length
- `lines`: Array of diff lines

**Line object:**
- `kind`: `"add"`, `"del"`, or `"context"`
- `text`: Full line text (includes `+`, `-`, or space prefix)

**Skip reasons:**
- `excluded-by-default`: File matches a default exclusion pattern (lockfiles, build artifacts, etc.)
- `excluded-by-glob`: File matches a user-provided `--exclude` pattern
- `binary`: File is detected as binary
- `not-included`: File does not match any `--include` pattern (when includes are specified)
- `diff-empty`: Diff generation returned empty content (protects agents from blind spots)

**Notes:**
- JSON format does not support chunking. If output exceeds `--max-chars`, an error is returned.
- For non-branch modes, `git.base` and `git.head` are `null`.
- `untracked: true` is set for untracked files (included by default in non-branch modes).

---

## risk-report

Analyze git diff and emit a risk score (0-100) with evidence-backed flags.

```bash
branch-narrator risk-report [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--format <type>` | `json` | Output format: `json`, `md`, or `text` |
| `--out <path>` | (stdout) | Write output to file instead of stdout |
| `--fail-on-score <n>` | (none) | Exit with code 2 if risk score >= threshold |
| `--only <categories>` | (all) | Only include these categories (comma-separated) |
| `--exclude <categories>` | (none) | Exclude these categories (comma-separated) |
| `--max-evidence-lines <n>` | `5` | Max evidence lines per flag |
| `--redact` | `false` | Redact secret values in evidence |
| `--explain-score` | `false` | Include score breakdown in output |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |
| `--since <path>` | (none) | Compare current output to a previous JSON file |
| `--since-strict` | `false` | Exit with code 1 on scope/tool/schema mismatch |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files - **default** | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | All changes vs HEAD (staged + unstaged + untracked) | `git diff HEAD` + `git ls-files --others` |

### Examples

```bash
# Analyze unstaged changes (default)
branch-narrator risk-report

# Compare branches for PR
branch-narrator risk-report --mode branch --base develop --head feature/auth

# Analyze staged changes
branch-narrator risk-report --mode staged

# Analyze all local changes
branch-narrator risk-report --mode all

# Use Markdown format
branch-narrator risk-report --format md

# Use text format
branch-narrator risk-report --format text

# Write to file
branch-narrator risk-report --out risk-report.json

# Fail CI if risk score is too high
branch-narrator risk-report --fail-on-score 50

# Only analyze security and database categories
branch-narrator risk-report --only security,db

# Exclude tests category
branch-narrator risk-report --exclude tests

# Redact secrets in evidence
branch-narrator risk-report --redact

# Include score breakdown
branch-narrator risk-report --explain-score

# Pretty-print JSON output
branch-narrator risk-report --pretty

# Deterministic output (omit timestamp)
branch-narrator risk-report --no-timestamp

# Compare to previous run (delta mode)
branch-narrator risk-report --out .ai/prev-risk.json
# ... make code changes ...
branch-narrator risk-report --since .ai/prev-risk.json

# Strict delta mode (fail on scope mismatch)
branch-narrator risk-report --since .ai/prev-risk.json --since-strict
```

### Delta Mode (`--since`)

When `--since <path>` is provided, the output is a **delta** instead of the full risk report. The delta shows:

- Risk score change (from → to)
- Added flags (by ID)
- Removed flags (by ID)
- Changed flags (before/after objects)

**Note:** `--since` only supports JSON format. Using `--format md` or `--format text` with `--since` will result in an error.

#### Delta Output Schema

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-01-06T12:00:00.000Z",
  "command": {
    "name": "risk-report",
    "args": ["--mode", "unstaged", "--since", ".ai/prev-risk.json"]
  },
  "since": {
    "path": ".ai/prev-risk.json",
    "schemaVersion": "2.0"
  },
  "current": {
    "schemaVersion": "2.0"
  },
  "scope": {
    "mode": "unstaged",
    "base": null,
    "head": null,
    "only": null,
    "exclude": null
  },
  "delta": {
    "riskScore": {
      "from": 62,
      "to": 40,
      "delta": -22
    },
    "flags": {
      "added": ["flag.ci.pipeline_changed#abc123"],
      "removed": ["flag.db.destructive_sql#def456"],
      "changed": [
        {
          "flagId": "flag.deps.major_version_bump#789xyz",
          "before": { "...": "previous flag object..." },
          "after": { "...": "current flag object..." }
        }
      ]
    }
  },
  "summary": {
    "flagAddedCount": 1,
    "flagRemovedCount": 1,
    "flagChangedCount": 1
  }
}
```

#### Example Workflow

```bash
# 1. Save baseline
branch-narrator risk-report --out .ai/baseline-risk.json

# 2. Make code changes to address risks...
# (edit files)

# 3. Compare to baseline
branch-narrator risk-report --since .ai/baseline-risk.json --pretty

# Output shows:
# - Risk score change (hopefully lower!)
# - Which flags were resolved (removed)
# - Which new flags appeared (added)
# - Which flags changed
```

---

## zoom

Zoom into a specific finding or flag for detailed, targeted context. Designed for interactive AI agent loops.

```bash
branch-narrator zoom [options]
```

### Required Selector (exactly one)

Either `--finding <id>` or `--flag <id>` must be provided.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--finding <id>` | (none) | Finding ID to zoom into |
| `--flag <id>` | (none) | Flag ID to zoom into |
| `--mode <type>` | `unstaged` | Diff mode: `branch`, `unstaged`, `staged`, `all` |
| `--base <ref>` | auto-detected | Base git reference (branch mode only; auto-detected from remote HEAD, falls back to `main`) |
| `--head <ref>` | `HEAD` | Head git reference (branch mode only) |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, `next`, `react`, `vue`, `astro`, `stencil`, `angular`, `library`, `python`, `vite` |
| `--format <type>` | `json` | Output format: `json`, `md`, or `text` |
| `--unified <n>` | `3` | Lines of unified context for patch hunks |
| `--no-patch` | (off) | Do not include patch context, only evidence |
| `--max-evidence-lines <n>` | `8` | Max evidence excerpt lines to show |
| `--redact` | `false` | Redact obvious secret values in evidence excerpts |
| `--out <path>` | (stdout) | Write output to file instead of stdout |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index + untracked files - **default** | `git diff` + `git ls-files --others` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | All changes vs HEAD (staged + unstaged + untracked) | `git diff HEAD` + `git ls-files --others` |

### Workflow

The typical workflow for using `zoom` is:

1. Run `facts` or `risk-report` to get all findings or flags
2. Extract a specific `findingId` or `flagId` from the output
3. Run `zoom` with that ID to get detailed context for just that item

### Examples

```bash
# First, get available findings
branch-narrator facts --format json > facts.json

# Extract a finding ID (e.g., from jq)
FINDING_ID=$(cat facts.json | jq -r '.findings[0].findingId')

# Zoom into that specific finding (Markdown format)
branch-narrator zoom --finding "$FINDING_ID" --mode unstaged

# Zoom into a finding with JSON output
branch-narrator zoom --finding "finding.env-var#abc123def456" --format json --pretty

# Zoom into a finding without patch context (evidence only)
branch-narrator zoom --finding "finding.dependency-change#xyz789" --no-patch

# Zoom into a finding with redacted secrets
branch-narrator zoom --finding "finding.env-var#abc123" --redact

# Get a risk flag from risk-report
branch-narrator risk-report --format json > risk.json
FLAG_ID=$(cat risk.json | jq -r '.flags[0].flagId')

# Zoom into that specific flag
branch-narrator zoom --flag "$FLAG_ID" --format md

# Zoom into a flag in a branch comparison
branch-narrator zoom --flag "flag.security.workflow_permissions_broadened#def789" \
  --mode branch --base main --head feature/ci

# Write zoom output to file
branch-narrator zoom --finding "finding.route-change#abc123" --out zoom-output.md

# Deterministic output for testing
branch-narrator zoom --finding "finding.ci-workflow#xyz789" --no-timestamp --format json

# Text format for simple terminal output
branch-narrator zoom --finding "finding.sql-risk#abc456" --format text
```

### Output Formats

#### JSON Format

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-01-06T12:00:00.000Z",
  "range": {
    "base": "main",
    "head": "HEAD",
    "mode": "branch"
  },
  "itemType": "finding",
  "findingId": "finding.env-var#abc123def456",
  "finding": {
    "type": "env-var",
    "kind": "env-var",
    "category": "config_env",
    "confidence": "high",
    "evidence": [...],
    "name": "API_KEY",
    "change": "added",
    "evidenceFiles": ["src/config.ts"]
  },
  "evidence": [
    {
      "file": "src/config.ts",
      "excerpt": "const API_KEY = process.env.API_KEY;",
      "line": 5
    }
  ],
  "patchContext": [
    {
      "file": "src/config.ts",
      "status": "modified",
      "hunks": [
        {
          "oldStart": 1,
          "oldLines": 3,
          "newStart": 1,
          "newLines": 4,
          "content": "..."
        }
      ]
    }
  ]
}
```

#### Markdown Format

```markdown
# Finding: finding.env-var#abc123def456

**Type:** env-var
**Category:** config_env
**Confidence:** high

**Range:** main..HEAD

## Details

[JSON representation of the finding]

## Evidence

### src/config.ts
Line 5

const API_KEY = process.env.API_KEY;

## Patch Context

### src/config.ts (modified)

[diff hunks]
```

#### Text Format

Plain text output optimized for terminal display, similar to Markdown but without formatting.

### Use Cases

- **AI Agent Iteration**: Agent runs `facts`, sees a concerning finding, zooms in for details
- **CI/CD Integration**: Investigate specific high-risk flags in automated workflows
- **Developer Workflow**: Quick drill-down on specific changes without full diff noise
- **Debugging**: Isolate context for a particular finding or flag

---

## integrate

Generate provider-specific rules for AI coding assistants. If no target is
provided, the command auto-detects existing agent guides and integrates all
matches.

```bash
branch-narrator integrate [target] [options]
```

### Auto-detect behavior

When `target` is omitted, `integrate` scans for existing guide locations:

- `.cursor/rules/`
- `AGENTS.md`
- `CLAUDE.md`
- `.jules/`
- `OPENCODE.md`, `opencode.md`
- `.opencode/`

If none are found, the command logs a message with the available targets.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview what would be written without creating files |
| `--force` | `false` | Overwrite existing files |

### Targets

| Target | Description |
|--------|-------------|
| `cursor` | Generates `.cursor/rules/branch-narrator.md` and `.cursor/rules/pr-description.md` |
| `jules` | Appends a Branch Narrator section to `AGENTS.md` |
| `claude` | Appends a Branch Narrator section to `CLAUDE.md` |
| `jules-rules` | Generates `.jules/rules/branch-narrator.md` |
| `opencode` | Appends a Branch Narrator section to `OPENCODE.md` (or `opencode.md`); uses `.opencode/branch-narrator.md` if `.opencode/` exists |

### Examples

```bash
# Auto-detect existing guides
branch-narrator integrate

# Generate Cursor rules
branch-narrator integrate cursor

# Add to CLAUDE.md
branch-narrator integrate claude

# Add to OPENCODE.md
branch-narrator integrate opencode

# Preview without writing
branch-narrator integrate cursor --dry-run

# Overwrite existing rules
branch-narrator integrate cursor --force
```

---

## snap

Manage local workspace snapshots for agent iteration. Snapshots capture the full
workspace state (staged + unstaged + untracked) and embed analysis artifacts for
comparison and rollback.

```bash
branch-narrator snap <subcommand> [options]
```

### Subcommands

#### snap save [label]

Create a new snapshot of the current workspace state.

```bash
branch-narrator snap save [label] [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--out <path>` | (stdout) | Write snapshotId to file instead of stdout |

**Output:** Prints the snapshot ID (12 hex characters) to stdout.

```bash
# Create snapshot with auto-generated label
branch-narrator snap save

# Create snapshot with custom label
branch-narrator snap save "before-refactor"

# Write snapshot ID to file for scripting
branch-narrator snap save --out .ai/current-snapshot.txt
```

#### snap list

List all snapshots with summary information.

```bash
branch-narrator snap list [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |

**Output:** JSON object with snapshot index.

```bash
# List all snapshots
branch-narrator snap list

# Pretty-print output
branch-narrator snap list --pretty
```

#### snap show <snapshotId>

Show the full details of a specific snapshot.

```bash
branch-narrator snap show <snapshotId> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |

**Output:** Full snapshot.json content including embedded analysis.

```bash
# Show snapshot details
branch-narrator snap show abc123def456

# Pretty-print output
branch-narrator snap show abc123def456 --pretty
```

#### snap diff <idA> <idB>

Compare two snapshots and output a delta.

```bash
branch-narrator snap diff <idA> <idB> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |

**Output:** JSON delta with findings/flags/files changes and risk score delta.

```bash
# Compare two snapshots
branch-narrator snap diff abc123 def456

# Pretty-print output
branch-narrator snap diff abc123 def456 --pretty
```

#### snap restore <snapshotId>

Restore the workspace to match a snapshot exactly.

```bash
branch-narrator snap restore <snapshotId>
```

**Safety:** Before restoring, automatically creates a backup snapshot named
`auto/pre-restore/<timestamp>` so the current state can always be recovered.

**Requirements:** HEAD must match the snapshot's `headSha`. Snapshots can only
be restored when on the same commit.

```bash
# Restore to a previous snapshot
branch-narrator snap restore abc123def456
```

### Storage Location

All snapshot data is stored under `.branch-narrator/snapshots/`:

```
.branch-narrator/
  snapshots/
    index.json
    <snapshotId>/
      snapshot.json
      staged.patch
      unstaged.patch
      untracked/
        manifest.json
        blobs/
```

**Important:** Add `.branch-narrator/` to your `.gitignore` file. Snapshots
contain local workspace state and should not be committed.

### Agent Workflow Example

```bash
# 1. Save initial state
INITIAL=$(branch-narrator snap save "before-changes")

# 2. Make changes...

# 3. Save progress
ATTEMPT1=$(branch-narrator snap save "attempt-1")

# 4. Compare to see what changed
branch-narrator snap diff $INITIAL $ATTEMPT1 --pretty

# 5. If regression detected, restore initial state
branch-narrator snap restore $INITIAL

# 6. Pre-restore backup is available in snap list
branch-narrator snap list
```

See [Snapshots Documentation](../10-snapshots/overview.md) for detailed information.

---

## cache

Manage the project-local cache system (`<cwd>/.branch-narrator/cache/`).

`which branch-narrator` reports where the executable is installed, not where this cache is stored.

```bash
branch-narrator cache <subcommand> [options]
```

### Subcommands

#### cache stats

Show cache statistics including cache location, hit/miss counts, and size.

```bash
branch-narrator cache stats [--pretty]
```

| Option | Description |
|--------|-------------|
| `--pretty` | Pretty-print JSON with 2-space indentation |

**Example output:**

```json
{
  "location": "/path/to/repo/.branch-narrator/cache",
  "hits": 42,
  "misses": 8,
  "hitRate": 84,
  "entries": 15,
  "sizeBytes": 125432,
  "sizeHuman": "122.5 KB",
  "oldestEntry": "2024-01-15T10:30:00Z",
  "newestEntry": "2024-01-20T14:22:00Z"
}
```

#### cache clear

Remove all cache data.

```bash
branch-narrator cache clear
```

#### cache prune

Remove cache entries older than the specified number of days.

```bash
branch-narrator cache prune [--max-age <days>] [--pretty]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--max-age <days>` | `30` | Maximum age in days |
| `--pretty` | `false` | Pretty-print JSON output |

### Global Cache Flags

These flags can be used with any command:

| Flag | Description |
|------|-------------|
| `--no-cache` | Disable caching entirely (bypass lookup and don't store) |
| `--clear-cache` | Clear the cache before running the command |

### Examples

```bash
# Check cache status
branch-narrator cache stats --pretty

# Clear all cache data
branch-narrator cache clear

# Prune entries older than 7 days
branch-narrator cache prune --max-age 7

# Run facts without using cache
branch-narrator --no-cache facts --mode branch

# Clear cache before running facts
branch-narrator --clear-cache facts --mode branch
```

See [Caching Documentation](../12-caching/overview.md) for detailed information.

---

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Expected failure (not a git repo, invalid refs) |
| `2` | Risk threshold exceeded (`--fail-on-score` in `risk-report`) |

---

## Help

```bash
# Show help
branch-narrator --help
branch-narrator pretty --help
branch-narrator pr-body --help
branch-narrator facts --help
branch-narrator dump-diff --help
branch-narrator risk-report --help
branch-narrator zoom --help
branch-narrator integrate --help
branch-narrator snap --help
branch-narrator snap save --help
branch-narrator snap list --help
branch-narrator snap show --help
branch-narrator snap diff --help
branch-narrator snap restore --help
branch-narrator cache --help
branch-narrator cache stats --help
branch-narrator cache clear --help
branch-narrator cache prune --help

# Show version
branch-narrator --version
```
