/**
 * Tests for getDefaultBranch function in git/collector.ts
 * 
 * This test suite validates the auto-detection of the repository's default branch
 * by checking refs/remotes/origin/HEAD, with proper fallback to "main".
 */

import { describe, expect, it, beforeAll, beforeEach, afterAll, mock, type Mock } from "bun:test";

// We need to declare these at module scope but initialize them in beforeAll
// to ensure proper mock lifecycle management
let getDefaultBranch: typeof import("../src/git/collector.js").getDefaultBranch;
let execa: typeof import("execa").execa;

describe("getDefaultBranch", () => {
  beforeAll(async () => {
    // Set up the mock BEFORE importing the module that uses it
    mock.module("execa", () => {
      return {
        execa: mock(),
      };
    });

    // Now import the modules that depend on the mock
    const collectorModule = await import("../src/git/collector.js");
    getDefaultBranch = collectorModule.getDefaultBranch;

    const execaModule = await import("execa");
    execa = execaModule.execa;
  });

  beforeEach(() => {
    // mockReset() clears both call history AND implementation, preventing leaks between tests
    (execa as unknown as Mock<typeof import("execa").execa>).mockReset();
  });

  afterAll(() => {
    // Restore the original modules to avoid affecting other tests
    mock.restore();
  });

  describe("Successful detection", () => {
    it("should detect 'main' when refs/remotes/origin/HEAD points to main", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/main",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
      expect(execa).toHaveBeenCalledWith(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD"],
        expect.objectContaining({ reject: false })
      );
    });

    it("should detect 'develop' when refs/remotes/origin/HEAD points to develop", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/develop",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("develop");
    });

    it("should detect 'master' when refs/remotes/origin/HEAD points to master", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/master",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("master");
    });

    it("should handle custom branch names", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/production",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("production");
    });

    it("should handle branch names with slashes", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/release/v1.0",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("release/v1.0");
    });

    it("should handle stdout with trailing whitespace", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/main\n",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });

    it("should handle stdout with leading whitespace", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "  refs/remotes/origin/develop  ",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("develop");
    });
  });

  describe("Fallback to 'main'", () => {
    it("should fallback to 'main' when symbolic-ref command fails (non-zero exit code)", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 1,
        stdout: "",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });

    it("should fallback to 'main' when command throws an error", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockRejectedValue(
        new Error("Git command failed")
      );

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });

    it("should fallback to 'main' when stdout is empty", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });

    it("should fallback to 'main' when stdout contains only whitespace", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "   \n  ",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });

    it("should fallback to 'main' when output format is unexpected (no slashes)", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "unexpected-format",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });

    it("should fallback to 'main' when output has unexpected format (missing parts)", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("main");
    });
  });

  describe("Custom cwd parameter", () => {
    it("should pass custom cwd to execa", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/main",
      } as any);

      const customCwd = "/custom/path";
      await getDefaultBranch(customCwd);

      expect(execa).toHaveBeenCalledWith(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD"],
        expect.objectContaining({ cwd: customCwd })
      );
    });

    it("should use process.cwd() by default", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/develop",
      } as any);

      await getDefaultBranch();

      expect(execa).toHaveBeenCalledWith(
        "git",
        ["symbolic-ref", "refs/remotes/origin/HEAD"],
        expect.objectContaining({ cwd: process.cwd() })
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle branch names with special characters", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/feature-123_test",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("feature-123_test");
    });

    it("should handle very long branch names", async () => {
      const longBranchName = "a".repeat(200);
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: `refs/remotes/origin/${longBranchName}`,
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe(longBranchName);
    });

    it("should handle branch names with dots", async () => {
      (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
        exitCode: 0,
        stdout: "refs/remotes/origin/release-1.2.3",
      } as any);

      const result = await getDefaultBranch();

      expect(result).toBe("release-1.2.3");
    });
  });
});
