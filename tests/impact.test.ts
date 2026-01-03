
import { describe, expect, it, vi, beforeEach } from "vitest";
import { impactAnalyzer } from "../src/analyzers/impact.js";
import type { ChangeSet } from "../src/core/types.js";
import { execa } from "execa";
import fs from "node:fs/promises";
import path from "node:path";

// Mock execa and fs
vi.mock("execa", () => {
  return {
    execa: vi.fn(),
  };
});

vi.mock("node:fs/promises", () => {
  return {
    default: {
      readFile: vi.fn(),
    },
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
          // simple heuristic for mock: assume "filename:content"
          const parts = r.split(":");
          const file = parts[0];
          const content = parts.slice(1).join(":");
          return `${file}\0${content}`;
      }).join("\n");

      vi.mocked(execa).mockResolvedValue({ stdout } as any);
  };

  const mockFileContent = (pathMap: Record<string, string>) => {
    vi.mocked(fs.readFile).mockImplementation(async (filepath) => {
      // The analyzer calls path.join(cwd, filepath), so we just check if the filepath ends with our key
      // or check basename match.
      const key = Object.keys(pathMap).find(k => filepath.toString().endsWith(k));
      if (key) return pathMap[key];
      throw new Error(`File not found: ${filepath}`);
    });
  };

  it("should find imported symbols and identify test files", async () => {
    mockChangeSet.files = [
      { path: "src/utils/math.ts", status: "modified" },
    ];

    // 1. Mock grep results
    mockGitGrep([
        "src/main.ts:import { add } from './math'",
        "tests/math.test.ts:import { add, sub } from '../src/utils/math'"
    ]);

    // 2. Mock file content reading for detailed analysis
    mockFileContent({
        "src/main.ts": "import { add } from './math';\n\nconsole.log(add(1, 2));",
        "tests/math.test.ts": "import { add, sub } from '../src/utils/math';\n\ndescribe('math', () => {});"
    });

    const findings = await impactAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    const finding = findings[0] as any;

    expect(finding.type).toBe("impact-analysis");
    expect(finding.affectedFiles).toContain("src/main.ts");
    expect(finding.affectedFiles).toContain("tests/math.test.ts");

    // Check extracted symbols (aggregated)
    expect(finding.importedSymbols).toContain("add");
    expect(finding.importedSymbols).toContain("sub");

    // Check usage context (should pick one)
    expect(finding.usageContext).toContain("import");

    // Evidence checks
    const evidenceText = finding.evidence.map((e: any) => e.excerpt).join(" ");
    expect(evidenceText).toContain("imports: add");
    expect(evidenceText).toContain("[TEST]");
  });

  it("should handle default imports", async () => {
    mockChangeSet.files = [
      { path: "src/components/Button.svelte", status: "modified" },
    ];

    mockGitGrep([
        "src/routes/+page.svelte:import Button from '../components/Button.svelte'"
    ]);

    mockFileContent({
        "src/routes/+page.svelte": "<script>\nimport Button from '../components/Button.svelte';\n</script>"
    });

    const findings = await impactAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    const finding = findings[0] as any;
    expect(finding.importedSymbols).toContain("Button");
  });

  it("should handle namespace imports", async () => {
    mockChangeSet.files = [
      { path: "src/utils/helpers.ts", status: "modified" },
    ];

    mockGitGrep([
        "src/app.ts:import * as Helpers from './utils/helpers'"
    ]);

    mockFileContent({
        "src/app.ts": "import * as Helpers from './utils/helpers';"
    });

    const findings = await impactAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    const finding = findings[0] as any;
    expect(finding.importedSymbols).toContain("Helpers");
  });

  it("should handle side-effect imports", async () => {
    mockChangeSet.files = [
        { path: "src/init.ts", status: "modified" }
    ];

    mockGitGrep([
        "src/main.ts:import './init'"
    ]);

    mockFileContent({
        "src/main.ts": "import './init';"
    });

    const findings = await impactAnalyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    const finding = findings[0] as any;
    expect(finding.importedSymbols).toEqual([]);
    expect(finding.usageContext).toContain("import './init'");
  });

  it("should ignore excluded files", async () => {
    mockChangeSet.files = [
      { path: "src/types.d.ts", status: "modified" },
    ];
    mockGitGrep([]);

    const findings = await impactAnalyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(0);
  });

  it("should set isTestFile to true only if all dependents are tests", async () => {
      mockChangeSet.files = [
          { path: "src/internal-helper.ts", status: "modified" }
      ];

      mockGitGrep([
          "tests/helper.test.ts:import '../src/internal-helper'"
      ]);

      mockFileContent({
          "tests/helper.test.ts": "import '../src/internal-helper';"
      });

      const findings = await impactAnalyzer.analyze(mockChangeSet);
      expect((findings[0] as any).isTestFile).toBe(true);
  });

  it("should set isTestFile to false if mixed dependents", async () => {
      mockChangeSet.files = [
          { path: "src/utils.ts", status: "modified" }
      ];

      mockGitGrep([
          "src/app.ts:import './utils'",
          "tests/utils.test.ts:import './utils'"
      ]);

      mockFileContent({
          "src/app.ts": "import './utils';",
          "tests/utils.test.ts": "import './utils';"
      });

      const findings = await impactAnalyzer.analyze(mockChangeSet);
      expect((findings[0] as any).isTestFile).toBe(false);
  });
});
