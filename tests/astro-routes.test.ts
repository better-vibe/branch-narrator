/**
 * Astro routes analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  astroRoutesAnalyzer,
  isAstroPage,
  isAstroEndpoint,
  isAstroLayout,
  isAstroContent,
  isAstroConfig,
  astroFileToRoute,
} from "../src/analyzers/astro-routes.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange, createFileDiff } from "./fixtures/index.js";

describe("isAstroPage", () => {
  it("should identify Astro page files", () => {
    expect(isAstroPage("src/pages/index.astro")).toBe(true);
    expect(isAstroPage("src/pages/about.astro")).toBe(true);
    expect(isAstroPage("src/pages/blog/[slug].astro")).toBe(true);
  });

  it("should identify Markdown pages", () => {
    expect(isAstroPage("src/pages/about.md")).toBe(true);
    expect(isAstroPage("src/pages/blog/post.mdx")).toBe(true);
  });

  it("should identify API endpoints", () => {
    expect(isAstroPage("src/pages/api/users.ts")).toBe(true);
    expect(isAstroPage("src/pages/api/auth.js")).toBe(true);
  });

  it("should reject non-page files", () => {
    expect(isAstroPage("src/components/Button.astro")).toBe(false);
    expect(isAstroPage("pages/index.astro")).toBe(false);
  });
});

describe("isAstroEndpoint", () => {
  it("should identify API endpoints", () => {
    expect(isAstroEndpoint("src/pages/api/users.ts")).toBe(true);
    expect(isAstroEndpoint("src/pages/api/auth.js")).toBe(true);
  });

  it("should reject Astro pages", () => {
    expect(isAstroEndpoint("src/pages/index.astro")).toBe(false);
    expect(isAstroEndpoint("src/pages/about.md")).toBe(false);
  });
});

describe("isAstroLayout", () => {
  it("should identify Astro layouts", () => {
    expect(isAstroLayout("src/layouts/BaseLayout.astro")).toBe(true);
    expect(isAstroLayout("src/layouts/BlogLayout.astro")).toBe(true);
  });

  it("should reject non-layout files", () => {
    expect(isAstroLayout("src/pages/layout.astro")).toBe(false);
    expect(isAstroLayout("src/layouts/utils.ts")).toBe(false);
  });
});

describe("isAstroContent", () => {
  it("should identify Astro content files", () => {
    expect(isAstroContent("src/content/blog/post-1.md")).toBe(true);
    expect(isAstroContent("src/content/docs/intro.mdx")).toBe(true);
    expect(isAstroContent("src/content/authors/jane.json")).toBe(true);
  });

  it("should reject non-content files", () => {
    expect(isAstroContent("src/pages/blog/post.md")).toBe(false);
    expect(isAstroContent("content/blog/post.md")).toBe(false);
  });
});

describe("isAstroConfig", () => {
  it("should identify Astro config files", () => {
    expect(isAstroConfig("astro.config.mjs")).toBe(true);
    expect(isAstroConfig("astro.config.ts")).toBe(true);
    expect(isAstroConfig("astro.config.js")).toBe(true);
  });

  it("should reject non-config files", () => {
    expect(isAstroConfig("vite.config.ts")).toBe(false);
    expect(isAstroConfig("astro.config.json")).toBe(false);
  });
});

describe("astroFileToRoute", () => {
  it("should convert index.astro to /", () => {
    expect(astroFileToRoute("src/pages/index.astro")).toBe("/");
  });

  it("should convert simple paths", () => {
    expect(astroFileToRoute("src/pages/about.astro")).toBe("/about");
    expect(astroFileToRoute("src/pages/contact.md")).toBe("/contact");
  });

  it("should convert nested paths", () => {
    expect(astroFileToRoute("src/pages/blog/posts.astro")).toBe("/blog/posts");
    expect(astroFileToRoute("src/pages/docs/getting-started.mdx")).toBe("/docs/getting-started");
  });

  it("should convert dynamic segments", () => {
    expect(astroFileToRoute("src/pages/blog/[slug].astro")).toBe("/blog/:slug");
    expect(astroFileToRoute("src/pages/users/[id]/profile.astro")).toBe("/users/:id/profile");
  });

  it("should convert catch-all segments", () => {
    expect(astroFileToRoute("src/pages/[...slug].astro")).toBe("/:slug*");
    expect(astroFileToRoute("src/pages/docs/[...path].astro")).toBe("/docs/:path*");
  });

  it("should handle nested index files", () => {
    expect(astroFileToRoute("src/pages/blog/index.astro")).toBe("/blog");
  });
});

describe("astroRoutesAnalyzer", () => {
  it("should detect Astro page additions", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/pages/dashboard.astro", "added")],
      diffs: [
        createFileDiff(
          "src/pages/dashboard.astro",
          ["---", "const title = 'Dashboard';", "---", "<h1>{title}</h1>"],
          [],
          "added"
        ),
      ],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as RouteChangeFinding;
    expect(finding.type).toBe("route-change");
    expect(finding.routeId).toBe("/dashboard");
    expect(finding.routeType).toBe("page");
    expect(finding.change).toBe("added");
  });

  it("should detect Astro API endpoint with methods", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/pages/api/users.ts", "added")],
      diffs: [
        createFileDiff(
          "src/pages/api/users.ts",
          [
            "export const GET = async () => {",
            "  return new Response(JSON.stringify([]));",
            "};",
            "export const POST = async ({ request }) => {",
            "  return new Response('ok');",
            "};",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeType).toBe("endpoint");
    expect(finding.methods).toContain("GET");
    expect(finding.methods).toContain("POST");
  });

  it("should detect Astro layout changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/layouts/BaseLayout.astro", "modified")],
      diffs: [
        createFileDiff(
          "src/layouts/BaseLayout.astro",
          ["<slot />"],
          [],
          "modified"
        ),
      ],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeType).toBe("layout");
  });

  it("should detect Astro config changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("astro.config.mjs", "modified")],
      diffs: [
        createFileDiff(
          "astro.config.mjs",
          ["export default defineConfig({ integrations: [react()] });"],
          [],
          "modified"
        ),
      ],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeId).toBe("astro-config");
  });

  it("should detect content collection changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/content/blog/new-post.md", "added")],
      diffs: [
        createFileDiff(
          "src/content/blog/new-post.md",
          ["---", "title: New Post", "---", "Content here"],
          [],
          "added"
        ),
      ],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeId).toBe("/content/blog/new-post.md");
    expect(finding.tags).toContain("content-collection");
  });

  it("should detect error pages", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/pages/404.astro", "added")],
      diffs: [
        createFileDiff(
          "src/pages/404.astro",
          ["<h1>Not Found</h1>"],
          [],
          "added"
        ),
      ],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeType).toBe("error");
  });

  it("should return empty for non-route files", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/components/Button.astro", "added")],
    });

    const findings = astroRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });
});
