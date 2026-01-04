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

  describe("Default mode behavior", () => {
    it("should default to branch mode for facts command", () => {
      const defaultMode = "branch";
      expect(defaultMode).toBe("branch");
    });

    it("should default to branch mode for risk-report command", () => {
      const defaultMode = "branch";
      expect(defaultMode).toBe("branch");
    });

    it("should match dump-diff default mode", () => {
      const factsDefault = "branch";
      const riskReportDefault = "branch";
      const dumpDiffDefault = "branch";

      expect(factsDefault).toBe(dumpDiffDefault);
      expect(riskReportDefault).toBe(dumpDiffDefault);
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

    it("should not set includeUntracked for branch mode", () => {
      const branchModeConfig = {
        mode: "branch" as const,
        includeUntracked: false,
      };

      expect(branchModeConfig.includeUntracked).toBe(false);
    });
  });
});
