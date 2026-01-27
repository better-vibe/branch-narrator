---
"@better-vibe/branch-narrator": minor
---

Add global caching system for improved performance

This release introduces a comprehensive caching system that persists intermediate results across CLI executions:

**Cache Features:**
- **ChangeSet caching**: Parsed git diff output is cached based on git state
- **Per-analyzer caching**: Individual analyzer findings are cached with file-pattern-aware invalidation
- **Git ref caching**: SHA lookups are cached and invalidated when HEAD changes

**New CLI Options:**
- `--no-cache`: Disable caching entirely (bypass lookup and don't store)
- `--clear-cache`: Clear the cache before running the command

**New `cache` Command:**
- `cache stats [--pretty]`: Show cache statistics (hits, misses, hit rate, size)
- `cache clear`: Remove all cache data
- `cache prune [--max-age <days>]`: Remove entries older than N days (default: 30)

**Cache Location:**
All cache data is stored in `.branch-narrator/cache/` within your project directory.

**Cache Invalidation:**
- Content-addressed caching with SHA-256 hashes
- Automatic invalidation on CLI version change
- Mode-specific invalidation strategies for different git states
- Two-entry limit policy (current + previous) prevents unbounded growth

The caching system is enabled by default and works transparently. Use `--no-cache` when you need fresh results.
