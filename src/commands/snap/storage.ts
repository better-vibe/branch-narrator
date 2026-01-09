/**
 * Storage utilities for snapshot management.
 *
 * Handles reading/writing snapshot files, index management,
 * and directory structure operations.
 */

import { mkdir, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type {
  SnapshotJson,
  SnapshotIndex,
  SnapshotIndexEntry,
  SnapshotManifest,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Base directory for branch-narrator data */
export const BRANCH_NARRATOR_DIR = ".branch-narrator";

/** Snapshots subdirectory */
export const SNAPSHOTS_DIR = "snapshots";

/** Index file name */
export const INDEX_FILE = "index.json";

/** Snapshot JSON file name */
export const SNAPSHOT_FILE = "snapshot.json";

/** Staged patch file name */
export const STAGED_PATCH_FILE = "staged.patch";

/** Unstaged patch file name */
export const UNSTAGED_PATCH_FILE = "unstaged.patch";

/** Untracked files directory name */
export const UNTRACKED_DIR = "untracked";

/** Manifest file name */
export const MANIFEST_FILE = "manifest.json";

/** Blobs directory name */
export const BLOBS_DIR = "blobs";

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * Get the snapshots base directory path.
 */
export function getSnapshotsDir(cwd: string = process.cwd()): string {
  return join(cwd, BRANCH_NARRATOR_DIR, SNAPSHOTS_DIR);
}

/**
 * Get the path to the snapshot index file.
 */
export function getIndexPath(cwd: string = process.cwd()): string {
  return join(getSnapshotsDir(cwd), INDEX_FILE);
}

/**
 * Get the path to a specific snapshot directory.
 */
export function getSnapshotDir(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getSnapshotsDir(cwd), snapshotId);
}

/**
 * Get the path to a snapshot's JSON file.
 */
export function getSnapshotJsonPath(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getSnapshotDir(snapshotId, cwd), SNAPSHOT_FILE);
}

/**
 * Get the path to a snapshot's staged patch file.
 */
export function getStagedPatchPath(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getSnapshotDir(snapshotId, cwd), STAGED_PATCH_FILE);
}

/**
 * Get the path to a snapshot's unstaged patch file.
 */
export function getUnstagedPatchPath(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getSnapshotDir(snapshotId, cwd), UNSTAGED_PATCH_FILE);
}

/**
 * Get the path to a snapshot's untracked files directory.
 */
export function getUntrackedDir(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getSnapshotDir(snapshotId, cwd), UNTRACKED_DIR);
}

/**
 * Get the path to a snapshot's manifest file.
 */
export function getManifestPath(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getUntrackedDir(snapshotId, cwd), MANIFEST_FILE);
}

/**
 * Get the path to a snapshot's blobs directory.
 */
export function getBlobsDir(snapshotId: string, cwd: string = process.cwd()): string {
  return join(getUntrackedDir(snapshotId, cwd), BLOBS_DIR);
}

/**
 * Get the path to a specific blob file.
 */
