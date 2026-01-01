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
| `branch` | Compare base ref to head ref (default) | `git diff base..head` |
| `unstaged` | Working tree vs index | `git diff` |
| `staged` | Index vs HEAD | `git diff --staged` |
| `all` | Working tree vs HEAD (includes untracked) | `git diff HEAD` |

**Default:** `branch`

**Note:** When using `unstaged`, `staged`, or `all` modes, the `--base` and `--head` options are ignored (a warning is printed to stderr).

---

## --base

Base git reference to compare against. Only used in `branch` mode.

```bash
branch-narrator pretty --base <ref>
branch-narrator pr-body --base <ref>
branch-narrator facts --base <ref>
branch-narrator dump-diff --base <ref>
```

### Values

| Type | Example |
|------|---------|
| Branch | `main`, `develop`, `feature/xyz` |
| Commit SHA | `abc123`, `abc123def456` |
| Tag | `v1.0.0`, `release-2024-01` |
| Relative | `HEAD~5`, `HEAD^` |

### Default

`main`

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

## -u, --uncommitted

Include uncommitted and untracked changes. Only available on `pr-body` command.

```bash
branch-narrator pr-body -u
branch-narrator pr-body --uncommitted
```

### Behavior

When enabled:
- Compares working directory against `--base`
- Includes modified tracked files (staged and unstaged)
- Includes new untracked files (not in .gitignore)
- Sets `head` to `"WORKING"` in output

### Use Cases

```bash
# Review changes before committing
branch-narrator pr-body -u
```

**Note:** For `pretty` and `facts` commands, use `--mode all` instead.

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

### Auto-Detection Logic

1. Check for `src/routes/` directory → SvelteKit
2. Check for `@sveltejs/kit` in package.json → SvelteKit
3. Otherwise → Default profile

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

# Using modes for uncommitted work
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
