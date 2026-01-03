
import { describe, expect, it, vi, beforeEach } from "vitest";
import { impactAnalyzer } from "../src/analyzers/impact.js";
import type { ChangeSet } from "../src/core/types.js";
import { execa } from "execa";

// Mock execa
vi.mock("execa", () => {
  return {
    execa: vi.fn(),
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
    vi.mocked(execa).mockResolvedValue({
      stdout: results.join("\n"),
      stderr: "",
      exitCode: 0,
    } as any);
  };

  const mockGitGrepEmpty = () => {
    vi.mocked(execa).mockRejectedValue({
      stdout: "",
      stderr: "",
      exitCode: 1,
    } as any);
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
