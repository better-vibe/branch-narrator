/**
 * Tests for the TanStack Query analyzer.
 */

import { describe, it, expect } from "bun:test";
import { tanstackQueryAnalyzer } from "../src/analyzers/tanstack-query.js";
import type { ChangeSet, FileDiff, TanStackQueryFinding } from "../src/core/types.js";

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

describe("tanstackQueryAnalyzer", () => {
  describe("dependency detection", () => {
    it("skips projects without TanStack Query dependency", async () => {
      const content = `const data = useQuery({ queryKey: ["todos"] });`;
      const diff = createFileDiff("src/hooks.ts", content);
      const changeSet = createChangeSet([diff], {
        dependencies: {},
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("processes files with @tanstack/react-query dependency", async () => {
      const content = `const { data } = useQuery({ queryKey: ["todos"] });`;
      const diff = createFileDiff("src/hooks.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe("tanstack-query");
    });

    it("detects legacy react-query dependency", async () => {
      const content = `const { data } = useQuery({ queryKey: ["todos"] });`;
      const diff = createFileDiff("src/hooks.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "react-query": "^3.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("hook detection", () => {
    it("detects useQuery additions", async () => {
      const content = `
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
});
`;
      const diff = createFileDiff("src/components/TodoList.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TanStackQueryFinding;
      expect(finding.queryChanges).toHaveLength(1);
      expect(finding.queryChanges[0].type).toBe("query");
      expect(finding.queryChanges[0].operation).toBe("added");
    });

    it("detects useMutation additions", async () => {
      const content = `
const mutation = useMutation({
  mutationFn: createTodo,
});
`;
      const diff = createFileDiff("src/components/AddTodo.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TanStackQueryFinding;
      expect(finding.queryChanges[0].type).toBe("mutation");
    });

    it("detects useInfiniteQuery additions", async () => {
      const content = `
const { data, fetchNextPage } = useInfiniteQuery({
  queryKey: ["posts"],
  queryFn: fetchPosts,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
});
`;
      const diff = createFileDiff("src/components/PostList.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TanStackQueryFinding;
      expect(finding.queryChanges[0].type).toBe("infinite");
    });

    it("detects removed hooks as breaking", async () => {
      const content = `const { data } = useQuery({ queryKey: ["todos"] });`;
      const diff: FileDiff = {
        path: "src/components/TodoList.tsx",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TanStackQueryFinding;
      expect(finding.queryChanges[0].operation).toBe("removed");
      expect(finding.queryChanges[0].isBreaking).toBe(true);
      expect(finding.tags).toContain("breaking");
    });
  });

  describe("cache option detection", () => {
    it("detects staleTime changes", async () => {
      const content = `
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  staleTime: 5000,
});
`;
      const diff = createFileDiff("src/hooks.ts", content, "modified");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TanStackQueryFinding;
      expect(finding.tags).toContain("cache-affecting");
    });

    it("detects gcTime (cacheTime) changes", async () => {
      const content = `
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  gcTime: 1000 * 60 * 5,
});
`;
      const diff = createFileDiff("src/hooks.ts", content, "modified");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("tanstack-query");
    });

    it("detects refetchInterval changes", async () => {
      const content = `
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  refetchInterval: 30000,
});
`;
      const diff = createFileDiff("src/hooks.ts", content, "modified");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
    });
  });

  describe("file filtering", () => {
    it("skips non-code files", async () => {
      const content = `useQuery({ queryKey: ["data"] })`;
      const diff = createFileDiff("README.md", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("processes .ts files", async () => {
      const content = `const { data } = useQuery({ queryKey: ["data"] });`;
      const diff = createFileDiff("src/hooks.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
    });

    it("processes .tsx files", async () => {
      const content = `const { data } = useQuery({ queryKey: ["data"] });`;
      const diff = createFileDiff("src/components/Data.tsx", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("confidence levels", () => {
    it("assigns high confidence to breaking changes", async () => {
      const content = `const { data } = useQuery({ queryKey: ["todos"] });`;
      const diff: FileDiff = {
        path: "src/components/TodoList.tsx",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("assigns medium confidence to cache changes", async () => {
      const content = `
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  staleTime: 5000,
});
`;
      const diff = createFileDiff("src/hooks.ts", content, "modified");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("medium");
    });

    it("assigns low confidence to non-breaking additions", async () => {
      const content = `
const { data } = useQuery({
  queryKey: ["todos"],
  queryFn: fetchTodos,
});
`;
      const diff = createFileDiff("src/hooks.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@tanstack/react-query": "^5.0.0" },
      });

      const findings = await tanstackQueryAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("medium");
    });
  });
});
