/**
 * Snap show command implementation.
 *
 * Shows the full details of a specific snapshot.
 */

import type { SnapShowOptions, SnapshotJson } from "./types.js";
import { readSnapshotJson, snapshotExists } from "./storage.js";
import { BranchNarratorError } from "../../core/errors.js";

/**
 * Error thrown when snapshot is not found.
 */
export class SnapshotNotFoundError extends BranchNarratorError {
  constructor(snapshotId: string) {
    super(`Snapshot not found: ${snapshotId}`, 1);
    this.name = "SnapshotNotFoundError";
  }
}

/**
 * Execute the snap show command.
 *
 * Returns the full snapshot JSON for the given ID.
 */
export async function executeSnapShow(
  snapshotId: string,
  options: SnapShowOptions = {}
): Promise<SnapshotJson> {
  const cwd = options.cwd ?? process.cwd();

  // Check if snapshot exists
  if (!(await snapshotExists(snapshotId, cwd))) {
    throw new SnapshotNotFoundError(snapshotId);
  }

  return await readSnapshotJson(snapshotId, cwd);
}

/**
 * Render snapshot as JSON string.
 */
export function renderSnapShowJSON(snapshot: SnapshotJson, pretty: boolean = false): string {
  return pretty
    ? JSON.stringify(snapshot, null, 2)
    : JSON.stringify(snapshot);
}
