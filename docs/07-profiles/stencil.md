# Stencil Profile

The `stencil` profile is designed for StencilJS component libraries and applications. It focuses on detecting API changes in Web Components.

## Detection

The profile is automatically detected if:
- `package.json` includes `@stencil/core` in `dependencies` or `devDependencies`.
- `stencil.config.ts` or `stencil.config.js` exists in the root directory.

## Analyzers

The following analyzers are enabled in this profile:

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | General file change statistics |
| `file-category` | Categorization of changed files |
| `stencil` | AST-based analysis of Stencil components (props, events, methods, slots) |
| `env-var` | Extract environment variables |
| `cloudflare` | Detect Cloudflare changes |
| `vitest` | Detect test changes |
| `dependencies` | Analysis of package.json changes |
| `security-files` | Detect security-sensitive files |
| `impact` | Analyzes the impact of changes on other files |
| `typescript-config` | Detect TypeScript config changes |
| `large-diff` | Detect large changesets |
| `lockfiles` | Detect lockfile/manifest mismatches |
| `test-gaps` | Detect production code changes without tests |
| `sql-risks` | Detect risky SQL in migrations |
| `ci-workflows` | Detect CI/CD workflow changes |
| `infra` | Detect infrastructure changes |
| `api-contracts` | Detect API contract changes |

## Usage

You can force the usage of this profile with the `--profile` flag:

```bash
branch-narrator facts --profile stencil
```

Or let it be auto-detected:

```bash
branch-narrator facts --profile auto
```
