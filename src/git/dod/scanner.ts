/**
 * Zero-Copy Byte-Level Scanner for git diff output.
 *
 * Scans raw Uint8Array (or Buffer) data without converting to strings,
 * identifying control characters and diff structure markers directly.
 * All positions are tracked as byte offsets into the source buffer.
 *
 * ASCII byte constants for common characters:
 * - 0x0A = newline (\n)
 * - 0x2B = plus (+)
 * - 0x2D = minus (-)
 * - 0x40 = at sign (@)
 * - 0x20 = space
 * - 0x09 = tab (\t)
 * - 0x64 = 'd' (for "diff --git")
 */

// ASCII byte constants
const BYTE_NEWLINE = 0x0a;
const BYTE_PLUS = 0x2b;
const BYTE_MINUS = 0x2d;
const BYTE_AT = 0x40;
const BYTE_SPACE = 0x20;
const BYTE_D = 0x64;
const BYTE_ZERO = 0x30;
const BYTE_NINE = 0x39;
const BYTE_COMMA = 0x2c;

// Marker patterns (as byte arrays for fast comparison)
const DIFF_GIT_MARKER = new Uint8Array([0x64, 0x69, 0x66, 0x66, 0x20]); // "diff "
const HUNK_MARKER = new Uint8Array([0x40, 0x40, 0x20, 0x2d]); // "@@ -"
const OLD_FILE_MARKER = new Uint8Array([0x2d, 0x2d, 0x2d, 0x20]); // "--- "
const NEW_FILE_MARKER = new Uint8Array([0x2b, 0x2b, 0x2b, 0x20]); // "+++ "
const PLUS_PLUS_PLUS = new Uint8Array([0x2b, 0x2b, 0x2b]); // "+++"
const MINUS_MINUS_MINUS = new Uint8Array([0x2d, 0x2d, 0x2d]); // "---"

/**
 * Scan result types for different line classifications.
 */
export const enum ScanResultType {
  /** diff --git a/... b/... */
  DiffHeader = 0,
  /** --- a/path or --- /dev/null */
  OldFilePath = 1,
  /** +++ b/path or +++ /dev/null */
  NewFilePath = 2,
  /** @@ -old,count +new,count @@ */
  HunkHeader = 3,
  /** + addition line */
  Addition = 4,
  /** - deletion line */
  Deletion = 5,
  /** Context line (space prefix or no prefix) */
  Context = 6,
  /** Other metadata lines (index, mode, etc.) */
  Metadata = 7,
  /** End of input */
  End = 8,
}

/**
 * Result of scanning a single line.
 */
export interface ScanResult {
  type: ScanResultType;
  /** Start offset of line content (after prefix if any) */
  contentStart: number;
  /** Length of line content (excluding newline) */
  contentLength: number;
  /** Start offset of the entire line (including prefix) */
  lineStart: number;
  /** Length of the entire line (including prefix, excluding newline) */
  lineLength: number;
  /** For hunk headers: parsed range values */
  hunkRange?: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
  };
}

/**
 * Zero-copy byte-level scanner for git diff output.
 * Maintains cursor position and provides efficient line-by-line scanning.
 */
export class DiffScanner {
  private readonly buffer: Uint8Array;
  private readonly length: number;
  private cursor: number = 0;

  constructor(buffer: Uint8Array | Buffer) {
    // Handle both Node.js Buffer and Uint8Array
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    this.length = this.buffer.length;
  }

  /**
   * Get the underlying buffer reference.
   */
  getBuffer(): Uint8Array {
    return this.buffer;
  }

  /**
   * Get current cursor position.
   */
  getPosition(): number {
    return this.cursor;
  }

  /**
   * Reset cursor to beginning.
   */
  reset(): void {
    this.cursor = 0;
  }

  /**
   * Check if scanner has more data.
   */
  hasMore(): boolean {
    return this.cursor < this.length;
  }

