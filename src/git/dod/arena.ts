/**
 * DiffArena - Data-Oriented Design structure for high-performance diff parsing.
 *
 * Uses TypedArrays (Struct of Arrays pattern) to minimize GC pressure and
 * maximize CPU cache locality. All line data is stored as offsets into
 * the original buffer, avoiding string allocations until decode time.
 *
 * Memory Layout:
 * - Lines are stored as (startOffset, length) pairs into the source buffer
 * - Types are stored as uint8 (0=ADD, 1=DEL, 2=CTX)
 * - File indices map lines back to their parent files
 * - Hunk indices map lines back to their parent hunks
 */

// Line type constants (uint8)
export const LINE_TYPE_ADD = 0;
export const LINE_TYPE_DEL = 1;
export const LINE_TYPE_CTX = 2;

// File status constants (uint8)
export const FILE_STATUS_ADDED = 0;
export const FILE_STATUS_MODIFIED = 1;
export const FILE_STATUS_DELETED = 2;
export const FILE_STATUS_RENAMED = 3;

/**
 * Memory arena for diff data using Struct of Arrays (SoA) layout.
 * Pre-allocates arrays and grows them dynamically when needed.
 */
export class DiffArena {
  // Parallel arrays for line data (SoA pattern)
  lineTypes: Uint8Array;
  lineStartOffsets: Uint32Array;
  lineLengths: Uint16Array;
  lineFileIndices: Uint32Array;
  lineHunkIndices: Uint32Array;
  lineNewNumbers: Uint32Array; // Line number in new file (0 for deletions)
  lineOldNumbers: Uint32Array; // Line number in old file (0 for additions)

  // Parallel arrays for hunk data
  hunkOldStarts: Uint32Array;
  hunkOldLines: Uint16Array;
  hunkNewStarts: Uint32Array;
  hunkNewLines: Uint16Array;
  hunkFileIndices: Uint32Array;
  hunkContentOffsets: Uint32Array; // Offset to @@ header in source
  hunkContentLengths: Uint32Array;

  // Parallel arrays for file data
  fileStatuses: Uint8Array;
  filePathOffsets: Uint32Array;
  filePathLengths: Uint16Array;
  fileOldPathOffsets: Uint32Array; // For renames (0 if not rename)
  fileOldPathLengths: Uint16Array;
  fileFirstHunkIndex: Uint32Array;
  fileHunkCount: Uint16Array;

  // Cursors for current insertion position
  lineCount: number = 0;
  hunkCount: number = 0;
  fileCount: number = 0;

  // Source buffer reference (for lazy decoding)
  private sourceBuffer: Uint8Array | null = null;

  // Capacity tracking
  private lineCapacity: number;
  private hunkCapacity: number;
  private fileCapacity: number;

  // TextDecoder for efficient string decoding
  private readonly decoder = new TextDecoder("utf-8");

  constructor(options: {
    lineCapacity?: number;
    hunkCapacity?: number;
    fileCapacity?: number;
  } = {}) {
    // Default capacities optimized for typical diffs
    this.lineCapacity = options.lineCapacity ?? 8192;
    this.hunkCapacity = options.hunkCapacity ?? 512;
    this.fileCapacity = options.fileCapacity ?? 128;

    // Initialize line arrays
    this.lineTypes = new Uint8Array(this.lineCapacity);
    this.lineStartOffsets = new Uint32Array(this.lineCapacity);
    this.lineLengths = new Uint16Array(this.lineCapacity);
    this.lineFileIndices = new Uint32Array(this.lineCapacity);
    this.lineHunkIndices = new Uint32Array(this.lineCapacity);
    this.lineNewNumbers = new Uint32Array(this.lineCapacity);
    this.lineOldNumbers = new Uint32Array(this.lineCapacity);

    // Initialize hunk arrays
    this.hunkOldStarts = new Uint32Array(this.hunkCapacity);
    this.hunkOldLines = new Uint16Array(this.hunkCapacity);
    this.hunkNewStarts = new Uint32Array(this.hunkCapacity);
    this.hunkNewLines = new Uint16Array(this.hunkCapacity);
    this.hunkFileIndices = new Uint32Array(this.hunkCapacity);
    this.hunkContentOffsets = new Uint32Array(this.hunkCapacity);
    this.hunkContentLengths = new Uint32Array(this.hunkCapacity);

    // Initialize file arrays
    this.fileStatuses = new Uint8Array(this.fileCapacity);
    this.filePathOffsets = new Uint32Array(this.fileCapacity);
    this.filePathLengths = new Uint16Array(this.fileCapacity);
    this.fileOldPathOffsets = new Uint32Array(this.fileCapacity);
    this.fileOldPathLengths = new Uint16Array(this.fileCapacity);
    this.fileFirstHunkIndex = new Uint32Array(this.fileCapacity);
    this.fileHunkCount = new Uint16Array(this.fileCapacity);
  }

