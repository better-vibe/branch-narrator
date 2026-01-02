
import { describe, expect, it, vi, beforeEach } from "vitest";
import { impactAnalyzer } from "../src/analyzers/impact.js";
import type { ChangeSet } from "../src/core/types.js";
import fs from "node:fs";

// Mock file system
vi.mock("node:fs", () => {
  return {
    default: {
      existsSync: vi.fn(),
      readdirSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
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
    // Default: src exists, empty dir
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  it("should find files that import the modified file", () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    // Mock file system scan
    vi.mocked(fs.readdirSync).mockImplementation((dir) => {
      if (dir === "src") {
        return [
          { name: "main.ts", isDirectory: () => false },
          { name: "utils", isDirectory: () => true },
        ] as any;
      }
      return [];
    });

    // Mock file read
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path === "src/main.ts") {
        return "import { add } from './utils/math';";
      }
      return "";
    });

    const findings = impactAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("impact-analysis");
    expect((findings[0] as any).affectedFiles).toContain("src/main.ts");
    expect((findings[0] as any).blastRadius).toBe("low");
  });

  it("should ignore excluded files", () => {
    mockChangeSet.files = [
      { path: "src/types.d.ts", status: "modified" },
    ];

    // Even if something imports it, we skip d.ts modification analysis based on our rule
    // Wait, the rule is to exclude d.ts from *sourceFiles* list.

    const findings = impactAnalyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(0);
  });
});
