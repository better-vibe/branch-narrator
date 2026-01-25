/**
 * String Interning System for diff parsing.
 *
 * Filenames and context markers often repeat thousands of times in a diff.
 * This module provides efficient string interning to:
 * 1. Store unique strings only once in memory
 * 2. Return the same reference for repeated strings
 * 3. Use FNV-1a hashing for fast lookup without full string comparison
 *
 * Memory savings example:
 * - 50 modifications to "src/components/Button.tsx"
 * - Without interning: 50 * 24 bytes = 1,200 bytes for path strings alone
 * - With interning: 1 * 24 bytes = 24 bytes (50x reduction)
 */

/**
 * FNV-1a 32-bit hash constants.
 * FNV is chosen for its simplicity and good distribution properties.
 */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Compute FNV-1a hash of a byte slice.
 * Returns a 32-bit unsigned integer hash.
 */
function fnv1aHash(data: Uint8Array, start: number, length: number): number {
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < length; i++) {
    hash ^= data[start + i];
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash;
}

/**
 * Compute FNV-1a hash of a string.
 */
function fnv1aHashString(str: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash;
}

/**
 * Entry in the intern table.
 * Stores both the hash and the interned string for collision detection.
 */
interface InternEntry {
  hash: number;
  value: string;
}

/**
 * String interning pool for efficient memory usage.
 *
 * Design decisions:
 * - Uses Map<number, InternEntry[]> for hash -> entries mapping
 * - Handles hash collisions with linear probing within bucket
 * - Pre-allocates common paths (package.json, etc.) for faster lookup
 */
export class StringInternPool {
  // Hash map: hash -> array of entries (handles collisions)
  private readonly table: Map<number, InternEntry[]> = new Map();

  // Statistics for debugging/optimization
  private hits: number = 0;
  private misses: number = 0;
  private collisions: number = 0;

  // TextDecoder for byte-to-string conversion
  private readonly decoder = new TextDecoder("utf-8");

  constructor() {
    // Pre-populate with common paths to avoid first-lookup cost
    this.prePopulateCommon();
  }

  /**
   * Intern a string from raw bytes.
   * Returns the canonical string reference for the given byte sequence.
   *
   * This is the primary method for production use - it avoids creating
   * intermediate strings during the lookup process.
   */
  internFromBytes(
    buffer: Uint8Array,
    start: number,
    length: number
  ): string {
    const hash = fnv1aHash(buffer, start, length);
    const bucket = this.table.get(hash);

    if (bucket !== undefined) {
      // Check for existing entry with same content
      for (const entry of bucket) {
        if (this.bytesMatchString(buffer, start, length, entry.value)) {
          this.hits++;
          return entry.value;
        }
      }

      // Hash collision - different string with same hash
      this.collisions++;
    }

    // New string - decode and intern it
    this.misses++;
    const value = this.decoder.decode(buffer.subarray(start, start + length));

    if (bucket !== undefined) {
      bucket.push({ hash, value });
    } else {
      this.table.set(hash, [{ hash, value }]);
    }

    return value;
  }

  /**
   * Intern a string directly.
   * Used when you already have a string and want to deduplicate it.
   */
  intern(str: string): string {
    const hash = fnv1aHashString(str);
    const bucket = this.table.get(hash);

    if (bucket !== undefined) {
      for (const entry of bucket) {
        if (entry.value === str) {
          this.hits++;
          return entry.value;
        }
      }
      this.collisions++;
    }

    // New string - intern it
    this.misses++;

    if (bucket !== undefined) {
      bucket.push({ hash, value: str });
    } else {
      this.table.set(hash, [{ hash, value: str }]);
    }

    return str;
  }

