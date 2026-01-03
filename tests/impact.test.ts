
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
      // Results format for batch: filename\0content
      const stdout = results.map(r => {
          // simple heuristic for mock: assume "filename"
          // but we need content to match basename.
          // let's assume result strings are "filename:content"
          const parts = r.split(":");
          const file = parts[0];
          const content = parts.slice(1).join(":");
          return `${file}\0${content}`;
      }).join("\n");

      vi.mocked(execa).mockResolvedValue({ stdout } as any);
  };

  const mockGitGrepEmpty = () => {
      // git grep usually exits with 1 if nothing found, but execa in analyzer is configured with reject: false
      vi.mocked(execa).mockResolvedValue({ stdout: "", exitCode: 1 } as any);
  };

  it("should find files that import the modified file", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    // Mock git grep output: filename:content matching "math"
    mockGitGrep([
        "src/main.ts:import { add } from './math'",
        "src/utils/calc.ts:import { sub } from './math'"
    ]);

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
    // Should not even call git grep for d.ts if filtered out
    // But if it did, we mock empty
    mockGitGrep([]);

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
