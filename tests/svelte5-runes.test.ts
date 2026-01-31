/**
 * Tests for the Svelte 5 Runes analyzer.
 */

import { describe, it, expect } from "bun:test";
import { svelte5RunesAnalyzer, isSvelteFile } from "../src/analyzers/svelte5-runes.js";
import type { ChangeSet, FileDiff, Svelte5RunesFinding } from "../src/core/types.js";

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

describe("svelte5RunesAnalyzer", () => {
  describe("file pattern detection", () => {
    it("detects .svelte files", () => {
      expect(isSvelteFile("src/components/Button.svelte")).toBe(true);
      expect(isSvelteFile("App.svelte")).toBe(true);
    });

    it("detects .svelte.ts files", () => {
      expect(isSvelteFile("src/stores.svelte.ts")).toBe(true);
      expect(isSvelteFile("utils.svelte.ts")).toBe(true);
    });

    it("detects .svelte.js files", () => {
      expect(isSvelteFile("src/stores.svelte.js")).toBe(true);
    });

    it("rejects non-svelte files", () => {
      expect(isSvelteFile("src/utils.ts")).toBe(false);
      expect(isSvelteFile("src/components.tsx")).toBe(false);
    });
  });

  describe("dependency detection", () => {
    it("skips projects without Svelte 5 dependency", async () => {
      const content = `<script>let count = $state(0);</script>`;
      const diff = createFileDiff("src/Counter.svelte", content);
      const changeSet = createChangeSet([diff], {
        dependencies: {},
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("processes files with Svelte 5 dependency", async () => {
      const content = `<script>let count = $state(0);</script>`;
      const diff = createFileDiff("src/Counter.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe("svelte5-runes");
    });

    it("handles svelte version with caret", async () => {
      const content = `<script>let count = $state(0);</script>`;
      const diff = createFileDiff("src/Counter.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0-next.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings.length).toBeGreaterThan(0);
    });
  });

  describe("rune detection", () => {
    it("detects $state additions", async () => {
      const content = `
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<button onclick={() => count++}>
  Count: {count}
</button>
`;
      const diff = createFileDiff("src/Counter.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as Svelte5RunesFinding;
      expect(finding.runeChanges).toHaveLength(2);
      const stateChange = finding.runeChanges.find((r) => r.rune === "$state");
      expect(stateChange?.operation).toBe("added");
      expect(stateChange?.variableName).toBe("count");
    });

    it("detects $derived additions", async () => {
      const content = `
<script>
  let items = $state([]);
  let count = $derived(items.length);
</script>
`;
      const diff = createFileDiff("src/List.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      const finding = findings[0] as Svelte5RunesFinding;
      const derivedChange = finding.runeChanges.find((r) => r.rune === "$derived");
      expect(derivedChange?.operation).toBe("added");
      expect(derivedChange?.variableName).toBe("count");
    });

    it("detects $effect additions", async () => {
      const content = `
<script>
  let count = $state(0);
  
  $effect(() => {
    console.log('Count changed:', count);
  });
</script>
`;
      const diff = createFileDiff("src/Logger.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      const finding = findings[0] as Svelte5RunesFinding;
      const effectChange = finding.runeChanges.find((r) => r.rune === "$effect");
      expect(effectChange?.operation).toBe("added");
    });

    it("detects $props additions", async () => {
      const content = `
<script>
  let { title, description } = $props();
</script>

<h1>{title}</h1>
<p>{description}</p>
`;
      const diff = createFileDiff("src/Card.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      const finding = findings[0] as Svelte5RunesFinding;
      const propsChange = finding.runeChanges.find((r) => r.rune === "$props");
      expect(propsChange?.operation).toBe("added");
    });

    it("detects removed runes as breaking", async () => {
      const content = `
<script>
  let count = $state(0);
</script>
`;
      const diff: FileDiff = {
        path: "src/Counter.svelte",
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
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as Svelte5RunesFinding;
      const stateChange = finding.runeChanges.find((r) => r.rune === "$state");
      expect(stateChange?.operation).toBe("removed");
      expect(stateChange?.isBreaking).toBe(true);
      expect(finding.tags).toContain("breaking");
    });
  });

  describe(".svelte.ts file support", () => {
    it("detects runes in .svelte.ts files", async () => {
      const content = `
export function createCounter() {
  let count = $state(0);
  
  return {
    get count() { return count; },
    increment() { count++; }
  };
}
`;
      const diff = createFileDiff("src/counter.svelte.ts", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as Svelte5RunesFinding;
      expect(finding.runeChanges.some((r) => r.rune === "$state")).toBe(true);
    });
  });

  describe("migration detection", () => {
    it("detects Svelte 4 to 5 migration", async () => {
      const baseContent = `
<script>
  export let count = 0;
  $: doubled = count * 2;
</script>
`;
      const headContent = `
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
`;
      const diff: FileDiff = {
        path: "src/Counter.svelte",
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
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as Svelte5RunesFinding;
      expect(finding.migrationPattern).toEqual({ from: "svelte4", to: "svelte5" });
      expect(finding.tags).toContain("migration");
    });
  });

  describe("confidence levels", () => {
    it("assigns high confidence to breaking changes", async () => {
      const content = `
<script>
  let count = $state(0);
</script>
`;
      const diff: FileDiff = {
        path: "src/Counter.svelte",
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
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("assigns high confidence to migrations", async () => {
      const baseContent = `
<script>
  export let count = 0;
</script>
`;
      const headContent = `
<script>
  let count = $state(0);
</script>
`;
      const diff: FileDiff = {
        path: "src/Counter.svelte",
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
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("high");
    });

    it("assigns low confidence to pure additions", async () => {
      const content = `
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
`;
      const diff = createFileDiff("src/Counter.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings[0].confidence).toBe("low");
    });
  });

  describe("edge cases", () => {
    it("handles files without runes", async () => {
      const content = `
<script>
  console.log("Hello");
</script>

<div>Static content</div>
`;
      const diff = createFileDiff("src/Static.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(0);
    });

    it("handles multiple script tags", async () => {
      const content = `
<script context="module">
  export const preload = () => {};
</script>

<script>
  let count = $state(0);
</script>
`;
      const diff = createFileDiff("src/Page.svelte", content, "added");
      const changeSet = createChangeSet([diff], {
        devDependencies: { svelte: "^5.0.0" },
      });

      const findings = await svelte5RunesAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as Svelte5RunesFinding;
      expect(finding.runeChanges.some((r) => r.rune === "$state")).toBe(true);
    });
  });
});
