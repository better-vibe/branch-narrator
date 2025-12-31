# Default Profile

Generic profile for any project type.

## When Used

The default profile is used when:

1. `--profile auto` is specified (default)
2. No specific framework is detected

## Analyzers

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | Summarize file changes |
| `file-category` | Categorize files by type |
| `env-var` | Extract environment variables |
| `cloudflare` | Detect Cloudflare changes |
| `vitest` | Detect test changes |
| `dependencies` | Analyze package.json |
| `security-files` | Detect security-sensitive files |

## What's NOT Included

| Analyzer | Reason |
|----------|--------|
| `route-detector` | SvelteKit-specific |
| `supabase` | Often paired with SvelteKit |

## Features

### File Categorization

Works for any project structure:

| Category | Patterns |
|----------|----------|
| `product` | `src/`, `lib/`, `app/` |
| `tests` | `tests/`, `*.test.*` |
| `ci` | `.github/workflows/` |
| `infra` | `Dockerfile`, `k8s/` |
| `docs` | `docs/`, `*.md` |
| `dependencies` | `package.json`, lockfiles |
| `config` | `*.config.*`, `.env*` |

### Environment Variables

Detects:
- `process.env.VAR`
- `PUBLIC_*` patterns
- SvelteKit `$env` imports (if present)

### Security Detection

Flags auth-related files:
- `auth`, `login`, `session`
- `middleware`, `guard`, `policy`

### Dependency Analysis

Full package.json analysis:
- Semver impact detection
- Risky package flagging
- Critical package major bumps

## Source

```typescript
// src/profiles/default.ts
export const defaultProfile: Profile = {
  name: "auto",
  analyzers: [
    fileSummaryAnalyzer,
    fileCategoryAnalyzer,
    envVarAnalyzer,
    cloudflareAnalyzer,
    vitestAnalyzer,
    dependencyAnalyzer,
    securityFilesAnalyzer,
  ],
};
```

## Adding Framework-Specific Analysis

If you need framework-specific analysis:

1. Force a profile: `--profile sveltekit`
2. Or create a custom profile (see [Adding Profiles](./overview.md))