export function getBlobPath(snapshotId: string, blobSha256: string, cwd: string = process.cwd()): string {
  return join(getBlobsDir(snapshotId, cwd), blobSha256);
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * Compute SHA256 hash of a buffer.
 */
export function computeSha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Compute snapshot ID from components.
 * Returns first 12 hex chars of SHA256 hash.
 */
export function computeSnapshotId(
  headSha: string,
  stagedPatchSha: string,
  unstagedPatchSha: string,
  manifestContent: string
): string {
  const fingerprint = `${headSha}:${stagedPatchSha}:${unstagedPatchSha}:${manifestContent}`;
  const hash = createHash("sha256").update(fingerprint).digest("hex");
  return hash.slice(0, 12);
}

// ============================================================================
// Directory Management
// ============================================================================

/**
 * Ensure the snapshots directory exists.
 */
export async function ensureSnapshotsDir(cwd: string = process.cwd()): Promise<void> {
  await mkdir(getSnapshotsDir(cwd), { recursive: true });
}

/**
 * Ensure a snapshot directory and its subdirectories exist.
 */
export async function ensureSnapshotDirs(snapshotId: string, cwd: string = process.cwd()): Promise<void> {
  const snapshotDir = getSnapshotDir(snapshotId, cwd);
  await mkdir(snapshotDir, { recursive: true });
  await mkdir(getBlobsDir(snapshotId, cwd), { recursive: true });
}

/**
 * Check if a snapshot exists.
 */
export async function snapshotExists(snapshotId: string, cwd: string = process.cwd()): Promise<boolean> {
  try {
    const jsonPath = getSnapshotJsonPath(snapshotId, cwd);
    await stat(jsonPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a snapshot directory.
 */
export async function deleteSnapshot(snapshotId: string, cwd: string = process.cwd()): Promise<void> {
  const snapshotDir = getSnapshotDir(snapshotId, cwd);
  await rm(snapshotDir, { recursive: true, force: true });
}

// ============================================================================
// Index Operations
// ============================================================================

/**
 * Read the snapshot index.
 * Returns empty index if file doesn't exist.
 */
export async function readIndex(cwd: string = process.cwd()): Promise<SnapshotIndex> {
  try {
    const indexPath = getIndexPath(cwd);
    const content = await readFile(indexPath, "utf-8");
    return JSON.parse(content) as SnapshotIndex;
  } catch {
    return {
      schemaVersion: "1.0",
      snapshots: [],
    };
  }
}

/**
 * Write the snapshot index.
 */
export async function writeIndex(index: SnapshotIndex, cwd: string = process.cwd()): Promise<void> {
  await ensureSnapshotsDir(cwd);
  const indexPath = getIndexPath(cwd);
  await writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
}

/**
 * Add an entry to the snapshot index.
 * Maintains sorted order by createdAt descending.
 */
export async function addIndexEntry(entry: SnapshotIndexEntry, cwd: string = process.cwd()): Promise<void> {
  const index = await readIndex(cwd);

  // Remove existing entry with same ID if present
  index.snapshots = index.snapshots.filter((s) => s.snapshotId !== entry.snapshotId);

  // Add new entry
  index.snapshots.push(entry);

  // Sort by createdAt descending (newest first)
  index.snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  await writeIndex(index, cwd);
}

/**
 * Remove an entry from the snapshot index.
 */
export async function removeIndexEntry(snapshotId: string, cwd: string = process.cwd()): Promise<void> {
  const index = await readIndex(cwd);
  index.snapshots = index.snapshots.filter((s) => s.snapshotId !== snapshotId);
  await writeIndex(index, cwd);
}

// ============================================================================
// Snapshot JSON Operations
// ============================================================================

/**
 * Read a snapshot JSON file.
 */
export async function readSnapshotJson(snapshotId: string, cwd: string = process.cwd()): Promise<SnapshotJson> {
  const jsonPath = getSnapshotJsonPath(snapshotId, cwd);
  const content = await readFile(jsonPath, "utf-8");
  return JSON.parse(content) as SnapshotJson;
}

/**
 * Write a snapshot JSON file.
 */
export async function writeSnapshotJson(
  snapshotId: string,
  snapshot: SnapshotJson,
  cwd: string = process.cwd()
): Promise<void> {
  await ensureSnapshotDirs(snapshotId, cwd);
  const jsonPath = getSnapshotJsonPath(snapshotId, cwd);
  await writeFile(jsonPath, JSON.stringify(snapshot, null, 2), "utf-8");
}

// ============================================================================
// Patch File Operations
// ============================================================================

/**
 * Write a patch file.
 */
export async function writePatchFile(
  snapshotId: string,
  type: "staged" | "unstaged",
  content: Buffer,
  cwd: string = process.cwd()
): Promise<{ path: string; sha256: string; bytes: number }> {
  await ensureSnapshotDirs(snapshotId, cwd);

  const filename = type === "staged" ? STAGED_PATCH_FILE : UNSTAGED_PATCH_FILE;
  const filePath = join(getSnapshotDir(snapshotId, cwd), filename);

  await writeFile(filePath, content);

  return {
    path: filename,
    sha256: computeSha256(content),
    bytes: content.length,
  };
}

/**
 * Read a patch file.
 */
export async function readPatchFile(
  snapshotId: string,
  type: "staged" | "unstaged",
  cwd: string = process.cwd()
): Promise<Buffer> {
  const filePath = type === "staged"
    ? getStagedPatchPath(snapshotId, cwd)
    : getUnstagedPatchPath(snapshotId, cwd);
  return await readFile(filePath);
}

// ============================================================================
// Manifest Operations
// ============================================================================

/**
 * Read a snapshot's manifest.
 */
export async function readManifest(snapshotId: string, cwd: string = process.cwd()): Promise<SnapshotManifest> {
  try {
    const manifestPath = getManifestPath(snapshotId, cwd);
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as SnapshotManifest;
  } catch {
    return { entries: [] };
  }
}

/**
 * Write a snapshot's manifest.
 */
export async function writeManifest(
  snapshotId: string,
  manifest: SnapshotManifest,
  cwd: string = process.cwd()
): Promise<void> {
  await ensureSnapshotDirs(snapshotId, cwd);
  const manifestPath = getManifestPath(snapshotId, cwd);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

// ============================================================================
// Blob Operations
// ============================================================================

/**
 * Write a blob file.
 * Returns the SHA256 hash used as filename.
 */
export async function writeBlob(
  snapshotId: string,
  content: Buffer,
  cwd: string = process.cwd()
): Promise<string> {
  await ensureSnapshotDirs(snapshotId, cwd);

  const sha256 = computeSha256(content);
  const blobPath = getBlobPath(snapshotId, sha256, cwd);

  await writeFile(blobPath, content);

  return sha256;
}

/**
 * Read a blob file.
 */
export async function readBlob(
  snapshotId: string,
  blobSha256: string,
  cwd: string = process.cwd()
): Promise<Buffer> {
  const blobPath = getBlobPath(snapshotId, blobSha256, cwd);
  return await readFile(blobPath);
}

/**
 * Check if a blob exists.
 */
export async function blobExists(
  snapshotId: string,
  blobSha256: string,
  cwd: string = process.cwd()
): Promise<boolean> {
  try {
    const blobPath = getBlobPath(snapshotId, blobSha256, cwd);
    await stat(blobPath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List all snapshot IDs.
 */
export async function listSnapshotIds(cwd: string = process.cwd()): Promise<string[]> {
  try {
    const snapshotsDir = getSnapshotsDir(cwd);
    const entries = await readdir(snapshotsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== BLOBS_DIR)
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Create an index entry from a snapshot.
 */
export function createIndexEntry(snapshot: SnapshotJson): SnapshotIndexEntry {
  return {
    snapshotId: snapshot.snapshotId,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    headSha: snapshot.git.headSha,
    branch: snapshot.git.branch,
    filesChanged: snapshot.analysis.facts.stats.filesChanged,
    riskScore: snapshot.analysis.riskReport.riskScore,
    flagCount: snapshot.analysis.riskReport.flags.length,
    findingCount: snapshot.analysis.facts.findings.length,
  };
}

/**
 * Generate a timestamp string for auto-generated labels.
 */
export function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Generate an auto-restore label.
 */
export function generateAutoRestoreLabel(): string {
  return `auto/pre-restore/${generateTimestamp()}`;
}
