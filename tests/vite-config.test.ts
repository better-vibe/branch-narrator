/**
 * Vite config analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  viteConfigAnalyzer,
  isViteConfig,
} from "../src/analyzers/vite-config.js";
import type { ViteConfigFinding } from "../src/core/types.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("isViteConfig", () => {
  it("should identify vite.config.ts", () => {
    expect(isViteConfig("vite.config.ts")).toBe(true);
  });

  it("should identify vite.config.js", () => {
    expect(isViteConfig("vite.config.js")).toBe(true);
  });

  it("should identify vite.config.mjs", () => {
    expect(isViteConfig("vite.config.mjs")).toBe(true);
  });

  it("should identify vite.config.mts", () => {
    expect(isViteConfig("vite.config.mts")).toBe(true);
  });

  it("should identify vite.config.cjs", () => {
    expect(isViteConfig("vite.config.cjs")).toBe(true);
  });

  it("should not identify other config files", () => {
    expect(isViteConfig("vitest.config.ts")).toBe(false);
    expect(isViteConfig("tsconfig.json")).toBe(false);
    expect(isViteConfig("eslint.config.ts")).toBe(false);
    expect(isViteConfig("tailwind.config.js")).toBe(false);
  });

  it("should not identify nested config files", () => {
    expect(isViteConfig("config/vite.config.ts")).toBe(false);
  });
});

describe("viteConfigAnalyzer", () => {
  it("should detect vite config changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", [
          "import { defineConfig } from 'vite'",
          "export default defineConfig({",
          "  plugins: [],",
          "})",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as ViteConfigFinding;
    expect(finding.type).toBe("vite-config");
    expect(finding.file).toBe("vite.config.ts");
  });

  it("should detect plugin changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", [
          "import react from '@vitejs/plugin-react'",
          "export default defineConfig({",
          "  plugins: [react()],",
          "})",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as ViteConfigFinding;
    expect(finding.pluginsDetected).toContain("React");
  });

  it("should detect Vue plugin", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", [
          "import vue from '@vitejs/plugin-vue'",
          "export default defineConfig({",
          "  plugins: [vue()],",
          "})",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.pluginsDetected).toContain("Vue");
  });

  it("should detect Svelte plugin", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", [
          "import { svelte } from '@sveltejs/vite-plugin-svelte'",
          "export default defineConfig({",
          "  plugins: [svelte()],",
          "})",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.pluginsDetected).toContain("Svelte");
  });

  it("should detect breaking changes when base path changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          ["  base: '/new-path/',"],
          ["  base: '/old-path/',"]
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("Base path changed (affects all asset URLs)");
  });

  it("should detect breaking changes when outDir changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          ["  build: {", "    outDir: 'dist-new',", "  }"],
          []
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("Output directory changed (may affect deployment)");
  });

  it("should detect breaking changes when build target changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          ["  build: {", "    target: 'esnext',", "  }"],
          []
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("Build target changed (affects browser compatibility)");
  });

  it("should detect SSR configuration changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          ["  ssr: {", "    noExternal: ['some-package'],", "  }"],
          []
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("SSR configuration changed (affects server rendering)");
  });

  it("should extract affected sections", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", [
          "export default defineConfig({",
          "  plugins: [],",
          "  server: {",
          "    port: 3000,",
          "  },",
          "  build: {",
          "    sourcemap: true,",
          "  },",
          "})",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.affectedSections).toContain("plugins");
    expect(finding.affectedSections).toContain("server");
    expect(finding.affectedSections).toContain("build");
    expect(finding.affectedSections).toContain("server.port");
    expect(finding.affectedSections).toContain("build.sourcemap");
  });

  it("should return empty for non-vite config files", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("tsconfig.json", [
          "{",
          '  "compilerOptions": {}',
          "}",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should return empty for empty changesets", () => {
    const changeSet = createChangeSet({
      diffs: [],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should have correct category and kind", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", ["export default {}"]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;

    expect(finding.kind).toBe("vite-config");
    expect(finding.category).toBe("config_env");
  });

  it("should detect envPrefix changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          ["  envPrefix: 'APP_',"],
          []
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("Environment prefix changed (affects env variable exposure)");
  });

  it("should detect define constant changes", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          [],
          ["  define: {", "    __VERSION__: '1.0.0',", "  }"]
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("Build-time constants modified");
  });

  it("should detect multiple plugins", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("vite.config.ts", [
          "import react from '@vitejs/plugin-react'",
          "import { VitePWA } from 'vite-plugin-pwa'",
          "import tsconfigPaths from 'vite-tsconfig-paths'",
          "export default defineConfig({",
          "  plugins: [react(), VitePWA(), tsconfigPaths()],",
          "})",
        ]),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.pluginsDetected).toContain("React");
    expect(finding.pluginsDetected).toContain("PWA");
    expect(finding.pluginsDetected).toContain("TypeScript Paths");
  });

  it("should detect resolve alias changes as breaking", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "vite.config.ts",
          [],
          ["  resolve: {", "    alias: {", "      '@': '/src',", "    },", "  }"]
        ),
      ],
    });

    const findings = viteConfigAnalyzer.analyze(changeSet);
    const finding = findings[0] as ViteConfigFinding;
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons).toContain("Path aliases modified (may break imports)");
  });
});
