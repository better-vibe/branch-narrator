
import { describe, expect, it, vi, beforeEach } from "vitest";
import { testParityAnalyzer } from "../src/analyzers/test-parity.js";
import type { ChangeSet } from "../src/core/types.js";
import fs from "node:fs";

// Mock file system
vi.mock("node:fs", () => {
  return {
    default: {
      existsSync: vi.fn(),
    },
    existsSync: vi.fn(),
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
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  it("should detect missing test for source file", () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    const findings = testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe("convention-violation");
    expect((findings[0] as any).files).toContain("src/utils/math.ts");
  });

  it("should ignore excluded files", () => {
    mockChangeSet.files = [
      { path: "src/index.ts", status: "modified" },
      { path: "src/types.d.ts", status: "modified" },
      { path: "vitest.config.ts", status: "modified" },
    ];

    const findings = testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if test file exists (colocated)", () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    // Mock existence of test file
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      return path.toString().includes("src/utils/math.test.ts");
    });

    const findings = testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if test file exists (mirrored in tests/)", () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    // Mock existence of test file
    vi.mocked(fs.existsSync).mockImplementation((path) => {
      // should look for tests/utils/math.test.ts
      return path.toString().includes("tests/utils/math.test.ts");
    });

    const findings = testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if new test file is in changeset", () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "added" },
      { path: "src/utils/math.test.ts", status: "added" },
    ];

    const findings = testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });

  it("should pass if new test file (different dir) is in changeset", () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "added" },
      { path: "tests/math.test.ts", status: "added" },
    ];

    const findings = testParityAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(0);
  });
});
