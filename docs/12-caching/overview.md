# Caching System

branch-narrator includes a project-local caching system that improves performance by persisting intermediate results across executions.

## Overview

The cache stores:
- **ChangeSet data** - Parsed git diff output
- **Per-analyzer findings** - Results from individual analyzers
- **Git ref resolutions** - SHA lookups for branch refs

All cache data is stored locally in `.branch-narrator/cache/` inside the current working directory where you run the command.
This is branch-narrator's own cache, not Bun/npm package-manager cache.

## Cache Location

```
.branch-narrator/
└── cache/
    ├── index.json          # Cache index with hit/miss stats
    ├── changeset/          # Cached ChangeSet data
    │   └── {key}.json
    ├── per-analyzer/       # Cached analyzer findings
    │   └── {analyzer}_{key}.json
    └── git/
        └── refs.json       # Cached git ref resolutions
```

## Install Location vs Cache Location

`which branch-narrator` shows where the executable was resolved from (for example, `~/.bun/bin/branch-narrator`).
It does **not** indicate where branch-narrator stores cache data.

branch-narrator cache paths are derived from `process.cwd()`, so location depends on the directory you run from.

## Cache Location by Invocation Mode

| Invocation mode | Where binary/package is resolved | branch-narrator cache path |
|-----------------|----------------------------------|----------------------------|
| Global Bun install (`bun add -g @better-vibe/branch-narrator`) | Binary typically symlinked into `~/.bun/bin/` | `<cwd>/.branch-narrator/cache/` |
| `bunx @better-vibe/branch-narrator ...` | Package pulled from Bun cache (default `~/.bun/install/cache`) | `<cwd>/.branch-narrator/cache/` |
| `npx @better-vibe/branch-narrator ...` | Package pulled from npm cache (default `~/.npm` on Posix) | `<cwd>/.branch-narrator/cache/` |
| Local project install (`node_modules/.bin/branch-narrator`, scripts) | Binary in project `node_modules/.bin` | `<cwd>/.branch-narrator/cache/` |

The same rule applies to snapshot state: `<cwd>/.branch-narrator/snapshots/`.

## Working Directory Edge Cases

- Run from repo root: cache goes to `<repo>/.branch-narrator/cache/`
- Run from a subdirectory: cache goes to `<subdir>/.branch-narrator/cache/`
- Different working directories create separate caches, even within the same git repository

If you want a single cache per repository, run commands consistently from repo root.

## CLI Options

### Global Flags

| Flag | Description |
|------|-------------|
| `--no-cache` | Disable caching entirely (bypass lookup and don't store) |
| `--clear-cache` | Clear the cache before running the command |

### Cache Command

The `cache` command provides cache management operations:

```bash
# Show cache statistics
branch-narrator cache stats [--pretty]

# Clear all cache data
branch-narrator cache clear

# Remove entries older than N days (default: 30)
branch-narrator cache prune [--max-age <days>]
```

## Cache Invalidation

The cache uses a smart invalidation strategy:

1. **Content-addressed caching** - Cache keys are SHA-256 hashes of the inputs
2. **CLI version** - Cache is invalidated when CLI version changes
3. **Git state changes** - Different modes use different invalidation strategies:
   - **Branch mode**: Invalidates when base/head refs change
   - **Staged/Unstaged/All modes**: Invalidates when worktree state changes

### Cache Keys

Cache keys are computed from:

- **Mode** (branch, staged, unstaged, all)
- **Base/head refs** (for branch mode)
- **Worktree signature** (for non-branch modes):
  - Hash of `git status --porcelain -z`
  - Hash of `git write-tree`
  - Current HEAD SHA
- **File pattern hash** (sorted include/exclude globs)
- **CLI version**

### Entry Limits

To prevent unbounded cache growth:

- **ChangeSets**: Maximum 2 entries (current + previous state)
- **Per-analyzer**: Maximum 2 entries per analyzer

This two-entry limit policy supports undo scenarios while keeping cache size bounded.

## Statistics

The cache tracks location, hit/miss statistics, and size:

```bash
$ branch-narrator cache stats --pretty
{
  "location": "/path/to/repo/.branch-narrator/cache",
  "hits": 42,
  "misses": 8,
  "hitRate": 84,
  "entries": 15,
  "sizeBytes": 125432,
  "sizeHuman": "122.5 KB",
  "oldestEntry": "2024-01-15T10:30:00Z",
  "newestEntry": "2024-01-20T14:22:00Z"
}
```

## Troubleshooting

### Cache not being used

Check that:
1. `--no-cache` flag is not set
2. Git state hasn't changed between runs
3. CLI version matches

### Stale results

If you suspect stale cache data:

```bash
# Clear and run fresh
branch-narrator --clear-cache facts --mode branch
```

### Cache growing too large

```bash
# Prune old entries
branch-narrator cache prune --max-age 7

# Or clear completely
branch-narrator cache clear
```

## Configuration

Currently the cache is enabled by default. Use `--no-cache` to disable.

## Relationship to Snapshots

The cache and snapshot systems are complementary:

| Feature | Cache | Snapshots |
|---------|-------|-----------|
| Purpose | Performance optimization | Point-in-time analysis storage |
| Lifespan | Short-term, auto-invalidated | Long-term, persistent |
| Storage | Automatic, bounded | User-controlled |
| Data | ChangeSet, findings | Full workspace state |

Use **snapshots** for:
- Saving specific analysis results
- Comparing changes over time
- Restoring previous states

Use **cache** for:
- Faster repeated analysis
- Automatic optimization
- No user intervention needed

## Technical Details

### Atomic Writes

All cache writes use atomic operations (temp file + rename) to prevent corruption from interrupted writes.
Temporary files are written under the OS temp directory as `branch-narrator-*.tmp`, then moved into `.branch-narrator/cache/`.

### Concurrent Safety

- **Read operations**: Safe to run concurrently
- **Write operations**: Serialized through index updates
- **Cache files**: Atomic rename ensures consistency

### Hashing

Cache keys use SHA-256 truncated to 16 hex characters (64 bits), providing:
- Good collision resistance
- Compact key length
- Fast computation
