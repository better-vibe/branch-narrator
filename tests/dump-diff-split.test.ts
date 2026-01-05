/**
 * Tests for diff splitting utility
 */

import { describe, expect, it } from "bun:test";
import { splitFullDiff, limitConcurrency } from "../src/commands/dump-diff/core.js";

describe("splitFullDiff", () => {
  it("should split single file edit", () => {
    const diff = `diff --git a/file1.txt b/file1.txt
index 1234567..abcdefg 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,2 +1,3 @@
 line 1
-line 2
+line 2 modified
+line 3`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("file1.txt");
    expect(result[0]!.oldPath).toBeUndefined();
    expect(result[0]!.diffText).toBe(diff);
  });

  it("should split multiple file edits", () => {
    const diff = `diff --git a/file1.txt b/file1.txt
index 1234567..abcdefg 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1 +1 @@
-old
+new
diff --git a/file2.txt b/file2.txt
index 2345678..bcdefgh 100644
--- a/file2.txt
+++ b/file2.txt
@@ -1 +1 @@
-old2
+new2`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(2);
    expect(result[0]!.path).toBe("file1.txt");
    expect(result[1]!.path).toBe("file2.txt");
    expect(result[0]!.diffText).toContain("file1.txt");
    expect(result[0]!.diffText).toContain("-old");
    expect(result[1]!.diffText).toContain("file2.txt");
    expect(result[1]!.diffText).toContain("-old2");
  });

  it("should handle rename with oldPath", () => {
    const diff = `diff --git a/old-name.txt b/new-name.txt
similarity index 100%
rename from old-name.txt
rename to new-name.txt`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("new-name.txt");
    expect(result[0]!.oldPath).toBe("old-name.txt");
  });

  it("should handle new file", () => {
    const diff = `diff --git a/newfile.txt b/newfile.txt
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,2 @@
+line 1
+line 2`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("newfile.txt");
    expect(result[0]!.diffText).toContain("new file mode");
    expect(result[0]!.diffText).toContain("/dev/null");
  });

  it("should handle deleted file", () => {
    const diff = `diff --git a/deleted.txt b/deleted.txt
deleted file mode 100644
index 1234567..0000000
--- a/deleted.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("deleted.txt");
    expect(result[0]!.diffText).toContain("deleted file mode");
  });

  it("should handle empty diff", () => {
    const result = splitFullDiff("");
    expect(result).toHaveLength(0);
  });

  it("should handle whitespace-only diff", () => {
    const result = splitFullDiff("   \n  \n  ");
    expect(result).toHaveLength(0);
  });

  it("should preserve exact diff content for each file", () => {
    const diff = `diff --git a/file1.txt b/file1.txt
index abc..def 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,3 +1,4 @@
 context line
-removed line
+added line
+another added
 more context`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(1);
    // Ensure the entire diff is preserved
    expect(result[0]!.diffText).toBe(diff);
  });

  it("should handle files with special characters in path", () => {
    const diff = `diff --git a/path/to/file-name_v2.txt b/path/to/file-name_v2.txt
index 1234567..abcdefg 100644
--- a/path/to/file-name_v2.txt
+++ b/path/to/file-name_v2.txt
@@ -1 +1 @@
-old
+new`;

    const result = splitFullDiff(diff);

    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("path/to/file-name_v2.txt");
  });
});

describe("limitConcurrency", () => {
  it("should execute all tasks", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ];

    const results = await limitConcurrency(tasks, 2);

    expect(results).toEqual([1, 2, 3]);
  });

  it("should preserve order of results", async () => {
    const tasks = [
      () => new Promise<number>((resolve) => setTimeout(() => resolve(1), 50)),
      () => Promise.resolve(2),
      () => new Promise<number>((resolve) => setTimeout(() => resolve(3), 10)),
    ];

    const results = await limitConcurrency(tasks, 3);

    expect(results).toEqual([1, 2, 3]);
  });

  it("should limit concurrency", async () => {
    let activeCount = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount--;
      return i;
    });

    await limitConcurrency(tasks, 3);

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(0);
  });

  it("should handle empty task array", async () => {
    const results = await limitConcurrency([], 2);
    expect(results).toEqual([]);
  });

  it("should handle task errors", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error("Task failed")),
      () => Promise.resolve(3),
    ];

    await expect(limitConcurrency(tasks, 2)).rejects.toThrow("Task failed");
  });

  it("should use default concurrency limit of 4", async () => {
    let activeCount = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeCount--;
      return i;
    });

    await limitConcurrency(tasks);

    expect(maxActive).toBeLessThanOrEqual(4);
  });
});
