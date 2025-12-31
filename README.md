# branch-narrator

A local-first CLI that reads `git diff` and generates structured **PR descriptions** (Markdown) and **machine-readable facts** (JSON).

## Features

- **Heuristics-only**: No LLM calls, no network calls. Fully deterministic and grounded in git diff.
- **SvelteKit-aware**: Detects routes, layouts, endpoints, and HTTP methods.
- **Supabase integration**: Scans migrations for destructive SQL patterns.
- **Environment variable detection**: Finds `process.env`, SvelteKit `$env` imports.
- **Cloudflare detection**: Detects wrangler config and CI changes.
- **Dependency analysis**: Tracks package.json changes with semver impact.
- **Risk scoring**: Computes aggregate risk with evidence-based explanations.

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

### Generate JSON Facts

```bash
# Machine-readable output
branch-narrator facts

# Parse with jq
branch-narrator facts | jq '.riskScore.level'
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

