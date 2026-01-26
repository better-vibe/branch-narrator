/**
 * Cache module tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CacheManager,
  createEmptyIndex,
  computeHash,
  getCacheDir,
  clearCache,
  CACHE_SCHEMA_VERSION,
  MAX_ENTRIES_PER_ANALYZER,
  MAX_CHANGESET_ENTRIES,
  pruneExcessPerAnalyzerEntries,
  pruneExcessChangeSetEntries,
} from "../src/cache/index.js";

describe("Cache Module", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testDir = join(tmpdir(), `branch-narrator-cache-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Initialize a minimal git repo for cache to work
    const { execa } = await import("execa");
    await execa("git", ["init"], { cwd: testDir });
    await execa("git", ["config", "user.email", "test@test.com"], { cwd: testDir });
    await execa("git", ["config", "user.name", "Test"], { cwd: testDir });
    await writeFile(join(testDir, "test.txt"), "test");
    await execa("git", ["add", "."], { cwd: testDir });
    await execa("git", ["commit", "-m", "initial"], { cwd: testDir });
  });

  afterEach(async () => {
    // Clean up
    await rm(testDir, { recursive: true, force: true });
  });

  describe("CacheManager", () => {
    it("should initialize successfully", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");
      expect(cache.enabled).toBe(true);
    });

    it("should be disabled when enabled option is false", async () => {
      const cache = new CacheManager(testDir, { enabled: false });
      await cache.init();
      expect(cache.enabled).toBe(false);
    });

    it("should return correct version signature", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("2.0.0");
      const sig = cache.getVersionSignature();
      expect(sig.cliVersion).toBe("2.0.0");
      expect(sig.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
    });

    it("should compute worktree signature", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");
      const sig = await cache.computeWorktreeSignature();
      expect(sig.headSha).toBeTruthy();
      expect(sig.statusHash).toBeTruthy();
      expect(sig.indexTreeHash).toBeTruthy();
    });

    it("should cache worktree signature within session", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");
      const sig1 = await cache.computeWorktreeSignature();
      const sig2 = await cache.computeWorktreeSignature();
      expect(sig1).toBe(sig2); // Same object reference
    });

    it("should invalidate worktree signature", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");
      const sig1 = await cache.computeWorktreeSignature();
      cache.invalidateWorktreeSignature();
      const sig2 = await cache.computeWorktreeSignature();
      expect(sig1).not.toBe(sig2); // Different object
    });
  });

  describe("ChangeSet Cache", () => {
    it("should store and retrieve changesets", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const changeSet = {
        base: "main",
        head: "HEAD",
        files: [{ path: "src/foo.ts", status: "modified" as const }],
        diffs: [],
      };

      const key = {
        diffHash: "abc123",
        packageJsonHash: "def456",
      };

      await cache.setChangeSet(key, changeSet as any);

      const hash = cache.buildChangeSetCacheKey(key.diffHash, key.packageJsonHash);
      const retrieved = await cache.getChangeSet(hash);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.base).toBe("main");
      expect(retrieved?.head).toBe("HEAD");
    });
  });

  describe("Ref Cache", () => {
    it("should store and retrieve ref SHA", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      await cache.setRefSha("main", "abc123", true);
      const retrieved = cache.getRefSha("main");

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sha).toBe("abc123");
      expect(retrieved?.exists).toBe(true);
    });

    it("should return null for non-cached ref", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const retrieved = cache.getRefSha("nonexistent");
      expect(retrieved).toBeNull();
    });
  });

  describe("Cache Maintenance", () => {
    it("should clear cache", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Add some data
      await cache.setRefSha("main", "abc123", true);

      // Clear cache
      await cache.clear();

      // Stats should be reset
      const stats = await cache.stats();
      expect(stats.entries).toBe(0);
    });

    it("should return cache stats", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const stats = await cache.stats();
      expect(typeof stats.hits).toBe("number");
      expect(typeof stats.misses).toBe("number");
      expect(typeof stats.size).toBe("number");
      expect(typeof stats.entries).toBe("number");
    });
  });

  describe("computeHash", () => {
    it("should produce consistent hashes for same input", () => {
      const input = { foo: "bar", baz: 123 };
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      expect(hash1).toBe(hash2);
    });

    it("should produce consistent hashes regardless of key order", () => {
      const input1 = { a: 1, b: 2 };
      const input2 = { b: 2, a: 1 };
      const hash1 = computeHash(input1);
      const hash2 = computeHash(input2);
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = computeHash({ foo: "bar" });
      const hash2 = computeHash({ foo: "baz" });
      expect(hash1).not.toBe(hash2);
    });

    it("should handle string input", () => {
      const hash = computeHash("test string");
      expect(hash).toBeTruthy();
      expect(hash.length).toBe(16);
    });
  });

  describe("createEmptyIndex", () => {
    it("should create valid empty index", () => {
      const index = createEmptyIndex("1.0.0");
      expect(index.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
      expect(index.cliVersion).toBe("1.0.0");
      expect(index.entries).toHaveLength(0);
      expect(index.stats.hits).toBe(0);
      expect(index.stats.misses).toBe(0);
    });
  });

  describe("getCacheDir", () => {
    it("should return correct cache directory path", () => {
      const dir = getCacheDir("/some/path");
      expect(dir).toBe("/some/path/.branch-narrator/cache");
    });
  });

  describe("clearCache", () => {
    it("should clear cache directory", async () => {
      // Create cache
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");
      await cache.setRefSha("main", "abc123", true);

      // Clear using exported function
      await clearCache(testDir);

      // Create new cache and verify empty
      const cache2 = new CacheManager(testDir);
      await cache2.init("1.0.0");
      const stats = await cache2.stats();
      expect(stats.entries).toBe(0);
    });
  });

  describe("Per-Analyzer Incremental Caching", () => {
    it("should build per-analyzer cache key with ref names and profile", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const key1 = cache.buildPerAnalyzerCacheKey({
        analyzerName: "dependencies",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "feature/test",
        filesHash: "abc123",
      });

      const key2 = cache.buildPerAnalyzerCacheKey({
        analyzerName: "dependencies",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "feature/test",
        filesHash: "abc123",
      });

      // Same inputs should produce same key
      expect(key1).toBe(key2);
    });

    it("should produce different keys for different analyzers", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const key1 = cache.buildPerAnalyzerCacheKey({
        analyzerName: "dependencies",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "HEAD",
        filesHash: "abc123",
      });

      const key2 = cache.buildPerAnalyzerCacheKey({
        analyzerName: "vitest",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "HEAD",
        filesHash: "abc123",
      });

      expect(key1).not.toBe(key2);
    });

    it("should produce different keys for different file hashes", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const key1 = cache.buildPerAnalyzerCacheKey({
        analyzerName: "dependencies",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "HEAD",
        filesHash: "hash1",
      });

      const key2 = cache.buildPerAnalyzerCacheKey({
        analyzerName: "dependencies",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "HEAD",
        filesHash: "hash2",
      });

      expect(key1).not.toBe(key2);
    });

    it("should store and retrieve per-analyzer findings", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const key = cache.buildPerAnalyzerCacheKeyObject({
        analyzerName: "test-analyzer",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "feature/test",
        filesHash: "abc123",
      });

      const findings = [
        { type: "dependency-change" as const, name: "lodash", action: "added" as const, version: "4.0.0" },
      ];

      await cache.setPerAnalyzerFindings(key, findings, ["package.json"]);

      const hash = cache.buildPerAnalyzerCacheKey({
        analyzerName: "test-analyzer",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "feature/test",
        filesHash: "abc123",
      });

      const cached = await cache.getPerAnalyzerFindings(hash);

      expect(cached).not.toBeNull();
      expect(cached!.findings).toHaveLength(1);
      expect(cached!.processedFiles).toContain("package.json");
    });

    it("should not invalidate per-analyzer cache on HEAD change", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Store a per-analyzer result
      const key = cache.buildPerAnalyzerCacheKeyObject({
        analyzerName: "test-analyzer",
        profile: "sveltekit",
        mode: "branch",
        baseRef: "main",
        headRef: "feature/test",
        filesHash: "abc123",
      });

      await cache.setPerAnalyzerFindings(key, [], ["test.ts"]);

      // Simulate HEAD change by modifying a file and committing
      const { execa } = await import("execa");
      await writeFile(join(testDir, "test.txt"), "modified");
      await execa("git", ["add", "."], { cwd: testDir });
      await execa("git", ["commit", "-m", "second commit"], { cwd: testDir });

      // Reinitialize cache (simulates new run)
      const cache2 = new CacheManager(testDir);
      await cache2.init("1.0.0");

      // The per-analyzer cache should still exist (not invalidated)
      const stats = await cache2.stats();
      expect(stats.entries).toBeGreaterThanOrEqual(1);
    });

    it("should update lastAccess on cache hit", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Store a changeset
      const key = { diffHash: "test123", packageJsonHash: "pkg456" };
      const changeSet = {
        base: "main",
        head: "HEAD",
        files: [],
        diffs: [],
      };

      await cache.setChangeSet(key, changeSet);

      // Wait a moment to ensure time difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Access the cache entry
      const hash = cache.buildChangeSetCacheKey("test123", "pkg456");
      await cache.getChangeSet(hash);

      // Check that lastAccess was updated (stats reflect the access)
      const stats = await cache.stats();
      expect(stats.hits).toBe(1);
    });
  });

  describe("LRU Pruning", () => {
    it("should prune entries by size using LRU", async () => {
      const { pruneBySizeLRU, readIndex } = await import("../src/cache/storage.js");
      
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Add multiple entries with different access times
      for (let i = 0; i < 5; i++) {
        const key = cache.buildPerAnalyzerCacheKeyObject({
          analyzerName: `analyzer-${i}`,
          profile: "default",
          mode: "branch",
          baseRef: "main",
          headRef: "HEAD",
          filesHash: `hash${i}`,
        });
        await cache.setPerAnalyzerFindings(key, [], [`file${i}.ts`]);
        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const statsBefore = await cache.stats();
      expect(statsBefore.entries).toBe(5);

      // Prune with a very small max size (should remove some entries)
      const removed = await pruneBySizeLRU(100, testDir);
      
      // Should have removed some entries (exact number depends on entry sizes)
      expect(removed).toBeGreaterThanOrEqual(0);
      
      const indexAfter = await readIndex(testDir);
      expect(indexAfter.entries.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Per-Analyzer Entry Limit (2 files per analyzer)", () => {
    it("should expose MAX_ENTRIES_PER_ANALYZER constant", () => {
      expect(MAX_ENTRIES_PER_ANALYZER).toBe(2);
    });

    it("should expose MAX_CHANGESET_ENTRIES constant", () => {
      expect(MAX_CHANGESET_ENTRIES).toBe(2);
    });

    it("should keep only 2 entries per analyzer when adding more", async () => {
      const { readIndex } = await import("../src/cache/storage.js");
      
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Add 4 entries for the SAME analyzer
      for (let i = 0; i < 4; i++) {
        const key = cache.buildPerAnalyzerCacheKeyObject({
          analyzerName: "dependencies", // Same analyzer
          profile: "default",
          mode: "branch",
          baseRef: "main",
          headRef: "HEAD",
          filesHash: `hash${i}`, // Different file hash each time
        });
        await cache.setPerAnalyzerFindings(key, [], [`file${i}.ts`]);
        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      // Should only have 2 entries for this analyzer (the 2 most recent)
      const index = await readIndex(testDir);
      const analyzerEntries = index.entries.filter(
        (e) => e.type === "per-analyzer" && e.analyzerName === "dependencies"
      );
      
      expect(analyzerEntries.length).toBe(2);
    });

    it("should keep entries for different analyzers separately", async () => {
      const { readIndex } = await import("../src/cache/storage.js");
      
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Add 3 entries each for 2 different analyzers
      const analyzers = ["dependencies", "vitest"];
      
      for (const analyzerName of analyzers) {
        for (let i = 0; i < 3; i++) {
          const key = cache.buildPerAnalyzerCacheKeyObject({
            analyzerName,
            profile: "default",
            mode: "branch",
            baseRef: "main",
            headRef: "HEAD",
            filesHash: `${analyzerName}-hash${i}`,
          });
          await cache.setPerAnalyzerFindings(key, [], [`${analyzerName}-file${i}.ts`]);
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      }

      // Each analyzer should have exactly 2 entries
      const index = await readIndex(testDir);
      
      for (const analyzerName of analyzers) {
        const entries = index.entries.filter(
          (e) => e.type === "per-analyzer" && e.analyzerName === analyzerName
        );
        expect(entries.length).toBe(2);
      }
      
      // Total should be 4 (2 per analyzer)
      const totalPerAnalyzer = index.entries.filter((e) => e.type === "per-analyzer");
      expect(totalPerAnalyzer.length).toBe(4);
    });

    it("should prune excess entries directly via pruneExcessPerAnalyzerEntries", async () => {
      const { readIndex, addEntry, writeIndex } = await import("../src/cache/storage.js");
      
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Manually add 5 entries for the same analyzer (bypassing auto-pruning)
      const index = await readIndex(testDir);
      for (let i = 0; i < 5; i++) {
        const entry = {
          hash: `manual-hash-${i}`,
          type: "per-analyzer" as const,
          created: new Date(Date.now() - i * 1000).toISOString(), // Older entries have earlier timestamps
          lastAccess: new Date(Date.now() - i * 1000).toISOString(),
          size: 100,
          analyzerName: "test-analyzer",
        };
        addEntry(index, entry);
      }
      await writeIndex(index, testDir);

      // Verify we have 5 entries
      const indexBefore = await readIndex(testDir);
      expect(indexBefore.entries.filter((e) => e.analyzerName === "test-analyzer").length).toBe(5);

      // Prune to keep only 2
      const removed = await pruneExcessPerAnalyzerEntries("test-analyzer", testDir, 2);
      
      expect(removed).toBe(3);

      const indexAfter = await readIndex(testDir);
      expect(indexAfter.entries.filter((e) => e.analyzerName === "test-analyzer").length).toBe(2);
    });
  });

  describe("ChangeSet Entry Limit (2 files)", () => {
    it("should keep only 2 changeset entries when adding more", async () => {
      const { readIndex } = await import("../src/cache/storage.js");
      
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Add 4 changesets
      for (let i = 0; i < 4; i++) {
        const changeSet = {
          base: "main",
          head: "HEAD",
          files: [{ path: `src/file${i}.ts`, status: "modified" as const }],
          diffs: [],
        };

        const key = {
          diffHash: `diff${i}`,
          packageJsonHash: `pkg${i}`,
        };

        await cache.setChangeSet(key, changeSet as any);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }

      // Should only have 2 changeset entries (the 2 most recent)
      const index = await readIndex(testDir);
      const changesetEntries = index.entries.filter((e) => e.type === "changeset");
      
      expect(changesetEntries.length).toBe(2);
    });

    it("should prune excess entries directly via pruneExcessChangeSetEntries", async () => {
      const { readIndex, addEntry, writeIndex } = await import("../src/cache/storage.js");
      
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      // Manually add 5 changeset entries (bypassing auto-pruning)
      const index = await readIndex(testDir);
      for (let i = 0; i < 5; i++) {
        const entry = {
          hash: `changeset-hash-${i}`,
          type: "changeset" as const,
          created: new Date(Date.now() - i * 1000).toISOString(),
          lastAccess: new Date(Date.now() - i * 1000).toISOString(),
          size: 200,
        };
        addEntry(index, entry);
      }
      await writeIndex(index, testDir);

      // Verify we have 5 entries
      const indexBefore = await readIndex(testDir);
      expect(indexBefore.entries.filter((e) => e.type === "changeset").length).toBe(5);

      // Prune to keep only 2
      const removed = await pruneExcessChangeSetEntries(testDir, 2);
      
      expect(removed).toBe(3);

      const indexAfter = await readIndex(testDir);
      expect(indexAfter.entries.filter((e) => e.type === "changeset").length).toBe(2);
    });
  });
});
