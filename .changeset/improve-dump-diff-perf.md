---
"@better-vibe/branch-narrator": patch
---

Improve dump-diff performance by reducing git calls and batching work

- Use single git diff call for all tracked files instead of per-file calls
- Batch binary detection using git diff --numstat for tracked files
- Limit concurrency for untracked file operations (binary checks and diffs)
- Add diff splitting utility to parse full diff into per-file chunks
- Add concurrency limiting utility for parallel operations
- Maintain identical output for all existing modes (full, --name-only, --stat, --patch-for)

