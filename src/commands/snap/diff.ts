/**
 * Snap diff command implementation.
 *
 * Compares two snapshots and outputs a delta showing what changed.
 */

import type {
  SnapDiffOptions,
  SnapshotDelta,
  SnapshotJson,
  FindingChange,
  FlagChange,
} from "./types.js";
import { readSnapshotJson, readManifest, snapshotExists } from "./storage.js";
import { SnapshotNotFoundError } from "./show.js";
import type { Finding, RiskFlag } from "../../core/types.js";

/**
 * Execute the snap diff command.
 *
 * Compares two snapshots and returns a delta with:
 * - Risk score change
 * - Findings added/removed/changed
 * - Flags added/removed/changed
 * - Files added/removed/modified
 */
export async function executeSnapDiff(
  fromId: string,
  toId: string,
  options: SnapDiffOptions = {}
): Promise<SnapshotDelta> {
  const cwd = options.cwd ?? process.cwd();

  // Validate both snapshots exist
  if (!(await snapshotExists(fromId, cwd))) {
    throw new SnapshotNotFoundError(fromId);
  }
  if (!(await snapshotExists(toId, cwd))) {
    throw new SnapshotNotFoundError(toId);
  }

  // Load both snapshots
  const [fromSnapshot, toSnapshot] = await Promise.all([
    readSnapshotJson(fromId, cwd),
    readSnapshotJson(toId, cwd),
  ]);

  // Load manifests for file comparison
  const [fromManifest, toManifest] = await Promise.all([
    readManifest(fromId, cwd),
    readManifest(toId, cwd),
  ]);

  // Compute findings delta
  const findingsDelta = computeFindingsDelta(
    fromSnapshot.analysis.facts.findings,
    toSnapshot.analysis.facts.findings
  );

  // Compute flags delta
  const flagsDelta = computeFlagsDelta(
    fromSnapshot.analysis.riskReport.flags,
    toSnapshot.analysis.riskReport.flags
  );

  // Compute files delta
  const filesDelta = computeFilesDelta(fromSnapshot, toSnapshot, fromManifest.entries, toManifest.entries);

  // Build delta object
  const delta: SnapshotDelta = {
    schemaVersion: "1.0",
    from: fromId,
    to: toId,
    delta: {
      riskScore: {
        from: fromSnapshot.analysis.riskReport.riskScore,
        to: toSnapshot.analysis.riskReport.riskScore,
        delta: toSnapshot.analysis.riskReport.riskScore - fromSnapshot.analysis.riskReport.riskScore,
      },
      findings: findingsDelta,
      flags: flagsDelta,
      files: filesDelta,
    },
    summary: {
      findingsAdded: findingsDelta.added.length,
      findingsRemoved: findingsDelta.removed.length,
      findingsChanged: findingsDelta.changed.length,
      flagsAdded: flagsDelta.added.length,
      flagsRemoved: flagsDelta.removed.length,
      flagsChanged: flagsDelta.changed.length,
      filesAdded: filesDelta.added.length,
      filesRemoved: filesDelta.removed.length,
      filesModified: filesDelta.modified.length,
    },
  };

  return delta;
}

/**
 * Compute delta between two sets of findings.
 */
