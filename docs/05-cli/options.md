# CLI Options

Detailed documentation for each CLI option.

## --mode

Select the diff mode to use. Available on `pretty`, `facts`, and `dump-diff` commands.

```bash
branch-narrator pretty --mode <type>
branch-narrator facts --mode <type>
branch-narrator dump-diff --mode <type>
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
| `library` | npm package/library analyzers (API surface, exports) |
| `python` | Python project analyzers (Django, FastAPI, Flask) |

### Auto-Detection Logic

1. Check for `src/routes/` directory → SvelteKit
2. Check for `@sveltejs/kit` in package.json → SvelteKit
3. Check for `@stencil/core` or `stencil.config.*` → Stencil
4. Check for `next` in package.json with `app/` directory → Next.js
5. Check for `react` + `react-router-dom` → React
6. Check for `vue` + Nuxt markers → Vue
7. Check for `astro` in package.json → Astro
8. Check for `exports`/`publishConfig`/`bin` in package.json → Library
9. Check for Python files (pyproject.toml, requirements.txt) → Python
10. Otherwise → Default profile

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

### --format

Output format for the diff.

```bash
branch-narrator dump-diff --format <type>
```

| Format | Description |
|--------|-------------|
| `text` | Raw unified diff (default) |
| `md` | Markdown with fenced code block and header |
| `json` | Machine-readable JSON with metadata |

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

## --test-parity

Enable test parity checking. Available on `facts` and `risk-report` commands.

```bash
branch-narrator facts --mode branch --base main --test-parity
branch-narrator risk-report --mode branch --base main --test-parity
```

### Behavior

When enabled, the test parity analyzer checks if modified/added source files have corresponding test files. This is an opt-in feature because it requires git file system operations that can be slow on large repositories.

### Output

Produces `test-parity-violation` findings for each source file without a corresponding test. In risk reports, these are aggregated into a `tests.missing_parity` flag.

### Example

```bash
# Check for test coverage gaps
branch-narrator risk-report --mode branch --base main --test-parity --format text
```

Output:
```
tests.missing_parity (score: 18, confidence: 0.75)
  Source files modified without corresponding tests
  - src/services/auth.ts: No test file found
  - src/utils/helpers.ts: No test file found
```

**Default:** Disabled (opt-in only)

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
