/**
 * Tests for Next.js App Router route detection.
 */

import { describe, it, expect } from "bun:test";
import {
  isNextRouteFile,
  isNextMetadataFile,
  getRouteType,
  pathToRouteId,
  detectMethods,
  hasServerActions,
  hasGenerateStaticParams,
  hasMetadataExport,
  isMiddlewareFile,
  isInstrumentationFile,
  isNextConfigFile,
  detectConfigFeatures,
  hasParallelSegment,
  extractParallelSlots,
  hasInterceptingSegment,
  nextRoutesAnalyzer,
} from "../src/analyzers/next-routes.js";
import type { ChangeSet, FileDiff, Finding } from "../src/core/types.js";

// Helper to create a minimal ChangeSet
function createChangeSet(
  files: Array<{ path: string; status: "added" | "modified" | "deleted" }>,
  diffs: FileDiff[] = []
): ChangeSet {
  return {
    base: "main",
    head: "HEAD",
    files: files.map(f => ({ path: f.path, status: f.status })),
    diffs,
  };
}

// Helper to create a FileDiff
function createFileDiff(
  path: string,
  additions: string[] = [],
  status: "added" | "modified" | "deleted" = "modified"
): FileDiff {
  return {
    path,
    status,
    hunks: additions.length > 0 ? [{
      oldStart: 1,
      oldLines: 0,
      newStart: 1,
      newLines: additions.length,
      content: additions.map(a => `+${a}`).join("\n"),
      additions: additions.map(a => `+${a}`),
      deletions: [],
    }] : [],
  };
}

// ============================================================================
// isNextRouteFile
// ============================================================================

describe("isNextRouteFile", () => {
  it("should detect page.tsx in app directory", () => {
    expect(isNextRouteFile("app/page.tsx")).toBe(true);
    expect(isNextRouteFile("app/dashboard/page.tsx")).toBe(true);
    expect(isNextRouteFile("app/dashboard/[id]/page.tsx")).toBe(true);
  });

  it("should detect page files in src/app directory", () => {
    expect(isNextRouteFile("src/app/page.tsx")).toBe(true);
    expect(isNextRouteFile("src/app/dashboard/page.tsx")).toBe(true);
  });

  it("should detect layout files", () => {
    expect(isNextRouteFile("app/layout.tsx")).toBe(true);
    expect(isNextRouteFile("app/dashboard/layout.tsx")).toBe(true);
    expect(isNextRouteFile("src/app/layout.tsx")).toBe(true);
  });

  it("should detect template files", () => {
    expect(isNextRouteFile("app/template.tsx")).toBe(true);
    expect(isNextRouteFile("app/dashboard/template.tsx")).toBe(true);
    expect(isNextRouteFile("src/app/template.ts")).toBe(true);
  });

  it("should detect default files (parallel route fallback)", () => {
    expect(isNextRouteFile("app/default.tsx")).toBe(true);
    expect(isNextRouteFile("app/@modal/default.tsx")).toBe(true);
    expect(isNextRouteFile("src/app/default.jsx")).toBe(true);
  });

  it("should detect error and loading files", () => {
    expect(isNextRouteFile("app/error.tsx")).toBe(true);
    expect(isNextRouteFile("app/loading.tsx")).toBe(true);
    expect(isNextRouteFile("app/not-found.tsx")).toBe(true);
  });

  it("should detect global-error files", () => {
    expect(isNextRouteFile("app/global-error.tsx")).toBe(true);
    expect(isNextRouteFile("app/global-error.jsx")).toBe(true);
    expect(isNextRouteFile("app/global-error.ts")).toBe(true);
  });

  it("should detect route.ts (API routes)", () => {
    expect(isNextRouteFile("app/api/users/route.ts")).toBe(true);
    expect(isNextRouteFile("app/api/auth/[...nextauth]/route.ts")).toBe(true);
    expect(isNextRouteFile("src/app/api/route.ts")).toBe(true);
  });

  it("should support all JS/TS extensions for all file types", () => {
    for (const ext of ["tsx", "ts", "jsx", "js"]) {
      expect(isNextRouteFile(`app/page.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/layout.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/template.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/default.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/loading.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/error.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/global-error.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/not-found.${ext}`)).toBe(true);
      expect(isNextRouteFile(`app/api/route.${ext}`)).toBe(true);
    }
  });

  it("should not match files outside app directory", () => {
    expect(isNextRouteFile("pages/index.tsx")).toBe(false);
    expect(isNextRouteFile("components/page.tsx")).toBe(false);
    expect(isNextRouteFile("lib/page.tsx")).toBe(false);
  });

  it("should not match non-route files", () => {
    expect(isNextRouteFile("app/utils.ts")).toBe(false);
    expect(isNextRouteFile("app/components/Button.tsx")).toBe(false);
  });
});

