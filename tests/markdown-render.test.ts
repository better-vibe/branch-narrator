/**
 * Markdown renderer tests.
 */

import { describe, expect, it } from "bun:test";
import type {
  DependencyChangeFinding,
  EnvVarFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  RenderContext,
  RouteChangeFinding,
  SecurityFileFinding,
  TestChangeFinding,
} from "../src/core/types.js";
import { renderMarkdown } from "../src/render/markdown.js";
import { computeRiskScore } from "../src/render/risk-score.js";

function createContext(
  findings: Finding[],
  interactive?: RenderContext["interactive"]
): RenderContext {
  return {
    findings,
    riskScore: computeRiskScore(findings),
    profile: "sveltekit",
    interactive,
  };
}

describe("renderMarkdown", () => {
  it("should render basic summary", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: ["src/lib/new.ts"],
        modified: ["src/lib/old.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("2 file(s) changed");
    expect(markdown).toContain("1 file(s) added");
  });

  it("should render routes table", () => {
    const findings: Finding[] = [
      {
        type: "route-change",
        routeId: "/dashboard",
        file: "src/routes/dashboard/+page.svelte",
        change: "added",
        routeType: "page",
      } as RouteChangeFinding,
      {
        type: "route-change",
        routeId: "/api/users",
        file: "src/routes/api/users/+server.ts",
        change: "added",
        routeType: "endpoint",
        methods: ["GET", "POST"],
      } as RouteChangeFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Routes / API");
    expect(markdown).toContain("/dashboard");
    expect(markdown).toContain("page");
    expect(markdown).toContain("/api/users");
    expect(markdown).toContain("endpoint");
    expect(markdown).toContain("GET, POST");
  });

  it("should render env vars table", () => {
    const findings: Finding[] = [
      {
        type: "env-var",
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/lib/config.ts"],
      } as EnvVarFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Config / Env");
    expect(markdown).toContain("`API_KEY`");
    expect(markdown).toContain("added");
    expect(markdown).toContain("src/lib/config.ts");
  });

  it("should render dependencies section", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "@sveltejs/kit",
        section: "dependencies",
        from: "^1.0.0",
        to: "^2.0.0",
        impact: "major",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "vitest",
        section: "devDependencies",
        from: "^0.28.0",
        to: "^1.0.0",
        impact: "major",
      } as DependencyChangeFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Dependencies");
    expect(markdown).toContain("### Production");
    expect(markdown).toContain("`@sveltejs/kit`");
    expect(markdown).toContain("^1.0.0");
    expect(markdown).toContain("^2.0.0");
    expect(markdown).toContain("major");
    expect(markdown).toContain("### Dev Dependencies");
    expect(markdown).toContain("`vitest`");
  });

  it("should render test plan", () => {
    const findings: Finding[] = [
      {
        type: "test-change",
        kind: "test-change",
        category: "tests",
        confidence: "high",
        evidence: [],
        framework: "vitest",
        files: ["tests/unit.test.ts"],
        added: [],
        modified: ["tests/unit.test.ts"],
        deleted: [],
      } as TestChangeFinding,
      {
        type: "route-change",
        routeId: "/api/users",
        file: "src/routes/api/users/+server.ts",
        change: "added",
        routeType: "endpoint",
        methods: ["GET"],
      } as RouteChangeFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Suggested Test Plan");
    expect(markdown).toContain("`bun test`");
    expect(markdown).toContain("1 updated test file(s)");
    expect(markdown).toContain("`bun run check`");
    expect(markdown).toContain("GET /api/users");
  });

  it("should render risks section", () => {
    const findings: Finding[] = [
      {
        type: "risk-flag",
        kind: "risk-flag",
        category: "infra",
        confidence: "high",
        evidence: [],
        risk: "high",
        evidenceText: "Critical security change",
      },
      {
        type: "risk-flag",
        kind: "risk-flag",
        category: "database",
        confidence: "high",
        evidence: [],
        risk: "high",
        evidenceText: "Database schema modification",
      },
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Risks / Notes");
    expect(markdown).toContain("HIGH");
    expect(markdown).toContain("Critical security change");
  });

  it("should render context in interactive mode", () => {
    const findings: Finding[] = [];
    const interactive = {
      context: "This PR adds a new feature for user dashboards.",
      testNotes: "Check mobile layout",
    };

    const markdown = renderMarkdown(createContext(findings, interactive));

    expect(markdown).toContain("## Context");
    expect(markdown).toContain("adds a new feature for user dashboards");
    expect(markdown).toContain("Check mobile layout");
  });

  it("should not render context without interactive mode", () => {
    const findings: Finding[] = [];
    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).not.toContain("## Context");
  });

  it("should skip empty sections", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: ["src/lib/new.ts"],
        modified: [],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).not.toContain("## Routes / API");
    expect(markdown).not.toContain("## Database");
    expect(markdown).not.toContain("## Config / Env");
    expect(markdown).not.toContain("## Cloudflare");
    expect(markdown).not.toContain("## Dependencies");
  });

  it("should remove route groups from URL display", () => {
    const findings: Finding[] = [
      {
        type: "route-change",
        routeId: "/(app)/dashboard",
        file: "src/routes/(app)/dashboard/+page.svelte",
        change: "added",
        routeType: "page",
      } as RouteChangeFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("`/dashboard`");
    expect(markdown).not.toContain("(app)");
  });

  it("should render What Changed section grouped by category", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: ["src/lib/new.ts", "tests/new.test.ts"],
        modified: ["README.md"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "file-category",
        categories: {
          product: ["src/lib/new.ts"],
          tests: ["tests/new.test.ts"],
          ci: [],
          infra: [],
          docs: ["README.md"],
          dependencies: [],
          config: [],
          other: [],
        },
        summary: [
          { category: "product", count: 1 },
          { category: "tests", count: 1 },
          { category: "docs", count: 1 },
        ],
      } as FileCategoryFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## What Changed");
    expect(markdown).toContain("### Product Code");
    expect(markdown).toContain("`src/lib/new.ts`");
    expect(markdown).toContain("### Tests");
    expect(markdown).toContain("`tests/new.test.ts`");
    expect(markdown).toContain("### Documentation");
    expect(markdown).toContain("`README.md`");
  });

  it("should show security files in summary", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        kind: "file-summary",
        category: "routes",
        confidence: "high",
        evidence: [],
        added: [],
        modified: ["src/lib/auth.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "security-file",
        kind: "security-file",
        category: "infra",
        confidence: "high",
        evidence: [],
        files: ["src/lib/auth.ts"],
        reasons: ["auth-path"],
      } as SecurityFileFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    // Check summary contains security mention OR the new Security section renders
    const hasSecurityInSummary = markdown.includes("Security-sensitive files changed");
    const hasSecuritySection = markdown.includes("## 🔒 Security-Sensitive Files");
    expect(hasSecurityInSummary || hasSecuritySection).toBe(true);
  });
});

