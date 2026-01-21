/**
 * Snap command module - local workspace snapshots.
 *
 * Provides commands for creating, listing, comparing, and restoring
 * snapshots of local work.
 */

// Export all types
export * from "./types.js";

// Export storage utilities
export {
  getSnapshotsDir,
  getSnapshotDir,
  snapshotExists,
  readIndex,
  readSnapshotJson,
  computeSnapshotId,
} from "./storage.js";

// Export git operations
export {
  getHeadSha,
  getCurrentBranch,
  getStagedPatch,
  getUnstagedPatch,
  getUntrackedFiles,
} from "./git-ops.js";

// Export command implementations
export { executeSnapSave } from "./save.js";
export { executeSnapList, renderSnapListJSON } from "./list.js";
export { executeSnapShow, renderSnapShowJSON, SnapshotNotFoundError } from "./show.js";
export { executeSnapDiff, renderSnapDiffJSON } from "./diff.js";
export { executeSnapRestore, HeadMismatchError, PatchApplicationError, RestoreVerificationError } from "./restore.js";
