# Global Caching System Proposal

> **Status**: Proposal
> **Author**: Claude
> **Date**: January 2026

## Executive Summary

This document analyzes the current optimization and caching efforts in branch-narrator and proposes a **Global Caching System** that persists data across executions to significantly improve performance for repeated runs.

---

## 1. Current State Analysis

### 1.1 Existing Caching Mechanisms

| Mechanism | Location | Scope | Persisted? |
|-----------|----------|-------|-----------|
| File Existence Cache | `src/profiles/index.ts:37-65` | Profile detection | No (in-memory) |
| Directory File Cache | `src/analyzers/test-parity.ts:57-68` | Test parity analyzer | No (in-memory) |
| Batch Git Operations | `src/git/batch.ts` | Multiple file fetch | N/A (optimization) |
| Snapshot Storage | `src/commands/snap/storage.ts` | Delta comparisons | Yes (disk) |

### 1.2 Current Optimizations

1. **Parallel Execution**:
   - Git operations run in parallel (`Promise.all`)
   - All 30+ analyzers execute concurrently
   - File reads batched where possible

2. **Batch Operations**:
   - `git cat-file --batch` for multiple files in single call
   - Reduces 2N git calls to 1 call for N files

3. **O(1) Lookups**:
   - `BINARY_EXTENSIONS` as Set (`src/git/collector.ts:391-399`)
   - File existence cache uses Map
   - Profile path preloading

### 1.3 What's NOT Cached (Opportunities)

| Operation | Frequency | Cost | Cache Potential |
|-----------|-----------|------|-----------------|
| Git diff operations | Every run | High | **HIGH** |
| Ref validation | Every run | Medium | **HIGH** |
| Profile detection | Every run | Low | **MEDIUM** |
| Analyzer results | Every run | Medium | **HIGH** |
| Package.json parsing | Every run | Low | **LOW** |

---

## 2. Performance Bottleneck Analysis

### 2.1 Git Operations (Primary Bottleneck)

The following git operations happen on **every execution**:

```
Operation                          Typical Time (ms)
─────────────────────────────────────────────────────
git rev-parse --is-inside-work-tree     5-10
git symbolic-ref refs/remotes/origin/HEAD   5-10
git rev-parse --verify <ref>            5-10 (×2)
git diff --name-status                  20-100
git diff --unified=3                    50-500
git cat-file --batch (package.json)    10-20
git ls-files (test-parity)             50-200
─────────────────────────────────────────────────────
Total Git I/O                          145-850ms
```

### 2.2 Analyzer Execution

- 30+ analyzers run every time
- Most are fast (<5ms each)
- But total adds up: ~50-150ms

### 2.3 Profile Detection

- ~35 filesystem existence checks per run
- Already optimized with preloading
- ~10-30ms total

---

## 3. Proposed Global Caching System

### 3.1 Architecture Overview

```
.branch-narrator/
├── cache/
│   ├── index.json              # Cache metadata & invalidation
│   ├── git/
│   │   ├── refs.json           # Validated refs cache
│   │   ├── diffs/
│   │   │   └── <hash>.json     # Diff content cache
│   │   └── files/
│   │       └── <hash>.json     # File listing cache
│   ├── analysis/
│   │   └── <changeset-hash>/
│   │       ├── findings.json   # Analyzer results
│   │       └── metadata.json   # Cache metadata
│   └── profile/
│       └── detection.json      # Profile detection cache
└── snapshots/                  # Existing snapshot system
```

### 3.2 Cache Key Strategy

#### Git Diff Cache Key
```typescript
interface DiffCacheKey {
  base: string;      // Base ref SHA
  head: string;      // Head ref SHA (or "WORKING"/"INDEX")
  mode: DiffMode;    // branch | staged | unstaged | all
  dirty: boolean;    // Working dir dirty state
}

// Hash: SHA256(JSON.stringify(sortedKey)).slice(0, 16)
```

#### ChangeSet Cache Key
```typescript
interface ChangeSetCacheKey {
  diffHash: string;       // From diff cache
  packageJsonHash: string; // SHA256 of head package.json
}
```

#### Analysis Cache Key
```typescript
interface AnalysisCacheKey {
  changeSetHash: string;
  profile: ProfileName;
  analyzerVersions: Record<string, string>; // For invalidation
}
```

### 3.3 Invalidation Strategy

| Cache Type | Invalidation Trigger |
|------------|---------------------|
| Git refs | SHA mismatch (refs are immutable) |
| Git diff | HEAD SHA change, working dir change |
| File listings | Working dir dirty, mtime check |
| Profile detection | Package.json mtime change |
| Analyzer results | ChangeSet hash change, analyzer version |

#### Automatic Invalidation Markers

