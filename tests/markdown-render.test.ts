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
import {
  buildDependencyOverview,
  formatDependencyOverviewBullets,
} from "../src/render/summary.js";

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
    // New format: explicit diffstat
    expect(markdown).toContain("Files: 2 changed (1 added, 1 modified)");
  });

  it("should render routes table in details", () => {
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

    // Routes are now in the details section
    expect(markdown).toContain("<details>");
    expect(markdown).toContain("### Routes / API");
    expect(markdown).toContain("/dashboard");
    expect(markdown).toContain("page");
    expect(markdown).toContain("/api/users");
    expect(markdown).toContain("endpoint");
    expect(markdown).toContain("GET, POST");
  });

  it("should render env vars table in details", () => {
    const findings: Finding[] = [
      {
        type: "env-var",
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/lib/config.ts"],
      } as EnvVarFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    // Env vars are now in the details section
    expect(markdown).toContain("<details>");
    expect(markdown).toContain("### Config / Env");
    expect(markdown).toContain("`API_KEY`");
    expect(markdown).toContain("added");
    expect(markdown).toContain("src/lib/config.ts");
  });

  it("should render dependencies section in details", () => {
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

    // Dependencies are now in the details section
    expect(markdown).toContain("<details>");
    expect(markdown).toContain("### Dependencies");
    expect(markdown).toContain("**Production**");
    expect(markdown).toContain("`@sveltejs/kit`");
    expect(markdown).toContain("^1.0.0");
    expect(markdown).toContain("^2.0.0");
    expect(markdown).toContain("major");
    expect(markdown).toContain("**Dev Dependencies**");
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

    // New section name (lowercase)
    expect(markdown).toContain("## Suggested test plan");
    // New format with targeted test
    expect(markdown).toContain("`bun test tests/unit.test.ts`");
    expect(markdown).toContain("(targeted)");
    // Profile-specific command
    expect(markdown).toContain("`bun run check`");
    expect(markdown).toContain("(SvelteKit profile)");
    // Route test suggestion
    expect(markdown).toContain("GET /api/users");
    expect(markdown).toContain("(route changed)");
  });

  it("should render notes section", () => {
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

    // New section name
    expect(markdown).toContain("## Notes");
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

    // These are now in details section when present, but should not appear when empty
    expect(markdown).not.toContain("### Routes / API");
    expect(markdown).not.toContain("### Database");
    expect(markdown).not.toContain("### Config / Env");
    expect(markdown).not.toContain("### Cloudflare");
    expect(markdown).not.toContain("### Dependencies");
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

    expect(markdown).toContain("## What changed");
    // Categories use getCategoryLabel
    expect(markdown).toContain("### Product Code");
    expect(markdown).toContain("`src/lib/new.ts`");
    expect(markdown).toContain("### Tests");
    expect(markdown).toContain("`tests/new.test.ts`");
    expect(markdown).toContain("### Documentation");
    expect(markdown).toContain("`README.md`");
  });

  it("should show security files in details", () => {
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

    // Security files appear in the details section or as a top finding
    expect(markdown).toContain("Security");
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
        evidenceText: "Critical issue",
      },
      {
        type: "risk-flag",
        kind: "risk-flag",
        category: "infra",
        confidence: "high",
        evidence: [],
        risk: "high",
        evidenceText: "Another issue",
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
        evidenceText: "Security concern",
      },
    ];

    const score = computeRiskScore(findings);
    const bullets = score.evidenceBullets ?? [];
    expect(bullets.some((b) => b.includes("Security concern"))).toBe(true);
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

// ============================================================================
// Dependency Overview Tests
// ============================================================================

describe("buildDependencyOverview", () => {
  it("should return empty overview for no findings", () => {
    const overview = buildDependencyOverview([]);
    expect(overview.total).toBe(0);
    expect(overview.prodCount).toBe(0);
    expect(overview.devCount).toBe(0);
  });

  it("should count prod and dev dependencies separately", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "express",
        section: "dependencies",
        from: "^4.0.0",
        to: "^5.0.0",
        impact: "major",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "typescript",
        section: "devDependencies",
        from: "^4.0.0",
        to: "^5.0.0",
        impact: "major",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "lodash",
        section: "dependencies",
        from: "^4.17.0",
        to: "^4.17.21",
        impact: "patch",
      } as DependencyChangeFinding,
    ];

    const overview = buildDependencyOverview(findings);
    expect(overview.total).toBe(3);
    expect(overview.prodCount).toBe(2);
    expect(overview.devCount).toBe(1);
    expect(overview.byImpact.major).toBe(2);
    expect(overview.byImpact.patch).toBe(1);
  });

  it("should track major updates with version info", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "@sveltejs/kit",
        section: "dependencies",
        from: "^1.0.0",
        to: "^2.0.0",
        impact: "major",
      } as DependencyChangeFinding,
    ];

    const overview = buildDependencyOverview(findings);
    expect(overview.majorUpdates).toHaveLength(1);
    expect(overview.majorUpdates[0].name).toBe("@sveltejs/kit");
    expect(overview.majorUpdates[0].from).toBe("^1.0.0");
    expect(overview.majorUpdates[0].to).toBe("^2.0.0");
  });

  it("should track new and removed packages", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "better-auth",
        section: "dependencies",
        to: "^1.0.0",
        impact: "new",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "old-lib",
        section: "dependencies",
        from: "^1.0.0",
        impact: "removed",
      } as DependencyChangeFinding,
    ];

    const overview = buildDependencyOverview(findings);
    expect(overview.newPackages).toContain("better-auth");
    expect(overview.removedPackages).toContain("old-lib");
    expect(overview.byImpact.new).toBe(1);
    expect(overview.byImpact.removed).toBe(1);
  });

  it("should detect risky category changes", () => {
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

    const overview = buildDependencyOverview(findings);
    expect(overview.hasRiskyCategoryChanges).toBe(true);
  });
});

