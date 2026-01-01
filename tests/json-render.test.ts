/**
 * JSON renderer tests.
 */

import { describe, expect, it } from "vitest";
import type {
  DependencyChangeFinding,
  EnvVarFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  RenderContext,
  RouteChangeFinding,
} from "../src/core/types.js";
import {
  aggregateFindingsByType,
  renderJson,
  validateFactsOutput,
  type FactsOutput,
} from "../src/render/json.js";
import { computeRiskScore } from "../src/render/risk-score.js";

function createContext(findings: Finding[]): RenderContext {
  return {
    findings,
    riskScore: computeRiskScore(findings),
    profile: "auto",
  };
}

describe("renderJson", () => {
  it("should render basic JSON output", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: ["src/lib/new.ts"],
        modified: ["src/lib/old.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
    ];

    const json = renderJson(createContext(findings));
    const parsed = JSON.parse(json);

    expect(parsed.profile).toBe("auto");
    expect(parsed.riskScore).toBeDefined();
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].type).toBe("file-summary");
  });

  it("should render JSON without findingsByType by default", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: ["src/lib/utils.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "env-var",
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
      } as EnvVarFinding,
    ];

    const json = renderJson(createContext(findings));
    const parsed = JSON.parse(json);

    expect(parsed.findingsByType).toBeUndefined();
  });

  it("should include findingsByType when option is enabled", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: ["src/lib/utils.ts"],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "env-var",
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
      } as EnvVarFinding,
      {
        type: "env-var",
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: ["src/db.ts"],
      } as EnvVarFinding,
    ];

    const json = renderJson(createContext(findings), {
      includeFindingsByType: true,
    });
    const parsed = JSON.parse(json);

    expect(parsed.findingsByType).toBeDefined();
    expect(parsed.findingsByType["file-summary"]).toBe(1);
    expect(parsed.findingsByType["env-var"]).toBe(2);
  });

  it("should handle empty findings", () => {
    const json = renderJson(createContext([]));
    const parsed = JSON.parse(json);

    expect(parsed.profile).toBe("auto");
    expect(parsed.findings).toHaveLength(0);
  });

  it("should not include findingsByType for empty findings", () => {
    const json = renderJson(createContext([]), {
      includeFindingsByType: true,
    });
    const parsed = JSON.parse(json);

    expect(parsed.findingsByType).toBeUndefined();
  });
});

describe("aggregateFindingsByType", () => {
  it("should count findings by type", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: [],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
      {
        type: "env-var",
        name: "API_KEY",
        change: "added",
        evidenceFiles: [],
      } as EnvVarFinding,
      {
        type: "env-var",
        name: "DATABASE_URL",
        change: "added",
        evidenceFiles: [],
      } as EnvVarFinding,
      {
        type: "route-change",
        routeId: "/api/users",
        file: "src/routes/api/users/+server.ts",
        change: "added",
        routeType: "endpoint",
      } as RouteChangeFinding,
    ];

    const result = aggregateFindingsByType(findings);

    expect(result).toEqual({
      "file-summary": 1,
      "env-var": 2,
      "route-change": 1,
    });
  });

  it("should handle empty array", () => {
    const result = aggregateFindingsByType([]);
    expect(result).toEqual({});
  });

  it("should handle single finding", () => {
    const findings: Finding[] = [
      {
        type: "file-summary",
        added: [],
        modified: [],
        deleted: [],
        renamed: [],
      } as FileSummaryFinding,
    ];

    const result = aggregateFindingsByType(findings);
    expect(result).toEqual({ "file-summary": 1 });
  });

  it("should count multiple findings of same type", () => {
    const findings: Finding[] = [
      {
        type: "dependency-change",
        name: "express",
        section: "dependencies",
        from: "4.0.0",
        to: "5.0.0",
        impact: "major",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "lodash",
        section: "dependencies",
        to: "4.17.21",
        impact: "new",
      } as DependencyChangeFinding,
      {
        type: "dependency-change",
        name: "typescript",
        section: "devDependencies",
        from: "5.0.0",
        to: "5.3.0",
        impact: "minor",
      } as DependencyChangeFinding,
    ];

    const result = aggregateFindingsByType(findings);
    expect(result).toEqual({ "dependency-change": 3 });
  });
});

