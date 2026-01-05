/**
 * Tests for benchmark temp repository helper.
 */

import { describe, expect, it, afterEach } from "bun:test";
import { execa } from "execa";
import { access } from "node:fs/promises";
import { setupBenchmarkRepo, cleanupBenchmarkRepo, type BenchmarkRepo } from "../benchmarks/helpers/temp-repo.ts";

// ============================================================================
// Test Fixtures
// ============================================================================

let currentRepo: BenchmarkRepo | null = null;

afterEach(async () => {
  // Clean up any repo created during tests
  if (currentRepo) {
    await cleanupBenchmarkRepo(currentRepo);
    currentRepo = null;
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

async function git(args: string[], cwd: string): Promise<string> {
  const result = await execa('git', args, { cwd });
  return result.stdout;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// setupBenchmarkRepo Tests
// ============================================================================

describe("setupBenchmarkRepo", () => {
  it("should create a git repository", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Verify git repo exists
    const isGit = await git(['rev-parse', '--is-inside-work-tree'], currentRepo.cwd);
    expect(isGit).toBe('true');
  });

  it("should create base and feature branches", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Get all branches
    const branches = await git(['branch', '--list'], currentRepo.cwd);
    
    expect(branches).toContain('develop');
    expect(branches).toContain('feature/benchmark');
  });

  it("should checkout feature branch", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Get current branch
    const currentBranch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], currentRepo.cwd);
    
    expect(currentBranch).toBe('feature/benchmark');
  });

  it("should create committed changes", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Get commit count on feature branch
    const commitCount = await git(['rev-list', '--count', 'develop..feature/benchmark'], currentRepo.cwd);
    
    // Should have at least 1 commit (could be more with renames)
    expect(parseInt(commitCount, 10)).toBeGreaterThanOrEqual(1);
  });

  it("should create staged changes", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Get staged files
    const stagedFiles = await git(['diff', '--staged', '--name-only'], currentRepo.cwd);
    
    // Should have staged files
    expect(stagedFiles.length).toBeGreaterThan(0);
  });

  it("should create unstaged changes", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Get unstaged files
    const unstagedFiles = await git(['diff', '--name-only'], currentRepo.cwd);
    
    // Should have unstaged files
    expect(unstagedFiles.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Size Configuration Tests
// ============================================================================

describe("benchmark sizes", () => {
  it("should create different file counts for different sizes", async () => {
    const smallRepo = await setupBenchmarkRepo('small');
    const mediumRepo = await setupBenchmarkRepo('medium');
    const largeRepo = await setupBenchmarkRepo('large');
    
    try {
      // Count files changed in committed diff
      const smallDiff = await git(['diff', '--name-only', 'develop...feature/benchmark'], smallRepo.cwd);
      const mediumDiff = await git(['diff', '--name-only', 'develop...feature/benchmark'], mediumRepo.cwd);
      const largeDiff = await git(['diff', '--name-only', 'develop...feature/benchmark'], largeRepo.cwd);
      
      const smallCount = smallDiff.split('\n').filter(f => f.trim()).length;
      const mediumCount = mediumDiff.split('\n').filter(f => f.trim()).length;
      const largeCount = largeDiff.split('\n').filter(f => f.trim()).length;
      
      // Large should have more files than medium, medium more than small
      expect(largeCount).toBeGreaterThan(mediumCount);
      expect(mediumCount).toBeGreaterThan(smallCount);
    } finally {
      await cleanupBenchmarkRepo(smallRepo);
      await cleanupBenchmarkRepo(mediumRepo);
      await cleanupBenchmarkRepo(largeRepo);
    }
  });

  it("small size should not include renames", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Get commit messages
    const log = await git(['log', '--oneline', 'develop..feature/benchmark'], currentRepo.cwd);
    
    // Should not have rename commits
    expect(log.toLowerCase()).not.toContain('rename');
  });

  it("medium size should include renames", async () => {
    currentRepo = await setupBenchmarkRepo('medium');
    
    // Get commit messages
    const log = await git(['log', '--oneline', 'develop..feature/benchmark'], currentRepo.cwd);
    
    // Should have rename commits
    expect(log.toLowerCase()).toContain('rename');
  });

  it("large size should include renames", async () => {
    currentRepo = await setupBenchmarkRepo('large');
    
    // Get commit messages
    const log = await git(['log', '--oneline', 'develop..feature/benchmark'], currentRepo.cwd);
    
    // Should have rename commits
    expect(log.toLowerCase()).toContain('rename');
  });
});

// ============================================================================
// File Type Tests
// ============================================================================

describe("file variety", () => {
  it("should create multiple file types", async () => {
    currentRepo = await setupBenchmarkRepo('medium');
    
    // Get all files in committed diff
    const files = await git(['diff', '--name-only', 'develop...feature/benchmark'], currentRepo.cwd);
    
    // Should have different file types
    expect(files).toContain('.ts');
    expect(files).toContain('.js');
    expect(files).toContain('.md');
    expect(files).toContain('.json');
  });

  it("should organize files in directories", async () => {
    currentRepo = await setupBenchmarkRepo('medium');
    
    // Get all files in committed diff
    const files = await git(['diff', '--name-only', 'develop...feature/benchmark'], currentRepo.cwd);
    
    // Should have files in different directories
    expect(files).toContain('src/');
    expect(files).toContain('lib/');
    expect(files).toContain('docs/');
    expect(files).toContain('config/');
  });
});

// ============================================================================
// Cleanup Tests
// ============================================================================

describe("cleanupBenchmarkRepo", () => {
  it("should remove the repository directory", async () => {
    const repo = await setupBenchmarkRepo('small');
    const repoPath = repo.cwd;
    
    // Verify directory exists
    expect(await fileExists(repoPath)).toBe(true);
    
    // Cleanup
    await cleanupBenchmarkRepo(repo);
    
    // Verify directory is removed
    expect(await fileExists(repoPath)).toBe(false);
  });

  it("should handle cleanup errors gracefully", async () => {
    const repo = await setupBenchmarkRepo('small');
    
    // Manually delete the directory first
    await cleanupBenchmarkRepo(repo);
    
    // Cleanup again should not throw (just return successfully)
    let error: Error | null = null;
    try {
      await cleanupBenchmarkRepo(repo);
    } catch (e) {
      error = e as Error;
    }
    
    // Should not have thrown an error
    expect(error).toBeNull();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("benchmark integration", () => {
  it("should support --mode branch", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Verify we can get diff between base and feature
    const diff = await git(['diff', '--stat', 'develop...feature/benchmark'], currentRepo.cwd);
    
    // Should have some diff
    expect(diff.length).toBeGreaterThan(0);
  });

  it("should support --mode staged", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Verify we have staged changes
    const staged = await git(['diff', '--staged', '--stat'], currentRepo.cwd);
    
    // Should have staged changes
    expect(staged.length).toBeGreaterThan(0);
  });

  it("should support --mode unstaged", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Verify we have unstaged changes
    const unstaged = await git(['diff', '--stat'], currentRepo.cwd);
    
    // Should have unstaged changes
    expect(unstaged.length).toBeGreaterThan(0);
  });

  it("should support --mode all", async () => {
    currentRepo = await setupBenchmarkRepo('small');
    
    // Verify we can get all changes from HEAD
    const all = await git(['diff', '--stat', 'HEAD'], currentRepo.cwd);
    
    // Should have changes
    expect(all.length).toBeGreaterThan(0);
  });
});
