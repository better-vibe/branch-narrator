# CLI Options

Detailed documentation for each CLI option.

## --base

Base git reference to compare against.

```bash
branch-narrator pr-body --base <ref>
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

Head git reference (your changes).

```bash
branch-narrator pr-body --head <ref>
```

Same value types as `--base`.

### Default

`HEAD`

---

## -u, --uncommitted

Include uncommitted and untracked changes.

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

# Check risk of current work
branch-narrator facts -u | jq '.riskScore'
```

---

## --profile

Specify which analyzer profile to use.

```bash
branch-narrator pr-body --profile <name>
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

Enable interactive mode with prompts.

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

## Environment Variables

### DEBUG

Show stack traces on error.

```bash
DEBUG=1 branch-narrator pr-body
```

---

## Combining Options

```bash
# Full example
branch-narrator pr-body \
  --base main \
  --head feature/auth \
  --profile sveltekit \
  --interactive

# Short form
branch-narrator pr-body -u --interactive
```

