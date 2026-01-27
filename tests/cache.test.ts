/**
 * Tests for cache utilities.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hashString,
  hashBuffer,
  computeCacheKey,
  hashFilePatterns,
  hashContent,
  HASH_LENGTH,
} from "../src/cache/hash.js";
import {
  getCacheDir,
  getIndexPath,
  getRefsCachePath,
  getChangesetCachePath,
  getAnalyzerCachePath,
} from "../src/cache/paths.js";
import {
  readIndex,
  writeIndex,
  recordHit,
  recordMiss,
  getCacheStats,
  clearCache,
  pruneCache,
  atomicWriteFile,
  writeCacheEntry,
  readCacheEntry,
} from "../src/cache/storage.js";
import {
  computeFilePatternsSignature,
  computeAnalyzerInputSignature,
} from "../src/cache/signatures.js";
import {
  computeAnalyzerContentHash,
  filterDiffsByPatterns,
} from "../src/cache/analyzer.js";
import type { CacheIndex, CacheEntryMetadata } from "../src/cache/types.js";
import type { Analyzer, ChangeSet, FileDiff, Finding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

// ============================================================================
// Hash Tests
// ============================================================================

describe("hash utilities", () => {
  describe("hashString", () => {
    it("should return a 16-character hex string", () => {
      const hash = hashString("test");
      expect(hash).toHaveLength(HASH_LENGTH);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should be deterministic", () => {
      const hash1 = hashString("same input");
      const hash2 = hashString("same input");
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashString("input1");
      const hash2 = hashString("input2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("hashBuffer", () => {
    it("should return a 16-character hex string", () => {
      const hash = hashBuffer(Buffer.from("test"));
      expect(hash).toHaveLength(HASH_LENGTH);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it("should match hashString for same content", () => {
      const content = "hello world";
      const hashFromString = hashString(content);
      const hashFromBuffer = hashBuffer(Buffer.from(content));
      expect(hashFromBuffer).toBe(hashFromString);
    });
  });

  describe("computeCacheKey", () => {
    it("should combine components into a hash", () => {
      const key = computeCacheKey("a", "b", "c");
      expect(key).toHaveLength(HASH_LENGTH);
      expect(key).toMatch(/^[a-f0-9]+$/);
    });

    it("should be order-sensitive", () => {
      const key1 = computeCacheKey("a", "b");
      const key2 = computeCacheKey("b", "a");
      expect(key1).not.toBe(key2);
    });
  });

  describe("hashFilePatterns", () => {
    it("should produce consistent hash for same patterns", () => {
      const hash1 = hashFilePatterns(["*.ts", "*.js"], ["node_modules/**"]);
      const hash2 = hashFilePatterns(["*.ts", "*.js"], ["node_modules/**"]);
      expect(hash1).toBe(hash2);
    });

    it("should produce same hash regardless of pattern order", () => {
      const hash1 = hashFilePatterns(["*.js", "*.ts"], ["node_modules/**"]);
      const hash2 = hashFilePatterns(["*.ts", "*.js"], ["node_modules/**"]);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hash for different patterns", () => {
      const hash1 = hashFilePatterns(["*.ts"], []);
      const hash2 = hashFilePatterns(["*.js"], []);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("hashContent", () => {
    it("should hash serialized content", () => {
      const hash = hashContent({ key: "value" });
      expect(hash).toHaveLength(HASH_LENGTH);
    });

    it("should be deterministic for same content", () => {
      const hash1 = hashContent({ a: 1, b: 2 });
      const hash2 = hashContent({ a: 1, b: 2 });
      expect(hash1).toBe(hash2);
    });
  });
});

// ============================================================================
// Path Tests
// ============================================================================

describe("path utilities", () => {
  it("getCacheDir should return expected path", () => {
    const cwd = "/project";
    const dir = getCacheDir(cwd);
    expect(dir).toBe("/project/.branch-narrator/cache");
  });

  it("getIndexPath should return expected path", () => {
    const cwd = "/project";
    const path = getIndexPath(cwd);
    expect(path).toBe("/project/.branch-narrator/cache/index.json");
  });

  it("getRefsCachePath should return expected path", () => {
    const cwd = "/project";
    const path = getRefsCachePath(cwd);
    expect(path).toBe("/project/.branch-narrator/cache/git/refs.json");
  });

  it("getChangesetCachePath should return expected path", () => {
    const cwd = "/project";
    const path = getChangesetCachePath("abc123", cwd);
    expect(path).toBe("/project/.branch-narrator/cache/changeset/abc123.json");
  });

  it("getAnalyzerCachePath should return expected path", () => {
    const cwd = "/project";
    const path = getAnalyzerCachePath("my-analyzer", "abc123", cwd);
    expect(path).toBe("/project/.branch-narrator/cache/per-analyzer/my-analyzer_abc123.json");
  });
});

// ============================================================================
// Storage Tests
// ============================================================================

describe("storage utilities", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cache-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("readIndex / writeIndex", () => {
    it("should return empty index when file doesn't exist", async () => {
      const index = await readIndex(tempDir);
      expect(index.schemaVersion).toBe("1.0");
      expect(index.hits).toBe(0);
      expect(index.misses).toBe(0);
      expect(Object.keys(index.entries)).toHaveLength(0);
    });

    it("should write and read back index", async () => {
      const testIndex: CacheIndex = {
        schemaVersion: "1.0",
        hits: 5,
        misses: 3,
        entries: {},
        updatedAt: new Date().toISOString(),
      };

      await writeIndex(testIndex, tempDir);
      const readBack = await readIndex(tempDir);

      expect(readBack.hits).toBe(5);
      expect(readBack.misses).toBe(3);
    });
  });

  describe("recordHit / recordMiss", () => {
    it("should increment hit counter", async () => {
      await recordHit(tempDir);
      await recordHit(tempDir);
      const index = await readIndex(tempDir);
      expect(index.hits).toBe(2);
    });

    it("should increment miss counter", async () => {
      await recordMiss(tempDir);
      await recordMiss(tempDir);
      await recordMiss(tempDir);
      const index = await readIndex(tempDir);
      expect(index.misses).toBe(3);
    });
  });

  describe("getCacheStats", () => {
    it("should return empty stats for empty cache", async () => {
      const stats = await getCacheStats({ cwd: tempDir });
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.entries).toBe(0);
      expect(stats.sizeBytes).toBe(0);
    });

    it("should calculate hit rate correctly", async () => {
      await recordHit(tempDir);
      await recordHit(tempDir);
      await recordMiss(tempDir);

      const stats = await getCacheStats({ cwd: tempDir });
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(67); // 2/3 ≈ 67%
    });
  });

  describe("clearCache", () => {
    it("should remove cache directory", async () => {
      await writeIndex(
        { schemaVersion: "1.0", hits: 1, misses: 1, entries: {}, updatedAt: "" },
        tempDir
      );

      await clearCache({ cwd: tempDir });

      const index = await readIndex(tempDir);
      expect(index.hits).toBe(0);
      expect(index.misses).toBe(0);
    });
  });

  describe("atomicWriteFile", () => {
    it("should write file atomically", async () => {
      const filePath = join(tempDir, "test", "file.txt");
      await atomicWriteFile(filePath, "hello world");

      const content = await readFile(filePath, "utf-8");
      expect(content).toBe("hello world");
    });
  });

  describe("writeCacheEntry / readCacheEntry", () => {
    it("should write and read cache entry", async () => {
      const category = "test";
      const key = "abc123";
      const data = { foo: "bar" };
      const filePath = join(tempDir, ".branch-narrator", "cache", "test", `${key}.json`);

      await writeCacheEntry(category, key, data, filePath, tempDir);
      const readBack = await readCacheEntry<typeof data>(category, key, filePath, tempDir);

      expect(readBack).toEqual(data);
    });

    it("should return null for non-existent entry", async () => {
      const filePath = join(tempDir, "nonexistent.json");
      const result = await readCacheEntry("test", "key", filePath, tempDir);
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Signature Tests
// ============================================================================

describe("signature utilities", () => {
  describe("computeFilePatternsSignature", () => {
    it("should produce deterministic signature", () => {
      const sig1 = computeFilePatternsSignature(["*.ts"], ["node_modules/**"]);
      const sig2 = computeFilePatternsSignature(["*.ts"], ["node_modules/**"]);
      expect(sig1).toBe(sig2);
    });
  });

  describe("computeAnalyzerInputSignature", () => {
    it("should compute signature from relevant diffs", () => {
      const diffs = [
        { path: "a.ts", contentHash: "hash1" },
        { path: "b.ts", contentHash: "hash2" },
      ];
      const sig = computeAnalyzerInputSignature(diffs);
      expect(sig).toHaveLength(HASH_LENGTH);
    });

    it("should produce same signature regardless of order", () => {
      const diffs1 = [
        { path: "a.ts", contentHash: "hash1" },
        { path: "b.ts", contentHash: "hash2" },
      ];
      const diffs2 = [
        { path: "b.ts", contentHash: "hash2" },
        { path: "a.ts", contentHash: "hash1" },
      ];
      const sig1 = computeAnalyzerInputSignature(diffs1);
      const sig2 = computeAnalyzerInputSignature(diffs2);
      expect(sig1).toBe(sig2);
    });

    it("should produce different signature for different content", () => {
      const diffs1 = [{ path: "a.ts", contentHash: "hash1" }];
      const diffs2 = [{ path: "a.ts", contentHash: "hash2" }];
      const sig1 = computeAnalyzerInputSignature(diffs1);
      const sig2 = computeAnalyzerInputSignature(diffs2);
      expect(sig1).not.toBe(sig2);
    });
  });
});

// ============================================================================
// Content-Based Analyzer Caching Tests
// ============================================================================

describe("content-based analyzer caching", () => {
  // Helper to create a simple analyzer for testing
  function createTestAnalyzer(
    name: string,
    cache?: { includeGlobs?: string[]; excludeGlobs?: string[] }
  ): Analyzer {
    return {
      name,
      cache,
      analyze: () => [],
    };
  }

  describe("filterDiffsByPatterns", () => {
    const diffs: FileDiff[] = [
      createFileDiff("src/routes/+page.svelte", ["<h1>Hello</h1>"]),
      createFileDiff("package.json", ['{"name":"test"}']),
      createFileDiff("tests/foo.test.ts", ["it('should', () => {})"]),
      createFileDiff(".github/workflows/ci.yml", ["on: push"]),
    ];

    it("should return all diffs when no patterns specified", () => {
      const result = filterDiffsByPatterns(diffs);
      expect(result).toHaveLength(4);
    });

    it("should filter by includeGlobs", () => {
      const result = filterDiffsByPatterns(diffs, ["**/package.json"]);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("package.json");
    });

    it("should support multiple includeGlobs patterns", () => {
      const result = filterDiffsByPatterns(diffs, ["**/package.json", "**/.github/workflows/**"]);
      expect(result).toHaveLength(2);
    });

    it("should filter by excludeGlobs", () => {
      const result = filterDiffsByPatterns(diffs, undefined, ["**/tests/**"]);
      expect(result).toHaveLength(3);
      expect(result.every((d) => !d.path.startsWith("tests/"))).toBe(true);
    });

    it("should apply both includeGlobs and excludeGlobs", () => {
      const result = filterDiffsByPatterns(
        diffs,
        ["**/*.ts", "**/*.svelte"],
        ["**/tests/**"]
      );
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("src/routes/+page.svelte");
    });
  });

  describe("computeAnalyzerContentHash", () => {
    it("should produce stable hash for same inputs", () => {
      const analyzer = createTestAnalyzer("test", { includeGlobs: ["**/package.json"] });
      const changeSet = createChangeSet({
        diffs: [createFileDiff("package.json", ['{"name":"test"}'])],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet);
      expect(hash1).toBe(hash2);
    });

    it("should ignore unrelated files when includeGlobs is set", () => {
      const analyzer = createTestAnalyzer("test", { includeGlobs: ["**/package.json"] });

      const changeSet1 = createChangeSet({
        diffs: [
          createFileDiff("package.json", ['{"name":"test"}']),
          createFileDiff("tests/foo.test.ts", ["test 1"]),
        ],
      });

      const changeSet2 = createChangeSet({
        diffs: [
          createFileDiff("package.json", ['{"name":"test"}']),
          createFileDiff("tests/bar.test.ts", ["test 2"]),
        ],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet1);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet2);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hash when relevant files change", () => {
      const analyzer = createTestAnalyzer("test", { includeGlobs: ["**/package.json"] });

      const changeSet1 = createChangeSet({
        diffs: [createFileDiff("package.json", ['{"name":"v1"}'])],
      });

      const changeSet2 = createChangeSet({
        diffs: [createFileDiff("package.json", ['{"name":"v2"}'])],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet1);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet2);
      expect(hash1).not.toBe(hash2);
    });

    it("should hash all files when cache is empty object (no patterns)", () => {
      const analyzer = createTestAnalyzer("test", {});

      const changeSet1 = createChangeSet({
        diffs: [
          createFileDiff("src/a.ts", ["const a = 1"]),
          createFileDiff("src/b.ts", ["const b = 2"]),
        ],
      });

      const changeSet2 = createChangeSet({
        diffs: [
          createFileDiff("src/a.ts", ["const a = 1"]),
          createFileDiff("src/b.ts", ["const b = 3"]),
        ],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet1);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet2);
      expect(hash1).not.toBe(hash2);
    });

    it("should produce same hash for empty matching set regardless of unrelated files", () => {
      const analyzer = createTestAnalyzer("test", { includeGlobs: ["**/*.graphql"] });

      const changeSet1 = createChangeSet({
        diffs: [createFileDiff("src/a.ts", ["const a = 1"])],
      });

      const changeSet2 = createChangeSet({
        diffs: [
          createFileDiff("src/a.ts", ["const a = 1"]),
          createFileDiff("src/b.ts", ["const b = 2"]),
        ],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet1);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet2);
      // Both produce empty match set → same hash
      expect(hash1).toBe(hash2);
    });

    it("should produce deterministic hash regardless of file order", () => {
      const analyzer = createTestAnalyzer("test", {});

      const changeSet1 = createChangeSet({
        diffs: [
          createFileDiff("src/a.ts", ["const a = 1"]),
          createFileDiff("src/b.ts", ["const b = 2"]),
        ],
      });

      const changeSet2 = createChangeSet({
        diffs: [
          createFileDiff("src/b.ts", ["const b = 2"]),
          createFileDiff("src/a.ts", ["const a = 1"]),
        ],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet1);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet2);
      expect(hash1).toBe(hash2);
    });

    it("should respect excludeGlobs patterns", () => {
      const analyzer = createTestAnalyzer("test", {
        includeGlobs: ["**/*.ts"],
        excludeGlobs: ["**/tests/**"],
      });

      const changeSet1 = createChangeSet({
        diffs: [
          createFileDiff("src/a.ts", ["const a = 1"]),
          createFileDiff("tests/a.test.ts", ["test v1"]),
        ],
      });

      const changeSet2 = createChangeSet({
        diffs: [
          createFileDiff("src/a.ts", ["const a = 1"]),
          createFileDiff("tests/a.test.ts", ["test v2"]),
        ],
      });

      const hash1 = computeAnalyzerContentHash(analyzer, changeSet1);
      const hash2 = computeAnalyzerContentHash(analyzer, changeSet2);
      // Test file changes ignored due to excludeGlobs
      expect(hash1).toBe(hash2);
    });
  });

  describe("analyzer cache metadata on built-in analyzers", () => {
    it("impact analyzer should cache based on code file diffs", async () => {
      const { impactAnalyzer } = await import("../src/analyzers/impact.js");
      expect(impactAnalyzer.cache).toBeDefined();
      expect(impactAnalyzer.cache?.includeGlobs).toContain(
        "**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts,vue,svelte}"
      );
    });

    it("dependencies analyzer should have package.json pattern", async () => {
      const { dependencyAnalyzer } = await import("../src/analyzers/dependencies.js");
      expect(dependencyAnalyzer.cache).toBeDefined();
      expect(dependencyAnalyzer.cache?.includeGlobs).toContain("**/package.json");
    });

    it("vitest analyzer should have test file patterns", async () => {
      const { vitestAnalyzer } = await import("../src/analyzers/vitest.js");
      expect(vitestAnalyzer.cache).toBeDefined();
      expect(vitestAnalyzer.cache?.includeGlobs?.length).toBeGreaterThan(0);
    });

    it("file-summary analyzer should have empty cache (hashes all files)", async () => {
      const { fileSummaryAnalyzer } = await import("../src/analyzers/file-summary.js");
      expect(fileSummaryAnalyzer.cache).toBeDefined();
      expect(fileSummaryAnalyzer.cache?.includeGlobs).toBeUndefined();
    });

    it("cloudflare analyzer should have specific patterns", async () => {
      const { cloudflareAnalyzer } = await import("../src/analyzers/cloudflare.js");
      expect(cloudflareAnalyzer.cache).toBeDefined();
      expect(cloudflareAnalyzer.cache?.includeGlobs).toContain("**/wrangler.toml");
    });
  });
});