  /**
   * Scan the next line and classify it.
   * Returns null if at end of input.
   */
  scanLine(): ScanResult | null {
    if (this.cursor >= this.length) {
      return null;
    }

    const lineStart = this.cursor;
    const lineEnd = this.findLineEnd();
    const lineLength = lineEnd - lineStart;

    // Empty line - treat as context
    if (lineLength === 0) {
      this.cursor = lineEnd + 1;
      return {
        type: ScanResultType.Context,
        contentStart: lineStart,
        contentLength: 0,
        lineStart,
        lineLength: 0,
      };
    }

    const firstByte = this.buffer[lineStart];

    // Classify based on first byte (fast path)
    let result: ScanResult;

    switch (firstByte) {
      case BYTE_D:
        // Check for "diff " marker
        if (this.matchesPattern(lineStart, DIFF_GIT_MARKER)) {
          result = {
            type: ScanResultType.DiffHeader,
            contentStart: lineStart + DIFF_GIT_MARKER.length,
            contentLength: lineLength - DIFF_GIT_MARKER.length,
            lineStart,
            lineLength,
          };
        } else {
          result = this.createMetadataResult(lineStart, lineLength);
        }
        break;

      case BYTE_MINUS:
        if (
          lineLength >= 4 &&
          this.matchesPattern(lineStart, OLD_FILE_MARKER)
        ) {
          // --- a/path or --- /dev/null
          result = {
            type: ScanResultType.OldFilePath,
            contentStart: lineStart + 4, // Skip "--- "
            contentLength: lineLength - 4,
            lineStart,
            lineLength,
          };
        } else if (
          lineLength >= 3 &&
          this.matchesPattern(lineStart, MINUS_MINUS_MINUS)
        ) {
          // Could be "---" without space (malformed but handle gracefully)
          result = {
            type: ScanResultType.OldFilePath,
            contentStart: lineStart + 3,
            contentLength: lineLength - 3,
            lineStart,
            lineLength,
          };
        } else {
          // Single minus = deletion
          result = {
            type: ScanResultType.Deletion,
            contentStart: lineStart + 1,
            contentLength: lineLength - 1,
            lineStart,
            lineLength,
          };
        }
        break;

      case BYTE_PLUS:
        if (
          lineLength >= 4 &&
          this.matchesPattern(lineStart, NEW_FILE_MARKER)
        ) {
          // +++ b/path or +++ /dev/null
          result = {
            type: ScanResultType.NewFilePath,
            contentStart: lineStart + 4, // Skip "+++ "
            contentLength: lineLength - 4,
            lineStart,
            lineLength,
          };
        } else if (
          lineLength >= 3 &&
          this.matchesPattern(lineStart, PLUS_PLUS_PLUS)
        ) {
          // Could be "+++" without space
          result = {
            type: ScanResultType.NewFilePath,
            contentStart: lineStart + 3,
            contentLength: lineLength - 3,
            lineStart,
            lineLength,
          };
        } else {
          // Single plus = addition
          result = {
            type: ScanResultType.Addition,
            contentStart: lineStart + 1,
            contentLength: lineLength - 1,
            lineStart,
            lineLength,
          };
        }
        break;

      case BYTE_AT:
        if (lineLength >= 4 && this.matchesPattern(lineStart, HUNK_MARKER)) {
          // @@ -old,count +new,count @@
          const hunkRange = this.parseHunkHeader(lineStart, lineLength);
          result = {
            type: ScanResultType.HunkHeader,
            contentStart: lineStart,
            contentLength: lineLength,
            lineStart,
            lineLength,
            hunkRange,
          };
        } else {
          result = this.createMetadataResult(lineStart, lineLength);
        }
        break;

      case BYTE_SPACE:
        // Space-prefixed context line
        result = {
          type: ScanResultType.Context,
          contentStart: lineStart + 1,
          contentLength: lineLength - 1,
          lineStart,
          lineLength,
        };
        break;

      default:
        // Other lines (index:, mode:, Binary files, etc.)
        result = this.createMetadataResult(lineStart, lineLength);
    }

    // Advance cursor past newline
    this.cursor = lineEnd + 1;
    return result;
  }

  /**
   * Scan until a specific pattern is found.
   * Returns the offset where pattern starts, or -1 if not found.
   */
  scanUntil(pattern: Uint8Array): number {
    const patternLength = pattern.length;

    for (let i = this.cursor; i <= this.length - patternLength; i++) {
      if (this.matchesPattern(i, pattern)) {
        return i;
      }
    }

    return -1;
  }

  /**
   * Skip bytes until the next newline.
   */
  skipLine(): void {
    const lineEnd = this.findLineEnd();
    this.cursor = lineEnd + 1;
  }

  /**
   * Read a slice of the buffer without copying.
   */
  slice(start: number, end: number): Uint8Array {
    return this.buffer.subarray(start, end);
  }

  /**
   * Decode a portion of the buffer to string.
   */
  decode(start: number, length: number): string {
    return new TextDecoder().decode(this.buffer.subarray(start, start + length));
  }

  /**
   * Extract file path from a "diff --git a/path b/path" line.
   * Returns the path after "b/" (the new path).
   */
  extractDiffPath(contentStart: number, contentLength: number): {
    oldPath: { start: number; length: number };
    newPath: { start: number; length: number };
  } | null {
    // Format: "git a/oldpath b/newpath"
    // Skip "git " prefix if present
    let pos = contentStart;
    const end = contentStart + contentLength;

    // Skip "git " if present
    if (
      pos + 4 <= end &&
      this.buffer[pos] === 0x67 && // 'g'
      this.buffer[pos + 1] === 0x69 && // 'i'
      this.buffer[pos + 2] === 0x74 && // 't'
      this.buffer[pos + 3] === BYTE_SPACE
    ) {
      pos += 4;
    }

    // Find "a/" marker
    while (pos < end - 1) {
      if (this.buffer[pos] === 0x61 && this.buffer[pos + 1] === 0x2f) {
        // "a/"
        break;
      }
      pos++;
    }

    if (pos >= end - 1) return null;

    const oldPathStart = pos + 2; // Skip "a/"

    // Find " b/" marker
    let oldPathEnd = oldPathStart;
    while (oldPathEnd < end - 3) {
      if (
        this.buffer[oldPathEnd] === BYTE_SPACE &&
        this.buffer[oldPathEnd + 1] === 0x62 && // 'b'
        this.buffer[oldPathEnd + 2] === 0x2f // '/'
      ) {
        break;
      }
      oldPathEnd++;
    }

    if (oldPathEnd >= end - 3) return null;

    const newPathStart = oldPathEnd + 3; // Skip " b/"
    const newPathEnd = end;

    return {
      oldPath: { start: oldPathStart, length: oldPathEnd - oldPathStart },
      newPath: { start: newPathStart, length: newPathEnd - newPathStart },
    };
  }

