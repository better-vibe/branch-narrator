/**
 * Tests for git collector functions.
 */

import { describe, expect, it, beforeAll, beforeEach, afterAll, mock, type Mock } from "bun:test";

// We need to declare these at module scope but initialize them in beforeAll
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
    // mockReset() clears both call history AND implementation
    (execa as unknown as Mock<typeof import("execa").execa>).mockReset();
  });

  afterAll(() => {
    // Restore the original modules to avoid affecting other tests
    mock.restore();
  });

  it("should detect default branch when refs/remotes/origin/HEAD exists and points to main", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "refs/remotes/origin/main",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("main");
  });

  it("should detect default branch when refs/remotes/origin/HEAD points to develop", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "refs/remotes/origin/develop",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("develop");
  });

  it("should detect default branch when refs/remotes/origin/HEAD points to master", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "refs/remotes/origin/master",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("master");
  });

  it("should handle branch names with multiple slashes", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "refs/remotes/origin/feature/main-branch",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("main-branch");
  });

  it("should fallback to main when symbolic-ref command fails with non-zero exit code", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 1,
      stdout: "",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("main");
  });

  it("should fallback to main when symbolic-ref throws an error", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockRejectedValue(
      new Error("Git command failed")
    );

    const result = await getDefaultBranch();
    expect(result).toBe("main");
  });

  it("should fallback to main when output is empty", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("main");
  });

  it("should fallback to main when output contains only slashes", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "///",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("main");
  });

  it("should handle whitespace in output", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "  refs/remotes/origin/develop  \n",
    } as any);

    const result = await getDefaultBranch();
    expect(result).toBe("develop");
  });

  it("should pass cwd parameter to git command", async () => {
    const testCwd = "/path/to/repo";
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "refs/remotes/origin/main",
    } as any);

    await getDefaultBranch(testCwd);

    expect(execa).toHaveBeenCalledWith(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      expect.objectContaining({ cwd: testCwd })
    );
  });

  it("should use process.cwd() when no cwd parameter provided", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({
      exitCode: 0,
      stdout: "refs/remotes/origin/main",
    } as any);

    await getDefaultBranch();

    expect(execa).toHaveBeenCalledWith(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      expect.objectContaining({ cwd: process.cwd() })
    );
  });
});
