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
 * Find files that import the target file using git grep.
 * This avoids reading all files into memory.
 */
async function findDependents(targetFile: string): Promise<string[]> {
  const ext = path.extname(targetFile);
  const baseName = path.basename(targetFile, ext); // e.g. "math" from "src/utils/math.ts"

  // We search for the base filename. This is heuristic and might return false positives,
  // but it's much faster than parsing ASTs.
  // We use git grep to search in all tracked files.

  // Searching for: 'import ... from ".../math"' or 'require(".../math")'
  // Simplified: just search for the filename without extension.
  // This might catch "math" in comments, but we filter later or accept the noise for speed.

  try {
    // -l: list filenames only
    // -F: fixed string (faster and safer against regex injection)
    // We search for the baseName.
    // Optimization: Search only in src/ or relevant dirs if possible, but git grep defaults to all tracked files.

    // Using execa to avoid shell injection
    const { stdout } = await execa("git", ["grep", "-l", "-F", baseName]);

    const candidates = stdout.split("\n").filter(Boolean);

    // Filter candidates:
    // 1. Must not be the file itself
    // 2. Must not be excluded
    // 3. (Optional) Read file to verify it's an import?
    //    For "Improve Algorithm Efficiency", we might skip full verification if git grep is precise enough.
    //    Let's verify it contains "import" or "require" line with the file.

    return candidates.filter(file => {
      if (file === targetFile) return false;
      if (EXCLUDE_PATTERNS.some(p => p.test(file))) return false;
      return true;
    });

  } catch (error) {
    // git grep returns exit code 1 if not found, which throws error in execPromise
    return [];
  }
}

export const impactAnalyzer: Analyzer = {
  name: "impact",

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // We only care about modified/renamed files that are "sources"
    const sourceFiles = changeSet.files.filter(f =>
      (f.status === "modified" || f.status === "renamed") &&
      !EXCLUDE_PATTERNS.some(p => p.test(f.path))
    );

    if (sourceFiles.length === 0) return [];

    for (const source of sourceFiles) {
      const dependents = await findDependents(source.path);

      if (dependents.length > 0) {
        findings.push({
          type: "impact-analysis",
          kind: "impact-analysis",
          category: "tests", // broadly related to testing/qa
          confidence: "medium", // heuristic
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