function computeFindingsDelta(
  fromFindings: Finding[],
  toFindings: Finding[]
): { added: string[]; removed: string[]; changed: FindingChange[] } {
  const fromMap = new Map<string, Finding>();
  const toMap = new Map<string, Finding>();

  // Build maps keyed by findingId
  for (const finding of fromFindings) {
    if (finding.findingId) {
      fromMap.set(finding.findingId, finding);
    }
  }
  for (const finding of toFindings) {
    if (finding.findingId) {
      toMap.set(finding.findingId, finding);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  const changed: FindingChange[] = [];

  // Find removed (in from but not in to)
  for (const id of fromMap.keys()) {
    if (!toMap.has(id)) {
      removed.push(id);
    }
  }

  // Find added and changed
  for (const [id, toFinding] of toMap) {
    const fromFinding = fromMap.get(id);
    if (!fromFinding) {
      added.push(id);
    } else {
      // Check if finding changed (deep comparison)
      if (!deepEqual(fromFinding, toFinding)) {
        changed.push({
          findingId: id,
          before: fromFinding,
          after: toFinding,
        });
      }
    }
  }

  // Sort all arrays for determinism
  added.sort();
  removed.sort();
  changed.sort((a, b) => a.findingId.localeCompare(b.findingId));

  return { added, removed, changed };
}

/**
 * Compute delta between two sets of flags.
 */
function computeFlagsDelta(
  fromFlags: RiskFlag[],
  toFlags: RiskFlag[]
): { added: string[]; removed: string[]; changed: FlagChange[] } {
  const fromMap = new Map<string, RiskFlag>();
  const toMap = new Map<string, RiskFlag>();

  // Build maps keyed by flagId
  for (const flag of fromFlags) {
    if (flag.flagId) {
      fromMap.set(flag.flagId, flag);
    }
  }
  for (const flag of toFlags) {
    if (flag.flagId) {
      toMap.set(flag.flagId, flag);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  const changed: FlagChange[] = [];

  // Find removed (in from but not in to)
  for (const id of fromMap.keys()) {
    if (!toMap.has(id)) {
      removed.push(id);
    }
  }

  // Find added and changed
  for (const [id, toFlag] of toMap) {
    const fromFlag = fromMap.get(id);
    if (!fromFlag) {
      added.push(id);
    } else {
      // Check if flag changed (deep comparison)
      if (!deepEqual(fromFlag, toFlag)) {
        changed.push({
          flagId: id,
          before: fromFlag,
          after: toFlag,
        });
      }
    }
  }

  // Sort all arrays for determinism
  added.sort();
  removed.sort();
  changed.sort((a, b) => a.flagId.localeCompare(b.flagId));

  return { added, removed, changed };
}

/**
 * Compute delta between files in two snapshots.
 */
function computeFilesDelta(
  fromSnapshot: SnapshotJson,
  toSnapshot: SnapshotJson,
  fromManifestEntries: Array<{ path: string; blobSha256: string }>,
  toManifestEntries: Array<{ path: string; blobSha256: string }>
): { added: string[]; removed: string[]; modified: string[] } {
  // Collect all files from both snapshots
  const fromFiles = new Set<string>();
  const toFiles = new Set<string>();
  const fromHashes = new Map<string, string>();
  const toHashes = new Map<string, string>();

  // Add files from facts.changeset.files
  const fromChangeset = fromSnapshot.analysis.facts.changeset;
  const toChangeset = toSnapshot.analysis.facts.changeset;

  for (const file of fromChangeset.files.added) {
    fromFiles.add(file);
    fromHashes.set(file, "added");
  }
  for (const file of fromChangeset.files.modified) {
    fromFiles.add(file);
    fromHashes.set(file, "modified");
  }
  for (const file of fromChangeset.files.deleted) {
    fromFiles.add(file);
    fromHashes.set(file, "deleted");
  }
  for (const { from, to } of fromChangeset.files.renamed) {
    fromFiles.add(from);
    fromFiles.add(to);
    fromHashes.set(from, `renamed:${to}`);
  }

  for (const file of toChangeset.files.added) {
    toFiles.add(file);
    toHashes.set(file, "added");
  }
  for (const file of toChangeset.files.modified) {
    toFiles.add(file);
    toHashes.set(file, "modified");
  }
  for (const file of toChangeset.files.deleted) {
    toFiles.add(file);
    toHashes.set(file, "deleted");
  }
  for (const { from, to } of toChangeset.files.renamed) {
    toFiles.add(from);
    toFiles.add(to);
    toHashes.set(from, `renamed:${to}`);
  }

  // Add untracked files from manifests
  for (const entry of fromManifestEntries) {
    fromFiles.add(entry.path);
    fromHashes.set(entry.path, entry.blobSha256);
  }
  for (const entry of toManifestEntries) {
    toFiles.add(entry.path);
    toHashes.set(entry.path, entry.blobSha256);
  }

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Find removed (in from but not in to)
  for (const file of fromFiles) {
    if (!toFiles.has(file)) {
      removed.push(file);
    }
  }

  // Find added and modified
  for (const file of toFiles) {
    if (!fromFiles.has(file)) {
      added.push(file);
    } else {
      // Check if file changed
      const fromHash = fromHashes.get(file);
      const toHash = toHashes.get(file);
      if (fromHash !== toHash) {
        modified.push(file);
      }
    }
  }

  // Sort all arrays for determinism
  added.sort();
  removed.sort();
  modified.sort();

  return { added, removed, modified };
}

/**
 * Deep equality comparison for objects.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aKeys = Object.keys(a as object).sort();
  const bKeys = Object.keys(b as object).sort();

  if (aKeys.length !== bKeys.length) return false;
  if (!aKeys.every((key, i) => key === bKeys[i])) return false;

  for (const key of aKeys) {
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Render snapshot delta as JSON string.
 */
export function renderSnapDiffJSON(delta: SnapshotDelta, pretty: boolean = false): string {
  return pretty
    ? JSON.stringify(delta, null, 2)
    : JSON.stringify(delta);
}
