# Global Caching System

branch-narrator includes a global caching system that significantly improves performance for repeated runs by persisting intermediate results across executions.

## Overview

The caching system stores:

- **ChangeSet data** - Parsed and structured change information
- **Per-analyzer findings** - Results from each analyzer for incremental caching
- **Ref SHA lookups** - Git reference resolution results

## Cache Location

Cache data is stored in `.branch-narrator/cache/` within your project directory. This directory should be added to `.gitignore` (done automatically on newer projects).

```
.branch-narrator/
├── cache/
│   ├── index.json              # Cache metadata and statistics
│   ├── git/
│   │   └── refs.json           # Validated ref SHA cache
│   ├── changeset/              # Cached ChangeSets
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

The cache uses a smart invalidation strategy that maximizes reuse while ensuring correctness.

### Content-Addressed Caching

Cache entries are **content-addressed** - they are keyed by the content they represent, not just git state. This means:

- Cache hits occur when the same content is analyzed again, even across different branches
- Automatic cache file limits prevent unbounded growth

### Two-File Cache Strategy

To prevent cache churn while enabling undo scenarios, the cache maintains at most **2 files per category**:

- **Per-analyzer**: 2 cache files per analyzer (current + previous state)
- **ChangeSets**: 2 changeset cache files total

When a new cache entry is created and the limit would be exceeded, the oldest entry is automatically deleted. This allows you to:

1. Hit the cache on repeated runs with no changes
2. Revert changes and still hit the previous cache entry
3. Avoid unbounded cache growth over time

### What Gets Refreshed

| Git State Change | What Gets Refreshed |
|-----------------|---------------------|
| HEAD changes | Refs cache (SHA lookups) |
| Working directory changes | Worktree signature |
| CLI version upgrade | All caches (via version signature) |

### Mode-Specific Behavior

| Mode | Cache Key Includes |
|------|-------------------|
| `branch` | Base ref, Head ref, File patterns hash |
| `staged` | HEAD ref, Worktree signature, File patterns hash |
| `unstaged` | HEAD ref, Worktree signature, File patterns hash |
| `all` | HEAD ref, Worktree signature, File patterns hash |

For `staged`, `unstaged`, and `all` modes, the worktree signature includes:
- Hash of `git status --porcelain -z` output
- Hash of index tree (`git write-tree`)
- HEAD commit SHA

### Incremental Analyzer Caching

Each analyzer's results are cached separately. When a cached result exists:

1. The cache checks if any files the analyzer processed have changed
2. If no processed files changed, cached findings are reused
3. Otherwise, the analyzer runs fresh and results are cached

This enables significant performance improvements when making small changes to large repositories.

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

### Manual cache cleanup

If you need to remove old entries manually:

```bash
# Remove entries older than 7 days
branch-narrator cache prune --max-age 7
```

Note: Cache files are automatically limited (2 per category), so manual cleanup is rarely needed.

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

Cache behavior is controlled via CLI options.

| Setting | Default | Description |
|---------|---------|-------------|
| Cache enabled | `true` | Set `--no-cache` to disable |
| Max files per analyzer | 2 | Current + previous state |
| Max entry age | 30 days | `--max-age` for `cache prune` |

## Cache File Limits

The cache automatically maintains file limits when writing new entries:

- **Per-analyzer**: Maximum 2 cache files per analyzer (enforced per analyzer name)
- **ChangeSets**: Maximum 2 changeset files total

When adding a new entry would exceed these limits, the oldest entry in that category is automatically deleted. This ensures:

1. **Bounded cache size** - No unbounded growth over time
2. **Undo support** - Previous state is retained for one change cycle
3. **No manual cleanup needed** - Limits are enforced automatically

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
