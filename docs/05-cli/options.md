# CLI Options

Detailed documentation for each CLI option.

## --mode

Select the diff mode to use. Available on `pretty`, `pr-body`, `facts`, `dump-diff`, `risk-report`, and `zoom` commands.

```bash
branch-narrator pretty --mode <type>
branch-narrator pr-body --mode <type>
branch-narrator facts --mode <type>
branch-narrator dump-diff --mode <type>
branch-narrator risk-report --mode <type>
branch-narrator zoom --mode <type>
```

| Mode | Description | Git Equivalent |
|------|-------------|----------------|
| `unstaged` | Working tree vs index (default) | `git diff` |
| `branch` | Compare base ref to head ref | `git diff base..head` |
| `staged` | Index vs HEAD | `git diff --staged` |
| `all` | Working tree vs HEAD (includes untracked) | `git diff HEAD` |

**Default:** `unstaged`

**Note:** When using `unstaged`, `staged`, or `all` modes, the `--base` and `--head` options are ignored (a warning is printed to stderr).

---

## --base

Base git reference to compare against. Only used in `branch` mode.

```bash
branch-narrator pretty --mode branch --base <ref>
branch-narrator pr-body --mode branch --base <ref>
branch-narrator facts --mode branch --base <ref>
branch-narrator dump-diff --mode branch --base <ref>
branch-narrator risk-report --mode branch --base <ref>
branch-narrator zoom --mode branch --base <ref>
```

### Values

| Type | Example |
|------|---------|
| Branch | `main`, `develop`, `feature/xyz` |
| Commit SHA | `abc123`, `abc123def456` |
| Tag | `v1.0.0`, `release-2024-01` |
| Relative | `HEAD~5`, `HEAD^` |

### Default

Auto-detected from `refs/remotes/origin/HEAD` (usually `main` or `develop`). Falls back to `main` if detection fails.

---

## --head

Head git reference (your changes). Only used in `branch` mode.

```bash
branch-narrator pr-body --head <ref>
branch-narrator facts --head <ref>
branch-narrator dump-diff --head <ref>
branch-narrator risk-report --head <ref>
branch-narrator zoom --head <ref>
```

Same value types as `--base`.

### Default

`HEAD`

---

## --profile

Specify which analyzer profile to use.

```bash
branch-narrator pretty --profile <name>
branch-narrator pr-body --profile <name>
branch-narrator facts --profile <name>
```

### Values

| Profile | Description |
|---------|-------------|
| `auto` | Auto-detect based on project |
| `sveltekit` | SvelteKit-specific analyzers |
| `next` | Next.js App Router analyzers |
| `react` | React + React Router analyzers |
| `vue` | Vue.js + Vue Router analyzers |
| `astro` | Astro pages and routes analyzers |
| `stencil` | StencilJS component API analyzers |
| `angular` | Angular routes and component API analyzers |
| `library` | npm package/library analyzers (API surface, exports) |
| `python` | Python project analyzers (Django, FastAPI, Flask) |
| `vite` | Vite configuration analyzer set |

### Auto-Detection Logic

1. Check for `src/routes/` directory or `@sveltejs/kit` → SvelteKit
2. Check for `@stencil/core` or `stencil.config.*` → Stencil
3. Check for `next` in package.json with `app/` or `src/app/` → Next.js
4. Check for `react` + `react-router` → React
5. Check for `vue` + Nuxt markers (`pages/`, `src/pages`) → Vue
6. Check for `astro` dependency or `astro.config.*` → Astro
7. Check for `@angular/core` or `angular.json` → Angular
8. Check for `vite` dependency or `vite.config.*` → Vite
9. Check for `exports`/`publishConfig`/`bin` in package.json → Library
10. Check for Python files (pyproject.toml, requirements.txt) → Python
11. Otherwise → Default profile

---

## --interactive

Enable interactive mode with prompts. Only available on `pr-body` command.

```bash
branch-narrator pr-body --interactive
```

### Prompts

1. **Context/Why** - "Context/Why (1-3 sentences, press Enter to skip):"
2. **Test Notes** - "Special manual test notes (press Enter to skip):"

