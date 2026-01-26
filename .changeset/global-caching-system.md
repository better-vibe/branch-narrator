---
"@better-vibe/branch-narrator": minor
---

Add global caching system with incremental analyzer reuse and auto-pruning

- **Cache ChangeSets**: Parsed ChangeSet objects are cached and reused when inputs haven't changed
- **Incremental analysis**: Per-analyzer caching with file-pattern awareness enables reusing results when relevant files haven't changed
- **Smart invalidation**: Cache entries are content-addressed and persist across git state changes; only ref cache refreshes on HEAD change
- **Analyzer metadata**: Analyzers can declare `cacheScope` and `filePatterns` to enable fine-grained cache reuse
- **File-scoped analyzers**: Added `cacheScope: "files"` and `filePatterns` to 17 analyzers for reduced cache churn
- **Auto-pruning**: Cache automatically prunes on every initialization - removes entries older than 30 days and uses LRU eviction when size exceeds 100MB
- **LRU eviction**: Least-recently-used entries are evicted first when size limit is reached; `lastAccess` is updated on cache hits
- **CLI options**: Added `--no-cache` to bypass caching and `--clear-cache` to clear before running
- **Cache command**: New `cache` subcommand with `stats`, `clear`, and `prune` operations
- **Worktree signature**: Non-branch modes use worktree signature for accurate cache keys
- **Streamlined cache structure**: Removed unused cache directories (diffs, files, analysis) - only changeset, per-analyzer, and refs caches are used

Expected performance improvement: 70-90% faster for repeated runs with warm cache.