describe("computeRiskScore", () => {
  it("should compute low risk for no findings", () => {
    const score = computeRiskScore([]);
    expect(score.level).toBe("low");
    expect(score.score).toBe(0);
  });

  it("should compute high risk for risk flags", () => {
    const findings: Finding[] = [
      { 
        type: "risk-flag", 
        kind: "risk-flag",
        category: "infra",
        confidence: "high",
        evidence: [],
        risk: "high", 
        evidenceText: "Critical issue" 
      },
      { 
        type: "risk-flag", 
        kind: "risk-flag",
        category: "infra",
        confidence: "high",
        evidence: [],
        risk: "high", 
        evidenceText: "Another issue" 
      },
    ];

    const score = computeRiskScore(findings);
    expect(score.level).toBe("high");
    expect(score.score).toBeGreaterThanOrEqual(50);
  });

  it("should include evidence bullets", () => {
    const findings: Finding[] = [
      { 
        type: "risk-flag", 
        kind: "risk-flag",
        category: "infra",
        confidence: "high",
        evidence: [],
        risk: "high", 
        evidenceText: "Security concern" 
      },
    ];

    const score = computeRiskScore(findings);
    const bullets = score.evidenceBullets ?? [];
    expect(bullets.some((b) => b.includes("Security concern"))).toBe(
      true
    );
  });

  it("should cap score at 100", () => {
    const findings: Finding[] = Array(10).fill({
      type: "risk-flag",
      risk: "high",
      evidence: "Issue",
    });

    const score = computeRiskScore(findings);
    expect(score.score).toBe(100);
  });

  it("should reduce score for docs-only changes", () => {
    const findings: Finding[] = [
      {
        type: "file-category",
        categories: {
          product: [],
          tests: [],
          ci: [],
          infra: [],
          docs: ["README.md", "docs/guide.md"],
          dependencies: [],
          config: [],
          other: [],
        },
        summary: [{ category: "docs", count: 2 }],
      } as FileCategoryFinding,
    ];

    const score = computeRiskScore(findings);
    expect(score.level).toBe("low");
    expect(score.evidenceBullets.some((b) => b.includes("docs"))).toBe(true);
  });

  it("should reduce score for tests-only changes", () => {
    const findings: Finding[] = [
      {
        type: "file-category",
        categories: {
          product: [],
          tests: ["tests/unit.test.ts"],
          ci: [],
          infra: [],
          docs: [],
          dependencies: [],
          config: [],
          other: [],
        },
        summary: [{ category: "tests", count: 1 }],
      } as FileCategoryFinding,
    ];

    const score = computeRiskScore(findings);
    expect(score.level).toBe("low");
    expect(score.evidenceBullets.some((b) => b.includes("tests"))).toBe(true);
  });

  it("should add points for security files", () => {
    const findings: Finding[] = [
      {
        type: "security-file",
        files: ["src/lib/auth.ts"],
        reasons: ["auth-path"],
      } as SecurityFileFinding,
      {
        type: "risk-flag",
        risk: "medium",
        evidence: "Security-sensitive files changed",
      },
    ];

    const score = computeRiskScore(findings);
    expect(score.score).toBeGreaterThan(20);
  });

  it("should add points for risky package additions", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "stripe",
        section: "dependencies",
        to: "^12.0.0",
        impact: "new",
        riskCategory: "payment",
      } as DependencyChangeFinding,
    ];

    const score = computeRiskScore(findings);
    expect(score.score).toBeGreaterThan(0);
  });
});

