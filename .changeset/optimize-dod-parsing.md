---
"@better-vibe/branch-narrator": patch
---

perf: optimize DOD diff parser with indexed hunk line access

## What Changed

- **Hunk line indexing**: Added `hunkFirstLineIndex` and `hunkLineCount` to `DiffArena`, enabling O(1) range lookups for hunk lines instead of O(totalLines) full scans
- **Range-based materialization**: Adapter `materializeHunk()` (both lazy and eager paths) now iterates only the hunk's line range
- **Context line skip**: Context lines are no longer decoded during hunk materialization since only additions and deletions are collected
- **Zero-copy file status detection**: `determineFileStatus()` now compares path bytes directly instead of allocating a `TextDecoder` per file
- **Optimized `getChangeStats()`**: File paths are precomputed by index once, eliminating per-line path decoding

## Performance Impact

For a diff with F files, H hunks, and L total lines:
- **Hunk materialization**: O(L * H) → O(L) (each line visited once via its hunk range)
- **File additions/deletions generators**: O(L) full scan → O(file_lines) range scan
- **`getChangeStats()`**: O(L) path decodings → O(F) path decodings
- **`determineFileStatus()`**: Eliminates TextDecoder allocation per file
