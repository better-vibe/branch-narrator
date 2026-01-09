/**
 * Impact Analyzer.
 * Finds files that import the modified files (blast radius).
 */

import path from "node:path";
import fs from "node:fs/promises";
import { execa } from "execa";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  ImpactAnalysisFinding,
} from "../core/types.js";

// Files to exclude from impact scanning (both as source and target)
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.d\.ts$/,
  /^dist\//,
  /^build\//,
  /^\.git\//,
];

// File extensions that support import analysis (code files only)
// Excludes docs, config, and other non-importable files
const ANALYZABLE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
]);

// Patterns for detecting test files
const TEST_FILE_PATTERNS = [
  // Match .test.{js,jsx,ts,tsx} (case-insensitive)
  /\.test\.[jt]sx?$/i,
  // Match .spec.{js,jsx,ts,tsx} (case-insensitive)
  /\.spec\.[jt]sx?$/i,
  /^tests\//i,
  /^__tests__\//i,
];

// Pattern to match code files (for filtering dependents)
// Only these files can have actual imports, excludes docs/config/lockfiles
const CODE_FILE_PATTERN = /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts|vue|svelte)$/i;

/**
 * Batch search for dependents using git grep.
 */
async function findDependentsBatch(
  targets: Array<{ path: string; baseName: string }>,
  cwd: string = process.cwd()
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  targets.forEach((t) => results.set(t.path, []));

  if (targets.length === 0) return results;

  // Group paths by basename to avoid duplicate searches
  const baseNameToPaths = new Map<string, string[]>();
  for (const t of targets) {
    if (!baseNameToPaths.has(t.baseName)) {
      baseNameToPaths.set(t.baseName, []);
    }
    baseNameToPaths.get(t.baseName)!.push(t.path);
  }

  const uniqueBaseNames = Array.from(baseNameToPaths.keys());

  // Chunking to avoid ARG_MAX issues
  const CHUNK_SIZE = 50;
  for (let i = 0; i < uniqueBaseNames.length; i += CHUNK_SIZE) {
    const chunk = uniqueBaseNames.slice(i, i + CHUNK_SIZE);

    // git grep -I -F --null -e name1 -e name2 ...
    // -I: ignore binary files
    // -F: fixed strings
    // --null: output \0 after filename
    const args = ["grep", "-I", "-F", "--null"];
    for (const name of chunk) {
      args.push("-e");
      args.push(name);
    }

    try {
      const { stdout } = await execa("git", args, {
        cwd,
        maxBuffer: 1024 * 1024 * 20, // Increase buffer for large outputs
        reject: false // git grep returns 1 if no matches found
      });

      if (!stdout) continue;

      const lines = stdout.split("\n");
      for (const line of lines) {
        if (!line) continue;

        // Parse: filename\0content
        const nullIndex = line.indexOf("\0");
        if (nullIndex === -1) continue;

        const file = line.slice(0, nullIndex);
        const content = line.slice(nullIndex + 1);

        // Skip excluded files
        if (EXCLUDE_PATTERNS.some(p => p.test(file))) continue;
        
        // Skip non-code files (docs, config, lockfiles, etc.)
        // These may contain filename text but aren't actual imports
        if (!CODE_FILE_PATTERN.test(file)) continue;

        // Check which basename(s) matched in this line
        for (const baseName of chunk) {
          if (content.includes(baseName)) {
            const sourcePaths = baseNameToPaths.get(baseName) || [];
            for (const sourcePath of sourcePaths) {
              // Avoid self-reference
              if (sourcePath !== file) {
                const deps = results.get(sourcePath)!;
                if (!deps.includes(file)) {
                  deps.push(file);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      // Should ignore errors
    }
  }

  return results;
}

/**
 * Analyze a dependent file to extract detailed usage information.
 */
async function analyzeDependency(
  dependentPath: string,
  sourcePath: string,
  cwd: string = process.cwd()
): Promise<{ importedSymbols: string[]; usageContext: string; isTestFile: boolean } | null> {
  try {
    const content = await fs.readFile(path.join(cwd, dependentPath), "utf-8");
    const sourceBaseName = path.basename(sourcePath, path.extname(sourcePath));
    const lines = content.split("\n");

    const importedSymbols: string[] = [];
    let usageContext = "";

    // Regex to find import statement
    // Matches: import { A, B } from './source' or import X from './source'
    // This is heuristic and won't cover 100% of cases (e.g. multiline imports might need smarter parsing)
    // But we iterate lines to find the one containing the source name.

    for (const line of lines) {
      if (line.includes(sourceBaseName) && (line.trim().startsWith("import") || line.trim().startsWith("export"))) {
        usageContext = usageContext ? `${usageContext}\n${line.trim()}` : line.trim();

        // Try to extract symbols
        // Case 1: Named imports: import { A, B } ...
        const namedMatch = line.match(/\{([^}]+)\}/);
        if (namedMatch) {
          const symbols = namedMatch[1].split(",").map(s => {
            const part = s.trim().split(" as ")[0].trim(); // Handle 'as' aliases
            return part.replace(/^type\s+/, ""); // Handle 'type' keyword
          });
          importedSymbols.push(...symbols);
        }

        // Case 2: Default or namespace import: import X ... / import * as X ...
        // Simplistic check: if no curly braces and follows 'import'
        if (!namedMatch && line.trim().startsWith("import")) {
           const parts = line.split("from");
           if (parts.length > 1) {
             const preFrom = parts[0].replace("import", "").trim();
             if (preFrom) {
               // Handle namespace imports: import * as Utils from "./utils"
               const namespaceMatch = preFrom.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
               if (namespaceMatch) {
                 importedSymbols.push(namespaceMatch[1].trim());
               } else if (!preFrom.includes("{") && !preFrom.includes("*")) {
                 // Handle default imports: import X from "./x"
                 importedSymbols.push(preFrom.split(" as ")[0].trim());
               }
             }
           } else {
             // Note: lines like `import "./utils";` or `import "./styles.css";` are side-effect-only imports.
             // In these cases (and if we otherwise fail to parse), we intentionally leave `importedSymbols` empty
             // to distinguish "no named symbols, just side effects" from the presence of explicit imported identifiers.
           }
        }

        // Removed break to capture multiple imports
      }
    }

    // Note: We intentionally don't fall back to any matching line.
    // If no import/export statement was found, usageContext stays empty.
    // This avoids showing garbage like random doc text or config values.

    const isTestFile = TEST_FILE_PATTERNS.some(p => p.test(dependentPath));

    return {
      importedSymbols,
      usageContext,
      isTestFile
    };

  } catch (error) {
    // If file read fails (e.g. deleted), return null
    return null;
  }
}

export const impactAnalyzer: Analyzer = {
  name: "impact",

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Filter relevant source files - only code files that can be imported
    const sourceFiles = changeSet.files.filter(f => {
      // Only modified or renamed files
      if (f.status !== "modified" && f.status !== "renamed") return false;
      // Skip excluded paths
      if (EXCLUDE_PATTERNS.some(p => p.test(f.path))) return false;
      // Only analyze files with importable extensions (skip docs, config, etc.)
      const ext = path.extname(f.path).toLowerCase();
      return ANALYZABLE_EXTENSIONS.has(ext);
    });

    if (sourceFiles.length === 0) return [];

    // Prepare targets for batch search
    const targets = sourceFiles.map(source => {
      const ext = path.extname(source.path);
      const baseName = path.basename(source.path, ext);
      return { path: source.path, baseName };
    });

    // Run batch search
    const dependentsMap = await findDependentsBatch(targets);

    for (const source of sourceFiles) {
      const dependents = dependentsMap.get(source.path) || [];

      if (dependents.length > 0) {
        // Detailed analysis for each dependent
        const impactedFilesInfo: Array<{ file: string; details: any }> = [];

        for (const dep of dependents) {
            // We analyze only the first few dependents deeply to avoid perf hit on massive impact
            // Or maybe we analyze all? Let's analyze all for now, assuming typical impact < 100 files.
            // If massive, we might want to limit.
            if (impactedFilesInfo.length < 20) {
                 const details = await analyzeDependency(dep, source.path);
                 if (details) {
                     impactedFilesInfo.push({ file: dep, details });
                 } else {
                     impactedFilesInfo.push({ file: dep, details: { importedSymbols: [], usageContext: "", isTestFile: false } });
                 }
            } else {
                impactedFilesInfo.push({ file: dep, details: { importedSymbols: [], usageContext: "", isTestFile: false } });
            }
        }

        const evidence = [
            createEvidence(source.path, `Modified file ${source.path} is imported by ${dependents.length} other file(s).`),
            ...impactedFilesInfo.slice(0, 5).map(info => {
                let text = `Depends on ${source.path}`;
                if (info.details.importedSymbols?.length > 0) {
                    text += ` (imports: ${info.details.importedSymbols.join(", ")})`;
                }
                if (info.details.isTestFile) {
                    text += " [TEST]";
                }
                return createEvidence(info.file, text);
            })
        ];

        // Collect all symbols for the finding summary
        const allSymbols = new Set<string>();
        impactedFilesInfo.forEach(i => i.details.importedSymbols?.forEach((s: string) => allSymbols.add(s)));

        findings.push({
          type: "impact-analysis",
          kind: "impact-analysis",
          category: "impact",
          confidence: "medium",
          evidence: evidence,
          sourceFile: source.path,
          affectedFiles: dependents,
          importedSymbols: Array.from(allSymbols),
          isTestFile: impactedFilesInfo.every(i => i.details.isTestFile), // True if ALL dependents are tests
          usageContext: impactedFilesInfo[0]?.details.usageContext, // Example context from first file
          blastRadius: dependents.length > 10 ? "high" : dependents.length > 3 ? "medium" : "low",
          tags: ["impact", "dependency"]
        } as ImpactAnalysisFinding);
      }
    }

    return findings;
  },
};
