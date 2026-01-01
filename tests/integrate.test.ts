/**
 * Tests for integrate command.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeIntegrate,
  generateCursorRules,
  type IntegrateOptions,
} from "../src/commands/integrate.js";

// ============================================================================
// Test Fixtures
// ============================================================================

let tempDir: string;

beforeEach(async () => {
  // Create a unique temporary directory for each test
  tempDir = await mkdtemp(join(tmpdir(), "integrate-test-"));
});

afterEach(async () => {
  // Clean up temporary directory
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// generateCursorRules Tests
// ============================================================================

describe("generateCursorRules", () => {
  it("should generate exactly 2 rule files", () => {
    const rules = generateCursorRules();
    expect(rules).toHaveLength(2);
  });

  it("should generate branch-narrator.md rule", () => {
    const rules = generateCursorRules();
    const branchNarratorRule = rules.find((r) =>
      r.path.endsWith("branch-narrator.md")
    );

    expect(branchNarratorRule).toBeDefined();
    expect(branchNarratorRule?.path).toBe(".cursor/rules/branch-narrator.md");
    expect(branchNarratorRule?.content).toContain("branch-narrator");
    expect(branchNarratorRule?.content).toContain("facts");
    expect(branchNarratorRule?.content).toContain("dump-diff");
  });

  it("should generate pr-description.md rule", () => {
    const rules = generateCursorRules();
    const prDescriptionRule = rules.find((r) =>
      r.path.endsWith("pr-description.md")
    );

    expect(prDescriptionRule).toBeDefined();
    expect(prDescriptionRule?.path).toBe(".cursor/rules/pr-description.md");
    expect(prDescriptionRule?.content).toContain("PR Description");
    expect(prDescriptionRule?.content).toContain("dump-diff --base main --head HEAD --unified 3");
  });

  it("should include deterministic content with no timestamps", () => {
    const rules1 = generateCursorRules();
    const rules2 = generateCursorRules();

    // Content should be identical across multiple calls
    expect(rules1[0].content).toBe(rules2[0].content);
    expect(rules1[1].content).toBe(rules2[1].content);
  });

  it("should use \\n line endings", () => {
    const rules = generateCursorRules();
    
    for (const rule of rules) {
      expect(rule.content).not.toContain("\r\n");
      expect(rule.content).toContain("\n");
    }
  });
});

// ============================================================================
// executeIntegrate Tests
// ============================================================================

describe("executeIntegrate - basic functionality", () => {
  it("should create .cursor/rules/ directory", async () => {
    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const rulesDir = join(tempDir, ".cursor", "rules");
    const branchNarratorFile = join(rulesDir, "branch-narrator.md");
    const prDescriptionFile = join(rulesDir, "pr-description.md");

    // Verify files exist
    const branchNarratorContent = await readFile(branchNarratorFile, "utf-8");
    const prDescriptionContent = await readFile(prDescriptionFile, "utf-8");

    expect(branchNarratorContent).toContain("branch-narrator");
    expect(prDescriptionContent).toContain("PR Description");
  });

  it("should write both rule files with correct content", async () => {
    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const branchNarratorFile = join(tempDir, ".cursor/rules/branch-narrator.md");
    const prDescriptionFile = join(tempDir, ".cursor/rules/pr-description.md");

    const branchNarratorContent = await readFile(branchNarratorFile, "utf-8");
    const prDescriptionContent = await readFile(prDescriptionFile, "utf-8");

    // Verify branch-narrator.md content
    expect(branchNarratorContent).toContain("# branch-narrator (local change analysis tool)");
    expect(branchNarratorContent).toContain("branch-narrator facts --base main --head HEAD");
    expect(branchNarratorContent).toContain("dump-diff");

    // Verify pr-description.md content
    expect(prDescriptionContent).toContain("# PR Description (use branch-narrator)");
    expect(prDescriptionContent).toContain("branch-narrator dump-diff --base main --head HEAD --unified 3");
  });
});

// ============================================================================
// executeIntegrate - dry-run mode
// ============================================================================

describe("executeIntegrate - dry-run mode", () => {
  it("should not create any files in dry-run mode", async () => {
    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: true,
      force: false,
      cwd: tempDir,
    };

    // Capture console.log output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      await executeIntegrate(options);

      // Restore console.log
      console.log = originalLog;

      // Verify files were NOT created
      const rulesDir = join(tempDir, ".cursor", "rules");
      let dirExists = false;
      try {
        await readFile(join(rulesDir, "branch-narrator.md"), "utf-8");
        dirExists = true;
      } catch {
        // Expected - file should not exist
      }

      expect(dirExists).toBe(false);

      // Verify dry-run output contains file paths and contents
      const output = logs.join("\n");
      expect(output).toContain("DRY RUN");
      expect(output).toContain(".cursor/rules/branch-narrator.md");
      expect(output).toContain(".cursor/rules/pr-description.md");
      expect(output).toContain("# branch-narrator");
      expect(output).toContain("# PR Description");
    } finally {
      console.log = originalLog;
    }
  });

  it("should print both file paths and exact contents in dry-run", async () => {
    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: true,
      force: false,
      cwd: tempDir,
    };

    // Capture console.log output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      await executeIntegrate(options);
      console.log = originalLog;

      const output = logs.join("\n");

      // Should contain file paths
      expect(output).toContain("File: .cursor/rules/branch-narrator.md");
      expect(output).toContain("File: .cursor/rules/pr-description.md");

      // Should contain content from first file
      expect(output).toContain("branch-narrator facts --base main --head HEAD");

      // Should contain content from second file
      expect(output).toContain("dump-diff --base main --head HEAD --unified 3");
    } finally {
      console.log = originalLog;
    }
  });
});

// ============================================================================
// executeIntegrate - force mode
// ============================================================================

describe("executeIntegrate - force mode", () => {
  it("should fail if files exist without --force", async () => {
    // Create existing files
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "branch-narrator.md"),
      "existing content",
      "utf-8"
    );

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    // Should throw an error containing both messages
    await expect(executeIntegrate(options)).rejects.toThrow(/already exists.*--force/s);
  });

  it("should overwrite files with --force", async () => {
    // Create existing files
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "branch-narrator.md"),
      "old content",
      "utf-8"
    );
    await writeFile(
      join(rulesDir, "pr-description.md"),
      "old content",
      "utf-8"
    );

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: true,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    // Verify files were overwritten
    const branchNarratorContent = await readFile(
      join(rulesDir, "branch-narrator.md"),
      "utf-8"
    );
    const prDescriptionContent = await readFile(
      join(rulesDir, "pr-description.md"),
      "utf-8"
    );

    expect(branchNarratorContent).not.toBe("old content");
    expect(prDescriptionContent).not.toBe("old content");
    expect(branchNarratorContent).toContain("# branch-narrator");
    expect(prDescriptionContent).toContain("# PR Description");
  });

  it("should fail if only one file exists without --force", async () => {
    // Create only pr-description.md
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "pr-description.md"),
      "existing content",
      "utf-8"
    );

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    // Should throw an error
    await expect(executeIntegrate(options)).rejects.toThrow(/already exists/);
  });
});

// ============================================================================
// executeIntegrate - error handling
// ============================================================================

describe("executeIntegrate - error handling", () => {
  it("should fail with unknown target", async () => {
    const options: IntegrateOptions = {
      target: "unknown" as "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await expect(executeIntegrate(options)).rejects.toThrow(/Unknown integration target/);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("executeIntegrate - integration", () => {
  it("should create directory structure when missing", async () => {
    // Verify .cursor/rules/ doesn't exist
    let dirExists = false;
    try {
      await readFile(join(tempDir, ".cursor", "rules", "test.txt"), "utf-8");
      dirExists = true;
    } catch {
      // Expected
    }
    expect(dirExists).toBe(false);

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    // Verify directory and files were created
    const branchNarratorContent = await readFile(
      join(tempDir, ".cursor/rules/branch-narrator.md"),
      "utf-8"
    );
    expect(branchNarratorContent).toContain("# branch-narrator");
  });

  it("should work when .cursor/ exists but rules/ doesn't", async () => {
    // Create .cursor/ directory but not rules/
    await mkdir(join(tempDir, ".cursor"), { recursive: true });

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    // Verify files were created
    const branchNarratorContent = await readFile(
      join(tempDir, ".cursor/rules/branch-narrator.md"),
      "utf-8"
    );
    expect(branchNarratorContent).toContain("# branch-narrator");
  });
});