```typescript
interface CacheIndex {
  schemaVersion: "1.0";

  git: {
    headSha: string;           // Invalidate on change
    isDirty: boolean;          // Invalidate on change
    lastChecked: string;       // ISO timestamp
  };

  profile: {
    packageJsonMtime: number;  // Invalidate on change
    detected: ProfileName;
  };

  entries: CacheEntry[];       // Individual cache items
}
```

---

## 4. Implementation Phases

### Phase 1: Git Operation Caching (Highest Impact)

**Goal**: Eliminate redundant git calls for unchanged refs

**Implementation**:

```typescript
// src/cache/git-cache.ts
export interface GitCache {
  // Check if ref is still valid (quick SHA comparison)
  isRefValid(ref: string): Promise<boolean>;

  // Get cached diff or compute & cache
  getDiff(options: DiffOptions): Promise<CachedDiff | null>;

  // Cache invalidation
  invalidateIfDirty(): Promise<void>;
}
```

**Expected Improvement**: 40-60% reduction in git operations

### Phase 2: ChangeSet Caching

**Goal**: Reuse parsed ChangeSet when inputs haven't changed

**Implementation**:

```typescript
// src/cache/changeset-cache.ts
export interface ChangeSetCache {
  // Get cached ChangeSet by inputs
  get(key: ChangeSetCacheKey): Promise<ChangeSet | null>;

  // Store ChangeSet
  set(key: ChangeSetCacheKey, changeSet: ChangeSet): Promise<void>;

  // Quick validation without full recompute
  isValid(key: ChangeSetCacheKey): Promise<boolean>;
}
```

**Expected Improvement**: 20-30% reduction for unchanged changes

### Phase 3: Analysis Result Caching

**Goal**: Skip analyzer execution when ChangeSet is cached

**Implementation**:

```typescript
// src/cache/analysis-cache.ts
export interface AnalysisCache {
  // Get cached findings
  getFindings(changeSetHash: string, profile: ProfileName): Promise<Finding[] | null>;

  // Store findings
  setFindings(changeSetHash: string, profile: ProfileName, findings: Finding[]): Promise<void>;

  // Per-analyzer result caching (granular)
  getAnalyzerResult(analyzerName: string, changeSetHash: string): Promise<Finding[] | null>;
}
```

**Expected Improvement**: 30-50% reduction for repeated analysis

### Phase 4: Incremental Analysis (Advanced)

**Goal**: Only re-run analyzers for changed files

**Implementation**:

```typescript
// src/cache/incremental.ts
export interface IncrementalAnalysis {
  // Compute delta from last run
  computeDelta(currentChangeSet: ChangeSet, cachedChangeSet: ChangeSet): FileDelta;

  // Get analyzers affected by delta
  getAffectedAnalyzers(delta: FileDelta): Analyzer[];

  // Merge cached findings with new findings
  mergeFindings(cached: Finding[], delta: Finding[]): Finding[];
}
```

---

## 5. Cache Storage Format

### 5.1 Cache Index (`cache/index.json`)

```json
{
  "schemaVersion": "1.0",
  "created": "2026-01-23T10:00:00Z",
  "lastAccess": "2026-01-23T12:00:00Z",
  "git": {
    "headSha": "abc123def456",
    "isDirty": false,
    "lastChecked": "2026-01-23T12:00:00Z"
  },
  "profile": {
    "packageJsonMtime": 1706000000000,
    "detected": "sveltekit"
  },
  "stats": {
    "hits": 42,
    "misses": 5,
    "size": 1048576
  }
}
```

### 5.2 Diff Cache Entry (`cache/git/diffs/<hash>.json`)

```json
{
  "key": {
    "base": "main",
    "head": "feature-branch",
    "baseSha": "abc123",
    "headSha": "def456",
    "mode": "branch"
  },
  "created": "2026-01-23T10:00:00Z",
  "data": {
    "nameStatus": "M\tsrc/foo.ts\nA\tsrc/bar.ts",
    "unifiedDiff": "diff --git a/src/foo.ts..."
  }
}
```

### 5.3 Analysis Cache Entry (`cache/analysis/<hash>/findings.json`)

```json
{
  "changeSetHash": "abc123def456",
  "profile": "sveltekit",
  "created": "2026-01-23T10:00:00Z",
  "analyzerVersions": {
    "route-detector": "1.0",
    "dependencies": "1.0"
  },
  "findings": [
    { "type": "route-change", "...": "..." }
  ]
}
```

---

## 6. API Design

### 6.1 Cache Manager Interface

