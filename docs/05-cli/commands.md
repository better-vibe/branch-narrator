# CLI Commands

branch-narrator provides five commands for different use cases.

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
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, or `react` |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index (uncommitted) - **default** | `git diff` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | Working tree vs HEAD (all uncommitted + untracked) | `git diff HEAD` |

### Features

- Colorized output with risk indicators
- Formatted tables for routes, dependencies, env vars
- Section boxes and visual separators
- Progress spinner during analysis
- File status colors (green=added, red=deleted, cyan=modified)

### Examples

```bash
# Review unstaged changes (default)
branch-narrator pretty

# Review staged changes only
branch-narrator pretty --mode staged

# Review all uncommitted changes (staged + unstaged + untracked)
branch-narrator pretty --mode all

# Compare specific branches
branch-narrator pretty --mode branch --base develop --head feature/auth
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
| `-u, --uncommitted` | `false` | **[DEPRECATED]** Use `--mode unstaged` instead |
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, or `react` |
| `--interactive` | `false` | Prompt for context |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index (uncommitted) - **default** | `git diff` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | Working tree vs HEAD (all uncommitted + untracked) | `git diff HEAD` |

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
| `--profile <name>` | `auto` | Profile: `auto`, `sveltekit`, or `react` |
| `--format <type>` | `json` | Output format: `json` |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--redact` | `false` | Redact obvious secret values in evidence excerpts |
| `--exclude <glob>` | (none) | Additional exclusion glob (repeatable) |
| `--include <glob>` | (none) | Include only files matching glob (repeatable) |
| `--max-file-bytes <n>` | `1048576` | Maximum file size in bytes to analyze |
| `--max-diff-bytes <n>` | `5242880` | Maximum diff size in bytes to analyze |
| `--max-findings <n>` | (none) | Maximum number of findings to include |
| `--out <path>` | (stdout) | Write output to file instead of stdout |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index (uncommitted) - **default** | `git diff` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | Working tree vs HEAD (all uncommitted + untracked) | `git diff HEAD` |

### Examples

```bash
# Analyze unstaged changes (default)
branch-narrator facts

# Compare branches for PR
branch-narrator facts --mode branch --base develop --head feature/auth

# Analyze staged changes
branch-narrator facts --mode staged

# Analyze all uncommitted changes
branch-narrator facts --mode all

# Parse with jq
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'

# Get risk level
branch-narrator facts | jq -r '.riskScore.level'

# Write to file
branch-narrator facts --out facts.json

# Pretty-print JSON
branch-narrator facts --pretty

# Deterministic output (omit timestamp)
branch-narrator facts --no-timestamp
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
| `--patch-for <path>` | (none) | Output diff for a specific file only |
| `--pretty` | `false` | Pretty-print JSON with 2-space indentation |
| `--no-timestamp` | `false` | Omit `generatedAt` for deterministic output |

**Note:** `--name-only`, `--stat`, and `--patch-for` are mutually exclusive.

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index (uncommitted) - **default** | `git diff` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | Working tree vs HEAD (all uncommitted) | `git diff HEAD` |

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

### Diff Modes

| Mode | Description | Git Command |
|------|-------------|-------------|
| `unstaged` | Working tree vs index (uncommitted) - **default** | `git diff` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD (staged changes) | `git diff --staged` |
| `all` | Working tree vs HEAD (all uncommitted + untracked) | `git diff HEAD` |

### Examples

```bash
# Analyze unstaged changes (default)
branch-narrator risk-report

# Compare branches for PR
branch-narrator risk-report --mode branch --base develop --head feature/auth

# Analyze staged changes
branch-narrator risk-report --mode staged

# Analyze all uncommitted changes
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
```

---

## integrate

Generate provider-specific rules for AI coding assistants (e.g., Cursor, Jules).

```bash
branch-narrator integrate <target> [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview what would be written without creating files |
| `--force` | `false` | Overwrite existing files |

### Targets

| Target | Description |
|--------|-------------|
| `cursor` | Generates `.cursor/rules/branch-narrator.md` and `.cursor/rules/pr-description.md` |
| `jules` | Generates `.jules/rules/branch-narrator.md` |

### Examples

```bash
# Generate Cursor rules
branch-narrator integrate cursor

# Preview without writing
branch-narrator integrate cursor --dry-run

# Overwrite existing rules
branch-narrator integrate cursor --force
```

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

# Show version
branch-narrator --version
```
