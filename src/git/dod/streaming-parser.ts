/**
 * Streaming State Machine Parser for git diff output.
 *
 * This is the main entry point for DOD-based diff parsing. It combines:
 * - DiffScanner for zero-copy byte-level tokenization
 * - DiffArena for memory-efficient data storage
 * - StringInternPool for filename deduplication
 *
 * The parser operates as a state machine that processes the diff line-by-line,
 * transitioning between states based on line classification:
 *
 * State Machine:
 * ┌─────────────┐    diff --git    ┌─────────────┐
 * │  INITIAL    │ ───────────────► │   IN_FILE   │
 * └─────────────┘                  └──────┬──────┘
 *                                         │
 *                          @@             │ --- / +++
 *                     ┌───────────────────┴───────────────┐
 *                     │                                   │
 *                     ▼                                   ▼
 *               ┌─────────────┐                    ┌─────────────┐
 *               │   IN_HUNK   │ ◄──── @@ ──────── │  IN_HEADER  │
 *               └──────┬──────┘                    └─────────────┘
 *                      │
 *                      │ +/-/context
 *                      ▼
 *               ┌─────────────┐
 *               │   IN_LINE   │ ◄────┐
 *               └──────┬──────┘      │ +/-/context
 *                      └─────────────┘
 *
 * Performance characteristics:
 * - Single-pass parsing (O(n) where n is input bytes)
 * - Zero string allocation during parsing (deferred to adapter)
 * - Predictable memory usage (TypedArrays with known capacity)
 * - Cache-friendly sequential access pattern
 */

import {
  DiffArena,
  createArenaForSize,
  LINE_TYPE_ADD,
  LINE_TYPE_DEL,
  LINE_TYPE_CTX,
  FILE_STATUS_ADDED,
  FILE_STATUS_MODIFIED,
  FILE_STATUS_DELETED,
  FILE_STATUS_RENAMED,
} from "./arena.js";
import { DiffScanner, ScanResultType } from "./scanner.js";
import { StringInternPool, getGlobalInternPool } from "./intern.js";

/**
 * Parser state enumeration.
 */
const enum ParserState {
  /** Waiting for first diff header */
  Initial = 0,
  /** Inside a file, before hunks */
  InFileHeader = 1,
  /** Inside a hunk, processing lines */
  InHunk = 2,
}

/**
 * Options for the streaming parser.
 */
export interface StreamingParserOptions {
  /** Custom arena to use (creates one if not provided) */
  arena?: DiffArena;
  /** Custom string intern pool (uses global if not provided) */
  internPool?: StringInternPool;
  /** Initial capacity hints */
  capacityHints?: {
    lines?: number;
    hunks?: number;
    files?: number;
  };
}

/**
 * Result of parsing a diff.
 */
export interface ParseResult {
  /** The populated DiffArena */
  arena: DiffArena;
  /** The string intern pool used */
  internPool: StringInternPool;
  /** Parse statistics */
  stats: {
    totalBytes: number;
    parseTimeMs: number;
    filesFound: number;
    hunksFound: number;
    linesFound: number;
  };
}

/**
 * High-performance streaming diff parser.
 *
 * Usage:
 * ```typescript
 * const parser = new StreamingDiffParser();
 * const result = parser.parse(buffer);
 *
 * // Access parsed data through arena
 * for (let i = 0; i < result.arena.fileCount; i++) {
 *   const path = result.arena.decodeFilePath(i);
 *   console.log(`File: ${path}`);
 * }
 * ```
 */
export class StreamingDiffParser {
  private readonly options: StreamingParserOptions;

  constructor(options: StreamingParserOptions = {}) {
    this.options = options;
  }

