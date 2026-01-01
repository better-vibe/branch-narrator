# CLI Commands

branch-narrator provides four commands for different use cases.

## pretty

Display a colorized summary of changes in the terminal. This is the primary command for humans to review changes.

```bash
branch-narrator pretty [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `-u, --uncommitted` | `false` | Include uncommitted changes |
| `--profile <name>` | `auto` | Profile: `auto` or `sveltekit` |

### Features

- Colorized output with risk indicators
- Formatted tables for routes, dependencies, env vars
- Section boxes and visual separators
- Progress spinner during analysis
- File status colors (green=added, red=deleted, cyan=modified)

### Examples

```bash
# Review current branch changes
branch-narrator pretty

# Include uncommitted work
branch-narrator pretty -u

# Compare specific branches
branch-narrator pretty --base develop --head feature/auth
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
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `-u, --uncommitted` | `false` | Include uncommitted changes |
| `--profile <name>` | `auto` | Profile: `auto` or `sveltekit` |
| `--interactive` | `false` | Prompt for context |

### Examples

```bash
# Basic usage
branch-narrator pr-body

# Compare specific branches
branch-narrator pr-body --base develop --head feature/auth

# Include uncommitted changes
branch-narrator pr-body -u

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
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `-u, --uncommitted` | `false` | Include uncommitted changes |
| `--profile <name>` | `auto` | Profile: `auto` or `sveltekit` |

### Examples

```bash
# Basic JSON output
branch-narrator facts

# Include uncommitted changes
branch-narrator facts -u

# Parse with jq
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'

# Get risk level
branch-narrator facts | jq -r '.riskScore.level'
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
| `--base <ref>` | `main` | Base git reference |
| `--head <ref>` | `HEAD` | Head git reference |
| `--out <path>` | stdout | Write output to file |
| `--format <type>` | `text` | Output format: `text`, `md`, or `json` |
| `--unified <n>` | `0` | Lines of unified context |
| `--include <glob>` | (none) | Include only matching files (repeatable) |
| `--exclude <glob>` | (none) | Additional exclusion globs (repeatable) |
| `--max-chars <n>` | (none) | Chunk output if it exceeds this size |
| `--chunk-dir <path>` | `.ai/diff-chunks` | Directory for chunk files |
| `--name <prefix>` | `diff` | Chunk file name prefix |
| `--dry-run` | `false` | Preview what would be included/excluded |

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
# Basic usage - output diff to stdout
branch-narrator dump-diff

# Write to file
branch-narrator dump-diff --out .ai/diff.txt

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
```

### JSON Output Schema

When using `--format json`, the output follows this schema:

```json
{
  "schemaVersion": "1.0",
  "base": "main",
  "head": "HEAD",
  "unified": 0,
  "included": [
    {
      "path": "src/routes/foo/+page.svelte",
      "status": "M",
      "diff": "--- a/src/routes/foo/+page.svelte\n+++ b/src/routes/foo/+page.svelte\n..."
    }
  ],
  "skipped": [
    { "path": "pnpm-lock.yaml", "reason": "excluded-by-default" },
    { "path": "assets/logo.png", "reason": "binary" }
  ],
  "stats": {
    "filesConsidered": 10,
    "filesIncluded": 4,
    "filesSkipped": 6,
    "chars": 12345
  }
}
```

**Note:** JSON format does not support chunking. If output exceeds `--max-chars`, an error is returned.

---

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Expected failure (not a git repo, invalid refs) |

---

## Help

```bash
# Show help
branch-narrator --help
branch-narrator pretty --help
branch-narrator pr-body --help
branch-narrator facts --help
branch-narrator dump-diff --help

# Show version
branch-narrator --version
```
