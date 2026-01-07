---
"branch-narrator": minor
---

Change default behavior: `unstaged` mode now includes untracked files

The `--mode unstaged` (default) now includes untracked files in addition to modified tracked files. This matches the typical working state of AI coding agents where new files are created but not yet staged.

Previously, only `--mode all` included untracked files. Now both `unstaged` and `all` include them by default.

To exclude untracked files, use `--mode staged` or pass `--no-untracked` (where available).