  /**
   * Parse a git diff from a Uint8Array/Buffer.
   * This is the primary entry point for parsing.
   */
  parse(input: Uint8Array | Buffer): ParseResult {
    const startTime = performance.now();

    // Create or reuse arena
    const arena =
      this.options.arena ??
      createArenaForSize(input.length);

    // Get intern pool
    const internPool = this.options.internPool ?? getGlobalInternPool();

    // Create scanner
    const scanner = new DiffScanner(input);

    // Set source buffer for lazy decoding
    arena.setSourceBuffer(scanner.getBuffer());

    // Parse state
    let state = ParserState.Initial;
    let currentFileIndex = -1;
    let currentHunkIndex = -1;
    let currentNewLine = 0;
    let currentOldLine = 0;

    // Temporary storage for file paths
    let pendingOldPath: { start: number; length: number } | null = null;
    let pendingNewPath: { start: number; length: number } | null = null;

    // Process lines
    while (scanner.hasMore()) {
      const scanResult = scanner.scanLine();
      if (scanResult === null) break;

      switch (scanResult.type) {
        case ScanResultType.DiffHeader: {
          // Start of a new file
          // Extract paths from "diff --git a/old b/new"
          const paths = scanner.extractDiffPath(
            scanResult.contentStart,
            scanResult.contentLength
          );

          if (paths) {
            // Defer path handling until we see --- and +++
            // (they have more accurate paths for renames/adds)
            pendingOldPath = paths.oldPath;
            pendingNewPath = paths.newPath;
          }

          state = ParserState.InFileHeader;
          break;
        }

        case ScanResultType.OldFilePath: {
          // --- a/path or --- /dev/null
          const pathInfo = scanner.extractFilePath(
            scanResult.contentStart,
            scanResult.contentLength
          );

          if (pathInfo) {
            pendingOldPath = pathInfo;
          }
          break;
        }

        case ScanResultType.NewFilePath: {
          // +++ b/path or +++ /dev/null
          const pathInfo = scanner.extractFilePath(
            scanResult.contentStart,
            scanResult.contentLength
          );

          if (pathInfo) {
            pendingNewPath = pathInfo;
          }

          // Now we have both paths - create the file entry
          if (pendingNewPath) {
            const status = this.determineFileStatus(
              pendingOldPath,
              pendingNewPath,
              scanner.getBuffer()
            );

            const isRename =
              status === FILE_STATUS_RENAMED && pendingOldPath !== null;

            currentFileIndex = arena.addFile(
              status,
              pendingNewPath.start,
              pendingNewPath.length,
              isRename ? pendingOldPath!.start : 0,
              isRename ? pendingOldPath!.length : 0
            );

            // Reset pending paths
            pendingOldPath = null;
            pendingNewPath = null;
          }
          break;
        }

        case ScanResultType.HunkHeader: {
          // @@ -old,count +new,count @@
          if (currentFileIndex < 0) {
            // No file context yet - skip this hunk
            continue;
          }

          const range = scanResult.hunkRange!;

          currentHunkIndex = arena.addHunk(
            currentFileIndex,
            range.oldStart,
            range.oldLines,
            range.newStart,
            range.newLines,
            scanResult.lineStart,
            scanResult.lineLength
          );

          currentNewLine = range.newStart;
          currentOldLine = range.oldStart;
          state = ParserState.InHunk;
          break;
        }

        case ScanResultType.Addition: {
          if (state !== ParserState.InHunk || currentHunkIndex < 0) {
            continue;
          }

          arena.addLine(
            LINE_TYPE_ADD,
            scanResult.contentStart,
            scanResult.contentLength,
            currentFileIndex,
            currentHunkIndex,
            currentNewLine,
            0 // No old line for additions
          );

          currentNewLine++;
          break;
        }

        case ScanResultType.Deletion: {
          if (state !== ParserState.InHunk || currentHunkIndex < 0) {
            continue;
          }

          arena.addLine(
            LINE_TYPE_DEL,
            scanResult.contentStart,
            scanResult.contentLength,
            currentFileIndex,
            currentHunkIndex,
            0, // No new line for deletions
            currentOldLine
          );

          currentOldLine++;
          break;
        }

        case ScanResultType.Context: {
          if (state !== ParserState.InHunk || currentHunkIndex < 0) {
            continue;
          }

          arena.addLine(
            LINE_TYPE_CTX,
            scanResult.contentStart,
            scanResult.contentLength,
            currentFileIndex,
            currentHunkIndex,
            currentNewLine,
            currentOldLine
          );

          currentNewLine++;
          currentOldLine++;
          break;
        }

        case ScanResultType.Metadata:
        case ScanResultType.End:
          // Ignore metadata lines (index:, mode:, etc.)
          break;
      }
    }

    const endTime = performance.now();

    return {
      arena,
      internPool,
      stats: {
        totalBytes: input.length,
        parseTimeMs: endTime - startTime,
        filesFound: arena.fileCount,
        hunksFound: arena.hunkCount,
        linesFound: arena.lineCount,
      },
    };
  }

