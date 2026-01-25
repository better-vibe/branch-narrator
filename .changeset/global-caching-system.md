---
"@better-vibe/branch-narrator": minor
---

Add global caching system for improved performance

- **Cache git operations**: Ref SHA lookups, diff outputs, and file listings are cached across executions
- **Cache ChangeSets**: Parsed ChangeSet objects are cached and reused when inputs haven't changed
- **Cache analysis results**: Analyzer findings are cached per-profile and mode combination
- **Incremental analysis**: Per-analyzer caching enables reusing results for unchanged analyzers
- **CLI options**: Added `--no-cache` to bypass caching and `--clear-cache` to clear before running
- **Cache command**: New `cache` subcommand with `stats`, `clear`, and `prune` operations
- **Automatic invalidation**: Cache invalidates on HEAD change, working directory change, or CLI version change
- **Worktree signature**: Non-branch modes use worktree signature for accurate cache keys

Expected performance improvement: 70-90% faster for repeated runs with warm cache.
