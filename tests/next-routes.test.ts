/**
 * Tests for Next.js App Router route detection.
 */

import { describe, it, expect } from "bun:test";
import {
  isNextRouteFile,
  getRouteType,
  pathToRouteId,
  detectMethods,
  isMiddlewareFile,
  isNextConfigFile,
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

  it("should detect error and loading files", () => {
    expect(isNextRouteFile("app/error.tsx")).toBe(true);
    expect(isNextRouteFile("app/loading.tsx")).toBe(true);
    expect(isNextRouteFile("app/not-found.tsx")).toBe(true);
  });

  it("should detect route.ts (API routes)", () => {
    expect(isNextRouteFile("app/api/users/route.ts")).toBe(true);
    expect(isNextRouteFile("app/api/auth/[...nextauth]/route.ts")).toBe(true);
    expect(isNextRouteFile("src/app/api/route.ts")).toBe(true);
  });

  it("should support all JS/TS extensions", () => {
    expect(isNextRouteFile("app/page.ts")).toBe(true);
    expect(isNextRouteFile("app/page.jsx")).toBe(true);
    expect(isNextRouteFile("app/page.js")).toBe(true);
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

describe("getRouteType", () => {
  it("should return page for page files", () => {
    expect(getRouteType("app/page.tsx")).toBe("page");
    expect(getRouteType("app/loading.tsx")).toBe("page");
  });

  it("should return layout for layout files", () => {
    expect(getRouteType("app/layout.tsx")).toBe("layout");
  });

  it("should return error for error/not-found files", () => {
    expect(getRouteType("app/error.tsx")).toBe("error");
    expect(getRouteType("app/not-found.tsx")).toBe("error");
  });

  it("should return endpoint for route files", () => {
    expect(getRouteType("app/api/users/route.ts")).toBe("endpoint");
  });

  it("should return unknown for non-route files", () => {
    expect(getRouteType("app/utils.ts")).toBe("unknown");
  });
});

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

  it("should handle API routes", () => {
    expect(pathToRouteId("app/api/users/route.ts")).toBe("/api/users");
    expect(pathToRouteId("app/api/auth/[...nextauth]/route.ts")).toBe("/api/auth/[...nextauth]");
  });

  it("should handle src/app prefix", () => {
    expect(pathToRouteId("src/app/dashboard/page.tsx")).toBe("/dashboard");
    expect(pathToRouteId("src/app/api/users/route.ts")).toBe("/api/users");
  });
});

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

describe("isNextConfigFile", () => {
  it("should detect Next.js config files", () => {
    expect(isNextConfigFile("next.config.js")).toBe(true);
    expect(isNextConfigFile("next.config.mjs")).toBe(true);
    expect(isNextConfigFile("next.config.ts")).toBe(true);
  });

  it("should not match other config files", () => {
    expect(isNextConfigFile("next.config.json")).toBe(false);
    expect(isNextConfigFile("config/next.config.js")).toBe(false);
  });
});

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
});