  /**
   * Parse a git diff from a string.
   * Convenience method - prefer parse(Uint8Array) for production.
   */
  parseString(input: string): ParseResult {
    return this.parse(new TextEncoder().encode(input));
  }

  /**
   * Determine file status from old/new paths.
   * Uses zero-copy byte comparison to avoid TextDecoder allocations.
   */
  private determineFileStatus(
    oldPath: { start: number; length: number } | null,
    newPath: { start: number; length: number } | null,
    buffer: Uint8Array
  ): number {
    // Check for /dev/null (indicates add or delete)
    const isOldNull =
      oldPath !== null &&
      this.isDevNull(buffer, oldPath.start, oldPath.length);
    const isNewNull =
      newPath !== null &&
      this.isDevNull(buffer, newPath.start, newPath.length);

    if (isOldNull && !isNewNull) {
      return FILE_STATUS_ADDED;
    }

    if (isNewNull && !isOldNull) {
      return FILE_STATUS_DELETED;
    }

    // Check for rename (different paths, neither is null)
    // Compare bytes directly instead of decoding to strings
    if (oldPath && newPath && !isOldNull && !isNewNull) {
      if (oldPath.length !== newPath.length) {
        return FILE_STATUS_RENAMED;
      }

      for (let i = 0; i < oldPath.length; i++) {
        if (buffer[oldPath.start + i] !== buffer[newPath.start + i]) {
          return FILE_STATUS_RENAMED;
        }
      }
    }

    return FILE_STATUS_MODIFIED;
  }

  /**
   * Check if a path segment is "/dev/null".
   */
  private isDevNull(buffer: Uint8Array, start: number, length: number): boolean {
    // Check for "/dev/null" (9 chars)
    if (length < 9) return false;

    const devNull = "/dev/null";
    for (let i = 0; i < 9; i++) {
      if (buffer[start + i] !== devNull.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Parse a git diff buffer using the streaming parser.
 * Convenience function for simple use cases.
 */
export function parseDiffBuffer(
  buffer: Uint8Array | Buffer,
  options?: StreamingParserOptions
): ParseResult {
  const parser = new StreamingDiffParser(options);
  return parser.parse(buffer);
}

/**
 * Parse a git diff string using the streaming parser.
 * Convenience function for simple use cases.
 */
export function parseDiffString(
  input: string,
  options?: StreamingParserOptions
): ParseResult {
  const parser = new StreamingDiffParser(options);
  return parser.parseString(input);
}

/**
 * Parse result with file status strings.
 */
export type FileStatusString = "added" | "modified" | "deleted" | "renamed";

/**
 * Convert numeric file status to string.
 */
export function fileStatusToString(status: number): FileStatusString {
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
 * Line type strings.
 */
export type LineTypeString = "add" | "del" | "ctx";

/**
 * Convert numeric line type to string.
 */
export function lineTypeToString(type: number): LineTypeString {
  switch (type) {
    case LINE_TYPE_ADD:
      return "add";
    case LINE_TYPE_DEL:
      return "del";
    default:
      return "ctx";
  }
}