// ============================================================================
// isNextMetadataFile
// ============================================================================

describe("isNextMetadataFile", () => {
  it("should detect SEO metadata files", () => {
    expect(isNextMetadataFile("app/sitemap.ts")).toBe(true);
    expect(isNextMetadataFile("app/robots.ts")).toBe(true);
    expect(isNextMetadataFile("app/manifest.ts")).toBe(true);
  });

  it("should detect opengraph and twitter image files", () => {
    expect(isNextMetadataFile("app/opengraph-image.tsx")).toBe(true);
    expect(isNextMetadataFile("app/twitter-image.tsx")).toBe(true);
    expect(isNextMetadataFile("app/opengraph-image.png")).toBe(true);
    expect(isNextMetadataFile("app/twitter-image.jpg")).toBe(true);
  });

  it("should detect icon files", () => {
    expect(isNextMetadataFile("app/icon.tsx")).toBe(true);
    expect(isNextMetadataFile("app/icon.png")).toBe(true);
    expect(isNextMetadataFile("app/icon.ico")).toBe(true);
    expect(isNextMetadataFile("app/apple-icon.tsx")).toBe(true);
    expect(isNextMetadataFile("app/apple-icon.png")).toBe(true);
  });

  it("should detect metadata files in nested routes", () => {
    expect(isNextMetadataFile("app/blog/opengraph-image.tsx")).toBe(true);
    expect(isNextMetadataFile("src/app/products/sitemap.ts")).toBe(true);
  });

  it("should require app/ prefix", () => {
    expect(isNextMetadataFile("sitemap.ts")).toBe(false);
    expect(isNextMetadataFile("public/robots.txt")).toBe(false);
  });
});

// ============================================================================
// getRouteType
// ============================================================================

describe("getRouteType", () => {
  it("should return page for page files", () => {
    expect(getRouteType("app/page.tsx")).toBe("page");
  });

  it("should return loading for loading files", () => {
    expect(getRouteType("app/loading.tsx")).toBe("loading");
  });

  it("should return template for template files", () => {
    expect(getRouteType("app/template.tsx")).toBe("template");
  });

  it("should return default for default files", () => {
    expect(getRouteType("app/default.tsx")).toBe("default");
  });

  it("should return layout for layout files", () => {
    expect(getRouteType("app/layout.tsx")).toBe("layout");
  });

  it("should return error for error/not-found/global-error files", () => {
    expect(getRouteType("app/error.tsx")).toBe("error");
    expect(getRouteType("app/not-found.tsx")).toBe("error");
    expect(getRouteType("app/global-error.tsx")).toBe("error");
  });

  it("should return endpoint for route files", () => {
    expect(getRouteType("app/api/users/route.ts")).toBe("endpoint");
  });

  it("should return unknown for non-route files", () => {
    expect(getRouteType("app/utils.ts")).toBe("unknown");
  });
});

// ============================================================================
// pathToRouteId
// ============================================================================

