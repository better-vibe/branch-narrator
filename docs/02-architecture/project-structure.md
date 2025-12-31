# Project Structure

## Directory Layout

```
branch-narrator/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── index.ts                  # Library exports
│   │
│   ├── core/
│   │   ├── index.ts              # Core exports
│   │   ├── types.ts              # All TypeScript types
│   │   ├── change-set.ts         # ChangeSet builder
│   │   ├── errors.ts             # Custom error classes
│   │   └── filters.ts            # File exclusion patterns
│   │
│   ├── git/
│   │   ├── index.ts              # Git exports
│   │   ├── collector.ts          # Git data collection
│   │   └── parser.ts             # Diff parsing
│   │
│   ├── analyzers/
│   │   ├── index.ts              # Analyzer exports
│   │   ├── file-summary.ts       # File change summary
│   │   ├── file-category.ts      # File categorization
│   │   ├── route-detector.ts     # SvelteKit routes
│   │   ├── supabase.ts           # Migration analysis
│   │   ├── env-var.ts            # Environment variables
│   │   ├── cloudflare.ts         # Cloudflare detection
│   │   ├── vitest.ts             # Test file detection
│   │   ├── dependencies.ts       # Package.json analysis
│   │   └── security-files.ts     # Security file detection
│   │
│   ├── profiles/
│   │   ├── index.ts              # Profile resolution
│   │   ├── sveltekit.ts          # SvelteKit profile
│   │   └── default.ts            # Default profile
│   │
│   └── render/
│       ├── index.ts              # Render exports
│       ├── markdown.ts           # Markdown renderer
│       ├── json.ts               # JSON renderer
│       └── risk-score.ts         # Risk computation
│
├── tests/
│   ├── fixtures/
│   │   └── index.ts              # Test helpers
│   ├── route-mapping.test.ts
│   ├── sql-risk.test.ts
│   ├── env-var.test.ts
│   ├── dependencies.test.ts
│   ├── file-category.test.ts
│   ├── security-files.test.ts
│   ├── markdown-render.test.ts
│   └── untracked-files.test.ts
│
├── docs/                         # Documentation
├── dist/                         # Build output
│
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

## Key Files

### Entry Points

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI commands using commander |
| `src/index.ts` | Library exports for programmatic use |

### Core

| File | Purpose |
|------|---------|
| `core/types.ts` | All TypeScript type definitions |
| `core/change-set.ts` | Builds normalized ChangeSet from git data |
| `core/errors.ts` | Custom error classes with exit codes |
| `core/filters.ts` | Patterns for excluding build artifacts |

### Git

| File | Purpose |
|------|---------|
| `git/collector.ts` | Executes git commands, builds ChangeSet |
| `git/parser.ts` | Parses git diff output |

### Analyzers

Each analyzer is a single file implementing the `Analyzer` interface.

### Profiles

| File | Purpose |
|------|---------|
| `profiles/index.ts` | Profile detection and resolution |
| `profiles/sveltekit.ts` | SvelteKit-specific analyzer set |
| `profiles/default.ts` | Generic analyzer set |

### Render

| File | Purpose |
|------|---------|
| `render/markdown.ts` | Generates Markdown PR body |
| `render/json.ts` | Generates JSON facts output |
| `render/risk-score.ts` | Computes risk score with evidence |

