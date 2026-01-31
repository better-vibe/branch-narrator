/**
 * Tests for the Next.js RSC (React Server Components) boundary analyzer.
 */

import { describe, it, expect } from "bun:test";
import { rscBoundaryAnalyzer, isRSCFile } from "../src/analyzers/rsc-boundary.js";
import type { ChangeSet, FileDiff, RSCBoundaryFinding } from "../src/core/types.js";

function createChangeSet(diffs: FileDiff[], packageJson?: Record<string, unknown>): ChangeSet {
  return {
    base: "main",
    head: "feature",
    files: diffs.map((d) => ({
      path: d.path,
      status: d.status,
      oldPath: d.oldPath,
    })),
    diffs,
    headPackageJson: packageJson,
  };
}

function createFileDiff(
  path: string,
  content: string,
  status: "added" | "modified" | "deleted" = "modified"
): FileDiff {
  return {
    path,
    status,
    hunks: [
      {
        oldStart: 1,
        oldLines: 0,
        newStart: 1,
        newLines: content.split("\n").length,
        content,
        additions: content.split("\n"),
        deletions: [],
      },
    ],
  };
}

describe("rscBoundaryAnalyzer", () => {
  describe("file pattern detection", () => {
    it("detects files in app directory", () => {
      expect(isRSCFile("app/page.tsx")).toBe(true);
      expect(isRSCFile("src/app/layout.tsx")).toBe(true);
      expect(isRSCFile("app/blog/[slug]/page.tsx")).toBe(true);
    });

    it("detects .server files", () => {
      expect(isRSCFile("components/User.server.tsx")).toBe(true);
      expect(isRSCFile("lib/data.server.ts")).toBe(true);
    });

    it("detects .client files", () => {
      expect(isRSCFile("components/Button.client.tsx")).toBe(true);
      expect(isRSCFile("hooks/useAuth.client.ts")).toBe(true);
    });

    it("rejects non-RSC files", () => {
      expect(isRSCFile("src/components/Button.tsx")).toBe(false);
      expect(isRSCFile("pages/index.tsx")).toBe(false);
      expect(isRSCFile("lib/utils.ts")).toBe(false);
    });
  });

  describe("dependency detection", () => {
    it("skips projects without Next.js dependency", async () => {
      const content = `"use client";
export default function Button() { return <button>Click</button>; }`;
      const diff = createFileDiff("app/Button.tsx", content);
      const changeSet = createChangeSet([diff], {
        dependencies: {},
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("processes files with Next.js dependency", async () => {
      const content = `"use client";
export default function Button() { return <button>Click</button>; }`;
      const diff = createFileDiff("app/Button.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe("rsc-boundary");
    });
  });

  describe("directive detection", () => {
    it("detects use client additions", async () => {
      const content = `"use client";

import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}`;
      const diff = createFileDiff("app/Counter.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.boundaryType).toBe("client");
      expect(finding.directiveChange.to).toBe("use client");
      expect(finding.directiveChange.from).toBeNull();
    });

    it("detects use server additions", async () => {
      const content = `"use server";

export async function createUser(formData: FormData) {
  "use server";
  await db.user.create(formData);
}`;
      const diff = createFileDiff("app/actions.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.boundaryType).toBe("server");
      expect(finding.directiveChange.to).toBe("use server");
    });

    it("detects directive changes", async () => {
      const baseContent = `"use client";

export default function Component() {
  return <div>Client</div>;
}`;
      const headContent = `"use server";

export default async function Component() {
  const data = await fetchData();
  return <div>{data}</div>;
}`;
      const diff: FileDiff = {
        path: "app/Component.tsx",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 4,
            newStart: 1,
            newLines: 6,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.directiveChange.from).toBe("use client");
      expect(finding.directiveChange.to).toBe("use server");
      expect(finding.boundaryType).toBe("server");
    });

    it("detects removed directives as breaking", async () => {
      const content = `"use client";

export default function Button() {
  return <button>Click</button>;
}`;
      const diff: FileDiff = {
        path: "app/Button.tsx",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 4,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.directiveChange.from).toBe("use client");
      expect(finding.directiveChange.to).toBeNull();
      expect(finding.tags).toContain("breaking");
    });
  });

  describe("async component detection", () => {
    it("detects async server components", async () => {
      const content = `
export default async function Page() {
  const data = await fetch("https://api.example.com/data");
  return <div>{data}</div>;
}`;
      const diff = createFileDiff("app/page.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.boundaryType).toBe("server");
    });

    it("detects async function exports", async () => {
      const content = `
export async function generateMetadata() {
  return { title: "My Page" };
}`;
      const diff = createFileDiff("app/layout.tsx", content, "modified");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.boundaryType).toBe("server");
    });
  });

  describe("import detection", () => {
    it("detects server-only imports", async () => {
      const content = `
import "server-only";

export async function getData() {
  return db.query("SELECT * FROM users");
}`;
      const diff = createFileDiff("app/lib/data.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.imports.serverOnly).toBe(true);
      expect(finding.boundaryType).toBe("server");
    });

    it("detects client-only imports", async () => {
      const content = `
"use client";

import "client-only";

export function useBrowserApi() {
  return window.localStorage.getItem("key");
}`;
      const diff = createFileDiff("app/hooks/useStorage.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.imports.clientOnly).toBe(true);
      expect(finding.boundaryType).toBe("client");
    });
  });

  describe("breaking change detection", () => {
    it("detects breaking change when removing use client from browser API usage", async () => {
      const baseContent = `"use client";

export default function Component() {
  useEffect(() => {
    window.addEventListener("scroll", handler);
  }, []);
  return <div>Content</div>;
}`;
      const headContent = `
export default function Component() {
  useEffect(() => {
    window.addEventListener("scroll", handler);
  }, []);
  return <div>Content</div>;
}`;
      const diff: FileDiff = {
        path: "app/Component.tsx",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 8,
            newStart: 1,
            newLines: 7,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons.some((r) => r.includes("window"))).toBe(true);
    });

    it("detects adding server-only import as breaking for client components", async () => {
      const baseContent = `
"use client";

export function helper() { return "data"; }`;
      const headContent = `
"use client";

import "server-only";

export function helper() { return "data"; }`;
      const diff: FileDiff = {
        path: "app/utils.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 5,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as RSCBoundaryFinding;
      expect(finding.breakingReasons.some((r) => r.includes("server-only"))).toBe(true);
    });
  });

  describe("confidence levels", () => {
    it("assigns high confidence to breaking changes", async () => {
      const content = `"use client";

export default function Button() {
  return <button>Click</button>;
}`;
      const diff: FileDiff = {
        path: "app/Button.tsx",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 4,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("assigns high confidence to directive changes", async () => {
      const baseContent = `"use client";
export default function Comp() { return <div>Client</div>; }`;
      const headContent = `"use server";
export default async function Comp() { return <div>Server</div>; }`;
      const diff: FileDiff = {
        path: "app/Comp.tsx",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 1,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("assigns medium confidence to non-breaking directive additions", async () => {
      const content = `"use client";

export default function Button() { return <button>Click</button>; }`;
      const diff = createFileDiff("app/Button.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("medium");
    });
  });

  describe("edge cases", () => {
    it("skips pages router files", async () => {
      const content = `"use client";

export default function Page() { return <div>Page</div>; }`;
      const diff = createFileDiff("pages/index.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("skips non-app files without .server or .client suffix", async () => {
      const content = `export default function Button() { return <button>Click</button>; }`;
      const diff = createFileDiff("components/Button.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { next: "^14.0.0" },
      });

      const findings = await rscBoundaryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });
  });
});