describe("pathToRouteId", () => {
  it("should convert root page to /", () => {
    expect(pathToRouteId("app/page.tsx")).toBe("/");
    expect(pathToRouteId("src/app/page.tsx")).toBe("/");
  });

  it("should convert nested routes", () => {
    expect(pathToRouteId("app/dashboard/page.tsx")).toBe("/dashboard");
    expect(pathToRouteId("app/dashboard/settings/page.tsx")).toBe("/dashboard/settings");
  });

  it("should handle dynamic segments", () => {
    expect(pathToRouteId("app/blog/[slug]/page.tsx")).toBe("/blog/[slug]");
    expect(pathToRouteId("app/shop/[...slug]/page.tsx")).toBe("/shop/[...slug]");
    expect(pathToRouteId("app/docs/[[...slug]]/page.tsx")).toBe("/docs/[[...slug]]");
  });

  it("should remove route groups", () => {
    expect(pathToRouteId("app/(marketing)/about/page.tsx")).toBe("/about");
    expect(pathToRouteId("app/(auth)/login/page.tsx")).toBe("/login");
    expect(pathToRouteId("app/(dashboard)/settings/page.tsx")).toBe("/settings");
  });

  it("should remove multiple nested route groups", () => {
    expect(pathToRouteId("app/(shop)/(checkout)/payment/page.tsx")).toBe("/payment");
  });

  it("should handle API routes", () => {
    expect(pathToRouteId("app/api/users/route.ts")).toBe("/api/users");
    expect(pathToRouteId("app/api/auth/[...nextauth]/route.ts")).toBe("/api/auth/[...nextauth]");
  });

  it("should handle src/app prefix", () => {
    expect(pathToRouteId("src/app/dashboard/page.tsx")).toBe("/dashboard");
    expect(pathToRouteId("src/app/api/users/route.ts")).toBe("/api/users");
  });

  it("should remove parallel route slots from route ID", () => {
    expect(pathToRouteId("app/@modal/photo/page.tsx")).toBe("/photo");
    expect(pathToRouteId("app/dashboard/@analytics/page.tsx")).toBe("/dashboard");
    expect(pathToRouteId("app/@sidebar/@main/page.tsx")).toBe("/");
  });

  it("should preserve intercepting route segments", () => {
    expect(pathToRouteId("app/(.)photo/page.tsx")).toBe("/(.)photo");
    expect(pathToRouteId("app/(..)photo/page.tsx")).toBe("/(..)photo");
    expect(pathToRouteId("app/(...)photo/page.tsx")).toBe("/(...)photo");
  });
});

// ============================================================================
// detectMethods
// ============================================================================

describe("detectMethods", () => {
  it("should detect exported HTTP methods", () => {
    const diff = createFileDiff("app/api/users/route.ts", [
      "export async function GET(request: Request) {",
      "  return Response.json({ users: [] });",
      "}",
      "",
      "export async function POST(request: Request) {",
      "  const body = await request.json();",
      "  return Response.json({ success: true });",
      "}",
    ]);

    const methods = detectMethods(diff);
    expect(methods).toEqual(["GET", "POST"]);
  });

  it("should detect sync functions", () => {
    const diff = createFileDiff("app/api/health/route.ts", [
      "export function GET() {",
      "  return Response.json({ status: 'ok' });",
      "}",
    ]);

    const methods = detectMethods(diff);
    expect(methods).toEqual(["GET"]);
  });

  it("should detect all HTTP methods", () => {
    const diff = createFileDiff("app/api/route.ts", [
      "export function GET() {}",
      "export function POST() {}",
      "export function PUT() {}",
      "export function PATCH() {}",
      "export function DELETE() {}",
      "export function HEAD() {}",
      "export function OPTIONS() {}",
    ]);

    const methods = detectMethods(diff);
    expect(methods).toEqual(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
  });

  it("should return empty array for non-route files", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export default function Page() {",
      "  return <div>Hello</div>;",
      "}",
    ]);

    const methods = detectMethods(diff);
    expect(methods).toEqual([]);
  });
});

// ============================================================================
// Server Actions / generateStaticParams / generateMetadata
// ============================================================================