```typescript
// src/cache/manager.ts
export interface CacheManager {
  // Initialize cache (called once per execution)
  init(cwd?: string): Promise<void>;

  // Core operations
  git: GitCache;
  changeSet: ChangeSetCache;
  analysis: AnalysisCache;

  // Maintenance
  clear(): Promise<void>;
  prune(maxAge: number): Promise<void>;
  stats(): CacheStats;

  // Bypass flag support
  enabled: boolean;
}

// Singleton for easy access
export const cache: CacheManager;
```

### 6.2 Integration with Existing Code

```typescript
// src/git/collector.ts (modified)
import { cache } from "../cache/manager.js";

export async function collectChangeSet(options: CollectChangeSetOptionsV2): Promise<ChangeSet> {
  // Try cache first
  const cacheKey = buildChangeSetCacheKey(options);
  const cached = await cache.changeSet.get(cacheKey);

  if (cached && await cache.changeSet.isValid(cacheKey)) {
    return cached;
  }

  // Compute fresh (existing logic)
  const changeSet = await collectChangeSetFresh(options);

  // Store in cache
  await cache.changeSet.set(cacheKey, changeSet);

  return changeSet;
}
```

### 6.3 CLI Integration

```bash
# Enable/disable cache
branch-narrator facts --no-cache        # Bypass cache
branch-narrator facts --clear-cache     # Clear and run fresh

# Cache management commands
branch-narrator cache stats             # Show cache statistics
branch-narrator cache clear             # Clear all caches
branch-narrator cache prune --max-age 7 # Remove entries older than 7 days
```

---

## 7. Performance Estimates

### Without Cache (Current)

```
Operation                    Time (ms)
─────────────────────────────────────────
Git operations               150-500
ChangeSet parsing            10-30
Analyzer execution           50-150
Rendering                    10-50
─────────────────────────────────────────
Total                        220-730ms
```

### With Global Cache (Warm)

```
Operation                    Time (ms)
─────────────────────────────────────────
Cache validation             5-10
Cache read (if valid)        5-15
Rendering                    10-50
─────────────────────────────────────────
Total                        20-75ms
```

**Expected Improvement**: 70-90% faster for warm cache scenarios

---

## 8. Edge Cases & Considerations

### 8.1 Working Directory Changes

- Check `git diff-index --quiet HEAD` for dirty state
- Invalidate working-dir-dependent caches when dirty
- Consider file mtime tracking for fine-grained invalidation

### 8.2 Concurrent Execution

- Use file locking for cache writes (`flock` or equivalent)
- Read operations can be concurrent
- Consider atomic write pattern (write to temp, rename)

### 8.3 Cache Size Management

- Default max cache size: 100MB
- LRU eviction when limit exceeded
- Automatic pruning of entries older than 30 days

### 8.4 Analyzer Versioning

- Track analyzer versions in cache metadata
- Invalidate when analyzer code changes
- Use hash of analyzer source or explicit version bumps

---

## 9. Migration Path

### 9.1 Non-Breaking Introduction

1. Cache disabled by default initially
2. Enable with `--cache` flag for opt-in testing
3. Once stable, enable by default with `--no-cache` to disable

### 9.2 Backward Compatibility

- Existing snapshot system unchanged
- Cache is additive, doesn't modify core behavior
- Falls back to fresh computation on any cache error

---

## 10. Implementation Checklist

- [ ] Create `src/cache/` directory structure
- [ ] Implement `CacheManager` core interface
- [ ] Implement `GitCache` with ref and diff caching
- [ ] Implement `ChangeSetCache` with validation
- [ ] Implement `AnalysisCache` with analyzer versioning
- [ ] Add CLI flags (`--cache`, `--no-cache`, `--clear-cache`)
- [ ] Add `cache` command for management
- [ ] Write tests for cache hit/miss scenarios
- [ ] Write tests for invalidation logic
- [ ] Document in `docs/` directory
- [ ] Add benchmark comparison (cached vs uncached)
- [ ] Create changeset for the feature

---

## 11. Relationship to Existing Snapshot System

The proposed cache system is **complementary** to the existing snapshot system:

| Aspect | Snapshot System | Global Cache |
|--------|-----------------|--------------|
| Purpose | Point-in-time analysis storage | Performance optimization |
| Persistence | Long-term (user-managed) | Short-term (auto-managed) |
| Scope | Full analysis results | Intermediate computations |
| User-facing | Yes (`snap` command) | Transparent |
| Invalidation | Manual | Automatic |

The cache system can potentially leverage the snapshot storage infrastructure (content-addressable blobs, SHA256 hashing) for consistency.

---

## 12. Conclusion

Implementing a global caching system will provide:

1. **70-90% faster execution** for repeated runs
2. **Reduced git I/O** (primary bottleneck)
3. **Better developer experience** for iterative workflows
4. **Foundation for incremental analysis** in the future

The phased approach allows incremental delivery with measurable improvements at each stage.
