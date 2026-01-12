/**
 * Unit tests for diff line number tracking.
 */

import { describe, expect, test } from "bun:test";
import {
  getAdditionsWithLineNumbers,
  findAdditionMatchesWithLineNumbers,
} from "../src/git/parser.js";
import type { FileDiff } from "../src/core/types.js";

describe("getAdditionsWithLineNumbers", () => {
  test("should extract line numbers from a simple hunk", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 10,
          oldLines: 2,
          newStart: 10,
          newLines: 3,
          content: `@@ -10,2 +10,3 @@
 context line 1
+added line 1
+added line 2
 context line 2`,
          additions: ["added line 1", "added line 2"],
          deletions: [],
        },
      ],
    };

    const result = getAdditionsWithLineNumbers(diff);

    expect(result).toEqual([
      { line: "added line 1", lineNumber: 11 },
      { line: "added line 2", lineNumber: 12 },
    ]);
  });

  test("should handle deletions correctly (no line increment)", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 5,
          oldLines: 3,
          newStart: 5,
          newLines: 2,
          content: `@@ -5,3 +5,2 @@
 context before
-deleted line
+added line
 context after`,
          additions: ["added line"],
          deletions: ["deleted line"],
        },
      ],
    };

    const result = getAdditionsWithLineNumbers(diff);

    expect(result).toEqual([{ line: "added line", lineNumber: 6 }]);
  });

  test("should handle multiple hunks", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 2,
          content: `@@ -1,1 +1,2 @@
+first addition
 existing line`,
          additions: ["first addition"],
          deletions: [],
        },
        {
          oldStart: 10,
          oldLines: 1,
          newStart: 11,
          newLines: 2,
          content: `@@ -10,1 +11,2 @@
 another context
+second addition`,
          additions: ["second addition"],
          deletions: [],
        },
      ],
    };

    const result = getAdditionsWithLineNumbers(diff);

    expect(result).toEqual([
      { line: "first addition", lineNumber: 1 },
      { line: "second addition", lineNumber: 12 },
    ]);
  });

  test("should handle new file (all additions)", () => {
    const diff: FileDiff = {
      path: "new-file.ts",
      status: "added",
      hunks: [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 3,
          content: `@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3`,
          additions: ["line 1", "line 2", "line 3"],
          deletions: [],
        },
      ],
    };

    const result = getAdditionsWithLineNumbers(diff);

    expect(result).toEqual([
      { line: "line 1", lineNumber: 1 },
      { line: "line 2", lineNumber: 2 },
      { line: "line 3", lineNumber: 3 },
    ]);
  });

  test("should skip +++ file markers", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 2,
          content: `@@ -1,0 +1,2 @@
+actual addition 1
+actual addition 2`,
          additions: ["actual addition 1", "actual addition 2"],
          deletions: [],
        },
      ],
    };

    const result = getAdditionsWithLineNumbers(diff);

    // Should only include the actual additions, not file markers
    expect(result).toEqual([
      { line: "actual addition 1", lineNumber: 1 },
      { line: "actual addition 2", lineNumber: 2 },
    ]);
  });

  test("should handle empty hunks", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [],
    };

    const result = getAdditionsWithLineNumbers(diff);

    expect(result).toEqual([]);
  });
});

describe("findAdditionMatchesWithLineNumbers", () => {
  test("should find pattern matches with line numbers", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 3,
          content: `@@ -1,0 +1,3 @@
+const foo = 'bar';
+const baz = 'qux';
+console.log('test');`,
          additions: [
            "const foo = 'bar';",
            "const baz = 'qux';",
            "console.log('test');",
          ],
          deletions: [],
        },
      ],
    };

    const result = findAdditionMatchesWithLineNumbers(diff, /const (\w+)/);

    expect(result).toHaveLength(2);
    expect(result[0].lineNumber).toBe(1);
    expect(result[0].match[1]).toBe("foo");
    expect(result[1].lineNumber).toBe(2);
    expect(result[1].match[1]).toBe("baz");
  });

  test("should find multiple matches on same line", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          content: `@@ -1,0 +1,1 @@
+const foo = 'bar', baz = 'qux';`,
          additions: ["const foo = 'bar', baz = 'qux';"],
          deletions: [],
        },
      ],
    };

    const result = findAdditionMatchesWithLineNumbers(diff, /(\w+) = '/g);

    expect(result).toHaveLength(2);
    expect(result[0].lineNumber).toBe(1);
    expect(result[0].match[1]).toBe("foo");
    expect(result[1].lineNumber).toBe(1);
    expect(result[1].match[1]).toBe("baz");
  });

  test("should handle no matches", () => {
    const diff: FileDiff = {
      path: "test.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          content: `@@ -1,0 +1,1 @@
+console.log('test');`,
          additions: ["console.log('test');"],
          deletions: [],
        },
      ],
    };

    const result = findAdditionMatchesWithLineNumbers(diff, /const (\w+)/);

    expect(result).toEqual([]);
  });

  test("should track line numbers across multiple hunks", () => {
    const diff: FileDiff = {
      path: "env.ts",
      status: "modified",
      hunks: [
        {
          oldStart: 10,
          oldLines: 1,
          newStart: 10,
          newLines: 2,
          content: `@@ -10,1 +10,2 @@
+const API_KEY = process.env.API_KEY;
 existing line`,
          additions: ["const API_KEY = process.env.API_KEY;"],
          deletions: [],
        },
        {
          oldStart: 20,
          oldLines: 1,
          newStart: 21,
          newLines: 2,
          content: `@@ -20,1 +21,2 @@
 another line
+const DB_URL = process.env.DATABASE_URL;`,
          additions: ["const DB_URL = process.env.DATABASE_URL;"],
          deletions: [],
        },
      ],
    };

    const result = findAdditionMatchesWithLineNumbers(
      diff,
      /process\.env\.(\w+)/
    );

    expect(result).toHaveLength(2);
    expect(result[0].lineNumber).toBe(10);
    expect(result[0].match[1]).toBe("API_KEY");
    expect(result[1].lineNumber).toBe(22);
    expect(result[1].match[1]).toBe("DATABASE_URL");
  });
});
