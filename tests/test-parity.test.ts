
import { describe, expect, it, vi, beforeEach } from "vitest";
import { testParityAnalyzer, _resetCacheForTesting } from "../src/analyzers/test-parity.js";
import type { ChangeSet } from "../src/core/types.js";
import { execa } from "execa";

// Mock execa
vi.mock("execa", () => {
  return {
    execa: vi.fn(),
  };
});

describe("testParityAnalyzer", () => {
  const mockChangeSet: ChangeSet = {
    base: "main",
    head: "feature",
    files: [],
    diffs: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    _resetCacheForTesting();
    // Default mock implementation for git ls-files
    vi.mocked(execa).mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
    } as any);
  });

  const mockGitFiles = (files: string[]) => {
    vi.mocked(execa).mockResolvedValue({
      stdout: files.join("\n"),
      stderr: "",
      exitCode: 0,
    } as any);
  };

  it("should detect missing test for source file", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];
    mockGitFiles(["src/utils/math.ts"]);

    const findings = await testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("convention-violation");
    expect((findings[0] as any).files).toContain("src/utils/math.ts");
  });

  it("should ignore excluded files", async () => {
    mockChangeSet.files = [
      { path: "src/index.ts", status: "modified" },
      { path: "src/types.d.ts", status: "modified" },
      { path: "vitest.config.ts", status: "modified" },
    ];
    mockGitFiles([]);

    const findings = await testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if test file exists (colocated)", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];
    mockGitFiles(["src/utils/math.ts", "src/utils/math.test.ts"]);

    const findings = await testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if test file exists (mirrored in tests/)", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];
    // src/utils/math.ts -> tests/utils/math.test.ts
    mockGitFiles(["src/utils/math.ts", "tests/utils/math.test.ts"]);

    const findings = await testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if new test file is in changeset", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "added" },
      { path: "src/utils/math.test.ts", status: "added" },
    ];
    mockGitFiles([]); // Files might not be in git yet if just added, but changeset has them

    const findings = await testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if new test file (different dir) is in changeset", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "added" },
      { path: "tests/math.test.ts", status: "added" },
    ];
    mockGitFiles([]);

    const findings = await testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });
});