  /**
   * Set the source buffer for lazy decoding.
   */
  setSourceBuffer(buffer: Uint8Array): void {
    this.sourceBuffer = buffer;
  }

  /**
   * Add a file entry to the arena.
   */
  addFile(
    status: number,
    pathOffset: number,
    pathLength: number,
    oldPathOffset: number = 0,
    oldPathLength: number = 0
  ): number {
    if (this.fileCount >= this.fileCapacity) {
      this.growFileArrays();
    }

    const idx = this.fileCount++;
    this.fileStatuses[idx] = status;
    this.filePathOffsets[idx] = pathOffset;
    this.filePathLengths[idx] = pathLength;
    this.fileOldPathOffsets[idx] = oldPathOffset;
    this.fileOldPathLengths[idx] = oldPathLength;
    this.fileFirstHunkIndex[idx] = this.hunkCount;
    this.fileHunkCount[idx] = 0;

    return idx;
  }

  /**
   * Add a hunk entry to the arena.
   */
  addHunk(
    fileIndex: number,
    oldStart: number,
    oldLines: number,
    newStart: number,
    newLines: number,
    contentOffset: number,
    contentLength: number
  ): number {
    if (this.hunkCount >= this.hunkCapacity) {
      this.growHunkArrays();
    }

    const idx = this.hunkCount++;
    this.hunkOldStarts[idx] = oldStart;
    this.hunkOldLines[idx] = oldLines;
    this.hunkNewStarts[idx] = newStart;
    this.hunkNewLines[idx] = newLines;
    this.hunkFileIndices[idx] = fileIndex;
    this.hunkContentOffsets[idx] = contentOffset;
    this.hunkContentLengths[idx] = contentLength;

    // Update file's hunk count
    this.fileHunkCount[fileIndex]++;

    return idx;
  }

  /**
   * Add a line entry to the arena.
   */
  addLine(
    type: number,
    startOffset: number,
    length: number,
    fileIndex: number,
    hunkIndex: number,
    newLineNumber: number,
    oldLineNumber: number
  ): number {
    if (this.lineCount >= this.lineCapacity) {
      this.growLineArrays();
    }

    const idx = this.lineCount++;
    this.lineTypes[idx] = type;
    this.lineStartOffsets[idx] = startOffset;
    this.lineLengths[idx] = length;
    this.lineFileIndices[idx] = fileIndex;
    this.lineHunkIndices[idx] = hunkIndex;
    this.lineNewNumbers[idx] = newLineNumber;
    this.lineOldNumbers[idx] = oldLineNumber;

    return idx;
  }

  /**
   * Decode a line's content from the source buffer (lazy decoding).
   * Only allocates a string when explicitly needed.
   */
  decodeLineContent(lineIndex: number): string {
    if (!this.sourceBuffer) {
      throw new Error("Source buffer not set");
    }

    const offset = this.lineStartOffsets[lineIndex];
    const length = this.lineLengths[lineIndex];

    // Create a view into the source buffer (no copy)
    const slice = this.sourceBuffer.subarray(offset, offset + length);

    return this.decoder.decode(slice);
  }

  /**
   * Decode a file path from the source buffer.
   */
  decodeFilePath(fileIndex: number): string {
    if (!this.sourceBuffer) {
      throw new Error("Source buffer not set");
    }

    const offset = this.filePathOffsets[fileIndex];
    const length = this.filePathLengths[fileIndex];
    const slice = this.sourceBuffer.subarray(offset, offset + length);

    return this.decoder.decode(slice);
  }

