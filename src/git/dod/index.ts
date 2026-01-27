/**
 * Data-Oriented Design (DOD) Diff Parsing Module.
 *
 * This module provides high-performance diff parsing using:
 * - Zero-copy byte scanning
 * - TypedArray-based memory arenas (Struct of Arrays)
 * - String interning for filename deduplication
 * - Lazy decoding for on-demand string materialization
 *
 * Usage:
 * ```typescript
 * import { parseDiffBuffer, toFileDiffs } from "./git/dod/index.js";
 *
 * // Parse diff buffer
 * const result = parseDiffBuffer(buffer);
 *
 * // Convert to legacy types for compatibility
 * const diffs = toFileDiffs(result);
 *
 * // Or use direct arena access for maximum performance
 * for (let i = 0; i < result.arena.fileCount; i++) {
 *   const path = result.arena.decodeFilePath(i);
 *   // ...
 * }
 * ```
 *
 * Performance characteristics:
 * - 60-80% reduction in heap usage for large diffs
 * - Near-instant parsing startup (no upfront string decoding)
 * - Predictable GC behavior (TypedArrays are not traced by GC)
 *
 * @module git/dod
 */

// Core arena data structure
export {
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

// Zero-copy scanner
export {
  DiffScanner,
  ScanResultType,
  createScannerFromString,
  type ScanResult,
} from "./scanner.js";

// String interning
export {
  StringInternPool,
  getGlobalInternPool,
  resetGlobalInternPool,
  DeferredString,
} from "./intern.js";

// Streaming parser
export {
  StreamingDiffParser,
  parseDiffBuffer,
  parseDiffString,
  fileStatusToString,
  lineTypeToString,
  type StreamingParserOptions,
  type ParseResult,
  type FileStatusString,
  type LineTypeString,
} from "./streaming-parser.js";

// Adapter for backward compatibility
export {
  LazyFileDiff,
  toFileDiffs,
  toFileChanges,
  extractFilePaths,
  hasFileMatching,
  iterateAdditions,
  iterateDeletions,
  getChangeStats,
} from "./adapter.js";