describe("formatDependencyOverviewBullets", () => {
  it("should return empty array for no deps", () => {
    const overview = buildDependencyOverview([]);
    const bullets = formatDependencyOverviewBullets(overview);
    expect(bullets).toHaveLength(0);
  });

  it("should format counts correctly", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "express",
        section: "dependencies",
        from: "^4.0.0",
        to: "^5.0.0",
        impact: "major",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "typescript",
        section: "devDependencies",
        from: "^4.0.0",
        to: "^5.0.0",
        impact: "major",
      } as DependencyChangeFinding,
    ];

    const overview = buildDependencyOverview(findings);
    const bullets = formatDependencyOverviewBullets(overview);

    expect(bullets.length).toBeGreaterThan(0);
    expect(bullets[0]).toContain("2 dependency changes");
    expect(bullets[0]).toContain("1 production");
    expect(bullets[0]).toContain("1 dev");
  });
});

// ============================================================================
// No-Changes Short-Circuit Tests
// ============================================================================

describe("renderMarkdown - no-changes short-circuit", () => {
  it("should render single-line message when no findings", () => {
    const markdown = renderMarkdown(createContext([]));

    expect(markdown).toContain("No changes detected");
    expect(markdown).toContain("<!-- branch-narrator:");
    expect(markdown).not.toContain("## Summary");
    expect(markdown).not.toContain("## Suggested test plan");
    expect(markdown).not.toContain("## Notes");
    expect(markdown).not.toContain("<details>");
  });

  it("should NOT short-circuit when interactive content is provided", () => {
    const interactive = {
      context: "This is a test context.",
    };
    const markdown = renderMarkdown(createContext([], interactive));

    expect(markdown).toContain("## Context");
    expect(markdown).toContain("This is a test context.");
  });

  it("should NOT short-circuit when findings exist even without file-summary", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "@sveltejs/kit",
        section: "dependencies",
        from: "^1.0.0",
        to: "^2.0.0",
        impact: "major",
      } as DependencyChangeFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    // Should NOT be the short-circuit message
    expect(markdown).toContain("## Summary");
    // Should contain the promoted dependency section
    expect(markdown).toContain("## Dependencies");
  });
});

// ============================================================================
// Promoted Dependencies in Primary Section
// ============================================================================

describe("renderMarkdown - promoted dependencies", () => {
  it("should render dependency overview as primary section", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: ["package.json"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "dependency-change",
        name: "express",
        section: "dependencies",
        from: "^4.0.0",
        to: "^5.0.0",
        impact: "major",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "better-auth",
        section: "dependencies",
        to: "^1.0.0",
        impact: "new",
      } as DependencyChangeFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    // Primary dependency section
    expect(markdown).toContain("## Dependencies");
    expect(markdown).toContain("dependency changes");
    expect(markdown).toContain("Major:");
    expect(markdown).toContain("express");
    expect(markdown).toContain("Added:");
    expect(markdown).toContain("better-auth");
  });

  it("should not render dependency section when no deps", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: ["src/index.ts"],
        modified: [],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).not.toContain("## Dependencies");
  });
});

// ============================================================================
// Impact Analysis Trimming
// ============================================================================

describe("renderMarkdown - impact analysis trimming", () => {
  it("should only show high/medium blast radius in details", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: ["src/core.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "impact-analysis",
        kind: "impact-analysis",
        category: "product",
        confidence: "high",
        evidence: [],
        sourceFile: "src/core.ts",
        blastRadius: "high",
        affectedFiles: ["a.ts", "b.ts", "c.ts"],
      },
      {
        type: "impact-analysis",
        kind: "impact-analysis",
        category: "product",
        confidence: "high",
        evidence: [],
        sourceFile: "src/low.ts",
        blastRadius: "low",
        affectedFiles: ["d.ts"],
      },
    ] as Finding[];

    const markdown = renderMarkdown(createContext(findings));

    // High blast radius should appear
    expect(markdown).toContain("src/core.ts");
    expect(markdown).toContain("HIGH");
    // Low blast radius should NOT appear in impact analysis
    expect(markdown).not.toContain("src/low.ts");
  });
});

// ============================================================================
// Notes Section Conditional Rendering
// ============================================================================

describe("renderMarkdown - notes conditional rendering", () => {
  it("should omit notes when risk is low and no evidence", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: ["src/index.ts"],
        modified: [],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
    ];

    const markdown = renderMarkdown(createContext(findings));

    // Notes section should be omitted for low risk with no evidence
    expect(markdown).not.toContain("## Notes");
  });

  it("should render notes when risk has evidence", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: ["src/auth.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "risk-flag",
        kind: "risk-flag",
        category: "infra",
        confidence: "high",
        evidence: [],
        risk: "high",
        evidenceText: "Critical security change",
      },
    ] as Finding[];

    const markdown = renderMarkdown(createContext(findings));

    expect(markdown).toContain("## Notes");
    expect(markdown).toContain("Critical security change");
  });
});
