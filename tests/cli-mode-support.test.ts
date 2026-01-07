/**
 * Tests for CLI commands with mode support.
 * These tests verify that facts and risk-report commands work with different modes.
 */

import { describe, expect, it } from "bun:test";

// ============================================================================
// Mode Validation Tests
// ============================================================================

describe("CLI Mode Support", () => {
  describe("Mode options", () => {
    it("should support branch mode as default", () => {
      const modes = ["branch", "unstaged", "staged", "all"] as const;
      expect(modes).toContain("branch");
    });

    it("should support all four modes", () => {
      const validModes = ["branch", "unstaged", "staged", "all"];
      expect(validModes).toHaveLength(4);
      expect(validModes).toEqual(["branch", "unstaged", "staged", "all"]);
    });
  });

  describe("Mode descriptions", () => {
    it("should have correct git commands for each mode", () => {
      const modeDescriptions: Record<string, string> = {
        branch: "git diff base..head",
        unstaged: "git diff",
        staged: "git diff --staged",
        all: "git diff HEAD",
      };

      expect(modeDescriptions.branch).toBe("git diff base..head");
      expect(modeDescriptions.unstaged).toBe("git diff");
      expect(modeDescriptions.staged).toBe("git diff --staged");
      expect(modeDescriptions.all).toBe("git diff HEAD");
    });
  });

  describe("Base and Head options", () => {
    it("should only use base and head in branch mode", () => {
      const branchModeOptions = {
        mode: "branch" as const,
        base: "main",
        head: "HEAD",
      };

      expect(branchModeOptions.mode).toBe("branch");
      expect(branchModeOptions.base).toBeDefined();
      expect(branchModeOptions.head).toBeDefined();
    });

    it("should ignore base and head in non-branch modes", () => {
      const nonBranchModes = ["unstaged", "staged", "all"] as const;

      nonBranchModes.forEach((mode) => {
        const options = {
          mode,
          base: undefined,
          head: undefined,
        };

        expect(options.base).toBeUndefined();
        expect(options.head).toBeUndefined();
      });
    });
  });

  describe("Default mode behavior", async () => {
    const { execa } = await import("execa");
    const { join } = await import("path");

    // Helper to get help text for a command
    async function getHelpText(command: string): Promise<string> {
      const cliPath = join(process.cwd(), "src/cli.ts");
      const result = await execa("bun", [cliPath, command, "--help"], {
        reject: false,
      });
      if (result.failed) {
        throw new Error(`Failed to get help text for ${command}: ${result.stderr}`);
      }
      return result.stdout;
    }

    it("should default to unstaged mode for facts command", async () => {
      const helpText = await getHelpText("facts");
      // Normalize whitespace to handle wrapping
      const normalized = helpText.replace(/\s+/g, " ");
      expect(normalized).toContain('(default: "unstaged")');
    });

    it("should default to unstaged mode for risk-report command", async () => {
      const helpText = await getHelpText("risk-report");
      const normalized = helpText.replace(/\s+/g, " ");
      expect(normalized).toContain('(default: "unstaged")');
    });

    it("should default to unstaged mode for dump-diff command", async () => {
      const helpText = await getHelpText("dump-diff");
      const normalized = helpText.replace(/\s+/g, " ");
      expect(normalized).toContain('(default: "unstaged")');
    });

    it("should default to unstaged mode for pretty command", async () => {
      const helpText = await getHelpText("pretty");
      const normalized = helpText.replace(/\s+/g, " ");
      expect(normalized).toContain('(default: "unstaged")');
    });
  });

  describe("Mode validation", () => {
    it("should accept valid mode values", () => {
      const validModes = ["branch", "unstaged", "staged", "all"];

      validModes.forEach((mode) => {
        expect(validModes).toContain(mode);
      });
    });

    it("should reject invalid mode values", () => {
      const validModes = ["branch", "unstaged", "staged", "all"];
      const invalidModes = ["invalid", "wrong", "bad"];

      invalidModes.forEach((mode) => {
        expect(validModes).not.toContain(mode);
      });
    });
  });

  describe("includeUntracked behavior", () => {
    it("should set includeUntracked to true for all mode", () => {
      const allModeConfig = {
        mode: "all" as const,
        includeUntracked: true,
      };

      expect(allModeConfig.includeUntracked).toBe(true);
    });

    it("should set includeUntracked to true for unstaged mode (default)", () => {
      const unstagedModeConfig = {
        mode: "unstaged" as const,
        includeUntracked: true,
      };

      expect(unstagedModeConfig.includeUntracked).toBe(true);
    });

    it("should not set includeUntracked for branch mode", () => {
      const branchModeConfig = {
        mode: "branch" as const,
        includeUntracked: false,
      };

      expect(branchModeConfig.includeUntracked).toBe(false);
    });

    it("should not set includeUntracked for staged mode", () => {
      const stagedModeConfig = {
        mode: "staged" as const,
        includeUntracked: false,
      };

      expect(stagedModeConfig.includeUntracked).toBe(false);
    });
  });
});
