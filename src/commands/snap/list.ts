/**
 * Snap list command implementation.
 *
 * Lists all snapshots with summary information.
 */

import type { SnapListOptions, SnapshotIndex } from "./types.js";
import { readIndex } from "./storage.js";

/**
 * Execute the snap list command.
 *
 * Returns the snapshot index with all entries sorted by createdAt descending.
 */
export async function executeSnapList(options: SnapListOptions = {}): Promise<SnapshotIndex> {
  const cwd = options.cwd ?? process.cwd();
  
  const index = await readIndex(cwd);
  
  // Ensure sorted by createdAt descending (newest first)
  index.snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  
  return index;
}

/**
 * Render snapshot list as JSON string.
 */
export function renderSnapListJSON(index: SnapshotIndex, pretty: boolean = false): string {
  return pretty
    ? JSON.stringify(index, null, 2)
    : JSON.stringify(index);
}
