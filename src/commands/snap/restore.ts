/**
 * Snap restore command implementation.
 *
 * Restores the workspace to match a snapshot exactly.
 * Always creates an automatic pre-restore backup snapshot first.
 */

import type { SnapRestoreOptions, SnapRestoreResult } from "./types.js";
import {
  readSnapshotJson,
  readManifest,
  readPatchFile,
  readBlob,
  snapshotExists,
  generateAutoRestoreLabel,
  computeSha256,
} from "./storage.js";
import {
  getHeadSha,
  resetHard,
  cleanUntracked,
  applyPatchFromBuffer,
  writeWorkingFile,
  getStagedPatch,
  getUnstagedPatch,
} from "./git-ops.js";
import { executeSnapSave } from "./save.js";
import { SnapshotNotFoundError } from "./show.js";
import { BranchNarratorError } from "../../core/errors.js";

/**
 * Error thrown when HEAD SHA doesn't match snapshot.
 */
export class HeadMismatchError extends BranchNarratorError {
  constructor(expected: string, actual: string) {
    super(
      `HEAD mismatch: snapshot was created at ${expected.slice(0, 8)} but current HEAD is ${actual.slice(0, 8)}. ` +
      `Snapshots can only be restored when HEAD matches the original commit.`,
      1
    );
    this.name = "HeadMismatchError";
  }
}

/**
 * Error thrown when patch application fails.
 */
export class PatchApplicationError extends BranchNarratorError {
  constructor(patchType: "staged" | "unstaged", message: string) {
    super(`Failed to apply ${patchType} patch: ${message}`, 1);
    this.name = "PatchApplicationError";
  }
}

/**
 * Error thrown when restore verification fails.
 */
export class RestoreVerificationError extends BranchNarratorError {
  constructor(message: string) {
    super(`Restore verification failed: ${message}`, 1);
    this.name = "RestoreVerificationError";
  }
}

/**
 * Execute the snap restore command.
 *
 * Restores the workspace to match a snapshot:
 * 1. Verify HEAD SHA matches
 * 2. Create auto pre-restore backup
 * 3. Reset tracked files to HEAD
 * 4. Clean untracked files
 * 5. Apply staged patch
 * 6. Apply unstaged patch
 * 7. Restore untracked files from blobs
 * 8. Verify restore succeeded
 */
export async function executeSnapRestore(
  snapshotId: string,
  options: SnapRestoreOptions = {}
): Promise<SnapRestoreResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Validate snapshot exists
  if (!(await snapshotExists(snapshotId, cwd))) {
    throw new SnapshotNotFoundError(snapshotId);
  }

  // Load snapshot
  const snapshot = await readSnapshotJson(snapshotId, cwd);

  // 2. Verify HEAD SHA matches
  const currentHead = await getHeadSha(cwd);
  if (currentHead !== snapshot.git.headSha) {
    throw new HeadMismatchError(snapshot.git.headSha, currentHead);
  }

  // 3. Create automatic pre-restore backup snapshot
  const backupLabel = generateAutoRestoreLabel();
  const backupResult = await executeSnapSave({
    label: backupLabel,
    cwd,
  });

  // 4. Reset tracked files to HEAD
  await resetHard(cwd);

  // 5. Clean untracked files
  await cleanUntracked(cwd);

  // 6. Load and apply staged patch
  const stagedPatch = await readPatchFile(snapshotId, "staged", cwd);
  if (stagedPatch.length > 0) {
    try {
      // Apply to index (--cached)
      await applyPatchFromBuffer(stagedPatch, { cached: true }, cwd);
      // Apply to working tree
      await applyPatchFromBuffer(stagedPatch, {}, cwd);
    } catch (error) {
      throw new PatchApplicationError(
        "staged",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // 7. Load and apply unstaged patch
  const unstagedPatch = await readPatchFile(snapshotId, "unstaged", cwd);
  if (unstagedPatch.length > 0) {
    try {
      // Apply to working tree only
      await applyPatchFromBuffer(unstagedPatch, {}, cwd);
    } catch (error) {
      throw new PatchApplicationError(
        "unstaged",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // 8. Restore untracked files from blobs
  const manifest = await readManifest(snapshotId, cwd);
  for (const entry of manifest.entries) {
    const content = await readBlob(snapshotId, entry.blobSha256, cwd);
    await writeWorkingFile(entry.path, content, entry.mode, cwd);
  }

  // 9. Verify restore by comparing patch hashes
  const verified = await verifyRestore(snapshot, cwd);

  return {
    snapshotId,
    backupSnapshotId: backupResult.snapshotId,
    success: true,
    verified,
  };
}

/**
 * Verify that the restore succeeded by comparing patch hashes.
 */
async function verifyRestore(
  snapshot: { workspace: { patches: { staged: { sha256: string }; unstaged: { sha256: string } } } },
  cwd: string
): Promise<boolean> {
  try {
    // Get current patches
    const [currentStagedPatch, currentUnstagedPatch] = await Promise.all([
      getStagedPatch(cwd),
      getUnstagedPatch(cwd),
    ]);

    // Compare hashes
    const currentStagedSha = computeSha256(currentStagedPatch);
    const currentUnstagedSha = computeSha256(currentUnstagedPatch);

    const stagedMatch = currentStagedSha === snapshot.workspace.patches.staged.sha256;
    const unstagedMatch = currentUnstagedSha === snapshot.workspace.patches.unstaged.sha256;

    return stagedMatch && unstagedMatch;
  } catch {
    return false;
  }
}