describe("hasServerActions", () => {
  it("should detect 'use server' directive", () => {
    const diff = createFileDiff("app/actions.ts", [
      '"use server"',
      "",
      "export async function createUser() {",
      "  // ...",
      "}",
    ]);
    expect(hasServerActions(diff)).toBe(true);
  });

  it("should detect single-quoted directive", () => {
    const diff = createFileDiff("app/actions.ts", [
      "'use server'",
    ]);
    expect(hasServerActions(diff)).toBe(true);
  });

  it("should return false when no directive", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export default function Page() { return null; }",
    ]);
    expect(hasServerActions(diff)).toBe(false);
  });
});

describe("hasGenerateStaticParams", () => {
  it("should detect generateStaticParams export", () => {
    const diff = createFileDiff("app/blog/[slug]/page.tsx", [
      "export async function generateStaticParams() {",
      "  return [{ slug: 'hello' }];",
      "}",
    ]);
    expect(hasGenerateStaticParams(diff)).toBe(true);
  });

  it("should detect sync generateStaticParams", () => {
    const diff = createFileDiff("app/blog/[slug]/page.tsx", [
      "export function generateStaticParams() {",
      "  return [{ slug: 'hello' }];",
      "}",
    ]);
    expect(hasGenerateStaticParams(diff)).toBe(true);
  });

  it("should return false when not present", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export default function Page() { return null; }",
    ]);
    expect(hasGenerateStaticParams(diff)).toBe(false);
  });
});

describe("hasMetadataExport", () => {
  it("should detect generateMetadata function export", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export async function generateMetadata() {",
      "  return { title: 'Hello' };",
      "}",
    ]);
    expect(hasMetadataExport(diff)).toBe(true);
  });

  it("should detect metadata const export", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export const metadata = {",
      "  title: 'Hello',",
      "};",
    ]);
    expect(hasMetadataExport(diff)).toBe(true);
  });

  it("should return false when not present", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export default function Page() { return null; }",
    ]);
    expect(hasMetadataExport(diff)).toBe(false);
  });
});

// ============================================================================
// isMiddlewareFile
// ============================================================================

describe("isMiddlewareFile", () => {
  it("should detect middleware.ts at root", () => {
    expect(isMiddlewareFile("middleware.ts")).toBe(true);
    expect(isMiddlewareFile("middleware.js")).toBe(true);
  });

  it("should detect middleware in src directory", () => {
    expect(isMiddlewareFile("src/middleware.ts")).toBe(true);
    expect(isMiddlewareFile("src/middleware.js")).toBe(true);
  });

  it("should not match other files", () => {
    expect(isMiddlewareFile("app/middleware.ts")).toBe(false);
    expect(isMiddlewareFile("lib/middleware.ts")).toBe(false);
  });
});

// ============================================================================
// isInstrumentationFile
// ============================================================================

describe("isInstrumentationFile", () => {
  it("should detect instrumentation.ts at root", () => {
    expect(isInstrumentationFile("instrumentation.ts")).toBe(true);
    expect(isInstrumentationFile("instrumentation.js")).toBe(true);
  });

  it("should detect instrumentation in src directory", () => {
    expect(isInstrumentationFile("src/instrumentation.ts")).toBe(true);
    expect(isInstrumentationFile("src/instrumentation.js")).toBe(true);
  });

  it("should not match other files", () => {
    expect(isInstrumentationFile("app/instrumentation.ts")).toBe(false);
    expect(isInstrumentationFile("lib/instrumentation.ts")).toBe(false);
  });
});

// ============================================================================
// isNextConfigFile
// ============================================================================

describe("isNextConfigFile", () => {
  it("should detect Next.js config files", () => {
    expect(isNextConfigFile("next.config.js")).toBe(true);
    expect(isNextConfigFile("next.config.mjs")).toBe(true);
    expect(isNextConfigFile("next.config.ts")).toBe(true);
    expect(isNextConfigFile("next.config.cjs")).toBe(true);
  });

  it("should not match other config files", () => {
    expect(isNextConfigFile("next.config.json")).toBe(false);
    expect(isNextConfigFile("config/next.config.js")).toBe(false);
  });
});