describe("validateFactsOutput", () => {
  it("should validate correct FactsOutput", () => {
    const output: FactsOutput = {
      profile: "auto",
      riskScore: {
        score: 10,
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
    };

    expect(validateFactsOutput(output)).toBe(true);
  });

  it("should validate FactsOutput with findings", () => {
    const output: FactsOutput = {
      profile: "sveltekit",
      riskScore: {
        score: 45,
        level: "medium",
        evidenceBullets: ["Database migration detected"],
      },
      findings: [
        {
          type: "file-summary",
          added: ["src/new.ts"],
          modified: [],
          deleted: [],
          renamed: [],
        },
        {
          type: "env-var",
          name: "API_KEY",
          change: "added",
          evidenceFiles: ["src/config.ts"],
        },
      ],
    };

    expect(validateFactsOutput(output)).toBe(true);
  });

  it("should validate FactsOutput with findingsByType", () => {
    const output: FactsOutput = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [
        {
          type: "file-summary",
          added: [],
          modified: [],
          deleted: [],
          renamed: [],
        },
      ],
      findingsByType: {
        "file-summary": 1,
      },
    };

    expect(validateFactsOutput(output)).toBe(true);
  });

  it("should reject null or undefined", () => {
    expect(validateFactsOutput(null)).toBe(false);
    expect(validateFactsOutput(undefined)).toBe(false);
  });

  it("should reject non-object values", () => {
    expect(validateFactsOutput("string")).toBe(false);
    expect(validateFactsOutput(123)).toBe(false);
    expect(validateFactsOutput(true)).toBe(false);
  });

  it("should reject missing profile", () => {
    const output = {
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject invalid profile type", () => {
    const output = {
      profile: 123,
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject missing riskScore", () => {
    const output = {
      profile: "auto",
      findings: [],
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject invalid riskScore structure", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: "not a number",
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject riskScore without evidenceBullets array", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: "not an array",
      },
      findings: [],
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject missing findings", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject non-array findings", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: "not an array",
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject findings without type", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [
        {
          added: [],
          modified: [],
          deleted: [],
          renamed: [],
        },
      ],
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject invalid findingsByType", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
      findingsByType: "not an object",
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should reject findingsByType with non-number values", () => {
    const output = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
      findingsByType: {
        "file-summary": "not a number",
      },
    };

    expect(validateFactsOutput(output)).toBe(false);
  });

  it("should handle complex valid output", () => {
    const output: FactsOutput = {
      profile: "sveltekit",
      riskScore: {
        score: 75,
        level: "high",
        evidenceBullets: [
          "Database migration with DROP TABLE",
          "5 environment variables added",
          "Authentication changes detected",
        ],
      },
      findings: [
        {
          type: "file-summary",
          added: ["src/routes/api/+server.ts"],
          modified: ["src/lib/db.ts", "src/lib/auth.ts"],
          deleted: [],
          renamed: [
            {
              from: "src/old.ts",
              to: "src/new.ts",
            },
          ],
        },
        {
          type: "route-change",
          routeId: "/api",
          file: "src/routes/api/+server.ts",
          change: "added",
          routeType: "endpoint",
          methods: ["GET", "POST"],
        },
        {
          type: "file-category",
          categories: {
            product: ["src/lib/db.ts"],
            tests: [],
            ci: [],
            infra: [],
            docs: [],
            dependencies: [],
            config: [],
            other: [],
          },
          summary: [
            {
              category: "product",
              count: 1,
            },
          ],
        },
      ],
      findingsByType: {
        "file-summary": 1,
        "route-change": 1,
        "file-category": 1,
      },
    };

    expect(validateFactsOutput(output)).toBe(true);
  });
});
