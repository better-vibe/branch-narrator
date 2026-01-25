# Snapshots

Local workspace snapshots enable agents (and humans) to capture multiple stages
of ongoing work and compare/restore them without creating Git commits.

## Purpose

Snapshots create an "unstaged timeline" for autonomous iteration:

- **Checkpoint frequently** - Save workspace state at any point
- **Compare progress** - Use stable IDs (`findingId`, `flagId`) to measure changes
- **Safe rollback** - Restore a previous checkpoint with automatic backup

## Use Cases

### Agent Iteration

AI agents can use snapshots to:

1. Save state before making risky changes
2. Compare analysis results between iterations
3. Roll back if changes introduce regressions
4. Track progress objectively using findings/flags delta

### Human Workflows

Developers can use snapshots to:

1. Checkpoint work-in-progress before experiments
2. Compare the risk impact of different approaches
3. Restore clean state without losing snapshot history

## Commands

### `snap save [label]`

Creates a new snapshot of the current workspace state.

```bash
# Create snapshot with auto-generated label
branch-narrator snap save

# Create snapshot with custom label
branch-narrator snap save "attempt-3"

# Write snapshot ID to file
branch-narrator snap save --out .ai/current-snapshot.txt
```

**Output:** Prints the snapshot ID (12 hex characters) to stdout.

**What's captured:**

- Staged changes (git diff --binary --staged)
- Unstaged changes (git diff --binary)
- Untracked files (as content-addressed blobs)
- Embedded analysis (facts + risk-report using mode=all)

### `snap list`

Lists all snapshots with summary information.

```bash
# List all snapshots (JSON)
branch-narrator snap list

# Pretty-print output
branch-narrator snap list --pretty
```

**Output:** JSON object with `schemaVersion` and `snapshots` array.

Each snapshot entry includes:

- `snapshotId` - Unique identifier
- `label` - User-provided or auto-generated label
- `createdAt` - ISO 8601 timestamp
- `headSha` - HEAD commit at snapshot time
- `branch` - Branch name at snapshot time
- `filesChanged` - Number of changed files
- `riskScore` - Risk score (0-100)
- `flagCount` - Number of risk flags
- `findingCount` - Number of findings

### `snap show <snapshotId>`

Shows the full details of a specific snapshot.

```bash
# Show snapshot details
branch-narrator snap show abc123def456

# Pretty-print output
branch-narrator snap show abc123def456 --pretty
```

**Output:** Full `snapshot.json` content including embedded analysis.

### `snap diff <idA> <idB>`

Compares two snapshots and outputs a delta.

```bash
# Compare two snapshots
branch-narrator snap diff abc123def456 def456abc789

# Pretty-print output
branch-narrator snap diff abc123def456 def456abc789 --pretty
```

**Output:** JSON delta including:

- `riskScore` - Score change (from, to, delta)
- `findings` - Added, removed, and changed findings by ID
- `flags` - Added, removed, and changed flags by ID
- `files` - Added, removed, and modified files
- `summary` - Count summary for all changes

### `snap restore <snapshotId>`

Restores the workspace to match a snapshot exactly.

```bash
branch-narrator snap restore abc123def456
```

**Safety mechanism:** Before restoring, automatically creates a backup snapshot
named `auto/pre-restore/<timestamp>` so the current state can always be recovered.

**Restore steps:**

1. Verify current HEAD matches snapshot's `headSha` (aborts if different)
2. Create automatic pre-restore backup snapshot
3. Reset tracked files to HEAD
4. Clean untracked files (preserving `.branch-narrator/`)
5. Apply staged patch to recreate index state
6. Apply unstaged patch to recreate working tree deltas
7. Restore untracked files from stored blobs
8. Verify restore by comparing patch hashes

## Storage Location

All snapshot data is stored locally under `.branch-narrator/snapshots/`:

```
.branch-narrator/
  snapshots/
    index.json                    # Snapshot index
    <snapshotId>/
      snapshot.json               # Full snapshot with embedded analysis
      staged.patch                # Binary patch for staged changes
      unstaged.patch              # Binary patch for unstaged changes
      untracked/
        manifest.json             # Untracked file metadata
        blobs/
          <sha256>                # Raw file content
```

## Important Notes

### Add to .gitignore

Snapshots contain local workspace state and should not be committed:

```gitignore
# branch-narrator snapshots
.branch-narrator/
```

### Security Considerations

Snapshots may contain sensitive local data:

- Untracked files with secrets
- Staged/unstaged changes with API keys
- Environment variable values in evidence

Keep `.branch-narrator/` local and do not share snapshot directories.

### Determinism

- Snapshot IDs are deterministic for identical workspace state
- `snap diff` output uses stable, sorted ordering
- Embedded analysis omits timestamps for comparability
- Internal `.branch-narrator/` data is excluded from untracked capture

### HEAD Requirements

Snapshots can only be restored when HEAD matches the original commit.
This ensures patches apply cleanly and prevents unexpected conflicts.

## Agent Workflow Example

```bash
# 1. Save initial state
INITIAL=$(branch-narrator snap save "before-refactor")

# 2. Make changes...
# ...

# 3. Save progress
ATTEMPT1=$(branch-narrator snap save "attempt-1")

# 4. Compare to initial state
branch-narrator snap diff $INITIAL $ATTEMPT1 --pretty

# 5. If regression detected, restore initial state
branch-narrator snap restore $INITIAL

# 6. The pre-restore backup is available in snap list
branch-narrator snap list
```

## Schema Version

Current schema version: `1.0`

The `schemaVersion` field in all outputs allows for future schema evolution
while maintaining backward compatibility.