// ============================================================================
// detectConfigFeatures
// ============================================================================

describe("detectConfigFeatures", () => {
  it("should detect rewrites and redirects", () => {
    const diff = createFileDiff("next.config.ts", [
      "const config = {",
      "  async rewrites() {",
      "    return [{ source: '/old', destination: '/new' }];",
      "  },",
      "  async redirects() {",
      "    return [{ source: '/gone', destination: '/', permanent: true }];",
      "  },",
      "};",
    ]);
    const features = detectConfigFeatures(diff);
    expect(features).toContain("rewrites");
    expect(features).toContain("redirects");
  });

  it("should detect experimental features", () => {
    const diff = createFileDiff("next.config.ts", [
      "const config = {",
      "  experimental: {",
      "    ppr: true,",
      "    dynamicIO: true,",
      "  },",
      "};",
    ]);
    const features = detectConfigFeatures(diff);
    expect(features).toContain("experimental");
    expect(features).toContain("ppr");
    expect(features).toContain("dynamicIO");
  });

  it("should detect output and images config", () => {
    const diff = createFileDiff("next.config.mjs", [
      "export default {",
      "  output: 'standalone',",
      "  images: { remotePatterns: [] },",
      "};",
    ]);
    const features = detectConfigFeatures(diff);
    expect(features).toContain("output");
    expect(features).toContain("images");
  });

  it("should detect webpack and turbopack", () => {
    const diff = createFileDiff("next.config.js", [
      "module.exports = {",
      "  webpack: (config) => config,",
      "  turbopack: {},",
      "};",
    ]);
    const features = detectConfigFeatures(diff);
    expect(features).toContain("webpack");
    expect(features).toContain("turbopack");
  });

  it("should return empty for no-feature diff", () => {
    const diff = createFileDiff("next.config.js", [
      "module.exports = {};",
    ]);
    const features = detectConfigFeatures(diff);
    expect(features).toEqual([]);
  });
});

// ============================================================================
// Parallel routes
// ============================================================================

describe("hasParallelSegment", () => {
  it("should detect parallel route segments", () => {
    expect(hasParallelSegment("app/@modal/page.tsx")).toBe(true);
    expect(hasParallelSegment("app/@sidebar/page.tsx")).toBe(true);
    expect(hasParallelSegment("app/dashboard/@analytics/page.tsx")).toBe(true);
  });

  it("should not match non-parallel paths", () => {
    expect(hasParallelSegment("app/page.tsx")).toBe(false);
    expect(hasParallelSegment("app/dashboard/page.tsx")).toBe(false);
  });
});

describe("extractParallelSlots", () => {
  it("should extract slot names", () => {
    expect(extractParallelSlots("app/@modal/page.tsx")).toEqual(["modal"]);
    expect(extractParallelSlots("app/@sidebar/@main/page.tsx")).toEqual(["sidebar", "main"]);
  });

  it("should return empty for non-parallel paths", () => {
    expect(extractParallelSlots("app/page.tsx")).toEqual([]);
  });
});

// ============================================================================
// Intercepting routes
// ============================================================================

describe("hasInterceptingSegment", () => {
  it("should detect (.) intercepting routes", () => {
    expect(hasInterceptingSegment("app/(.)photo/page.tsx")).toBe(true);
  });

  it("should detect (..) intercepting routes", () => {
    expect(hasInterceptingSegment("app/(..)photo/page.tsx")).toBe(true);
  });

  it("should detect (...) intercepting routes", () => {
    expect(hasInterceptingSegment("app/(...)photo/page.tsx")).toBe(true);
  });

  it("should not match route groups", () => {
    expect(hasInterceptingSegment("app/(marketing)/page.tsx")).toBe(false);
  });
});

// ============================================================================
// nextRoutesAnalyzer
// ============================================================================

