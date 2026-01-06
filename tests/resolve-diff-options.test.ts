/**
 * Tests for CLI resolveDiffOptions helper function.
 */

import { describe, expect, it, beforeAll, beforeEach, afterAll, mock, type Mock } from "bun:test";

// We need to declare these at module scope but initialize them in beforeAll
let resolveDiffOptions: typeof import("../src/cli.js").resolveDiffOptions;
let getDefaultBranch: typeof import("../src/git/collector.js").getDefaultBranch;
let warn: typeof import("../src/core/logger.js").warn;

describe("resolveDiffOptions", () => {
  beforeAll(async () => {
    // Mock the git collector module
    mock.module("../src/git/collector.js", () => {
      return {
        collectChangeSet: mock(),
        getDefaultBranch: mock(),
        isGitRepo: mock(),
        refExists: mock(),
      };
    });

    // Mock the logger module
    mock.module("../src/core/logger.js", () => {
      return {
        warn: mock(),
        error: mock(),
        info: mock(),
        debug: mock(),
        configureLogger: mock(),
      };
    });

    // Mock commander to prevent CLI from executing
    mock.module("commander", () => {
      const mockCommand = () => ({
        name: () => mockCommand(),
        description: () => mockCommand(),
        version: () => mockCommand(),
        option: () => mockCommand(),
        hook: () => mockCommand(),
        command: () => mockCommand(),
        action: () => mockCommand(),
        parse: () => mockCommand(),
      });
      return {
        Command: class {
          name() { return this; }
          description() { return this; }
          version() { return this; }
          option() { return this; }
          hook() { return this; }
          command() { return this; }
          action() { return this; }
          parse() { return this; }
        },
      };
    });

    // Now import the modules
    const cliModule = await import("../src/cli.js");
    resolveDiffOptions = cliModule.resolveDiffOptions;
    
    const gitCollectorModule = await import("../src/git/collector.js");
    getDefaultBranch = gitCollectorModule.getDefaultBranch;
    
    const loggerModule = await import("../src/core/logger.js");
    warn = loggerModule.warn;
  });

  beforeEach(() => {
    // Reset mocks before each test
    (getDefaultBranch as unknown as Mock<typeof import("../src/git/collector.js").getDefaultBranch>).mockReset();
    (warn as unknown as Mock<typeof import("../src/core/logger.js").warn>).mockReset();
  });

  afterAll(() => {
    mock.restore();
  });

  describe("branch mode", () => {
    it("should auto-detect base branch when not provided", async () => {
      (getDefaultBranch as unknown as Mock<typeof import("../src/git/collector.js").getDefaultBranch>)
        .mockResolvedValue("develop");

      const result = await resolveDiffOptions({
        mode: "branch",
      });

      expect(result.base).toBe("develop");
      expect(result.head).toBe("HEAD");
      expect(getDefaultBranch).toHaveBeenCalled();
    });

    it("should use provided base branch when specified", async () => {
      const result = await resolveDiffOptions({
        mode: "branch",
        base: "main",
      });

      expect(result.base).toBe("main");
      expect(result.head).toBe("HEAD");
      expect(getDefaultBranch).not.toHaveBeenCalled();
    });

    it("should default head to HEAD when not provided", async () => {
      (getDefaultBranch as unknown as Mock<typeof import("../src/git/collector.js").getDefaultBranch>)
        .mockResolvedValue("main");

      const result = await resolveDiffOptions({
        mode: "branch",
      });

      expect(result.head).toBe("HEAD");
    });

    it("should use provided head when specified", async () => {
      (getDefaultBranch as unknown as Mock<typeof import("../src/git/collector.js").getDefaultBranch>)
        .mockResolvedValue("main");

      const result = await resolveDiffOptions({
        mode: "branch",
        head: "feature-branch",
      });

      expect(result.base).toBe("main");
      expect(result.head).toBe("feature-branch");
    });

    it("should use both base and head when provided", async () => {
      const result = await resolveDiffOptions({
        mode: "branch",
        base: "develop",
        head: "my-feature",
      });

      expect(result.base).toBe("develop");
      expect(result.head).toBe("my-feature");
      expect(getDefaultBranch).not.toHaveBeenCalled();
    });

    it("should not warn when base/head provided in branch mode", async () => {
      await resolveDiffOptions({
        mode: "branch",
        base: "main",
        head: "feature",
      });

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("unstaged mode", () => {
    it("should return undefined base and head", async () => {
      const result = await resolveDiffOptions({
        mode: "unstaged",
      });

      expect(result.base).toBeUndefined();
      expect(result.head).toBeUndefined();
    });

    it("should warn when base is provided", async () => {
      const result = await resolveDiffOptions({
        mode: "unstaged",
        base: "main",
      });

      expect(result.base).toBeUndefined();
      expect(result.head).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "unstaged"'
      );
    });

    it("should warn when head is provided", async () => {
      const result = await resolveDiffOptions({
        mode: "unstaged",
        head: "HEAD",
      });

      expect(result.base).toBeUndefined();
      expect(result.head).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "unstaged"'
      );
    });

    it("should warn when both base and head are provided", async () => {
      const result = await resolveDiffOptions({
        mode: "unstaged",
        base: "main",
        head: "HEAD",
      });

      expect(result.base).toBeUndefined();
      expect(result.head).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "unstaged"'
      );
    });
  });

  describe("staged mode", () => {
    it("should return undefined base and head", async () => {
      const result = await resolveDiffOptions({
        mode: "staged",
      });

      expect(result.base).toBeUndefined();
      expect(result.head).toBeUndefined();
    });

    it("should warn when base is provided", async () => {
      await resolveDiffOptions({
        mode: "staged",
        base: "main",
      });

      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "staged"'
      );
    });

    it("should warn when head is provided", async () => {
      await resolveDiffOptions({
        mode: "staged",
        head: "HEAD",
      });

      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "staged"'
      );
    });
  });

  describe("all mode", () => {
    it("should return undefined base and head", async () => {
      const result = await resolveDiffOptions({
        mode: "all",
      });

      expect(result.base).toBeUndefined();
      expect(result.head).toBeUndefined();
    });

    it("should warn when base is provided", async () => {
      await resolveDiffOptions({
        mode: "all",
        base: "main",
      });

      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "all"'
      );
    });

    it("should warn when head is provided", async () => {
      await resolveDiffOptions({
        mode: "all",
        head: "HEAD",
      });

      expect(warn).toHaveBeenCalledWith(
        'Warning: --base and --head are ignored when --mode is "all"'
      );
    });
  });

  describe("edge cases", () => {
    it("should handle auto-detection returning different branch names", async () => {
      (getDefaultBranch as unknown as Mock<typeof import("../src/git/collector.js").getDefaultBranch>)
        .mockResolvedValue("master");

      const result = await resolveDiffOptions({
        mode: "branch",
      });

      expect(result.base).toBe("master");
    });

    it("should not call getDefaultBranch for non-branch modes", async () => {
      const modes: Array<"unstaged" | "staged" | "all"> = ["unstaged", "staged", "all"];

      for (const mode of modes) {
        await resolveDiffOptions({ mode });
      }

      expect(getDefaultBranch).not.toHaveBeenCalled();
    });

    it("should only warn once even when both base and head provided", async () => {
      await resolveDiffOptions({
        mode: "unstaged",
        base: "main",
        head: "HEAD",
      });

      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
