/**
 * Tests for the tRPC v11 router analyzer.
 */

import { describe, it, expect } from "bun:test";
import { trpcRouterAnalyzer, isTRPCRouterFile } from "../src/analyzers/trpc-router.js";
import type { ChangeSet, FileDiff, TRPCRouterFinding } from "../src/core/types.js";

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

describe("trpcRouterAnalyzer", () => {
  describe("file pattern detection", () => {
    it("detects router files in routers directory", () => {
      expect(isTRPCRouterFile("server/routers/users.ts")).toBe(true);
      expect(isTRPCRouterFile("src/routers/posts.ts")).toBe(true);
    });

    it("detects files in api/trpc directory", () => {
      expect(isTRPCRouterFile("api/trpc/router.ts")).toBe(true);
      expect(isTRPCRouterFile("src/api/trpc/_app.ts")).toBe(true);
    });

    it("detects files in server/trpc directory", () => {
      expect(isTRPCRouterFile("server/trpc/context.ts")).toBe(true);
    });

    it("detects _app files", () => {
      expect(isTRPCRouterFile("_app.ts")).toBe(true);
      expect(isTRPCRouterFile("src/_app.ts")).toBe(true);
    });

    it("rejects non-router files", () => {
      expect(isTRPCRouterFile("src/components/Button.ts")).toBe(false);
      expect(isTRPCRouterFile("src/utils/helpers.ts")).toBe(false);
    });
  });

  describe("dependency detection", () => {
    it("skips projects without tRPC dependency", async () => {
      const content = `
export const appRouter = router({
  user: userRouter,
});
`;
      const diff = createFileDiff("server/routers/_app.ts", content);
      const changeSet = createChangeSet([diff], {
        dependencies: {},
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("processes files with @trpc/server dependency", async () => {
      const content = `
export const userRouter = router({
  getUser: publicProcedure.query(({ input }) => {
    return { id: input.id, name: "John" };
  }),
});
`;
      const diff = createFileDiff("server/routers/users.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe("trpc-router");
    });
  });

  describe("procedure detection", () => {
    it("detects added queries", async () => {
      const content = `
export const userRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      return db.user.findById(input.id);
    }),
  listUsers: publicProcedure.query(() => {
    return db.user.findAll();
  }),
});
`;
      const diff = createFileDiff("server/routers/users.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.procedureChanges).toHaveLength(2);
      expect(finding.procedureChanges.every((p) => p.type === "query")).toBe(true);
      expect(finding.procedureChanges.every((p) => p.operation === "added")).toBe(true);
    });

    it("detects added mutations", async () => {
      const content = `
export const userRouter = router({
  createUser: publicProcedure
    .input(z.object({ name: z.string(), email: z.string() }))
    .mutation(({ input }) => {
      return db.user.create(input);
    }),
});
`;
      const diff = createFileDiff("server/routers/users.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.procedureChanges[0].type).toBe("mutation");
    });

    it("detects added subscriptions", async () => {
      const content = `
export const messageRouter = router({
  onMessage: publicProcedure
    .subscription(({ input }) => {
      return observable((emit) => {
        // subscription logic
      });
    }),
});
`;
      const diff = createFileDiff("server/routers/messages.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.procedureChanges[0].type).toBe("subscription");
    });

    it("detects removed procedures as breaking", async () => {
      const content = `
export const userRouter = router({
  getUser: publicProcedure.query(() => {}),
});
`;
      const diff: FileDiff = {
        path: "server/routers/users.ts",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.procedureChanges[0].operation).toBe("removed");
      expect(finding.procedureChanges[0].isBreaking).toBe(true);
      expect(finding.isBreaking).toBe(true);
      expect(finding.tags).toContain("breaking");
    });

    it("detects modified procedures", async () => {
      const baseContent = `
export const userRouter = router({
  getUser: publicProcedure.query(() => ({ id: "1", name: "John" })),
});
`;
      const headContent = `
export const userRouter = router({
  getUser: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => db.user.findById(input.id)),
});
`;
      const diff: FileDiff = {
        path: "server/routers/users.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 4,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.procedureChanges[0].operation).toBe("modified");
    });
  });

  describe("router name extraction", () => {
    it("extracts router name from export", async () => {
      const content = `
export const postRouter = router({
  getPost: publicProcedure.query(() => {}),
});
`;
      const diff = createFileDiff("server/routers/posts.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.routerName).toBe("postRouter");
    });

    it("uses file name as fallback", async () => {
      const content = `
export default router({
  getUser: publicProcedure.query(() => {}),
});
`;
      const diff = createFileDiff("server/routers/users.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      const finding = findings[0] as TRPCRouterFinding;
      expect(finding.routerName).toBe("users");
    });
  });

  describe("breaking change detection", () => {
    it("detects input schema changes", async () => {
      const baseContent = `
export const userRouter = router({
  getUser: publicProcedure.query(() => {}),
});
`;
      const headContent = `
export const userRouter = router({
  getUser: publicProcedure.input(z.object({ id: z.string() })).query(() => {}),
});
`;
      const diff: FileDiff = {
        path: "server/routers/users.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 3,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      const finding = findings[0] as TRPCRouterFinding;
      // Should detect the input change as a breaking modification
      expect(finding.procedureChanges[0].operation).toBe("modified");
    });

    it("detects middleware changes", async () => {
      const baseContent = `
export const protectedProcedure = publicProcedure.use(isAuthed);
export const userRouter = router({
  getUser: protectedProcedure.query(() => {}),
});
`;
      const headContent = `
export const adminProcedure = publicProcedure.use(isAdmin);
export const userRouter = router({
  getUser: adminProcedure.query(() => {}),
});
`;
      const diff: FileDiff = {
        path: "server/routers/users.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 4,
            newStart: 1,
            newLines: 4,
            content: headContent,
            additions: headContent.split("\n"),
            deletions: baseContent.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
    });
  });

  describe("confidence levels", () => {
    it("assigns high confidence to breaking changes", async () => {
      const content = `
export const userRouter = router({
  getUser: publicProcedure.query(() => {}),
});
`;
      const diff: FileDiff = {
        path: "server/routers/users.ts",
        status: "deleted",
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 0,
            content,
            additions: [],
            deletions: content.split("\n"),
          },
        ],
      };
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("assigns low confidence to pure additions", async () => {
      const content = `
export const userRouter = router({
  getUser: publicProcedure.query(() => {}),
  listUsers: publicProcedure.query(() => []),
});
`;
      const diff = createFileDiff("server/routers/users.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        dependencies: { "@trpc/server": "^11.0.0" },
      });

      const findings = await trpcRouterAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("low");
    });
  });
});
