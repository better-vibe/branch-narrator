/**
 * Impact Analyzer.
 * Finds files that import the modified files (blast radius).
 */

import path from "node:path";
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
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /^dist\//,
  /^build\//,
  /^\.git\//,
];

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

export const impactAnalyzer: Analyzer = {
  name: "impact",

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Filter relevant source files
    const sourceFiles = changeSet.files.filter(f =>
      (f.status === "modified" || f.status === "renamed") &&
      !EXCLUDE_PATTERNS.some(p => p.test(f.path))
    );

    if (sourceFiles.length === 0) return [];

    // Prepare targets for batch search
    const targets = sourceFiles.map(source => {
      const ext = path.extname(source.path);
      const baseName = path.basename(source.path, ext);
      return { path: source.path, baseName };
    });

    // Run batch search
    // Note: process.cwd() is used implicitely unless we are running in a specific context.
    // The current architecture assumes the process runs in the repo root.
    const dependentsMap = await findDependentsBatch(targets);

    for (const source of sourceFiles) {
      const dependents = dependentsMap.get(source.path) || [];

      if (dependents.length > 0) {
        findings.push({
          type: "impact-analysis",
          kind: "impact-analysis",
          category: "tests",
          confidence: "medium",
          evidence: [
            createEvidence(source.path, `Modified file ${source.path} is imported by ${dependents.length} other file(s).`),
            ...dependents.slice(0, 5).map(d => createEvidence(d, `Depends on ${source.path}`))
          ],
          sourceFile: source.path,
          affectedFiles: dependents,
          blastRadius: dependents.length > 10 ? "high" : dependents.length > 3 ? "medium" : "low",
          tags: ["impact", "dependency"]
        } as ImpactAnalysisFinding);
      }
    }

    return findings;
  },
};
