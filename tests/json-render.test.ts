/**
 * Tests for enhanced JSON renderer.
 * Tests the new features added to the facts command.
 */

import { describe, expect, it } from "vitest";
import {
  renderJson,
  type EnhancedFactsOutput,
  type FactsOutput,
} from "../src/render/json.js";
import type { RenderContext } from "../src/core/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

function createRenderContext(): RenderContext {
  return {
    profile: "auto",
    riskScore: {
      score: 25,
      level: "low",
      evidenceBullets: ["ℹ️ Minor changes detected"],
    },
    findings: [
      {
        type: "file-summary",
        added: ["src/new.ts"],
        modified: ["src/existing.ts"],
        deleted: [],
        renamed: [],
      },
      {
        type: "file-category",
        categories: {
          product: ["src/new.ts", "src/existing.ts"],
          tests: [],
          ci: [],
          infra: [],
          docs: [],
          dependencies: [],
          config: [],
          other: [],
        },
        summary: [{ category: "product", count: 2 }],
      },
    ],
  };
}

// ============================================================================
// Legacy Format Tests
// ============================================================================

describe("renderJson - legacy format (backward compatibility)", () => {
  it("should render legacy format when no options provided", () => {
    const context = createRenderContext();
    const json = renderJson(context);
    const parsed: FactsOutput = JSON.parse(json);

    expect(parsed.profile).toBe("auto");
    expect(parsed.riskScore.score).toBe(25);
    expect(parsed.riskScore.level).toBe("low");
    expect(parsed.findings).toHaveLength(2);
    
    // Legacy format should NOT have enhanced fields
    expect((parsed as any).schemaVersion).toBeUndefined();
    expect((parsed as any).mode).toBeUndefined();
    expect((parsed as any).stats).toBeUndefined();
  });

  it("should be valid JSON", () => {
    const context = createRenderContext();
    const json = renderJson(context);
    
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should be pretty-printed with indentation", () => {
    const context = createRenderContext();
    const json = renderJson(context);
    
    // Check that JSON is formatted with newlines and indentation
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});

// ============================================================================
// Enhanced Format Tests
// ============================================================================

describe("renderJson - enhanced format with metadata", () => {
  it("should include schemaVersion, mode, base, head, and stats for branch mode", () => {
    const context = createRenderContext();
    const json = renderJson(context, {
      mode: "branch",
      base: "main",
      head: "HEAD",
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.schemaVersion).toBe("1.0");
    expect(parsed.mode).toBe("branch");
    expect(parsed.base).toBe("main");
    expect(parsed.head).toBe("HEAD");
    expect(parsed.profile).toBe("auto");
    expect(parsed.riskScore.score).toBe(25);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.stats).toBeDefined();
    expect(parsed.stats.totalFindings).toBe(2);
    expect(parsed.stats.findingsByType).toBeDefined();
  });

  it("should have null base/head for non-branch modes", () => {
    const context = createRenderContext();
    const json = renderJson(context, {
      mode: "unstaged",
      base: null,
      head: null,
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.mode).toBe("unstaged");
    expect(parsed.base).toBeNull();
    expect(parsed.head).toBeNull();
  });

  it("should correctly count findings by type", () => {
    const context: RenderContext = {
      profile: "sveltekit",
      riskScore: {
        score: 45,
        level: "medium",
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
        {
          type: "route-change",
          routeId: "/dashboard",
          file: "src/routes/dashboard/+page.svelte",
          change: "added",
          routeType: "page",
        },
        {
          type: "route-change",
          routeId: "/api/users",
          file: "src/routes/api/users/+server.ts",
          change: "added",
          routeType: "endpoint",
          methods: ["GET", "POST"],
        },
        {
          type: "dependency-change",
          name: "@sveltejs/kit",
          section: "dependencies",
          from: "^1.0.0",
          to: "^2.0.0",
          impact: "major",
        },
      ],
    };

    const json = renderJson(context, {
      mode: "branch",
      base: "main",
      head: "HEAD",
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.stats.totalFindings).toBe(4);
    expect(parsed.stats.findingsByType["file-summary"]).toBe(1);
    expect(parsed.stats.findingsByType["route-change"]).toBe(2);
    expect(parsed.stats.findingsByType["dependency-change"]).toBe(1);
  });

  it("should handle empty findings", () => {
    const context: RenderContext = {
      profile: "auto",
      riskScore: {
        score: 0,
        level: "low",
        evidenceBullets: [],
      },
      findings: [],
    };

    const json = renderJson(context, {
      mode: "all",
      base: null,
      head: null,
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.stats.totalFindings).toBe(0);
    expect(parsed.stats.findingsByType).toEqual({});
  });

  it("should be pretty-printed by default", () => {
    const context = createRenderContext();
    const json = renderJson(context, {
      mode: "branch",
      base: "main",
      head: "HEAD",
    });

    // Check that JSON is formatted with newlines and indentation
    expect(json).toContain("\n");
    expect(json).toContain("  ");
  });
});

// ============================================================================
// Compact Format Tests
// ============================================================================

describe("renderJson - compact format", () => {
  it("should produce minified JSON without whitespace", () => {
    const context = createRenderContext();
    const json = renderJson(context, {
      mode: "branch",
      base: "main",
      head: "HEAD",
      format: "compact",
    });

    // Compact should have no newlines or extra spaces
    expect(json).not.toContain("\n");
    expect(json).not.toContain("  ");
    
    // Should still be valid JSON
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("should produce same data as json format but minified", () => {
    const context = createRenderContext();
    
    const jsonPretty = renderJson(context, {
      mode: "branch",
      base: "main",
      head: "HEAD",
      format: "json",
    });
    
    const jsonCompact = renderJson(context, {
      mode: "branch",
      base: "main",
      head: "HEAD",
      format: "compact",
    });

    const parsedPretty = JSON.parse(jsonPretty);
    const parsedCompact = JSON.parse(jsonCompact);

    // Data should be identical
    expect(parsedCompact).toEqual(parsedPretty);
    
    // But compact should be shorter
    expect(jsonCompact.length).toBeLessThan(jsonPretty.length);
  });
});

// ============================================================================
// All Modes Tests
// ============================================================================

describe("renderJson - different diff modes", () => {
  const context = createRenderContext();

  it("should handle branch mode", () => {
    const json = renderJson(context, {
      mode: "branch",
      base: "develop",
      head: "feature/auth",
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.mode).toBe("branch");
    expect(parsed.base).toBe("develop");
    expect(parsed.head).toBe("feature/auth");
  });

  it("should handle unstaged mode", () => {
    const json = renderJson(context, {
      mode: "unstaged",
      base: null,
      head: null,
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.mode).toBe("unstaged");
    expect(parsed.base).toBeNull();
    expect(parsed.head).toBeNull();
  });

  it("should handle staged mode", () => {
    const json = renderJson(context, {
      mode: "staged",
      base: null,
      head: null,
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.mode).toBe("staged");
    expect(parsed.base).toBeNull();
    expect(parsed.head).toBeNull();
  });

  it("should handle all mode", () => {
    const json = renderJson(context, {
      mode: "all",
      base: null,
      head: null,
    });
    const parsed: EnhancedFactsOutput = JSON.parse(json);

    expect(parsed.mode).toBe("all");
    expect(parsed.base).toBeNull();
    expect(parsed.head).toBeNull();
  });
});
