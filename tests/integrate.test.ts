/**
 * Tests for integrate command.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeIntegrate,
} from "../src/commands/integrate.js";
import { generateCursorRules } from "../src/commands/integrate/commands/legacy_stub.js";
import { cursorProvider } from "../src/commands/integrate/providers/cursor.js";
import type { IntegrateOptions } from "../src/commands/integrate/types.js";

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
// generateCursorRules Tests (Legacy/Shared Content)
// ============================================================================

describe("generateCursorRules", () => {
  it("should generate exactly 2 rule files", async () => {
    const rules = await generateCursorRules();
    expect(rules).toHaveLength(2);
  });

  it("should generate branch-narrator rule with all commands documented", async () => {
    const rules = await generateCursorRules();
    const branchNarratorRule = rules.find((r) =>
      r.path.includes("branch-narrator")
    );

    expect(branchNarratorRule).toBeDefined();
    expect(branchNarratorRule?.content).toContain("branch-narrator");

    // Verify all commands are documented
    expect(branchNarratorRule?.content).toContain("### facts");
    expect(branchNarratorRule?.content).toContain("### risk-report");
    expect(branchNarratorRule?.content).toContain("### zoom");
    expect(branchNarratorRule?.content).toContain("### dump-diff");
    expect(branchNarratorRule?.content).toContain("### snap");
  });

  it("should include decision tree in documentation", async () => {
    const rules = await generateCursorRules();
    const branchNarratorRule = rules.find((r) =>
      r.path.includes("branch-narrator")
    );

    expect(branchNarratorRule?.content).toContain("Decision Tree");
    expect(branchNarratorRule?.content).toContain("User asks to understand changes");
    expect(branchNarratorRule?.content).toContain("User asks about risks/security");
  });

  it("should include common workflows", async () => {
    const rules = await generateCursorRules();
    const branchNarratorRule = rules.find((r) =>
      r.path.includes("branch-narrator")
    );

    expect(branchNarratorRule?.content).toContain("Common Workflows");
    expect(branchNarratorRule?.content).toContain("PR Description");
    expect(branchNarratorRule?.content).toContain("Risk Review");
  });
});

// ============================================================================
// Cursor Provider Format Detection Tests
// ============================================================================

describe("cursorProvider format detection", () => {
  it("should use .md format when no existing rules", async () => {
    const files = await cursorProvider.generate(tempDir);

    expect(files[0].path).toBe(".cursor/rules/branch-narrator.md");
    expect(files[1].path).toBe(".cursor/rules/pr-description.md");
  });

  it("should use .md format when only .md files exist", async () => {
    // Create .cursor/rules with .md files
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "existing.md"), "# Existing rule");

    const files = await cursorProvider.generate(tempDir);

    expect(files[0].path).toBe(".cursor/rules/branch-narrator.md");
    expect(files[1].path).toBe(".cursor/rules/pr-description.md");
    expect(files[0].content).not.toContain("alwaysApply:");
  });

  it("should use .mdc format when .mdc files exist", async () => {
    // Create .cursor/rules with .mdc files
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "existing.mdc"), "---\nalwaysApply: true\n---\n# Existing rule");

    const files = await cursorProvider.generate(tempDir);

    expect(files[0].path).toBe(".cursor/rules/branch-narrator.mdc");
    expect(files[1].path).toBe(".cursor/rules/pr-description.mdc");
  });

  it("should add frontmatter when using .mdc format", async () => {
    // Create .cursor/rules with .mdc files
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "existing.mdc"), "---\nalwaysApply: true\n---\n# Existing rule");

    const files = await cursorProvider.generate(tempDir);

    expect(files[0].content).toContain("---\nalwaysApply: true\n---");
    expect(files[1].content).toContain("---\nalwaysApply: true\n---");
  });

  it("should not add frontmatter when using .md format", async () => {
    const files = await cursorProvider.generate(tempDir);

    expect(files[0].content).not.toContain("alwaysApply:");
    expect(files[1].content).not.toContain("alwaysApply:");
  });

  it("should prefer .mdc when both formats exist", async () => {
    // Create .cursor/rules with both .md and .mdc files
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "old-rule.md"), "# Old rule");
    await writeFile(join(rulesDir, "new-rule.mdc"), "---\nalwaysApply: true\n---\n# New rule");

    const files = await cursorProvider.generate(tempDir);

    expect(files[0].path).toBe(".cursor/rules/branch-narrator.mdc");
    expect(files[1].path).toBe(".cursor/rules/pr-description.mdc");
  });
});

// ============================================================================
// executeIntegrate - Cursor
// ============================================================================

describe("executeIntegrate - Cursor", () => {
  it("should create rule files with .md extension by default", async () => {
    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const rulesDir = join(tempDir, ".cursor", "rules");
    const branchNarratorFile = join(rulesDir, "branch-narrator.md");

    // Verify files exist
    const content = await readFile(branchNarratorFile, "utf-8");
    expect(content).toContain("# branch-narrator");
  });

  it("should create rule files with .mdc extension when existing .mdc files", async () => {
    // Create existing .mdc file
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(rulesDir, "existing.mdc"), "---\nalwaysApply: true\n---\n# Existing");

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const branchNarratorFile = join(rulesDir, "branch-narrator.mdc");
    const content = await readFile(branchNarratorFile, "utf-8");

    expect(content).toContain("---\nalwaysApply: true\n---");
    expect(content).toContain("# branch-narrator");
  });

  it("should include all command documentation", async () => {
    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const rulesDir = join(tempDir, ".cursor", "rules");
    const content = await readFile(join(rulesDir, "branch-narrator.md"), "utf-8");

    // Verify all commands are documented
    expect(content).toContain("### facts");
    expect(content).toContain("### risk-report");
    expect(content).toContain("### zoom");
    expect(content).toContain("### dump-diff");
    expect(content).toContain("### snap");
    expect(content).toContain("Decision Tree");
  });

  it("should append if file exists (default behavior)", async () => {
    // Create existing file
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "branch-narrator.md"),
      "EXISTING CONTENT\n",
      "utf-8"
    );

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const content = await readFile(join(rulesDir, "branch-narrator.md"), "utf-8");
    expect(content).toContain("EXISTING CONTENT");
    expect(content).toContain("# branch-narrator"); // Appended
  });

  it("should overwrite if force is true", async () => {
    // Create existing file
    const rulesDir = join(tempDir, ".cursor", "rules");
    await mkdir(rulesDir, { recursive: true });
    await writeFile(
      join(rulesDir, "branch-narrator.md"),
      "EXISTING CONTENT",
      "utf-8"
    );

    const options: IntegrateOptions = {
      target: "cursor",
      dryRun: false,
      force: true,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const content = await readFile(join(rulesDir, "branch-narrator.md"), "utf-8");
    expect(content).not.toContain("EXISTING CONTENT");
    expect(content).toContain("# branch-narrator");
  });
});

// ============================================================================
// executeIntegrate - Jules
// ============================================================================

describe("executeIntegrate - Jules", () => {
  it("should create AGENTS.md if missing", async () => {
    const options: IntegrateOptions = {
      target: "jules",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const agentsFile = join(tempDir, "AGENTS.md");
    const content = await readFile(agentsFile, "utf-8");

    expect(content).toContain("Branch Narrator Usage");
    expect(content).toContain("dump-diff");
  });

  it("should append to AGENTS.md if exists", async () => {
    // Create existing AGENTS.md
    await writeFile(
      join(tempDir, "AGENTS.md"),
      "# Existing Agents Rules\n\nDo not violate physics.\n",
      "utf-8"
    );

    const options: IntegrateOptions = {
      target: "jules",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await executeIntegrate(options);

    const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
    expect(content).toContain("# Existing Agents Rules");
    expect(content).toContain("Do not violate physics.");
    expect(content).toContain("Branch Narrator Usage"); // Appended
  });
});

// ============================================================================
// executeIntegrate - Error Handling
// ============================================================================

describe("executeIntegrate - error handling", () => {
  it("should fail with unknown target", async () => {
    const options: IntegrateOptions = {
      target: "unknown",
      dryRun: false,
      force: false,
      cwd: tempDir,
    };

    await expect(executeIntegrate(options)).rejects.toThrow(/Supported targets/);
  });
});