  /**
   * Check if a string is already interned.
   */
  has(str: string): boolean {
    const hash = fnv1aHashString(str);
    const bucket = this.table.get(hash);

    if (bucket === undefined) return false;

    for (const entry of bucket) {
      if (entry.value === str) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get statistics about the intern pool.
   */
  getStats(): {
    uniqueStrings: number;
    buckets: number;
    hits: number;
    misses: number;
    collisions: number;
    hitRate: number;
  } {
    let uniqueStrings = 0;
    for (const bucket of this.table.values()) {
      uniqueStrings += bucket.length;
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      uniqueStrings,
      buckets: this.table.size,
      hits: this.hits,
      misses: this.misses,
      collisions: this.collisions,
      hitRate,
    };
  }

  /**
   * Clear the intern pool and reset statistics.
   */
  clear(): void {
    this.table.clear();
    this.hits = 0;
    this.misses = 0;
    this.collisions = 0;
    this.prePopulateCommon();
  }

  /**
   * Pre-populate with commonly seen file paths.
   * This avoids the first-lookup decode cost for frequent files.
   */
  private prePopulateCommon(): void {
    const commonPaths = [
      "package.json",
      "package-lock.json",
      "pnpm-lock.yaml",
      "bun.lockb",
      "yarn.lock",
      "tsconfig.json",
      "README.md",
      ".gitignore",
      ".env",
      ".env.local",
      "/dev/null",
    ];

    for (const path of commonPaths) {
      const hash = fnv1aHashString(path);
      this.table.set(hash, [{ hash, value: path }]);
    }
  }

  /**
   * Check if bytes match a string without decoding.
   * Optimized for ASCII-compatible UTF-8 strings (most file paths).
   */
  private bytesMatchString(
    buffer: Uint8Array,
    start: number,
    length: number,
    str: string
  ): boolean {
    // Quick length check
    if (length !== str.length) {
      // Handle multi-byte UTF-8 case
      // For most file paths this won't happen, but we need to be safe
      const decoded = this.decoder.decode(buffer.subarray(start, start + length));
      return decoded === str;
    }

    // Fast path: compare bytes directly (works for ASCII)
    for (let i = 0; i < length; i++) {
      if (buffer[start + i] !== str.charCodeAt(i)) {
        // Might be multi-byte UTF-8 - fall back to decode
        if (buffer[start + i] > 127) {
          const decoded = this.decoder.decode(buffer.subarray(start, start + length));
          return decoded === str;
        }
        return false;
      }
    }

    return true;
  }
}

/**
 * Global intern pool instance.
 * Most use cases should use this shared instance for maximum deduplication.
 */
let globalPool: StringInternPool | null = null;

/**
 * Get the global string intern pool.
 */
export function getGlobalInternPool(): StringInternPool {
  if (globalPool === null) {
    globalPool = new StringInternPool();
  }
  return globalPool;
}

/**
 * Reset the global intern pool (useful for tests or long-running processes).
 */
export function resetGlobalInternPool(): void {
  if (globalPool !== null) {
    globalPool.clear();
  }
}

/**
 * Deferred string reference.
 * Holds byte offset information and decodes/interns on demand.
 *
 * This enables lazy decoding - we store just the offset until
 * the actual string value is needed.
 */
export class DeferredString {
  private readonly buffer: Uint8Array;
  private readonly start: number;
  private readonly length: number;
  private cachedValue: string | null = null;
  private readonly pool: StringInternPool;

  constructor(
    buffer: Uint8Array,
    start: number,
    length: number,
    pool?: StringInternPool
  ) {
    this.buffer = buffer;
    this.start = start;
    this.length = length;
    this.pool = pool ?? getGlobalInternPool();
  }

  /**
   * Get the string value, decoding and interning on first access.
   */
  get value(): string {
    if (this.cachedValue === null) {
      this.cachedValue = this.pool.internFromBytes(
        this.buffer,
        this.start,
        this.length
      );
    }
    return this.cachedValue;
  }

  /**
   * Get byte length (without decoding).
   */
  get byteLength(): number {
    return this.length;
  }

  /**
   * Check if equals a string (without necessarily decoding).
   */
  equals(str: string): boolean {
    if (this.cachedValue !== null) {
      return this.cachedValue === str;
    }

    // Try byte comparison first
    if (this.length === str.length) {
      for (let i = 0; i < this.length; i++) {
        if (this.buffer[this.start + i] !== str.charCodeAt(i)) {
          return false;
        }
      }
      return true;
    }

    // Fallback to full decode
    return this.value === str;
  }

  /**
   * Check if starts with a prefix (without full decoding).
   */
  startsWith(prefix: string): boolean {
    if (this.length < prefix.length) return false;

    for (let i = 0; i < prefix.length; i++) {
      if (this.buffer[this.start + i] !== prefix.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if ends with a suffix (without full decoding).
   */
  endsWith(suffix: string): boolean {
    if (this.length < suffix.length) return false;

    const startPos = this.length - suffix.length;
    for (let i = 0; i < suffix.length; i++) {
      if (this.buffer[this.start + startPos + i] !== suffix.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Force decoding and return the value.
   */
  toString(): string {
    return this.value;
  }
}
