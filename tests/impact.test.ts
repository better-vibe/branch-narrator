
import { describe, expect, it, vi, beforeEach } from "vitest";
import { impactAnalyzer } from "../src/analyzers/impact.js";
import type { ChangeSet } from "../src/core/types.js";
import { execFile } from "node:child_process";

// Mock child_process
vi.mock("node:child_process", () => {
  return {
    execFile: vi.fn(),
  };
});

describe("impactAnalyzer", () => {
  const mockChangeSet: ChangeSet = {
    base: "main",
    head: "feature",
    files: [],
    diffs: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockGitGrep = (results: string[]) => {
      vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], callback: any) => {
        // Handle optional callback being the 2nd or 3rd argument
        const cb = typeof args === 'function' ? args : callback;
        const actualArgs = typeof args === 'function' ? [] : args;

        if (cmd === "git" && actualArgs[0] === "grep") {
             cb(null, { stdout: results.join("\n") });
        } else {
             cb(null, { stdout: "" });
        }
        return {} as any;
    }) as any);
  };

  const mockGitGrepEmpty = () => {
      vi.mocked(execFile).mockImplementation(((cmd: string, args: string[], callback: any) => {
          const cb = typeof args === 'function' ? args : callback;
          if (cmd === "git" && args[0] === "grep") {
             // git grep returns exit code 1 if not found, simulate error
             const error = new Error("Command failed");
             (error as any).code = 1;
             cb(error, { stdout: "" });
          }
          return {} as any;
      }) as any);
  };

  it("should find files that import the modified file", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    // Mock git grep output
    mockGitGrep(["src/main.ts", "src/utils/calc.ts"]);

    const findings = await impactAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("impact-analysis");
    expect((findings[0] as any).affectedFiles).toContain("src/main.ts");
    expect((findings[0] as any).affectedFiles).toContain("src/utils/calc.ts");
    expect((findings[0] as any).blastRadius).toBe("low");
  });

  it("should ignore excluded files", async () => {
    mockChangeSet.files = [
      { path: "src/types.d.ts", status: "modified" },
    ];
    // Should not even call git grep for d.ts
    mockGitGrep(["src/main.ts"]);

    const findings = await impactAnalyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(0);
  });

  it("should handle no dependents found", async () => {
      mockChangeSet.files = [
          { path: "src/utils/orphan.ts", status: "modified" },
      ];
      mockGitGrepEmpty();

      const findings = await impactAnalyzer.analyze(mockChangeSet);
      expect(findings).toHaveLength(0);
  });
});
