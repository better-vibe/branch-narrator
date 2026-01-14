import { describe, expect, it, beforeEach, mock, type Mock } from "bun:test";
import { createImpactAnalyzer } from "../src/analyzers/impact.js";
import type { ChangeSet } from "../src/core/types.js";

describe("impactAnalyzer", () => {
  const mockChangeSet: ChangeSet = {
    base: "main",
    head: "feature",
    files: [],
    diffs: [],
  };

  let execMock: Mock<any>;
  let readFileMock: Mock<any>;

  beforeEach(() => {
    execMock = mock();
    readFileMock = mock();
  });

  const mockGitGrep = (results: string[]) => {
    // Results format for batch: filename\0content
    const stdout = results
      .map((r) => {
        const parts = r.split(":");
        const file = parts[0];
        const content = parts.slice(1).join(":");
        return `${file}\0${content}`;
      })
      .join("\n");

    execMock.mockResolvedValue({ stdout });
  };

  const mockFileContent = (pathMap: Record<string, string>) => {
    readFileMock.mockImplementation(async (filepath: string) => {
      const key = Object.keys(pathMap).find((k) => filepath.toString().endsWith(k));
      if (key) return pathMap[key];
      const file = Bun.file(filepath);
      return await file.text();
    });
  };

  it("should find imported symbols from dependents", async () => {
    mockChangeSet.files = [{ path: "src/utils/math.ts", status: "modified" }];

    mockGitGrep([
      "src/main.ts:import { add } from './math'",
      "tests/math.test.ts:import { add, sub } from '../src/utils/math'",
    ]);

    mockFileContent({
      "src/main.ts": "import { add } from './math';\n\nconsole.log(add(1, 2));",
      "tests/math.test.ts":
        "import { add, sub } from '../src/utils/math';\n\ndescribe('math', () => {});",
    });

    const analyzer = createImpactAnalyzer({
      cwd: process.cwd(),
      exec: execMock as any,
      readFile: readFileMock as any,
    });

    const findings = await analyzer.analyze(mockChangeSet);

    expect(findings).toHaveLength(1);
    const finding = findings[0] as any;

    expect(finding.type).toBe("impact-analysis");
    expect(finding.affectedFiles).toContain("src/main.ts");
    expect(finding.affectedFiles).toContain("tests/math.test.ts");
    expect(finding.importedSymbols).toContain("add");
    expect(finding.importedSymbols).toContain("sub");
    expect(finding.usageContext).toContain("import");
  });

  it("should handle default imports", async () => {
    mockChangeSet.files = [{ path: "src/components/Button.svelte", status: "modified" }];

    mockGitGrep([
      "src/routes/+page.svelte:import Button from '../components/Button.svelte'",
    ]);

    mockFileContent({
      "src/routes/+page.svelte": "<script>\nimport Button from '../components/Button.svelte';\n</script>",
    });

    const analyzer = createImpactAnalyzer({
      cwd: process.cwd(),
      exec: execMock as any,
      readFile: readFileMock as any,
    });

    const findings = await analyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(1);
    expect((findings[0] as any).importedSymbols).toContain("Button");
  });

  it("should ignore excluded files", async () => {
    mockChangeSet.files = [{ path: "src/types.d.ts", status: "modified" }];
    mockGitGrep([]);

    const analyzer = createImpactAnalyzer({
      cwd: process.cwd(),
      exec: execMock as any,
      readFile: readFileMock as any,
    });

    const findings = await analyzer.analyze(mockChangeSet);
    expect(findings).toHaveLength(0);
  });
});

