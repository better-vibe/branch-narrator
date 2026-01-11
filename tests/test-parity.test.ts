import { describe, expect, it, beforeEach, afterAll, mock, type Mock } from "bun:test";
import { testParityAnalyzer, createTestParityAnalyzer, _resetCacheForTesting } from "../src/analyzers/test-parity.js";
import type { ChangeSet, TestParityViolationFinding } from "../src/core/types.js";
import { execa } from "execa";

// Mock execa
mock.module("execa", () => {
  return {
    execa: mock(),
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
    (execa as unknown as Mock<typeof execa>).mockReset();
    _resetCacheForTesting();
    // Default mock
    (execa as unknown as Mock<typeof execa>).mockResolvedValue({ stdout: "" } as any);
  });

  afterAll(() => {
    // Restore the original modules to avoid affecting other tests
    mock.restore();
  });

  const mockGitFiles = (files: string[]) => {
    (execa as unknown as Mock<typeof execa>).mockResolvedValue({ stdout: files.join("\n") } as any);
  };

  describe("per-file findings", () => {
    it("should emit one finding per file without test", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
        { path: "src/utils/string.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts", "src/utils/string.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(2);
      expect(findings[0].type).toBe("test-parity-violation");
      expect(findings[1].type).toBe("test-parity-violation");

      const violation1 = findings[0] as TestParityViolationFinding;
      const violation2 = findings[1] as TestParityViolationFinding;
      
      expect(violation1.sourceFile).toBe("src/utils/math.ts");
      expect(violation2.sourceFile).toBe("src/utils/string.ts");
    });

    it("should include expected test locations in finding", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(1);
      const violation = findings[0] as TestParityViolationFinding;
      expect(violation.expectedTestLocations).toBeDefined();
      expect(violation.expectedTestLocations.length).toBeGreaterThan(0);
      // Should include colocated option
      expect(violation.expectedTestLocations).toContain("src/utils/math.test.ts");
    });
  });

  describe("exclusion patterns", () => {
    it("should ignore index files", async () => {
      mockChangeSet.files = [
        { path: "src/index.ts", status: "modified" },
        { path: "src/utils/index.ts", status: "modified" },
      ];
      mockGitFiles([]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should ignore type definition files", async () => {
      mockChangeSet.files = [
        { path: "src/types.d.ts", status: "modified" },
        { path: "src/global.d.ts", status: "modified" },
      ];
      mockGitFiles([]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should ignore config files", async () => {
      mockChangeSet.files = [
        { path: "vitest.config.ts", status: "modified" },
        { path: "vite.config.ts", status: "modified" },
        { path: "tsconfig.config.ts", status: "modified" },
      ];
      mockGitFiles([]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should ignore files in test directories", async () => {
      mockChangeSet.files = [
        { path: "tests/helpers.ts", status: "modified" },
        { path: "test/fixtures.ts", status: "modified" },
        { path: "__tests__/utils.ts", status: "modified" },
      ];
      mockGitFiles([]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should ignore deleted files", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "deleted" },
      ];
      mockGitFiles([]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });
  });

  describe("test file detection", () => {
    it("should pass if colocated test file exists", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts", "src/utils/math.test.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should pass if mirrored test file exists in tests/", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts", "tests/utils/math.test.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should pass if flat test file exists in tests/", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts", "tests/math.test.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should pass if spec file exists", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts", "src/utils/math.spec.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should pass if new test file is in changeset (colocated)", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "added" },
        { path: "src/utils/math.test.ts", status: "added" },
      ];
      mockGitFiles([]); // Files not in git yet

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should pass if new test file is in changeset (different dir)", async () => {
      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "added" },
        { path: "tests/math.test.ts", status: "added" },
      ];
      mockGitFiles([]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });
  });

  describe("confidence scoring", () => {
    it("should assign high confidence to service/handler files", async () => {
      mockChangeSet.files = [
        { path: "src/services/auth.ts", status: "modified" },
      ];
      mockGitFiles(["src/services/auth.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(1);
      expect((findings[0] as TestParityViolationFinding).confidence).toBe("high");
    });

    it("should assign medium confidence to utils files", async () => {
      mockChangeSet.files = [
        { path: "src/utils/helpers.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/helpers.ts"]);

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(1);
      expect((findings[0] as TestParityViolationFinding).confidence).toBe("medium");
    });

    it("should assign low confidence to small changes", async () => {
      mockChangeSet.files = [
        { path: "src/components/button.ts", status: "modified" },
      ];
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

      const findings = await testParityAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(1);
      expect((findings[0] as TestParityViolationFinding).confidence).toBe("low");

      // Reset diffs
      mockChangeSet.diffs = [];
    });
  });

  describe("createTestParityAnalyzer (custom config)", () => {
    it("should use custom test patterns", async () => {
      const customAnalyzer = createTestParityAnalyzer({
        testPatterns: [".test.tsx"],
      });

      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      // Only .tsx test exists, which matches custom pattern
      mockGitFiles(["src/utils/math.ts", "src/utils/math.test.tsx"]);

      const findings = await customAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should use custom test directories", async () => {
      const customAnalyzer = createTestParityAnalyzer({
        testDirectories: ["spec"],
      });

      mockChangeSet.files = [
        { path: "src/utils/math.ts", status: "modified" },
      ];
      mockGitFiles(["src/utils/math.ts", "spec/math.test.ts"]);

      const findings = await customAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });

    it("should use custom exclude patterns", async () => {
      const customAnalyzer = createTestParityAnalyzer({
        excludePatterns: [/^src\/generated\//],
      });

      mockChangeSet.files = [
        { path: "src/generated/api.ts", status: "modified" },
      ];
      mockGitFiles(["src/generated/api.ts"]);

      const findings = await customAnalyzer.analyze(mockChangeSet);

      expect(findings).toHaveLength(0);
    });
  });
});
