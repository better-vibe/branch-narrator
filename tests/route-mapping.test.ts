/**
 * Route detector tests.
 */

import { describe, expect, it } from "bun:test";
import {
  detectMethods,
  getRouteType,
  isRouteFile,
  pathToRouteId,
  routeDetectorAnalyzer,
  routeIdToUrlPath,
} from "../src/analyzers/route-detector.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import {
  createChangeSet,
  createFileChange,
  createFileDiff,
  sampleRouteDiffs,
} from "./fixtures/index.js";

describe("isRouteFile", () => {
  it("should identify route files", () => {
    expect(isRouteFile("src/routes/+page.svelte")).toBe(true);
    expect(isRouteFile("src/routes/about/+page.svelte")).toBe(true);
    expect(isRouteFile("src/routes/api/+server.ts")).toBe(true);
    expect(isRouteFile("src/routes/(app)/+layout.svelte")).toBe(true);
  });

  it("should reject non-route files", () => {
    expect(isRouteFile("src/lib/utils.ts")).toBe(false);
    expect(isRouteFile("src/routes/README.md")).toBe(false);
    expect(isRouteFile("package.json")).toBe(false);
  });
});

describe("getRouteType", () => {
  it("should detect page type", () => {
    expect(getRouteType("src/routes/+page.svelte")).toBe("page");
    expect(getRouteType("src/routes/+page.ts")).toBe("page");
    expect(getRouteType("src/routes/+page.server.ts")).toBe("page");
  });

  it("should detect layout type", () => {
    expect(getRouteType("src/routes/+layout.svelte")).toBe("layout");
    expect(getRouteType("src/routes/+layout.ts")).toBe("layout");
    expect(getRouteType("src/routes/+layout.server.ts")).toBe("layout");
  });

  it("should detect endpoint type", () => {
    expect(getRouteType("src/routes/api/+server.ts")).toBe("endpoint");
  });

  it("should detect error type", () => {
    expect(getRouteType("src/routes/+error.svelte")).toBe("error");
  });
});

describe("pathToRouteId", () => {
  it("should handle root route", () => {
    expect(pathToRouteId("src/routes/+page.svelte")).toBe("/");
  });

  it("should handle nested routes", () => {
    expect(pathToRouteId("src/routes/about/+page.svelte")).toBe("/about");
    expect(pathToRouteId("src/routes/blog/posts/+page.svelte")).toBe(
      "/blog/posts"
    );
  });

  it("should preserve route groups in route ID", () => {
    expect(pathToRouteId("src/routes/(app)/dashboard/+page.svelte")).toBe(
      "/(app)/dashboard"
    );
    expect(pathToRouteId("src/routes/(marketing)/+layout.svelte")).toBe(
      "/(marketing)"
    );
  });

  it("should preserve param notation", () => {
    expect(pathToRouteId("src/routes/blog/[slug]/+page.svelte")).toBe(
      "/blog/[slug]"
    );
    expect(pathToRouteId("src/routes/users/[[id]]/+page.svelte")).toBe(
      "/users/[[id]]"
    );
    expect(pathToRouteId("src/routes/docs/[...rest]/+page.svelte")).toBe(
      "/docs/[...rest]"
    );
  });
});

describe("routeIdToUrlPath", () => {
  it("should remove route groups from URL", () => {
    expect(routeIdToUrlPath("/(app)/dashboard")).toBe("/dashboard");
    expect(routeIdToUrlPath("/(marketing)/about")).toBe("/about");
    expect(routeIdToUrlPath("/(app)/(nested)/page")).toBe("/page");
  });

  it("should preserve params", () => {
    expect(routeIdToUrlPath("/blog/[slug]")).toBe("/blog/[slug]");
    expect(routeIdToUrlPath("/users/[[id]]")).toBe("/users/[[id]]");
  });
});

describe("detectMethods", () => {
  it("should detect HTTP methods from endpoint", () => {
    const methods = detectMethods(sampleRouteDiffs.endpointWithMethods);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
    expect(methods).toHaveLength(2);
  });

  it("should return empty for non-endpoints", () => {
    const methods = detectMethods(sampleRouteDiffs.pageAdded);
    expect(methods).toHaveLength(0);
  });
});

describe("routeDetectorAnalyzer", () => {
  it("should detect added page routes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/routes/dashboard/+page.svelte", "added")],
      diffs: [sampleRouteDiffs.pageAdded],
    });

    const findings = routeDetectorAnalyzer.analyze(changeSet);
    const routeFinding = findings[0] as RouteChangeFinding;

    expect(findings).toHaveLength(1);
    expect(routeFinding.type).toBe("route-change");
    expect(routeFinding.routeId).toBe("/dashboard");
    expect(routeFinding.routeType).toBe("page");
    expect(routeFinding.change).toBe("added");
  });

  it("should detect endpoint with methods", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/routes/api/users/+server.ts", "added")],
      diffs: [sampleRouteDiffs.endpointWithMethods],
    });

    const findings = routeDetectorAnalyzer.analyze(changeSet);
    const routeFinding = findings[0] as RouteChangeFinding;

    expect(routeFinding.routeType).toBe("endpoint");
    expect(routeFinding.methods).toContain("GET");
    expect(routeFinding.methods).toContain("POST");
  });

  it("should detect routes with groups", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/routes/(app)/+layout.svelte", "modified"),
      ],
      diffs: [sampleRouteDiffs.layoutModified],
    });

    const findings = routeDetectorAnalyzer.analyze(changeSet);
    const routeFinding = findings[0] as RouteChangeFinding;

    expect(routeFinding.routeId).toBe("/(app)");
    expect(routeFinding.routeType).toBe("layout");
  });

  it("should detect routes with params", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/routes/blog/[slug]/+page.server.ts", "added"),
      ],
      diffs: [sampleRouteDiffs.nestedRoute],
    });

    const findings = routeDetectorAnalyzer.analyze(changeSet);
    const routeFinding = findings[0] as RouteChangeFinding;

    expect(routeFinding.routeId).toBe("/blog/[slug]");
  });
});