  /**
   * Decode a file's old path (for renames).
   */
  decodeFileOldPath(fileIndex: number): string | undefined {
    if (!this.sourceBuffer) {
      throw new Error("Source buffer not set");
    }

    const length = this.fileOldPathLengths[fileIndex];
    if (length === 0) return undefined;

    const offset = this.fileOldPathOffsets[fileIndex];
    const slice = this.sourceBuffer.subarray(offset, offset + length);

    return this.decoder.decode(slice);
  }

  /**
   * Decode hunk content (the @@ header line).
   */
  decodeHunkContent(hunkIndex: number): string {
    if (!this.sourceBuffer) {
      throw new Error("Source buffer not set");
    }

    const offset = this.hunkContentOffsets[hunkIndex];
    const length = this.hunkContentLengths[hunkIndex];
    const slice = this.sourceBuffer.subarray(offset, offset + length);

    return this.decoder.decode(slice);
  }

  /**
   * Get all addition lines for a file (returns indices for lazy access).
   */
  *getFileAdditions(fileIndex: number): Generator<number> {
    for (let i = 0; i < this.lineCount; i++) {
      if (
        this.lineFileIndices[i] === fileIndex &&
        this.lineTypes[i] === LINE_TYPE_ADD
      ) {
        yield i;
      }
    }
  }

  /**
   * Get all deletion lines for a file (returns indices for lazy access).
   */
  *getFileDeletions(fileIndex: number): Generator<number> {
    for (let i = 0; i < this.lineCount; i++) {
      if (
        this.lineFileIndices[i] === fileIndex &&
        this.lineTypes[i] === LINE_TYPE_DEL
      ) {
        yield i;
      }
    }
  }

  /**
   * Get all lines for a hunk (returns indices).
   */
  *getHunkLines(hunkIndex: number): Generator<number> {
    for (let i = 0; i < this.lineCount; i++) {
      if (this.lineHunkIndices[i] === hunkIndex) {
        yield i;
      }
    }
  }

  /**
   * Get all hunks for a file (returns indices).
   */
  *getFileHunks(fileIndex: number): Generator<number> {
    const firstHunk = this.fileFirstHunkIndex[fileIndex];
    const count = this.fileHunkCount[fileIndex];

    for (let i = firstHunk; i < firstHunk + count; i++) {
      yield i;
    }
  }

  /**
   * Get memory usage statistics.
   */
  getMemoryStats(): {
    lineCount: number;
    hunkCount: number;
    fileCount: number;
    totalBytes: number;
    efficiency: number;
  } {
    const lineBytes =
      this.lineTypes.byteLength +
      this.lineStartOffsets.byteLength +
      this.lineLengths.byteLength +
      this.lineFileIndices.byteLength +
      this.lineHunkIndices.byteLength +
      this.lineNewNumbers.byteLength +
      this.lineOldNumbers.byteLength;

    const hunkBytes =
      this.hunkOldStarts.byteLength +
      this.hunkOldLines.byteLength +
      this.hunkNewStarts.byteLength +
      this.hunkNewLines.byteLength +
      this.hunkFileIndices.byteLength +
      this.hunkContentOffsets.byteLength +
      this.hunkContentLengths.byteLength;

    const fileBytes =
      this.fileStatuses.byteLength +
      this.filePathOffsets.byteLength +
      this.filePathLengths.byteLength +
      this.fileOldPathOffsets.byteLength +
      this.fileOldPathLengths.byteLength +
      this.fileFirstHunkIndex.byteLength +
      this.fileHunkCount.byteLength;

    const totalBytes = lineBytes + hunkBytes + fileBytes;
    const usedBytes =
      this.lineCount * 29 + // 29 bytes per line entry
      this.hunkCount * 24 + // 24 bytes per hunk entry
      this.fileCount * 21; // 21 bytes per file entry

    return {
      lineCount: this.lineCount,
      hunkCount: this.hunkCount,
      fileCount: this.fileCount,
      totalBytes,
      efficiency: usedBytes / totalBytes,
    };
  }

