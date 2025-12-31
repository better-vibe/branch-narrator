/**
 * ChangeSet builder utilities.
 */

import type {
  ChangeSet,
  FileChange,
  FileDiff,
  FileStatus,
  Hunk,
} from "./types.js";

/**
 * Parse git diff --name-status output into FileChange array.
 */
export function parseNameStatus(output: string): FileChange[] {
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
 * Convert parse-diff File to our FileDiff structure.
 */
export function convertParsedDiff(
  parsed: ParseDiffFile[],
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

  return parsed.map((file) => {
    const path = file.to === "/dev/null" ? file.from! : file.to!;
    const normalizedPath = path.replace(/^[ab]\//, "");
    const status = statusMap.get(normalizedPath) ?? "modified";

    const hunks: Hunk[] = (file.chunks || []).map((chunk) => {
      const additions: string[] = [];
      const deletions: string[] = [];

      for (const change of chunk.changes || []) {
        if (change.type === "add") {
          additions.push(change.content.slice(1)); // Remove leading +
        } else if (change.type === "del") {
          deletions.push(change.content.slice(1)); // Remove leading -
        }
      }

      return {
        oldStart: chunk.oldStart,
        oldLines: chunk.oldLines,
        newStart: chunk.newStart,
        newLines: chunk.newLines,
        content: chunk.content,
        additions,
        deletions,
      };
    });

    return {
      path: normalizedPath,
      status,
      oldPath: oldPathMap.get(normalizedPath),
      hunks,
    };
  });
}

/**
 * Build a ChangeSet from raw git outputs.
 */
export function buildChangeSet(params: {
  base: string;
  head: string;
  nameStatusOutput: string;
  parsedDiffs: ParseDiffFile[];
  basePackageJson?: Record<string, unknown>;
  headPackageJson?: Record<string, unknown>;
}): ChangeSet {
  const files = parseNameStatus(params.nameStatusOutput);
  const diffs = convertParsedDiff(params.parsedDiffs, files);

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
// Type definitions for parse-diff (simplified)
// ============================================================================

export interface ParseDiffChange {
  type: "add" | "del" | "normal";
  content: string;
  ln?: number;
  ln1?: number;
  ln2?: number;
}

export interface ParseDiffChunk {
  content: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: ParseDiffChange[];
}

export interface ParseDiffFile {
  from?: string;
  to?: string;
  chunks: ParseDiffChunk[];
  deletions: number;
  additions: number;
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

