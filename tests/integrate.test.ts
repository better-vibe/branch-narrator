/**
 * Tests for integrate command.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  executeIntegrate,
} from "../src/commands/integrate.js";
import { generateCursorRules } from "../src/commands/integrate/commands/legacy_stub.js";
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

  it("should generate branch-narrator.md rule", async () => {
    const rules = await generateCursorRules();
    const branchNarratorRule = rules.find((r) =>
      r.path.endsWith("branch-narrator.md")
    );

    expect(branchNarratorRule).toBeDefined();
    expect(branchNarratorRule?.path).toBe(".cursor/rules/branch-narrator.md");
    expect(branchNarratorRule?.content).toContain("branch-narrator");
    expect(branchNarratorRule?.content).toContain("facts");
    expect(branchNarratorRule?.content).toContain("dump-diff");
  });
});

// ============================================================================
// executeIntegrate - Cursor
// ============================================================================

describe("executeIntegrate - Cursor", () => {
  it("should create rule files", async () => {
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
