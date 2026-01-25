/**
 * Adapter Layer for DOD Parser Backward Compatibility.
 *
 * This module bridges the high-performance DOD parser with the existing
 * FileDiff/Hunk type system used throughout the codebase. It provides:
 *
 * 1. Lazy conversion from DiffArena to FileDiff[] on demand
 * 2. Partial materialization (only decode what's needed)
 * 3. Full materialization for compatibility with existing analyzers
 *
 * Migration strategy:
 * - Phase 1: Use adapter to convert DOD output to legacy types (current)
 * - Phase 2: Update analyzers to accept DOD types directly (future)
 * - Phase 3: Remove adapter layer entirely (future)
 */

import type {
  FileDiff,
  FileStatus,
  Hunk,
  FileChange,
} from "../../core/types.js";
import {
  DiffArena,
  LINE_TYPE_ADD,
  LINE_TYPE_DEL,
  FILE_STATUS_ADDED,
  FILE_STATUS_DELETED,
  FILE_STATUS_RENAMED,
} from "./arena.js";
import type { ParseResult } from "./streaming-parser.js";
import { StringInternPool } from "./intern.js";

/**
 * Convert DOD file status to legacy FileStatus string.
 */
function toFileStatus(status: number): FileStatus {
  switch (status) {
    case FILE_STATUS_ADDED:
      return "added";
    case FILE_STATUS_DELETED:
      return "deleted";
    case FILE_STATUS_RENAMED:
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Lazy FileDiff wrapper that defers string decoding until accessed.
 *
 * This class proxies access to file diff data, only decoding strings
 * from the arena when they're actually read. This is useful when
 * analyzers only need to check file paths without reading content.
 */
export class LazyFileDiff implements FileDiff {
  private readonly arena: DiffArena;
  private readonly fileIndex: number;
  private readonly internPool: StringInternPool;

  // Cached decoded values
  private _path: string | undefined;
  private _oldPath: string | undefined;
  private _status: FileStatus | undefined;
  private _hunks: Hunk[] | undefined;

  constructor(
    arena: DiffArena,
    fileIndex: number,
    internPool: StringInternPool
  ) {
    this.arena = arena;
    this.fileIndex = fileIndex;
    this.internPool = internPool;
  }

  get path(): string {
    if (this._path === undefined) {
      const offset = this.arena.filePathOffsets[this.fileIndex];
      const length = this.arena.filePathLengths[this.fileIndex];

      // Use intern pool for deduplication
      this._path = this.internPool.internFromBytes(
        this.arena["sourceBuffer"]!,
        offset,
        length
      );
    }
    return this._path;
  }

  get oldPath(): string | undefined {
    if (this._oldPath === undefined) {
      const length = this.arena.fileOldPathLengths[this.fileIndex];
      if (length === 0) {
        this._oldPath = undefined;
      } else {
        const offset = this.arena.fileOldPathOffsets[this.fileIndex];
        this._oldPath = this.internPool.internFromBytes(
          this.arena["sourceBuffer"]!,
          offset,
          length
        );
      }
    }
    return this._oldPath;
  }

  get status(): FileStatus {
    if (this._status === undefined) {
      this._status = toFileStatus(this.arena.fileStatuses[this.fileIndex]);
    }
    return this._status;
  }

  get hunks(): Hunk[] {
    if (this._hunks === undefined) {
      this._hunks = this.materializeHunks();
    }
    return this._hunks;
  }

  /**
   * Materialize all hunks for this file.
   */
  private materializeHunks(): Hunk[] {
    const hunks: Hunk[] = [];
    const firstHunk = this.arena.fileFirstHunkIndex[this.fileIndex];
    const hunkCount = this.arena.fileHunkCount[this.fileIndex];

    for (let h = firstHunk; h < firstHunk + hunkCount; h++) {
      const hunk = this.materializeHunk(h);
      hunks.push(hunk);
    }

    return hunks;
  }

  /**
   * Materialize a single hunk.
   */
  private materializeHunk(hunkIndex: number): Hunk {
    const oldStart = this.arena.hunkOldStarts[hunkIndex];
    const oldLines = this.arena.hunkOldLines[hunkIndex];
    const newStart = this.arena.hunkNewStarts[hunkIndex];
    const newLines = this.arena.hunkNewLines[hunkIndex];

    // Decode hunk header content
    const content = this.arena.decodeHunkContent(hunkIndex);

    // Collect additions and deletions
    const additions: string[] = [];
    const deletions: string[] = [];

    // Find lines belonging to this hunk
    for (let i = 0; i < this.arena.lineCount; i++) {
      if (
        this.arena.lineHunkIndices[i] === hunkIndex &&
        this.arena.lineFileIndices[i] === this.fileIndex
      ) {
        const lineType = this.arena.lineTypes[i];
        const lineContent = this.arena.decodeLineContent(i);

        if (lineType === LINE_TYPE_ADD) {
          additions.push(lineContent);
        } else if (lineType === LINE_TYPE_DEL) {
          deletions.push(lineContent);
        }
      }
    }

    return {
      oldStart,
      oldLines,
      newStart,
      newLines,
      content,
      additions,
      deletions,
    };
  }
}

/**
 * Convert a ParseResult to an array of FileDiff objects.
 *
 * Options:
 * - `lazy: true` (default): Returns LazyFileDiff instances that defer decoding
 * - `lazy: false`: Fully materializes all data immediately
 *
 * For most analyzer use cases, lazy mode provides better performance
 * since not all files/hunks are accessed.
 */
export function toFileDiffs(
  result: ParseResult,
  options: { lazy?: boolean } = {}
): FileDiff[] {
  const { arena, internPool } = result;
  const lazy = options.lazy ?? true;

  const diffs: FileDiff[] = [];

  for (let i = 0; i < arena.fileCount; i++) {
    if (lazy) {
      diffs.push(new LazyFileDiff(arena, i, internPool));
    } else {
      diffs.push(materializeFileDiff(arena, i, internPool));
    }
  }

  return diffs;
}

/**
 * Fully materialize a FileDiff from arena data.
 */
function materializeFileDiff(
  arena: DiffArena,
  fileIndex: number,
  internPool: StringInternPool
): FileDiff {
  // Decode path
  const pathOffset = arena.filePathOffsets[fileIndex];
  const pathLength = arena.filePathLengths[fileIndex];
  const path = internPool.internFromBytes(
    arena["sourceBuffer"]!,
    pathOffset,
    pathLength
  );

  // Decode old path if present
  let oldPath: string | undefined;
  const oldPathLength = arena.fileOldPathLengths[fileIndex];
  if (oldPathLength > 0) {
    const oldPathOffset = arena.fileOldPathOffsets[fileIndex];
    oldPath = internPool.internFromBytes(
      arena["sourceBuffer"]!,
      oldPathOffset,
      oldPathLength
    );
  }

  // Get status
  const status = toFileStatus(arena.fileStatuses[fileIndex]);

  // Materialize hunks
  const hunks: Hunk[] = [];
  const firstHunk = arena.fileFirstHunkIndex[fileIndex];
  const hunkCount = arena.fileHunkCount[fileIndex];

  for (let h = firstHunk; h < firstHunk + hunkCount; h++) {
    hunks.push(materializeHunk(arena, h, fileIndex));
  }

  return {
    path,
    status,
    oldPath,
    hunks,
  };
}

/**
 * Materialize a Hunk from arena data.
 */
function materializeHunk(
  arena: DiffArena,
  hunkIndex: number,
  fileIndex: number
): Hunk {
  const oldStart = arena.hunkOldStarts[hunkIndex];
  const oldLines = arena.hunkOldLines[hunkIndex];
  const newStart = arena.hunkNewStarts[hunkIndex];
  const newLines = arena.hunkNewLines[hunkIndex];
  const content = arena.decodeHunkContent(hunkIndex);

  const additions: string[] = [];
  const deletions: string[] = [];

  // Collect additions and deletions for this hunk
  for (let i = 0; i < arena.lineCount; i++) {
    if (
      arena.lineHunkIndices[i] === hunkIndex &&
      arena.lineFileIndices[i] === fileIndex
    ) {
      const lineType = arena.lineTypes[i];
      const lineContent = arena.decodeLineContent(i);

      if (lineType === LINE_TYPE_ADD) {
        additions.push(lineContent);
      } else if (lineType === LINE_TYPE_DEL) {
        deletions.push(lineContent);
      }
    }
  }

  return {
    oldStart,
    oldLines,
    newStart,
    newLines,
    content,
    additions,
    deletions,
  };
}

/**
 * Convert a ParseResult to an array of FileChange objects.
 * FileChange is a simpler type with just path and status info.
 */
export function toFileChanges(result: ParseResult): FileChange[] {
  const { arena, internPool } = result;
  const changes: FileChange[] = [];

  for (let i = 0; i < arena.fileCount; i++) {
    const pathOffset = arena.filePathOffsets[i];
    const pathLength = arena.filePathLengths[i];
    const path = internPool.internFromBytes(
      arena["sourceBuffer"]!,
      pathOffset,
      pathLength
    );

    const status = toFileStatus(arena.fileStatuses[i]);

    const change: FileChange = { path, status };

    // Add oldPath for renames
    const oldPathLength = arena.fileOldPathLengths[i];
    if (oldPathLength > 0) {
      const oldPathOffset = arena.fileOldPathOffsets[i];
      change.oldPath = internPool.internFromBytes(
        arena["sourceBuffer"]!,
        oldPathOffset,
        oldPathLength
      );
    }

    changes.push(change);
  }

  return changes;
}

/**
 * Extract just the file paths from a ParseResult.
 * Useful for quick filtering without full materialization.
 */
export function extractFilePaths(result: ParseResult): string[] {
  const { arena, internPool } = result;
  const paths: string[] = [];

  for (let i = 0; i < arena.fileCount; i++) {
    const pathOffset = arena.filePathOffsets[i];
    const pathLength = arena.filePathLengths[i];
    const path = internPool.internFromBytes(
      arena["sourceBuffer"]!,
      pathOffset,
      pathLength
    );
    paths.push(path);
  }

  return paths;
}

/**
 * Check if any file matches a pattern without full materialization.
 */
export function hasFileMatching(
  result: ParseResult,
  pattern: RegExp
): boolean {
  const { arena, internPool } = result;

  for (let i = 0; i < arena.fileCount; i++) {
    const pathOffset = arena.filePathOffsets[i];
    const pathLength = arena.filePathLengths[i];
    const path = internPool.internFromBytes(
      arena["sourceBuffer"]!,
      pathOffset,
      pathLength
    );

    if (pattern.test(path)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all additions from all files without full materialization.
 * Returns an iterator for memory efficiency.
 */
export function* iterateAdditions(
  result: ParseResult
): Generator<{ path: string; content: string; lineNumber: number }> {
  const { arena, internPool } = result;

  for (let i = 0; i < arena.lineCount; i++) {
    if (arena.lineTypes[i] === LINE_TYPE_ADD) {
      const fileIndex = arena.lineFileIndices[i];
      const pathOffset = arena.filePathOffsets[fileIndex];
      const pathLength = arena.filePathLengths[fileIndex];

      yield {
        path: internPool.internFromBytes(
          arena["sourceBuffer"]!,
          pathOffset,
          pathLength
        ),
        content: arena.decodeLineContent(i),
        lineNumber: arena.lineNewNumbers[i],
      };
    }
  }
}

/**
 * Get all deletions from all files without full materialization.
 */
export function* iterateDeletions(
  result: ParseResult
): Generator<{ path: string; content: string; lineNumber: number }> {
  const { arena, internPool } = result;

  for (let i = 0; i < arena.lineCount; i++) {
    if (arena.lineTypes[i] === LINE_TYPE_DEL) {
      const fileIndex = arena.lineFileIndices[i];
      const pathOffset = arena.filePathOffsets[fileIndex];
      const pathLength = arena.filePathLengths[fileIndex];

      yield {
        path: internPool.internFromBytes(
          arena["sourceBuffer"]!,
          pathOffset,
          pathLength
        ),
        content: arena.decodeLineContent(i),
        lineNumber: arena.lineOldNumbers[i],
      };
    }
  }
}

/**
 * Count additions and deletions per file without full materialization.
 */
export function getChangeStats(
  result: ParseResult
): Map<string, { additions: number; deletions: number }> {
  const { arena, internPool } = result;
  const stats = new Map<string, { additions: number; deletions: number }>();

  // Initialize stats for all files
  for (let i = 0; i < arena.fileCount; i++) {
    const pathOffset = arena.filePathOffsets[i];
    const pathLength = arena.filePathLengths[i];
    const path = internPool.internFromBytes(
      arena["sourceBuffer"]!,
      pathOffset,
      pathLength
    );
    stats.set(path, { additions: 0, deletions: 0 });
  }

  // Count lines
  for (let i = 0; i < arena.lineCount; i++) {
    const fileIndex = arena.lineFileIndices[i];
    const pathOffset = arena.filePathOffsets[fileIndex];
    const pathLength = arena.filePathLengths[fileIndex];
    const path = internPool.internFromBytes(
      arena["sourceBuffer"]!,
      pathOffset,
      pathLength
    );

    const fileStat = stats.get(path)!;
    if (arena.lineTypes[i] === LINE_TYPE_ADD) {
      fileStat.additions++;
    } else if (arena.lineTypes[i] === LINE_TYPE_DEL) {
      fileStat.deletions++;
    }
  }

  return stats;
}
