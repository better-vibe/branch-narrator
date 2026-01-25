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

  describe("Diff Cache", () => {
    it("should store and retrieve diff data", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const key = {
        base: "main",
        head: "HEAD",
        baseSha: "abc123",
        headSha: "def456",
        mode: "branch" as const,
      };
      const data = {
        nameStatus: "M\tsrc/foo.ts",
        unifiedDiff: "diff --git a/src/foo.ts...",
      };

      await cache.setDiff(key, data);

      const hash = cache.buildDiffCacheKey(key);
      const retrieved = await cache.getDiff(hash);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.data.nameStatus).toBe(data.nameStatus);
      expect(retrieved?.data.unifiedDiff).toBe(data.unifiedDiff);
    });

    it("should return null for non-existent diff", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const retrieved = await cache.getDiff("nonexistent");
      expect(retrieved).toBeNull();
    });
  });

  describe("Analysis Cache", () => {
    it("should store and retrieve analysis findings", async () => {
      const cache = new CacheManager(testDir);
      await cache.init("1.0.0");

      const findings = [
        {
          type: "file-summary" as const,
          added: ["src/new.ts"],
          modified: [],
          deleted: [],
          renamed: [],
          evidence: [],
        },
      ];

      const key = cache.buildAnalysisCacheKeyObject({
        changeSetHash: "abc123",
        profile: "default" as const,
        mode: "branch" as const,
      });

      await cache.setFindings(key, findings);

      const hash = cache.buildAnalysisCacheKey({
        changeSetHash: "abc123",
        profile: "default" as const,
        mode: "branch" as const,
      });
      const retrieved = await cache.getFindings(hash);

      expect(retrieved).not.toBeNull();
      expect(retrieved).toHaveLength(1);
      expect(retrieved?.[0].type).toBe("file-summary");
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
});
