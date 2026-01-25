/**
 * Unit tests for Data-Oriented Design (DOD) diff parser.
 *
 * Tests cover:
 * - DiffArena TypedArray storage
 * - DiffScanner byte-level parsing
 * - StringInternPool deduplication
 * - StreamingDiffParser full parsing
 * - Adapter layer for legacy compatibility
 */

import { describe, expect, test, beforeEach } from "bun:test";
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
  DiffScanner,
  ScanResultType,
  createScannerFromString,
  StringInternPool,
  getGlobalInternPool,
  resetGlobalInternPool,
  DeferredString,
  StreamingDiffParser,
  parseDiffBuffer,
  parseDiffString,
  toFileDiffs,
  toFileChanges,
  extractFilePaths,
  hasFileMatching,
  iterateAdditions,
  getChangeStats,
} from "../src/git/dod/index.js";

// ============================================================================
// DiffArena Tests
// ============================================================================

describe("DiffArena", () => {
  test("should create arena with default capacity", () => {
    const arena = new DiffArena();

    expect(arena.lineCount).toBe(0);
    expect(arena.hunkCount).toBe(0);
    expect(arena.fileCount).toBe(0);
  });

  test("should create arena with custom capacity", () => {
    const arena = new DiffArena({
      lineCapacity: 100,
      hunkCapacity: 10,
      fileCapacity: 5,
    });

    expect(arena.lineTypes.length).toBe(100);
    expect(arena.hunkOldStarts.length).toBe(10);
    expect(arena.fileStatuses.length).toBe(5);
  });

  test("should add file entries correctly", () => {
    const arena = new DiffArena();
    const buffer = new TextEncoder().encode("src/test.ts");
    arena.setSourceBuffer(buffer);

    const idx = arena.addFile(FILE_STATUS_MODIFIED, 0, 11);

    expect(idx).toBe(0);
    expect(arena.fileCount).toBe(1);
    expect(arena.fileStatuses[0]).toBe(FILE_STATUS_MODIFIED);
  });

  test("should add hunk entries correctly", () => {
    const arena = new DiffArena();
    const buffer = new TextEncoder().encode("@@ -10,5 +10,7 @@");
    arena.setSourceBuffer(buffer);

    arena.addFile(FILE_STATUS_MODIFIED, 0, 0);
    const idx = arena.addHunk(0, 10, 5, 10, 7, 0, 17);

    expect(idx).toBe(0);
    expect(arena.hunkCount).toBe(1);
    expect(arena.hunkOldStarts[0]).toBe(10);
    expect(arena.hunkOldLines[0]).toBe(5);
    expect(arena.hunkNewStarts[0]).toBe(10);
    expect(arena.hunkNewLines[0]).toBe(7);
  });

  test("should add line entries correctly", () => {
    const arena = new DiffArena();
    const buffer = new TextEncoder().encode("const x = 1;");
    arena.setSourceBuffer(buffer);

    arena.addFile(FILE_STATUS_MODIFIED, 0, 0);
    arena.addHunk(0, 1, 0, 1, 1, 0, 0);
    const idx = arena.addLine(LINE_TYPE_ADD, 0, 12, 0, 0, 1, 0);

    expect(idx).toBe(0);
    expect(arena.lineCount).toBe(1);
    expect(arena.lineTypes[0]).toBe(LINE_TYPE_ADD);
    expect(arena.lineNewNumbers[0]).toBe(1);
  });

  test("should decode line content lazily", () => {
    const arena = new DiffArena();
    const content = "const x = 1;";
    const buffer = new TextEncoder().encode(content);
    arena.setSourceBuffer(buffer);

    arena.addFile(FILE_STATUS_MODIFIED, 0, 0);
    arena.addHunk(0, 1, 0, 1, 1, 0, 0);
    arena.addLine(LINE_TYPE_ADD, 0, 12, 0, 0, 1, 0);

    const decoded = arena.decodeLineContent(0);
    expect(decoded).toBe(content);
  });

  test("should grow arrays when capacity exceeded", () => {
    const arena = new DiffArena({
      lineCapacity: 2,
      hunkCapacity: 2,
      fileCapacity: 2,
    });

    const buffer = new TextEncoder().encode("test");
    arena.setSourceBuffer(buffer);

    // Add more than initial capacity
    for (let i = 0; i < 5; i++) {
      arena.addFile(FILE_STATUS_MODIFIED, 0, 4);
    }

    expect(arena.fileCount).toBe(5);
    expect(arena.fileStatuses.length).toBeGreaterThanOrEqual(5);
  });

  test("should reset arena for reuse", () => {
    const arena = new DiffArena();
    const buffer = new TextEncoder().encode("test");
    arena.setSourceBuffer(buffer);

    arena.addFile(FILE_STATUS_MODIFIED, 0, 4);
    arena.addHunk(0, 1, 1, 1, 1, 0, 4);
    arena.addLine(LINE_TYPE_ADD, 0, 4, 0, 0, 1, 0);

    arena.reset();

    expect(arena.fileCount).toBe(0);
    expect(arena.hunkCount).toBe(0);
    expect(arena.lineCount).toBe(0);
  });

  test("should calculate memory stats", () => {
    const arena = new DiffArena();
    const buffer = new TextEncoder().encode("test");
    arena.setSourceBuffer(buffer);

    arena.addFile(FILE_STATUS_MODIFIED, 0, 4);
    arena.addHunk(0, 1, 1, 1, 1, 0, 4);
    arena.addLine(LINE_TYPE_ADD, 0, 4, 0, 0, 1, 0);

    const stats = arena.getMemoryStats();

    expect(stats.lineCount).toBe(1);
    expect(stats.hunkCount).toBe(1);
    expect(stats.fileCount).toBe(1);
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.efficiency).toBeGreaterThan(0);
    expect(stats.efficiency).toBeLessThanOrEqual(1);
  });

  test("should create arena for estimated size", () => {
    const arena = createArenaForSize(100000); // 100KB

    // Should have reasonable capacity
    expect(arena.lineTypes.length).toBeGreaterThan(256);
    expect(arena.hunkOldStarts.length).toBeGreaterThan(32);
    expect(arena.fileStatuses.length).toBeGreaterThan(16);
  });
});

