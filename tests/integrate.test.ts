/**
 * Tests for integrate command.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeIntegrate, getRuleFiles } from "../src/commands/integrate.js";

// ============================================================================
// Test Helpers
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// getRuleFiles Tests
// ============================================================================

describe("getRuleFiles", () => {
  it("should return two rule files for cursor provider", () => {
    const files = getRuleFiles("cursor");

    expect(files).toHaveLength(2);
    expect(files[0].path).toBe(".cursor/rules/branch-narrator.md");
    expect(files[1].path).toBe(".cursor/rules/pr-description.md");
  });

  it("should include 'facts' in branch-narrator.md content", () => {
    const files = getRuleFiles("cursor");
    const branchNarratorFile = files.find((f) =>
      f.path.includes("branch-narrator.md")
    );

    expect(branchNarratorFile).toBeDefined();
    expect(branchNarratorFile!.content).toContain("facts");
    expect(branchNarratorFile!.content).toContain("dump-diff");
  });

  it("should include 'dump-diff --unified 3' in pr-description.md content", () => {
    const files = getRuleFiles("cursor");
    const prDescriptionFile = files.find((f) =>
      f.path.includes("pr-description.md")
    );

    expect(prDescriptionFile).toBeDefined();
    expect(prDescriptionFile!.content).toContain("dump-diff");
    expect(prDescriptionFile!.content).toContain("--unified 3");
  });

  it("should throw error for unknown provider", () => {
    expect(() => {
      // @ts-expect-error - testing invalid provider
      getRuleFiles("unknown");
    }).toThrow("Unknown integration provider");
  });
});

// ============================================================================
// executeIntegrate Tests
// ============================================================================

describe("executeIntegrate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "integrate-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("dry-run mode", () => {
    it("should not create any files in dry-run mode", async () => {
      // Capture stdout
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.join(" "));
      };

      await executeIntegrate({
        provider: "cursor",
        dryRun: true,
        force: false,
        cwd: tempDir,
      });

      console.log = originalLog;

      // Check that files were not created
      const file1Exists = await fileExists(
        join(tempDir, ".cursor/rules/branch-narrator.md")
      );
      const file2Exists = await fileExists(
        join(tempDir, ".cursor/rules/pr-description.md")
      );

      expect(file1Exists).toBe(false);
      expect(file2Exists).toBe(false);
    });

    it("should print file paths and contents in dry-run mode", async () => {
      // Capture stdout
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        logs.push(args.join(" "));
      };

      await executeIntegrate({
        provider: "cursor",
        dryRun: true,
        force: false,
        cwd: tempDir,
      });

      console.log = originalLog;

      const output = logs.join("\n");

      // Should mention dry run
      expect(output).toContain("[DRY RUN]");

      // Should show both file paths
      expect(output).toContain(".cursor/rules/branch-narrator.md");
      expect(output).toContain(".cursor/rules/pr-description.md");

      // Should include content from both files
      expect(output).toContain("branch-narrator (local change analysis tool)");
      expect(output).toContain("PR Description (use branch-narrator)");
      expect(output).toContain("facts");
      expect(output).toContain("dump-diff");
      expect(output).toContain("--unified 3");
    });
  });

  describe("normal mode", () => {
    it("should create .cursor/rules/ directory if missing", async () => {
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      const dirExists = await fileExists(join(tempDir, ".cursor/rules"));
      expect(dirExists).toBe(true);
    });

    it("should create both rule files", async () => {
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      const file1Exists = await fileExists(
        join(tempDir, ".cursor/rules/branch-narrator.md")
      );
      const file2Exists = await fileExists(
        join(tempDir, ".cursor/rules/pr-description.md")
      );

      expect(file1Exists).toBe(true);
      expect(file2Exists).toBe(true);
    });

    it("should write correct content to branch-narrator.md", async () => {
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      const content = await readFile(
        join(tempDir, ".cursor/rules/branch-narrator.md"),
        "utf-8"
      );

      expect(content).toContain("# branch-narrator (local change analysis tool)");
      expect(content).toContain("branch-narrator facts --base main --head HEAD");
      expect(content).toContain("branch-narrator dump-diff");
      expect(content).toContain("Do not guess \"why\" a change was made");
    });

    it("should write correct content to pr-description.md", async () => {
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      const content = await readFile(
        join(tempDir, ".cursor/rules/pr-description.md"),
        "utf-8"
      );

      expect(content).toContain("# PR Description (use branch-narrator)");
      expect(content).toContain("branch-narrator facts --base main --head HEAD");
      expect(content).toContain(
        "branch-narrator dump-diff --base main --head HEAD --unified 3"
      );
      expect(content).toContain("## Summary");
      expect(content).toContain("## Product impact");
      expect(content).toContain("## QA / Testing");
    });

    it("should fail with exit code 1 if file already exists and force is false", async () => {
      // First run should succeed
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      // Second run should throw
      await expect(
        executeIntegrate({
          provider: "cursor",
          dryRun: false,
          force: false,
          cwd: tempDir,
        })
      ).rejects.toThrow("File already exists");

      await expect(
        executeIntegrate({
          provider: "cursor",
          dryRun: false,
          force: false,
          cwd: tempDir,
        })
      ).rejects.toMatchObject({ exitCode: 1 });
    });

    it("should include instruction to use --force in error message", async () => {
      // Create files first
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      // Try to create again without force
      try {
        await executeIntegrate({
          provider: "cursor",
          dryRun: false,
          force: false,
          cwd: tempDir,
        });
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const err = error as Error;
        expect(err.message).toContain("--force");
      }
    });
  });

  describe("force mode", () => {
    it("should overwrite existing files when force is true", async () => {
      // Create files first
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      // Verify files exist
      const file1Before = await readFile(
        join(tempDir, ".cursor/rules/branch-narrator.md"),
        "utf-8"
      );
      expect(file1Before).toContain("branch-narrator (local change analysis tool)");

      // Overwrite with force
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: true,
        cwd: tempDir,
      });

      // Verify files still exist and have correct content
      const file1After = await readFile(
        join(tempDir, ".cursor/rules/branch-narrator.md"),
        "utf-8"
      );
      expect(file1After).toContain("branch-narrator (local change analysis tool)");
    });

    it("should not throw error when overwriting with --force", async () => {
      // Create files first
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      // Should not throw when using force
      await expect(
        executeIntegrate({
          provider: "cursor",
          dryRun: false,
          force: true,
          cwd: tempDir,
        })
      ).resolves.toBeUndefined();
    });
  });

  describe("content validation", () => {
    it("should use Unix line endings (\\n)", async () => {
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      const content = await readFile(
        join(tempDir, ".cursor/rules/branch-narrator.md"),
        "utf-8"
      );

      // Should not contain \r\n (Windows line endings)
      expect(content).not.toContain("\r\n");

      // Should contain \n (Unix line endings)
      expect(content).toContain("\n");
    });

    it("should be deterministic (no timestamps)", async () => {
      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: false,
        cwd: tempDir,
      });

      const content1 = await readFile(
        join(tempDir, ".cursor/rules/branch-narrator.md"),
        "utf-8"
      );

      // Wait a bit and create again with force
      await new Promise((resolve) => setTimeout(resolve, 100));

      await executeIntegrate({
        provider: "cursor",
        dryRun: false,
        force: true,
        cwd: tempDir,
      });

      const content2 = await readFile(
        join(tempDir, ".cursor/rules/branch-narrator.md"),
        "utf-8"
      );

      // Content should be identical
      expect(content1).toBe(content2);
    });
  });
});
