# Caching System

branch-narrator includes a global caching system that improves performance by persisting intermediate results across executions.

## Overview

The cache stores:
- **ChangeSet data** - Parsed git diff output
- **Per-analyzer findings** - Results from individual analyzers
- **Git ref resolutions** - SHA lookups for branch refs

All cache data is stored locally in `.branch-narrator/cache/` within your project directory.

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

The cache tracks hit/miss statistics:

```bash
$ branch-narrator cache stats --pretty
{
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

### Concurrent Safety

- **Read operations**: Safe to run concurrently
- **Write operations**: Serialized through index updates
- **Cache files**: Atomic rename ensures consistency

### Hashing

Cache keys use SHA-256 truncated to 16 hex characters (64 bits), providing:
- Good collision resistance
- Compact key length
- Fast computation