// ============================================================================
// DiffScanner Tests
// ============================================================================

describe("DiffScanner", () => {
  test("should scan diff header", () => {
    const scanner = createScannerFromString(
      "diff --git a/src/test.ts b/src/test.ts\n"
    );

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.DiffHeader);
  });

  test("should scan old file path", () => {
    const scanner = createScannerFromString("--- a/src/test.ts\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.OldFilePath);
  });

  test("should scan new file path", () => {
    const scanner = createScannerFromString("+++ b/src/test.ts\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.NewFilePath);
  });

  test("should scan hunk header", () => {
    const scanner = createScannerFromString("@@ -10,5 +10,7 @@ function test() {\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.HunkHeader);
    expect(result?.hunkRange).toEqual({
      oldStart: 10,
      oldLines: 5,
      newStart: 10,
      newLines: 7,
    });
  });

  test("should scan addition line", () => {
    const scanner = createScannerFromString("+const x = 1;\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.Addition);
    expect(scanner.decode(result!.contentStart, result!.contentLength)).toBe(
      "const x = 1;"
    );
  });

  test("should scan deletion line", () => {
    const scanner = createScannerFromString("-const x = 1;\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.Deletion);
    expect(scanner.decode(result!.contentStart, result!.contentLength)).toBe(
      "const x = 1;"
    );
  });

  test("should scan context line", () => {
    const scanner = createScannerFromString(" const x = 1;\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.Context);
  });

  test("should handle hunk header with single line counts", () => {
    const scanner = createScannerFromString("@@ -1 +1 @@\n");

    const result = scanner.scanLine();

    expect(result?.type).toBe(ScanResultType.HunkHeader);
    expect(result?.hunkRange).toEqual({
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
    });
  });

  test("should extract diff path correctly", () => {
    const scanner = createScannerFromString(
      "diff --git a/src/old.ts b/src/new.ts\n"
    );

    const result = scanner.scanLine()!;
    const paths = scanner.extractDiffPath(
      result.contentStart,
      result.contentLength
    );

    expect(paths).not.toBeNull();
    expect(scanner.decode(paths!.oldPath.start, paths!.oldPath.length)).toBe(
      "src/old.ts"
    );
    expect(scanner.decode(paths!.newPath.start, paths!.newPath.length)).toBe(
      "src/new.ts"
    );
  });

  test("should extract file path from --- line", () => {
    const scanner = createScannerFromString("--- a/src/test.ts\n");

    const result = scanner.scanLine()!;
    const pathInfo = scanner.extractFilePath(
      result.contentStart,
      result.contentLength
    );

    expect(pathInfo).not.toBeNull();
    expect(scanner.decode(pathInfo!.start, pathInfo!.length)).toBe(
      "src/test.ts"
    );
  });

  test("should handle /dev/null path", () => {
    const scanner = createScannerFromString("--- /dev/null\n");

    const result = scanner.scanLine()!;
    const pathInfo = scanner.extractFilePath(
      result.contentStart,
      result.contentLength
    );

    expect(pathInfo).not.toBeNull();
    expect(scanner.decode(pathInfo!.start, pathInfo!.length)).toBe("/dev/null");
  });

  test("should track position correctly", () => {
    const scanner = createScannerFromString("line1\nline2\nline3\n");

    expect(scanner.getPosition()).toBe(0);

    scanner.scanLine();
    expect(scanner.getPosition()).toBe(6); // After "line1\n"

    scanner.scanLine();
    expect(scanner.getPosition()).toBe(12); // After "line2\n"
  });

  test("should report hasMore correctly", () => {
    const scanner = createScannerFromString("line\n");

    expect(scanner.hasMore()).toBe(true);
    scanner.scanLine();
    expect(scanner.hasMore()).toBe(false);
  });

  test("should reset scanner", () => {
    const scanner = createScannerFromString("line1\nline2\n");

    scanner.scanLine();
    scanner.reset();

    expect(scanner.getPosition()).toBe(0);
  });
});

// ============================================================================
// StringInternPool Tests
// ============================================================================

describe("StringInternPool", () => {
  let pool: StringInternPool;

  beforeEach(() => {
    pool = new StringInternPool();
  });

  test("should intern string and return same reference", () => {
    const str1 = pool.intern("test-string");
    const str2 = pool.intern("test-string");

    expect(str1).toBe(str2);
  });

  test("should intern from bytes", () => {
    const buffer = new TextEncoder().encode("hello world");

    const str1 = pool.internFromBytes(buffer, 0, 5); // "hello"
    const str2 = pool.internFromBytes(buffer, 0, 5); // "hello" again

    expect(str1).toBe("hello");
    expect(str1).toBe(str2);
  });

  test("should detect existing strings", () => {
    pool.intern("exists");

    expect(pool.has("exists")).toBe(true);
    expect(pool.has("does-not-exist")).toBe(false);
  });

  test("should track statistics", () => {
    pool.intern("first");
    pool.intern("second");
    pool.intern("first"); // Hit

    const stats = pool.getStats();

    expect(stats.uniqueStrings).toBeGreaterThanOrEqual(2);
    expect(stats.hits).toBeGreaterThanOrEqual(1);
  });

  test("should handle hash collisions gracefully", () => {
    // Add many strings to increase collision probability
    for (let i = 0; i < 1000; i++) {
      pool.intern(`string-${i}`);
    }

    // All strings should still be retrievable
    for (let i = 0; i < 1000; i++) {
      expect(pool.has(`string-${i}`)).toBe(true);
    }
  });

  test("should clear pool", () => {
    pool.intern("test");
    pool.clear();

    // Common paths are re-added on clear
    expect(pool.has("test")).toBe(false);
    expect(pool.has("package.json")).toBe(true); // Pre-populated
  });
});

describe("Global intern pool", () => {
  beforeEach(() => {
    resetGlobalInternPool();
  });

  test("should return same instance", () => {
    const pool1 = getGlobalInternPool();
    const pool2 = getGlobalInternPool();

    expect(pool1).toBe(pool2);
  });

  test("should reset global pool", () => {
    const pool = getGlobalInternPool();
    pool.intern("test-value");

    resetGlobalInternPool();

    expect(pool.has("test-value")).toBe(false);
  });
});

describe("DeferredString", () => {
  test("should decode on value access", () => {
    const buffer = new TextEncoder().encode("hello world");
    const deferred = new DeferredString(buffer, 0, 5);

    expect(deferred.value).toBe("hello");
  });

  test("should cache decoded value", () => {
    const buffer = new TextEncoder().encode("hello");
    const deferred = new DeferredString(buffer, 0, 5);

    const value1 = deferred.value;
    const value2 = deferred.value;

    expect(value1).toBe(value2);
    expect(value1).toBe("hello");
  });

  test("should check equality without full decode", () => {
    const buffer = new TextEncoder().encode("hello");
    const deferred = new DeferredString(buffer, 0, 5);

    expect(deferred.equals("hello")).toBe(true);
    expect(deferred.equals("world")).toBe(false);
  });

  test("should check startsWith", () => {
    const buffer = new TextEncoder().encode("src/components/Button.tsx");
    const deferred = new DeferredString(buffer, 0, buffer.length);

    expect(deferred.startsWith("src/")).toBe(true);
    expect(deferred.startsWith("lib/")).toBe(false);
  });

  test("should check endsWith", () => {
    const buffer = new TextEncoder().encode("src/components/Button.tsx");
    const deferred = new DeferredString(buffer, 0, buffer.length);

    expect(deferred.endsWith(".tsx")).toBe(true);
    expect(deferred.endsWith(".ts")).toBe(false);
  });

  test("should return byteLength", () => {
    const buffer = new TextEncoder().encode("hello");
    const deferred = new DeferredString(buffer, 0, 5);

    expect(deferred.byteLength).toBe(5);
  });
});

// ============================================================================
// StreamingDiffParser Tests
// ============================================================================

describe("StreamingDiffParser", () => {
  const simpleDiff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

  test("should parse simple diff", () => {
    const result = parseDiffString(simpleDiff);

    expect(result.arena.fileCount).toBe(1);
    expect(result.arena.hunkCount).toBe(1);
    expect(result.arena.lineCount).toBeGreaterThan(0);
  });

  test("should track parse statistics", () => {
    const result = parseDiffString(simpleDiff);

    expect(result.stats.filesFound).toBe(1);
    expect(result.stats.hunksFound).toBe(1);
    expect(result.stats.linesFound).toBeGreaterThan(0);
    expect(result.stats.parseTimeMs).toBeGreaterThanOrEqual(0);
  });

  test("should parse multiple files", () => {
    const multiFileDiff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1,1 +1,2 @@
 line 1
+line 2
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1,1 +1,2 @@
 line a
+line b
`;

    const result = parseDiffString(multiFileDiff);

    expect(result.arena.fileCount).toBe(2);
    expect(result.arena.hunkCount).toBe(2);
  });

  test("should parse new file", () => {
    const newFileDiff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,2 @@
+line 1
+line 2
`;

    const result = parseDiffString(newFileDiff);

    expect(result.arena.fileCount).toBe(1);
    expect(result.arena.fileStatuses[0]).toBe(FILE_STATUS_ADDED);
  });

  test("should parse deleted file", () => {
    const deletedFileDiff = `diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2
`;

    const result = parseDiffString(deletedFileDiff);

    expect(result.arena.fileCount).toBe(1);
    expect(result.arena.fileStatuses[0]).toBe(FILE_STATUS_DELETED);
  });

  test("should parse renamed file", () => {
    const renamedFileDiff = `diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
`;

    const result = parseDiffString(renamedFileDiff);

    expect(result.arena.fileCount).toBe(1);
    expect(result.arena.fileStatuses[0]).toBe(FILE_STATUS_RENAMED);
  });

  test("should parse from buffer", () => {
    const buffer = new TextEncoder().encode(simpleDiff);
    const result = parseDiffBuffer(buffer);

    expect(result.arena.fileCount).toBe(1);
  });

  test("should reuse custom arena", () => {
    const arena = new DiffArena({ lineCapacity: 1000 });
    const parser = new StreamingDiffParser({ arena });

    const result = parser.parseString(simpleDiff);

    expect(result.arena).toBe(arena);
  });
});

// ============================================================================
// Adapter Tests
// ============================================================================

describe("toFileDiffs", () => {
  const testDiff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;
`;

  test("should convert to FileDiff array", () => {
    const result = parseDiffString(testDiff);
    const diffs = toFileDiffs(result);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].path).toBe("src/test.ts");
    expect(diffs[0].status).toBe("modified");
  });

  test("should include hunks", () => {
    const result = parseDiffString(testDiff);
    const diffs = toFileDiffs(result, { lazy: false });

    expect(diffs[0].hunks).toHaveLength(1);
    expect(diffs[0].hunks[0].newStart).toBe(1);
    expect(diffs[0].hunks[0].newLines).toBe(3);
  });

  test("should include additions and deletions", () => {
    const result = parseDiffString(testDiff);
    const diffs = toFileDiffs(result, { lazy: false });

    expect(diffs[0].hunks[0].additions).toContain("const b = 2;");
  });

  test("should support lazy mode", () => {
    const result = parseDiffString(testDiff);
    const diffs = toFileDiffs(result, { lazy: true });

    // Path should still work (lazy access)
    expect(diffs[0].path).toBe("src/test.ts");
  });
});

describe("toFileChanges", () => {
  test("should convert to FileChange array", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,1 +1,2 @@
 line 1
+line 2
`;

    const result = parseDiffString(diff);
    const changes = toFileChanges(result);

    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("file.ts");
    expect(changes[0].status).toBe("modified");
  });
});

describe("extractFilePaths", () => {
  test("should extract file paths", () => {
    const diff = `diff --git a/file1.ts b/file1.ts
--- a/file1.ts
+++ b/file1.ts
@@ -1 +1 @@
-old
+new
diff --git a/file2.ts b/file2.ts
--- a/file2.ts
+++ b/file2.ts
@@ -1 +1 @@
-old
+new
`;

    const result = parseDiffString(diff);
    const paths = extractFilePaths(result);

    expect(paths).toContain("file1.ts");
    expect(paths).toContain("file2.ts");
  });
});

describe("hasFileMatching", () => {
  test("should find matching files", () => {
    const diff = `diff --git a/src/components/Button.tsx b/src/components/Button.tsx
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1 +1 @@
-old
+new
`;

    const result = parseDiffString(diff);

    expect(hasFileMatching(result, /\.tsx$/)).toBe(true);
    expect(hasFileMatching(result, /\.vue$/)).toBe(false);
  });
});

describe("iterateAdditions", () => {
  test("should iterate over additions", () => {
    const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,1 +1,3 @@
 existing
+added1
+added2
`;

    const result = parseDiffString(diff);
    const additions = [...iterateAdditions(result)];

    expect(additions).toHaveLength(2);
    expect(additions[0].content).toBe("added1");
    expect(additions[1].content).toBe("added2");
  });
});

describe("getChangeStats", () => {
  test("should count additions and deletions per file", () => {
    const diff = `diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1,2 +1,3 @@
 existing
+added
-deleted
`;

    const result = parseDiffString(diff);
    const stats = getChangeStats(result);

    const fileStat = stats.get("test.ts");
    expect(fileStat).toBeDefined();
    expect(fileStat!.additions).toBe(1);
    expect(fileStat!.deletions).toBe(1);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("DOD Parser Integration", () => {
  test("should parse real-world diff format", () => {
    const realDiff = `diff --git a/src/analyzers/security.ts b/src/analyzers/security.ts
index abc1234..def5678 100644
--- a/src/analyzers/security.ts
+++ b/src/analyzers/security.ts
@@ -10,6 +10,8 @@ import type { Analyzer } from "../types.js";

 export const securityAnalyzer: Analyzer = {
   name: "security",
+  version: "2.0.0",
+  category: "security",
   analyze(changeSet) {
     const findings: Finding[] = [];
@@ -25,7 +27,8 @@ export const securityAnalyzer: Analyzer = {
       if (isSecurityFile(file.path)) {
         findings.push({
           type: "security-file",
-          file: file.path,
+          files: [file.path],
+          severity: "high",
         });
       }
     }
`;

    const result = parseDiffString(realDiff);

    expect(result.arena.fileCount).toBe(1);
    expect(result.arena.hunkCount).toBe(2);

    const diffs = toFileDiffs(result);
    expect(diffs[0].path).toBe("src/analyzers/security.ts");
    expect(diffs[0].hunks).toHaveLength(2);
  });

  test("should handle large diffs efficiently", () => {
    // Generate a large diff
    let diff = "";
    for (let i = 0; i < 100; i++) {
      diff += `diff --git a/file${i}.ts b/file${i}.ts
--- a/file${i}.ts
+++ b/file${i}.ts
@@ -1,5 +1,10 @@
 line 1
+added line 1
+added line 2
+added line 3
+added line 4
+added line 5
 line 2
 line 3
 line 4
 line 5
`;
    }

    const startTime = performance.now();
    const result = parseDiffString(diff);
    const parseTime = performance.now() - startTime;

    expect(result.arena.fileCount).toBe(100);
    expect(parseTime).toBeLessThan(1000); // Should parse in under 1 second

    // Memory should be efficient
    const stats = result.arena.getMemoryStats();
    expect(stats.efficiency).toBeGreaterThan(0);
  });

  test("should produce compatible output with legacy parser", () => {
    const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
 const c = 3;
-const d = 4;
`;

    const result = parseDiffString(diff);
    const diffs = toFileDiffs(result, { lazy: false });

    // Check structure matches legacy format
    expect(diffs[0]).toHaveProperty("path");
    expect(diffs[0]).toHaveProperty("status");
    expect(diffs[0]).toHaveProperty("hunks");
    expect(diffs[0].hunks[0]).toHaveProperty("oldStart");
    expect(diffs[0].hunks[0]).toHaveProperty("oldLines");
    expect(diffs[0].hunks[0]).toHaveProperty("newStart");
    expect(diffs[0].hunks[0]).toHaveProperty("newLines");
    expect(diffs[0].hunks[0]).toHaveProperty("content");
    expect(diffs[0].hunks[0]).toHaveProperty("additions");
    expect(diffs[0].hunks[0]).toHaveProperty("deletions");
  });
});