  /**
   * Reset the arena for reuse (avoids reallocation).
   */
  reset(): void {
    this.lineCount = 0;
    this.hunkCount = 0;
    this.fileCount = 0;
    this.sourceBuffer = null;
  }

  /**
   * Grow line arrays when capacity is exceeded.
   */
  private growLineArrays(): void {
    const newCapacity = this.lineCapacity * 2;

    this.lineTypes = this.growTypedArray(this.lineTypes, newCapacity);
    this.lineStartOffsets = this.growTypedArray(this.lineStartOffsets, newCapacity);
    this.lineLengths = this.growTypedArray(this.lineLengths, newCapacity);
    this.lineFileIndices = this.growTypedArray(this.lineFileIndices, newCapacity);
    this.lineHunkIndices = this.growTypedArray(this.lineHunkIndices, newCapacity);
    this.lineNewNumbers = this.growTypedArray(this.lineNewNumbers, newCapacity);
    this.lineOldNumbers = this.growTypedArray(this.lineOldNumbers, newCapacity);

    this.lineCapacity = newCapacity;
  }

  /**
   * Grow hunk arrays when capacity is exceeded.
   */
  private growHunkArrays(): void {
    const newCapacity = this.hunkCapacity * 2;

    this.hunkOldStarts = this.growTypedArray(this.hunkOldStarts, newCapacity);
    this.hunkOldLines = this.growTypedArray(this.hunkOldLines, newCapacity);
    this.hunkNewStarts = this.growTypedArray(this.hunkNewStarts, newCapacity);
    this.hunkNewLines = this.growTypedArray(this.hunkNewLines, newCapacity);
    this.hunkFileIndices = this.growTypedArray(this.hunkFileIndices, newCapacity);
    this.hunkContentOffsets = this.growTypedArray(this.hunkContentOffsets, newCapacity);
    this.hunkContentLengths = this.growTypedArray(this.hunkContentLengths, newCapacity);

    this.hunkCapacity = newCapacity;
  }

  /**
   * Grow file arrays when capacity is exceeded.
   */
  private growFileArrays(): void {
    const newCapacity = this.fileCapacity * 2;

    this.fileStatuses = this.growTypedArray(this.fileStatuses, newCapacity);
    this.filePathOffsets = this.growTypedArray(this.filePathOffsets, newCapacity);
    this.filePathLengths = this.growTypedArray(this.filePathLengths, newCapacity);
    this.fileOldPathOffsets = this.growTypedArray(this.fileOldPathOffsets, newCapacity);
    this.fileOldPathLengths = this.growTypedArray(this.fileOldPathLengths, newCapacity);
    this.fileFirstHunkIndex = this.growTypedArray(this.fileFirstHunkIndex, newCapacity);
    this.fileHunkCount = this.growTypedArray(this.fileHunkCount, newCapacity);

    this.fileCapacity = newCapacity;
  }

  /**
   * Generic TypedArray growth helper.
   */
  private growTypedArray<T extends Uint8Array | Uint16Array | Uint32Array>(
    arr: T,
    newCapacity: number
  ): T {
    const ArrayConstructor = arr.constructor as {
      new (length: number): T;
    };
    const newArr = new ArrayConstructor(newCapacity);
    newArr.set(arr);
    return newArr;
  }
}

/**
 * Create a DiffArena with automatic capacity estimation.
 * Estimates capacity based on input size to minimize reallocations.
 */
export function createArenaForSize(inputBytes: number): DiffArena {
  // Heuristics based on typical diff characteristics:
  // - Average line length: ~40 bytes
  // - Average lines per hunk: ~20
  // - Average hunks per file: ~3
  const estimatedLines = Math.max(256, Math.ceil(inputBytes / 40));
  const estimatedHunks = Math.max(32, Math.ceil(estimatedLines / 20));
  const estimatedFiles = Math.max(16, Math.ceil(estimatedHunks / 3));

  return new DiffArena({
    lineCapacity: estimatedLines,
    hunkCapacity: estimatedHunks,
    fileCapacity: estimatedFiles,
  });
}