describe("nextRoutesAnalyzer", () => {
  it("should detect page changes", () => {
    const changeSet = createChangeSet([
      { path: "app/dashboard/page.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("route-change");
    if (findings[0].type === "route-change") {
      expect(findings[0].routeId).toBe("/dashboard");
      expect(findings[0].routeType).toBe("page");
      expect(findings[0].change).toBe("added");
    }
  });

  it("should detect layout changes", () => {
    const changeSet = createChangeSet([
      { path: "app/layout.tsx", status: "modified" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("route-change");
    if (findings[0].type === "route-change") {
      expect(findings[0].routeId).toBe("/");
      expect(findings[0].routeType).toBe("layout");
    }
  });

  it("should detect template changes", () => {
    const changeSet = createChangeSet([
      { path: "app/dashboard/template.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    if (findings[0].type === "route-change") {
      expect(findings[0].routeType).toBe("template");
    }
  });

  it("should detect loading changes with correct type", () => {
    const changeSet = createChangeSet([
      { path: "app/dashboard/loading.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    if (findings[0].type === "route-change") {
      expect(findings[0].routeType).toBe("loading");
    }
  });

  it("should detect global-error changes", () => {
    const changeSet = createChangeSet([
      { path: "app/global-error.tsx", status: "modified" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    if (findings[0].type === "route-change") {
      expect(findings[0].routeType).toBe("error");
    }
  });

  it("should detect API route changes with methods", () => {
    const diff = createFileDiff("app/api/users/route.ts", [
      "export async function GET() {",
      "  return Response.json({ users: [] });",
      "}",
      "export async function POST() {",
      "  return Response.json({ created: true });",
      "}",
    ], "added");

    const changeSet = createChangeSet(
      [{ path: "app/api/users/route.ts", status: "added" }],
      [diff]
    );

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("route-change");
    if (findings[0].type === "route-change") {
      expect(findings[0].routeId).toBe("/api/users");
      expect(findings[0].routeType).toBe("endpoint");
      expect(findings[0].methods).toEqual(["GET", "POST"]);
    }
  });

  it("should detect middleware changes as security files", () => {
    const changeSet = createChangeSet([
      { path: "middleware.ts", status: "modified" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("security-file");
    if (findings[0].type === "security-file") {
      expect(findings[0].files).toContain("middleware.ts");
      expect(findings[0].reasons).toContain("middleware");
    }
  });

  it("should detect instrumentation changes as security files", () => {
    const changeSet = createChangeSet([
      { path: "instrumentation.ts", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("security-file");
    if (findings[0].type === "security-file") {
      expect(findings[0].files).toContain("instrumentation.ts");
    }
  });

  it("should detect next.config changes", () => {
    const diff = createFileDiff("next.config.ts", [
      "const config = {",
      "  experimental: {",
      "    ppr: true,",
      "  },",
      "  images: { remotePatterns: [] },",
      "};",
    ], "modified");

    const changeSet = createChangeSet(
      [{ path: "next.config.ts", status: "modified" }],
      [diff]
    );

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("next-config-change");
    if (findings[0].type === "next-config-change") {
      expect(findings[0].file).toBe("next.config.ts");
      expect(findings[0].detectedFeatures).toContain("experimental");
      expect(findings[0].detectedFeatures).toContain("ppr");
      expect(findings[0].detectedFeatures).toContain("images");
    }
  });

  it("should detect next.config.cjs changes", () => {
    const changeSet = createChangeSet([
      { path: "next.config.cjs", status: "modified" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("next-config-change");
  });

  it("should detect metadata file changes", () => {
    const changeSet = createChangeSet([
      { path: "app/sitemap.ts", status: "added" },
      { path: "app/robots.ts", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    const routeFindings = findings.filter(f => f.type === "route-change");
    expect(routeFindings.length).toBe(2);
    for (const f of routeFindings) {
      if (f.type === "route-change") {
        expect(f.routeType).toBe("metadata");
      }
    }
  });

  it("should handle multiple route changes", () => {
    const changeSet = createChangeSet([
      { path: "app/page.tsx", status: "modified" },
      { path: "app/about/page.tsx", status: "added" },
      { path: "app/dashboard/layout.tsx", status: "modified" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    const routeFindings = findings.filter(f => f.type === "route-change");
    expect(routeFindings.length).toBe(3);
  });

  it("should handle route groups correctly", () => {
    const changeSet = createChangeSet([
      { path: "app/(marketing)/about/page.tsx", status: "added" },
      { path: "app/(auth)/login/page.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    const routeIds = findings
      .filter(f => f.type === "route-change")
      .map(f => (f as any).routeId);

    expect(routeIds).toContain("/about");
    expect(routeIds).toContain("/login");
  });

  it("should handle src/app directory", () => {
    const changeSet = createChangeSet([
      { path: "src/app/dashboard/page.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe("route-change");
    if (findings[0].type === "route-change") {
      expect(findings[0].routeId).toBe("/dashboard");
    }
  });

  it("should tag parallel route files", () => {
    const changeSet = createChangeSet([
      { path: "app/@modal/photo/page.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    if (findings[0].type === "route-change") {
      expect(findings[0].routeId).toBe("/photo");
      expect(findings[0].tags).toContain("parallel:@modal");
    }
  });

  it("should tag intercepting route files", () => {
    const changeSet = createChangeSet([
      { path: "app/(.)photo/page.tsx", status: "added" },
    ]);

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    expect(findings.length).toBe(1);
    if (findings[0].type === "route-change") {
      expect(findings[0].tags).toContain("intercepting-route");
    }
  });

  it("should tag Server Actions", () => {
    const diff = createFileDiff("app/actions/page.tsx", [
      '"use server"',
      "export async function createItem() {}",
    ], "added");

    const changeSet = createChangeSet(
      [{ path: "app/actions/page.tsx", status: "added" }],
      [diff]
    );

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];
    const routeFindings = findings.filter(f => f.type === "route-change");

    expect(routeFindings.length).toBe(1);
    if (routeFindings[0].type === "route-change") {
      expect(routeFindings[0].tags).toContain("server-action");
    }
  });

  it("should tag generateStaticParams", () => {
    const diff = createFileDiff("app/blog/[slug]/page.tsx", [
      "export async function generateStaticParams() {",
      "  return [{ slug: 'hello' }];",
      "}",
      "export default function Page() { return null; }",
    ], "added");

    const changeSet = createChangeSet(
      [{ path: "app/blog/[slug]/page.tsx", status: "added" }],
      [diff]
    );

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];
    const routeFindings = findings.filter(f => f.type === "route-change");

    expect(routeFindings.length).toBe(1);
    if (routeFindings[0].type === "route-change") {
      expect(routeFindings[0].tags).toContain("static-params");
    }
  });

  it("should tag metadata exports", () => {
    const diff = createFileDiff("app/page.tsx", [
      "export const metadata = { title: 'Home' };",
      "export default function Page() { return null; }",
    ], "added");

    const changeSet = createChangeSet(
      [{ path: "app/page.tsx", status: "added" }],
      [diff]
    );

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];
    const routeFindings = findings.filter(f => f.type === "route-change");

    expect(routeFindings.length).toBe(1);
    if (routeFindings[0].type === "route-change") {
      expect(routeFindings[0].tags).toContain("has-metadata");
    }
  });

  it("should handle combined middleware + routes + config", () => {
    const configDiff = createFileDiff("next.config.ts", [
      "export default { experimental: { ppr: true } };",
    ], "modified");

    const changeSet = createChangeSet(
      [
        { path: "middleware.ts", status: "modified" },
        { path: "app/dashboard/page.tsx", status: "added" },
        { path: "next.config.ts", status: "modified" },
      ],
      [configDiff]
    );

    const findings = nextRoutesAnalyzer.analyze(changeSet) as Finding[];

    const types = findings.map(f => f.type);
    expect(types).toContain("security-file");
    expect(types).toContain("route-change");
    expect(types).toContain("next-config-change");
  });
});
