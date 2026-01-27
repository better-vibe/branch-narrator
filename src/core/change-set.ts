/**
 * ChangeSet builder utilities.
 *
 * Uses the high-performance DOD (Data-Oriented Design) parser for diff parsing.
 * All diff parsing is now done through the DOD parser for optimal performance.
 */

import type {
  ChangeSet,
  FileChange,
  FileDiff,
  FileStatus,
} from "./types.js";
import {
  parseDiffString,
  toFileDiffs,
} from "../git/dod/index.js";

/**
 * Parse git diff --name-status output into FileChange array.
 */
export function parseNameStatus(output: string): FileChange[] {
  if (!output.trim()) return [];

  const lines = output.trim().split("\n").filter(Boolean);
  const changes: FileChange[] = [];

  for (const line of lines) {
    const parts = line.split("\t");
    const statusCode = parts[0];

    if (statusCode.startsWith("R")) {
      // Rename: R100\told\tnew
      changes.push({
        path: parts[2],
        status: "renamed",
        oldPath: parts[1],
      });
    } else if (statusCode === "A") {
      changes.push({ path: parts[1], status: "added" });
    } else if (statusCode === "M") {
      changes.push({ path: parts[1], status: "modified" });
    } else if (statusCode === "D") {
      changes.push({ path: parts[1], status: "deleted" });
    }
  }

  return changes;
}

/**
 * Build a ChangeSet from raw git diff output using DOD parser.
 *
 * This is the primary entry point for building ChangeSets. It uses the
 * high-performance DOD parser internally for optimal memory usage and speed.
 */
export function buildChangeSet(params: {
  base: string;
  head: string;
  nameStatusOutput: string;
  unifiedDiff: string;
  basePackageJson?: Record<string, unknown>;
  headPackageJson?: Record<string, unknown>;
}): ChangeSet {
  const files = parseNameStatus(params.nameStatusOutput);

  // Parse diff using DOD parser
  let diffs: FileDiff[];

  if (params.unifiedDiff.trim()) {
    const parseResult = parseDiffString(params.unifiedDiff);
    const dodDiffs = toFileDiffs(parseResult, { lazy: false });

    // Apply status from name-status output
    diffs = applyFileStatuses(dodDiffs, files);
  } else {
    diffs = [];
  }

  return {
    base: params.base,
    head: params.head,
    files,
    diffs,
    basePackageJson: params.basePackageJson,
    headPackageJson: params.headPackageJson,
  };
}

/**
 * Apply file statuses from name-status output to parsed diffs.
 * The DOD parser determines status from diff content, but name-status
 * provides more accurate information (especially for renames).
 */
function applyFileStatuses(
  diffs: FileDiff[],
  fileChanges: FileChange[]
): FileDiff[] {
  const statusMap = new Map<string, FileStatus>();
  const oldPathMap = new Map<string, string>();

  for (const fc of fileChanges) {
    statusMap.set(fc.path, fc.status);
    if (fc.oldPath) {
      oldPathMap.set(fc.path, fc.oldPath);
      statusMap.set(fc.oldPath, fc.status);
    }
  }

  return diffs.map((diff) => {
    // Normalize path (remove a/ or b/ prefix if present)
    const normalizedPath = diff.path.replace(/^[ab]\//, "");
    const status = statusMap.get(normalizedPath) ?? diff.status;
    const oldPath = oldPathMap.get(normalizedPath) ?? diff.oldPath;

    return {
      ...diff,
      path: normalizedPath,
      status,
      oldPath,
    };
  });
}

/**
 * Build a ChangeSet by merging multiple diff sources.
 *
 * Used when combining tracked file diffs with untracked file diffs.
 */
export function buildChangeSetMerged(params: {
  base: string;
  head: string;
  nameStatusOutput: string;
  unifiedDiff: string;
  additionalDiffs?: FileDiff[];
  additionalNameStatus?: string;
  basePackageJson?: Record<string, unknown>;
  headPackageJson?: Record<string, unknown>;
}): ChangeSet {
  // Parse main diff
  let nameStatus = params.nameStatusOutput;
  if (params.additionalNameStatus) {
    nameStatus = nameStatus
      ? `${nameStatus}\n${params.additionalNameStatus}`
      : params.additionalNameStatus;
  }

  const files = parseNameStatus(nameStatus);

  // Parse tracked files diff using DOD parser
  let diffs: FileDiff[] = [];

  if (params.unifiedDiff.trim()) {
    const parseResult = parseDiffString(params.unifiedDiff);
    const dodDiffs = toFileDiffs(parseResult, { lazy: false });
    diffs = applyFileStatuses(dodDiffs, files);
  }

  // Merge additional diffs (e.g., untracked files)
  if (params.additionalDiffs && params.additionalDiffs.length > 0) {
    diffs = [...diffs, ...params.additionalDiffs];
  }

  return {
    base: params.base,
    head: params.head,
    files,
    diffs,
    basePackageJson: params.basePackageJson,
    headPackageJson: params.headPackageJson,
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal ChangeSet for testing purposes.
 */
export function createTestChangeSet(
  overrides: Partial<ChangeSet> = {}
): ChangeSet {
  return {
    base: "main",
    head: "HEAD",
    files: [],
    diffs: [],
    ...overrides,
  };
}

/**
 * Create a FileDiff with additions for testing.
 */
export function createTestFileDiff(
  path: string,
  additions: string[],
  status: FileStatus = "modified"
): FileDiff {
  return {
    path,
    status,
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: additions.length,
        content: "@@ -0,0 +1 @@",
        additions,
        deletions: [],
      },
    ],
  };
}