  /**
   * Extract path from "--- a/path" or "+++ b/path" line.
   */
  extractFilePath(contentStart: number, contentLength: number): {
    start: number;
    length: number;
  } | null {
    if (contentLength < 2) return null;

    // Check for "a/" or "b/" prefix
    if (
      this.buffer[contentStart] === 0x61 || // 'a'
      this.buffer[contentStart] === 0x62 // 'b'
    ) {
      if (this.buffer[contentStart + 1] === 0x2f) {
        // '/'
        return {
          start: contentStart + 2,
          length: contentLength - 2,
        };
      }
    }

    // Check for /dev/null
    if (contentLength >= 9) {
      // "/dev/null"
      const devNull = new Uint8Array([0x2f, 0x64, 0x65, 0x76, 0x2f, 0x6e, 0x75, 0x6c, 0x6c]);
      if (this.matchesPattern(contentStart, devNull)) {
        return {
          start: contentStart,
          length: 9,
        };
      }
    }

    // No prefix - return as-is
    return {
      start: contentStart,
      length: contentLength,
    };
  }

  /**
   * Find the end of the current line (position of newline or end of buffer).
   */
  private findLineEnd(): number {
    let pos = this.cursor;
    while (pos < this.length && this.buffer[pos] !== BYTE_NEWLINE) {
      pos++;
    }
    return pos;
  }

  /**
   * Check if buffer matches pattern at given offset.
   */
  private matchesPattern(offset: number, pattern: Uint8Array): boolean {
    if (offset + pattern.length > this.length) return false;

    for (let i = 0; i < pattern.length; i++) {
      if (this.buffer[offset + i] !== pattern[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Parse a hunk header to extract range values.
   * Format: @@ -old,count +new,count @@
   */
  private parseHunkHeader(
    start: number,
    length: number
  ): { oldStart: number; oldLines: number; newStart: number; newLines: number } {
    let pos = start + 4; // Skip "@@ -"
    const end = start + length;

    // Parse old start
    const oldStart = this.parseNumber(pos, end);
    pos = oldStart.endPos;

    // Check for comma (old lines count)
    let oldLines = 1;
    if (pos < end && this.buffer[pos] === BYTE_COMMA) {
      pos++;
      const oldLinesResult = this.parseNumber(pos, end);
      oldLines = oldLinesResult.value;
      pos = oldLinesResult.endPos;
    }

    // Skip to +
    while (pos < end && this.buffer[pos] !== BYTE_PLUS) {
      pos++;
    }
    pos++; // Skip +

    // Parse new start
    const newStart = this.parseNumber(pos, end);
    pos = newStart.endPos;

    // Check for comma (new lines count)
    let newLines = 1;
    if (pos < end && this.buffer[pos] === BYTE_COMMA) {
      pos++;
      const newLinesResult = this.parseNumber(pos, end);
      newLines = newLinesResult.value;
    }

    return {
      oldStart: oldStart.value,
      oldLines,
      newStart: newStart.value,
      newLines,
    };
  }

  /**
   * Parse a number from bytes.
   */
  private parseNumber(start: number, end: number): { value: number; endPos: number } {
    let value = 0;
    let pos = start;

    while (pos < end) {
      const byte = this.buffer[pos];
      if (byte >= BYTE_ZERO && byte <= BYTE_NINE) {
        value = value * 10 + (byte - BYTE_ZERO);
        pos++;
      } else {
        break;
      }
    }

    return { value, endPos: pos };
  }

  /**
   * Create a metadata result for unclassified lines.
   */
  private createMetadataResult(lineStart: number, lineLength: number): ScanResult {
    return {
      type: ScanResultType.Metadata,
      contentStart: lineStart,
      contentLength: lineLength,
      lineStart,
      lineLength,
    };
  }
}

/**
 * Create a scanner from a string (for testing/convenience).
 * Prefer using Buffer/Uint8Array directly for production.
 */
export function createScannerFromString(input: string): DiffScanner {
  return new DiffScanner(new TextEncoder().encode(input));
}
