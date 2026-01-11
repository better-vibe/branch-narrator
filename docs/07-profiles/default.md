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
| `impact` | Analyze blast radius of changes |
| `large-diff` | Detect large changesets |
| `lockfiles` | Detect lockfile/manifest mismatches |
| `test-gaps` | Detect production code changes without tests |
| `sql-risks` | Detect risky SQL in migrations |
| `ci-workflows` | Detect CI/CD workflow changes |
| `infra` | Detect infrastructure changes |
| `api-contracts` | Detect API contract changes |

## Opt-In Analyzers

These analyzers are NOT included by default but can be enabled via CLI flags:

| Analyzer | Flag | Purpose |
|----------|------|---------|
| `test-parity` | `--test-parity` | Check if each source file has a corresponding test file |

### Enabling Test Parity

Test parity checking is opt-in because it requires git file system operations that can be slow on large repositories:

```bash
# Enable test parity checking
branch-narrator facts --mode branch --base main --test-parity
branch-narrator risk-report --mode branch --base main --test-parity
```

## What's NOT Included

| Analyzer | Reason |
|----------|--------|
| `route-detector` | SvelteKit-specific |
| `supabase` | Often paired with SvelteKit |
| `next-routes` | Next.js-specific |
| `react-router` | React Router-specific |
| `stencil` | StencilJS-specific |

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
    impactAnalyzer,
    analyzeLargeDiff,
    analyzeLockfiles,
    analyzeTestGaps,
    analyzeSQLRisks,
    analyzeCIWorkflows,
    analyzeInfra,
    analyzeAPIContracts,
  ],
};
```

## Adding Framework-Specific Analysis

If you need framework-specific analysis:

1. Force a profile: `--profile sveltekit`
2. Or create a custom profile (see [Adding Profiles](./overview.md))
