# Project Structure

## Directory Layout

```
branch-narrator/
├── src/
│   ├── cli.ts                    # CLI entry point
│   ├── index.ts                  # Library exports
│   │
│   ├── cache/                    # Project-local caching system
│   │   ├── changeset.ts
│   │   ├── analyzer.ts
│   │   └── storage.ts
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
│   │   ├── parser.ts             # Diff parsing
│   │   └── dod/                  # DOD diff parser (streaming)
│   │
│   ├── analyzers/                # Heuristic analyzers
│   │   ├── index.ts              # Analyzer exports
│   │   ├── file-summary.ts
│   │   ├── file-category.ts
│   │   ├── impact.ts
│   │   ├── route-detector.ts
│   │   ├── next-routes.ts
│   │   ├── reactRouterRoutes.ts
│   │   ├── vue-routes.ts
│   │   ├── astro-routes.ts
│   │   ├── python-routes.ts
│   │   ├── supabase.ts
│   │   ├── sql-risks.ts
│   │   ├── dependencies.ts
│   │   ├── lockfiles.ts
│   │   ├── package-exports.ts
│   │   ├── typescript-config.ts
│   │   ├── tailwind.ts
│   │   ├── vite-config.ts
│   │   ├── env-var.ts
│   │   ├── security-files.ts
│   │   ├── infra.ts
│   │   ├── ci-workflows.ts
│   │   └── cloudflare.ts
│   │
│   ├── commands/
│   │   ├── cache/                # Cache management
│   │   ├── dump-diff/            # Diff export command
│   │   ├── facts/                # Facts command
│   │   ├── integrate/            # Integration command
│   │   ├── risk/                 # Risk report command
│   │   ├── snap/                 # Snapshot commands
│   │   └── zoom/                 # Zoom command
│   │
│   ├── profiles/
│   │   ├── index.ts              # Profile resolution
│   │   ├── default.ts
│   │   ├── sveltekit.ts
│   │   ├── next.ts
│   │   ├── react.ts
│   │   ├── vue.ts
│   │   ├── astro.ts
│   │   ├── angular.ts
│   │   ├── python.ts
│   │   ├── vite.ts
│   │   └── library.ts
│   │
│   └── render/
│       ├── index.ts              # Render exports
│       ├── markdown.ts           # Markdown renderer
│       ├── terminal.ts           # Pretty/terminal renderer
│       ├── json.ts               # Legacy JSON renderer
│       ├── sarif.ts              # SARIF renderer
│       └── risk-score.ts         # Facts risk score
│
├── tests/
│   ├── fixtures/                 # Test helpers
│   ├── e2e/                      # End-to-end CLI tests
│   └── *.test.ts                 # Unit tests
│
├── docs/                         # Documentation
├── dist/                         # Build output
│
├── package.json
├── tsconfig.json
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
Many analyzers include `cache` metadata so they can be invalidated based
on relevant files only (content-based cache keys).

### Profiles

| File | Purpose |
|------|---------|
| `profiles/index.ts` | Profile detection and resolution |
| `profiles/default.ts` | Generic analyzer set |
| `profiles/sveltekit.ts` | SvelteKit-specific analyzer set |
| `profiles/next.ts` | Next.js-specific analyzer set |
| `profiles/react.ts` | React Router analyzer set |
| `profiles/vue.ts` | Vue/Nuxt analyzer set |
| `profiles/astro.ts` | Astro analyzer set |
| `profiles/angular.ts` | Angular analyzer set |
| `profiles/python.ts` | Python analyzer set |
| `profiles/vite.ts` | Vite analyzer set |
| `profiles/library.ts` | Package/library analyzer set |

### Commands

CLI command implementations live under `src/commands/`, with each command having its own subdirectory:

| Directory | Purpose |
|-----------|---------|
| `commands/cache/` | Cache stats/clear/prune |
| `commands/dump-diff/` | Export git diffs in various formats |
| `commands/facts/` | Generate structured JSON facts output |
| `commands/integrate/` | Generate provider-specific integration rules |
| `commands/risk/` | Generate risk reports and scoring |
| `commands/snap/` | Snapshot management |
| `commands/zoom/` | Targeted drill-down for findings/flags |

Each command module exports an `execute*` handler function (e.g., `executeDumpDiff`, `executeIntegrate`, `executeFacts`, `executeRiskReport`) that is called from `cli.ts`.

### Render

| File | Purpose |
|------|---------|
| `render/markdown.ts` | Generates Markdown PR body |
| `render/terminal.ts` | Generates pretty terminal output |
| `render/json.ts` | Legacy JSON renderer (not the `facts` schema) |
| `render/sarif.ts` | SARIF output for `facts` |
| `render/risk-score.ts` | Computes facts risk score |

