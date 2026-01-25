# Global Caching System

branch-narrator includes a global caching system that significantly improves performance for repeated runs by persisting intermediate results across executions.

## Overview

The caching system stores:

- **Git diff data** - Raw diff output from git commands
- **ChangeSet data** - Parsed and structured change information  
- **Analysis findings** - Results from running analyzers
- **Ref SHA lookups** - Git reference resolution results
- **File listings** - Results from `git ls-files` operations

## Cache Location

Cache data is stored in `.branch-narrator/cache/` within your project directory. This directory should be added to `.gitignore` (done automatically on newer projects).

```
.branch-narrator/
├── cache/
│   ├── index.json              # Cache metadata and statistics
│   ├── git/
│   │   ├── refs.json           # Validated ref SHA cache
│   │   ├── diffs/              # Cached diff data
│   │   └── files/              # Cached file listings
│   ├── changeset/              # Cached ChangeSets
│   ├── analysis/               # Cached analysis results
│   └── per-analyzer/           # Per-analyzer incremental cache
└── snapshots/                  # Existing snapshot system
```

## CLI Options

### Global Options

| Option | Description |
|--------|-------------|
| `--no-cache` | Disable caching entirely (bypass lookup and don't store) |
| `--clear-cache` | Clear the cache before running |

### Cache Command

The `cache` command provides cache management operations:

```bash
# Show cache statistics
branch-narrator cache stats
branch-narrator cache stats --pretty  # Pretty-printed JSON

# Clear all cache data
branch-narrator cache clear

# Remove old cache entries
branch-narrator cache prune              # Default: 30 days
branch-narrator cache prune --max-age 7  # Custom max age in days
```

## Cache Invalidation

The cache automatically invalidates when:

1. **HEAD changes** - When you switch branches or make commits
2. **Working directory changes** - When files are modified (for non-branch modes)
3. **CLI version changes** - When you upgrade branch-narrator
4. **Schema version changes** - When cache format changes

### Mode-Specific Behavior

| Mode | Cache Key Includes |
|------|-------------------|
| `branch` | Base SHA, Head SHA |
| `staged` | HEAD SHA, Worktree signature |
| `unstaged` | HEAD SHA, Worktree signature |
| `all` | HEAD SHA, Worktree signature |

For `staged`, `unstaged`, and `all` modes, the worktree signature includes:
- Hash of `git status --porcelain -z` output
- Hash of index tree (`git write-tree`)
- HEAD commit SHA

This ensures cached data is invalidated whenever working directory state changes.

## Performance Impact

Typical performance improvements for warm cache scenarios:

| Operation | Cold (ms) | Warm (ms) | Improvement |
|-----------|-----------|-----------|-------------|
| Git diff collection | 150-500 | 5-15 | 90-97% |
| ChangeSet parsing | 10-30 | 5-10 | 50-67% |
| Analyzer execution | 50-150 | 5-15 | 70-90% |
| **Total** | 220-730 | 20-75 | **70-90%** |

## Cache Statistics

The `cache stats` command returns:

```json
{
  "hits": 42,
  "misses": 5,
  "hitRate": 89,
  "entries": 12,
  "sizeBytes": 1048576,
  "sizeHuman": "1 MB",
  "oldestEntry": "2026-01-20T10:00:00Z",
  "newestEntry": "2026-01-23T12:00:00Z"
}
```

## Troubleshooting

### Cache appears to never hit

1. **Working directory is changing** - For non-branch modes, any file change invalidates the cache
2. **HEAD is changing** - Frequent commits or rebases will invalidate cache
3. **Different profiles** - Each profile maintains separate cache entries

### Cache size is growing

Use `cache prune` to remove old entries:

```bash
# Remove entries older than 7 days
branch-narrator cache prune --max-age 7
```

Default maximum cache age is 30 days.

### Need fresh results

Use `--no-cache` to bypass caching entirely:

```bash
branch-narrator facts --mode branch --base main --no-cache
```

Or clear the cache first:

```bash
branch-narrator --clear-cache facts --mode branch --base main
```

## Configuration

Cache behavior is controlled via CLI options. Future versions may support configuration file settings.

| Setting | Default | Description |
|---------|---------|-------------|
| Cache enabled | `true` | Set `--no-cache` to disable |
| Max cache size | 100 MB | Automatic LRU eviction (planned) |
| Max entry age | 30 days | `--max-age` for `cache prune` |

## Technical Details

### Hashing

Cache keys use SHA256 hashes (truncated to 16 hex characters) for:
- Deterministic identification
- Collision resistance
- Consistent ordering

### Atomic Writes

All cache writes use atomic file operations:
1. Write to temporary file
2. Rename to final path

This prevents corruption from interrupted writes.

### Concurrent Safety

- Read operations can run concurrently
- Write operations use atomic rename pattern
- Index updates are serialized per-process

## Relationship to Snapshots

The caching system is complementary to the snapshot system:

| Aspect | Snapshot System | Global Cache |
|--------|-----------------|--------------|
| Purpose | Point-in-time analysis storage | Performance optimization |
| Persistence | Long-term (user-managed) | Short-term (auto-managed) |
| Scope | Full analysis results | Intermediate computations |
| User-facing | Yes (`snap` command) | Transparent |
| Invalidation | Manual | Automatic |
