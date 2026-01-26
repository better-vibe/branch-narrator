/**
 * Environment variable detector.
 */

import { shouldExcludeFile } from "../core/filters.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  EnvVarFinding,
  Finding,
} from "../core/types.js";
import { getAdditions } from "../git/parser.js";

// File extensions that should be scanned for env vars (actual code files)
const CODE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".svelte",
  ".vue",
  ".astro",
]);

// Config files that might contain env var references
const CONFIG_FILE_PATTERNS = [
  /\.env(\..+)?$/, // .env, .env.local, .env.production
  /vite\.config\.(ts|js|mjs)$/,
  /svelte\.config\.(ts|js|mjs)$/,
  /next\.config\.(ts|js|mjs)$/,
  /nuxt\.config\.(ts|js|mjs)$/,
  /astro\.config\.(ts|js|mjs)$/,
];

/**
 * Check if a file should be scanned for env vars.
 * Only scan actual code files and config files, not documentation or tests.
 */
function shouldScanForEnvVars(path: string): boolean {
  // Skip documentation
  if (path.endsWith(".md") || path.startsWith("docs/")) {
    return false;
  }

  // Skip test files (they often contain example env vars)
  if (
    path.includes("/tests/") ||
    path.includes("/__tests__/") ||
    path.includes(".test.") ||
    path.includes(".spec.") ||
    path.startsWith("tests/")
  ) {
    return false;
  }

  // Skip fixture files
  if (path.includes("/fixtures/") || path.includes("/__fixtures__/")) {
    return false;
  }

  // Check if it's a config file
  for (const pattern of CONFIG_FILE_PATTERNS) {
    if (pattern.test(path)) {
      return true;
    }
  }

  // Check if it has a code file extension
  const ext = path.substring(path.lastIndexOf("."));
  return CODE_FILE_EXTENSIONS.has(ext);
}

// Patterns for env var detection
const ENV_PATTERNS = {
  // process.env.VAR_NAME (including REACT_APP_ and NEXT_PUBLIC_ prefixes)
  processEnv: /process\.env\.([A-Z_][A-Z0-9_]*)/g,

  // import.meta.env.VITE_VAR_NAME (Vite)
  viteEnv: /import\.meta\.env\.VITE_([A-Z0-9_]+)/g,

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
  // Reset lastIndex to ensure consistent results since we're reusing global Regexps
  ENV_PATTERNS.processEnv.lastIndex = 0;
  let match;
  while ((match = ENV_PATTERNS.processEnv.exec(content)) !== null) {
    vars.add(match[1]);
  }

  // import.meta.env.VITE_VAR (Vite)
  ENV_PATTERNS.viteEnv.lastIndex = 0;
  while ((match = ENV_PATTERNS.viteEnv.exec(content)) !== null) {
    vars.add(`VITE_${match[1]}`);
  }

  // PUBLIC_VAR
  ENV_PATTERNS.publicVar.lastIndex = 0;
  while ((match = ENV_PATTERNS.publicVar.exec(content)) !== null) {
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
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
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
  cacheScope: "files",
  filePatterns: [".env", ".env.*", "**/.env", "**/.env.*"],

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const varToFilesAndExcerpts = new Map<
      string,
      Array<{ file: string; excerpt: string }>
    >();

    // Scan code files for env vars in additions
    for (const diff of changeSet.diffs) {
      // Skip build artifacts and generated files
      if (shouldExcludeFile(diff.path)) {
        continue;
      }

      // Only scan actual code files (not docs, tests, fixtures)
      if (!shouldScanForEnvVars(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const additionsText = additions.join("\n");
      const vars = extractEnvVars(additionsText);

      for (const varName of vars) {
        if (!varToFilesAndExcerpts.has(varName)) {
          varToFilesAndExcerpts.set(varName, []);
        }
        
        // Find line with this var
        const lineWithVar = additions.find(line => 
          line.includes(varName)
        );
        const excerpt = lineWithVar 
          ? lineWithVar.trim()
          : extractRepresentativeExcerpt(additions);
        
        varToFilesAndExcerpts.get(varName)!.push({
          file: diff.path,
          excerpt,
        });
      }
    }

    // Create findings
    for (const [name, fileExcerpts] of varToFilesAndExcerpts) {
      const files = Array.from(
        new Set(fileExcerpts.map((fe) => fe.file))
      );
      
      // Create evidence (up to 3 excerpts)
      const evidence = fileExcerpts
        .slice(0, 3)
        .map((fe) => createEvidence(fe.file, fe.excerpt));

      const finding: EnvVarFinding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name,
        change: "added", // MVP heuristic: if in additions, treat as added
        evidenceFiles: files,
      };
      findings.push(finding);
    }

    return findings;
  },
};
