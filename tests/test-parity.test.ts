import { describe, expect, it, beforeEach, mock, type Mock } from "bun:test";
import {
  createTestParityAnalyzer,
  _resetCacheForTesting,
} from "../src/analyzers/test-parity.js";
import type { ChangeSet, TestParityViolationFinding } from "../src/core/types.js";

describe("testParityAnalyzer", () => {
  const mockChangeSet: ChangeSet = {
    base: "main",
    head: "feature",
    files: [],
    diffs: [],
  };

  let execMock: Mock<any>;

  beforeEach(() => {
    execMock = mock();
    _resetCacheForTesting();
    execMock.mockResolvedValue({ stdout: "" });
  });

  const mockGitFiles = (files: string[]) => {
    execMock.mockResolvedValue({ stdout: files.join("\n") });
  };

  it("should emit one finding per file without test", async () => {
    const analyzer = createTestParityAnalyzer(undefined, { exec: execMock as any });

    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
      { path: "src/utils/string.ts", status: "modified" },
    ];
    mockGitFiles(["src/utils/math.ts", "src/utils/string.ts"]);

    const findings = await analyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(2);
    expect(findings[0].type).toBe("test-parity-violation");
    expect(findings[1].type).toBe("test-parity-violation");

    const v1 = findings[0] as TestParityViolationFinding;
    const v2 = findings[1] as TestParityViolationFinding;
    expect(v1.sourceFile).toBe("src/utils/math.ts");
    expect(v2.sourceFile).toBe("src/utils/string.ts");
  });

  it("should pass if colocated test file exists", async () => {
    const analyzer = createTestParityAnalyzer(undefined, { exec: execMock as any });

    mockChangeSet.files = [{ path: "src/utils/math.ts", status: "modified" }];
    mockGitFiles(["src/utils/math.ts", "src/utils/math.test.ts"]);

    const findings = await analyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(0);
  });

  it("should assign low confidence to small changes", async () => {
    const analyzer = createTestParityAnalyzer(undefined, { exec: execMock as any });

    mockChangeSet.files = [{ path: "src/components/button.ts", status: "modified" }];
    mockChangeSet.diffs = [
      {
        path: "src/components/button.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            content: "",
            additions: ["+ const x = 1;"],
            deletions: [],
          },
        ],
      },
    ];
    mockGitFiles(["src/components/button.ts"]);

    const findings = await analyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(1);
    expect((findings[0] as TestParityViolationFinding).confidence).toBe("low");

    mockChangeSet.diffs = [];
  });
});

