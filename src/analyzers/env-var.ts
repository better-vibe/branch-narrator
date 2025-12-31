/**
 * Environment variable detector.
 */

import { shouldExcludeFile } from "../core/filters.js";
import type {
  Analyzer,
  ChangeSet,
  EnvVarFinding,
  Finding,
} from "../core/types.js";
import { getAdditions } from "../git/parser.js";

// Patterns for env var detection
const ENV_PATTERNS = {
  // process.env.VAR_NAME
  processEnv: /process\.env\.([A-Z_][A-Z0-9_]*)/g,

  // PUBLIC_VAR (SvelteKit public env vars)
  publicVar: /\bPUBLIC_([A-Z0-9_]+)/g,

  // $env/static/public imports
  envStaticPublic:
    /import\s*\{([^}]+)\}\s*from\s*["']\$env\/static\/public["']/g,

  // $env/static/private imports
  envStaticPrivate:
    /import\s*\{([^}]+)\}\s*from\s*["']\$env\/static\/private["']/g,

  // $env/dynamic/public imports
  envDynamicPublic:
    /import\s*\{([^}]+)\}\s*from\s*["']\$env\/dynamic\/public["']/g,

  // $env/dynamic/private imports
  envDynamicPrivate:
    /import\s*\{([^}]+)\}\s*from\s*["']\$env\/dynamic\/private["']/g,
};

/**
 * Extract variable names from an import statement's destructured list.
 */
export function extractImportedVars(importList: string): string[] {
  return importList
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((v) => {
      // Handle "VAR as alias" syntax
      const parts = v.split(/\s+as\s+/);
      return parts[0].trim();
    });
}

/**
 * Extract environment variable names from content.
 */
export function extractEnvVars(content: string): Set<string> {
  const vars = new Set<string>();

  // process.env.VAR
  let match;
  const processEnvPattern = new RegExp(ENV_PATTERNS.processEnv.source, "g");
  while ((match = processEnvPattern.exec(content)) !== null) {
    vars.add(match[1]);
  }

  // PUBLIC_VAR
  const publicPattern = new RegExp(ENV_PATTERNS.publicVar.source, "g");
  while ((match = publicPattern.exec(content)) !== null) {
    vars.add(`PUBLIC_${match[1]}`);
  }

  // $env imports (all types)
  const importPatterns = [
    ENV_PATTERNS.envStaticPublic,
    ENV_PATTERNS.envStaticPrivate,
    ENV_PATTERNS.envDynamicPublic,
    ENV_PATTERNS.envDynamicPrivate,
  ];

  for (const pattern of importPatterns) {
    const importPattern = new RegExp(pattern.source, "g");
    while ((match = importPattern.exec(content)) !== null) {
      const importedVars = extractImportedVars(match[1]);
      for (const v of importedVars) {
        vars.add(v);
      }
    }
  }

  return vars;
}

export const envVarAnalyzer: Analyzer = {
  name: "env-var",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const varToFiles = new Map<string, Set<string>>();

    // Scan all diffs for env vars in additions
    for (const diff of changeSet.diffs) {
      // Skip build artifacts and generated files
      if (shouldExcludeFile(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff).join("\n");
      const vars = extractEnvVars(additions);

      for (const varName of vars) {
        if (!varToFiles.has(varName)) {
          varToFiles.set(varName, new Set());
        }
        varToFiles.get(varName)!.add(diff.path);
      }
    }

    // Create findings
    for (const [name, files] of varToFiles) {
      const finding: EnvVarFinding = {
        type: "env-var",
        name,
        change: "added", // MVP heuristic: if in additions, treat as added
        evidenceFiles: Array.from(files),
      };
      findings.push(finding);
    }

    return findings;
  },
};

