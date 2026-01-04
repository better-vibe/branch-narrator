/**
 * Environment variable detector tests.
 */

import { describe, expect, it } from "bun:test";
import {
  envVarAnalyzer,
  extractEnvVars,
  extractImportedVars,
} from "../src/analyzers/env-var.js";
import type { EnvVarFinding } from "../src/core/types.js";
import {
  createChangeSet,
  createFileDiff,
  sampleEnvVarContent,
} from "./fixtures/index.js";

describe("extractImportedVars", () => {
  it("should extract simple imports", () => {
    const vars = extractImportedVars("VAR_A, VAR_B, VAR_C");
    expect(vars).toEqual(["VAR_A", "VAR_B", "VAR_C"]);
  });

  it("should handle aliased imports", () => {
    const vars = extractImportedVars("VAR_A, VAR_B as myVar, VAR_C");
    expect(vars).toEqual(["VAR_A", "VAR_B", "VAR_C"]);
  });

  it("should handle whitespace", () => {
    const vars = extractImportedVars("  VAR_A  ,  VAR_B  ");
    expect(vars).toEqual(["VAR_A", "VAR_B"]);
  });
});

describe("extractEnvVars", () => {
  it("should extract process.env variables", () => {
    const vars = extractEnvVars(sampleEnvVarContent.processEnv);
    expect(vars.has("API_URL")).toBe(true);
    expect(vars.has("AUTH_SECRET")).toBe(true);
  });

  it("should extract SvelteKit public env imports", () => {
    const vars = extractEnvVars(sampleEnvVarContent.svelteKitPublic);
    expect(vars.has("PUBLIC_API_URL")).toBe(true);
    expect(vars.has("PUBLIC_APP_NAME")).toBe(true);
  });

  it("should extract SvelteKit private env imports", () => {
    const vars = extractEnvVars(sampleEnvVarContent.svelteKitPrivate);
    expect(vars.has("DATABASE_URL")).toBe(true);
    expect(vars.has("AUTH_SECRET")).toBe(true);
  });

  it("should extract mixed env var sources", () => {
    const vars = extractEnvVars(sampleEnvVarContent.mixed);
    expect(vars.has("PUBLIC_SUPABASE_URL")).toBe(true);
    expect(vars.has("SUPABASE_SERVICE_KEY")).toBe(true);
    expect(vars.has("FALLBACK_URL")).toBe(true);
  });

  it("should handle PUBLIC_ prefix pattern", () => {
    const content = "const url = PUBLIC_MY_VAR";
    const vars = extractEnvVars(content);
    expect(vars.has("PUBLIC_MY_VAR")).toBe(true);
  });

  it("should extract Vite import.meta.env variables", () => {
    const vars = extractEnvVars(sampleEnvVarContent.viteEnv);
    expect(vars.has("VITE_API_URL")).toBe(true);
    expect(vars.has("VITE_API_KEY")).toBe(true);
  });

  it("should extract React App process.env variables", () => {
    const vars = extractEnvVars(sampleEnvVarContent.reactAppEnv);
    expect(vars.has("REACT_APP_API_URL")).toBe(true);
    expect(vars.has("REACT_APP_API_KEY")).toBe(true);
  });

  it("should extract Next.js public env variables", () => {
    const vars = extractEnvVars(sampleEnvVarContent.nextPublicEnv);
    expect(vars.has("NEXT_PUBLIC_API_URL")).toBe(true);
    expect(vars.has("SECRET_KEY")).toBe(true);
  });
});

describe("envVarAnalyzer", () => {
  it("should detect env vars in diffs", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff(
          "src/lib/config.ts",
          sampleEnvVarContent.processEnv.split("\n")
        ),
      ],
    });

    const findings = envVarAnalyzer.analyze(changeSet);
    const varNames = findings.map((f) => (f as EnvVarFinding).name);

    expect(varNames).toContain("API_URL");
    expect(varNames).toContain("AUTH_SECRET");
  });

  it("should track evidence files", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("src/lib/config.ts", ["const x = process.env.MY_VAR;"]),
        createFileDiff("src/routes/+page.ts", ["const y = process.env.MY_VAR;"]),
      ],
    });

    const findings = envVarAnalyzer.analyze(changeSet);
    const myVarFinding = findings.find(
      (f) => (f as EnvVarFinding).name === "MY_VAR"
    ) as EnvVarFinding;

    expect(myVarFinding).toBeDefined();
    expect(myVarFinding.evidenceFiles).toContain("src/lib/config.ts");
    expect(myVarFinding.evidenceFiles).toContain("src/routes/+page.ts");
  });

  it("should mark vars as added", () => {
    const changeSet = createChangeSet({
      diffs: [
        createFileDiff("src/lib/config.ts", ["const x = process.env.NEW_VAR;"]),
      ],
    });

    const findings = envVarAnalyzer.analyze(changeSet);
    const finding = findings[0] as EnvVarFinding;

    expect(finding.change).toBe("added");
  });

  it("should return empty for no env vars", () => {
    const changeSet = createChangeSet({
      diffs: [createFileDiff("src/lib/utils.ts", ["const x = 1;"])],
    });

    const findings = envVarAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });
});