### Output

Responses appear in `## Context` section:

```markdown
## Context

This PR implements user authentication using Supabase Auth.
```

---

## --format

Output format for commands that support alternate renderers.

```bash
branch-narrator facts --format <type>
branch-narrator risk-report --format <type>
branch-narrator dump-diff --format <type>
branch-narrator zoom --format <type>
```

### Formats by Command

| Command | Formats |
|---------|---------|
| `facts` | `json`, `sarif` |
| `risk-report` | `json`, `md`, `text` |
| `dump-diff` | `text`, `md`, `json` |
| `zoom` | `json`, `md`, `text` |

---

## dump-diff Specific Options

The following options are only available on the `dump-diff` command.

### --no-untracked

Exclude untracked files from the diff output.

```bash
branch-narrator dump-diff --mode all --no-untracked
```

By default (without this flag), non-branch modes include untracked files:
- Enumerates untracked files via `git ls-files --others --exclude-standard`
- Applies include/exclude filters to untracked files
- Generates diffs for each untracked file
- In JSON output, untracked files have `"untracked": true`

When `--no-untracked` is specified, untracked files are skipped.

**Default:** Untracked files are included (flag is off)

**Note:** Only applies to non-branch modes (`unstaged`, `staged`, `all`).

---

### --out

Write output to a file instead of stdout.

```bash
branch-narrator dump-diff --out .ai/diff.txt
```

Creates parent directories as needed.

---

### --unified

Number of context lines around changes.

```bash
branch-narrator dump-diff --unified 3
```

**Default:** `0` (minimal output for AI consumption)

---

### --include

Include only files matching glob pattern. Can be repeated.

```bash
branch-narrator dump-diff --include "src/**" --include "tests/**"
```

When specified, default exclusions don't apply to matching files.

---

### --exclude

Additional exclusion globs. Can be repeated.

```bash
branch-narrator dump-diff --exclude "**/generated/**" --exclude "**/vendor/**"
```

Excludes always take priority over includes.

---

### --max-chars

Maximum output size before chunking.

```bash
branch-narrator dump-diff --max-chars 25000
```

When exceeded, output is split into multiple files at file boundaries.

**Note:** Not supported with `--format json` (will error).

---

### --chunk-dir

Directory for chunk files when chunking is needed.

```bash
branch-narrator dump-diff --max-chars 25000 --chunk-dir .ai/chunks
```

**Default:** `.ai/diff-chunks`

---

### --name

Prefix for chunk file names.

```bash
branch-narrator dump-diff --max-chars 25000 --name pr-diff
```

Produces: `pr-diff-001.txt`, `pr-diff-002.txt`, etc.

**Default:** `diff`

---

### --dry-run

Preview what would be included/excluded without writing.

```bash
branch-narrator dump-diff --dry-run
```

Shows file lists, estimated sizes, and chunk counts.

---

## Global Caching Options

These options can be used with any command to control caching behavior.

### --no-cache

Disable caching entirely. The cache will not be read or written.

```bash
branch-narrator --no-cache facts --mode branch
```

**Use cases:**
- Ensure fresh analysis (no cached data)
- Debugging or testing
- When you suspect stale cache data

### --clear-cache

Clear all cache data before running the command.

```bash
branch-narrator --clear-cache facts --mode branch
```

**Use cases:**
- Start fresh after significant changes
- Reset after CLI upgrade
- Clear corrupted cache data

---

## Environment Variables

### DEBUG

Show stack traces on error.

```bash
DEBUG=1 branch-narrator pr-body
```

---

## Combining Options

```bash
# Full example with branch mode
branch-narrator pr-body \
  --base main \
  --head feature/auth \
  --profile sveltekit \
  --interactive

# Using modes for unstaged work
branch-narrator pretty --mode all
branch-narrator facts --mode staged

# dump-diff with all options
branch-narrator dump-diff \
  --mode all \
  --format md \
  --unified 3 \
  --include "src/**" \
  --exclude "**/generated/**" \
  --max-chars 25000 \
  --out .ai/changes.md
```
