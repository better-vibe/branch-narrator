/**
 * Risk score computation.
 */

import type {
  ConventionViolationFinding,
  FileCategory,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  LargeDiffFinding,
  RiskLevel,
  RiskScore,
  RiskFactor,
} from "../core/types.js";

/**
 * Check if changes are only in low-risk categories.
 */
function checkLowRiskOnlyChanges(
  findings: Finding[]
): { isLowRisk: boolean; category: string | null } {
  const categoryFinding = findings.find(
    (f) => f.type === "file-category"
  ) as FileCategoryFinding | undefined;

  if (!categoryFinding) {
    return { isLowRisk: false, category: null };
  }

  const { categories } = categoryFinding;
  const highRiskCategories: FileCategory[] = [
    "product",
    "infra",
    "ci",
    "dependencies",
  ];

  // Check if any high-risk category has files
  const hasHighRiskChanges = highRiskCategories.some(
    (cat) => categories[cat].length > 0
  );

  if (hasHighRiskChanges) {
    return { isLowRisk: false, category: null };
  }

  // Determine which low-risk category dominates
  if (categories.docs.length > 0 && categories.tests.length === 0) {
    return { isLowRisk: true, category: "docs" };
  }
  if (categories.tests.length > 0 && categories.docs.length === 0) {
    return { isLowRisk: true, category: "tests" };
  }
  if (
    categories.config.length > 0 &&
    categories.docs.length === 0 &&
    categories.tests.length === 0
  ) {
    return { isLowRisk: true, category: "config" };
  }
  if (
    categories.docs.length > 0 ||
    categories.tests.length > 0 ||
    categories.config.length > 0
  ) {
    return { isLowRisk: true, category: "docs/tests/config" };
  }

  return { isLowRisk: false, category: null };
}

/**
 * Compute aggregate risk score from findings.
 */
export function computeRiskScore(findings: Finding[]): RiskScore {
  let score = 0;
  const evidenceBullets: string[] = [];
  const factors: RiskFactor[] = [];

  // Check for low-risk only changes first
  const { isLowRisk, category } = checkLowRiskOnlyChanges(findings);
  if (isLowRisk && category) {
    const reductions: Record<string, number> = {
      docs: -15,
      tests: -10,
      config: -5,
      "docs/tests/config": -10,
    };
    const weight = reductions[category] ?? 0;
    score += weight;
    evidenceBullets.push(
      `✅ Changes are only in ${category} (lower risk)`
    );
    factors.push({
      kind: "low-risk-category",
      weight,
      explanation: `Changes are only in ${category} (lower risk)`,
      evidence: [],
    });
  }

  for (const finding of findings) {
    switch (finding.type) {
      case "risk-flag":
        {
          const weight = finding.risk === "high" 
            ? 40 
            : finding.risk === "medium" 
            ? 20 
            : 5;
          score += weight;
          const emoji = finding.risk === "high" 
            ? "⚠️" 
            : finding.risk === "medium" 
            ? "⚡" 
            : "ℹ️";
          evidenceBullets.push(`${emoji} ${finding.evidenceText}`);
          factors.push({
            kind: `risk-${finding.risk}`,
            weight,
            explanation: finding.evidenceText,
            evidence: finding.evidence,
          });
        }
        break;

      case "db-migration":
        {
          const weight = finding.risk === "high" 
            ? 30 
            : finding.risk === "medium" 
            ? 15 
            : 0;
          if (weight > 0) {
            score += weight;
            const explanation = finding.risk === "high"
              ? `High-risk database migration: ${finding.reasons.join(", ")}`
              : `Database migration detected: ${finding.files.join(", ")}`;
            evidenceBullets.push(
              finding.risk === "high" ? `⚠️ ${explanation}` : `⚡ ${explanation}`
            );
            factors.push({
              kind: "db-migration",
              weight,
              explanation,
              evidence: finding.evidence,
            });
          }
        }
        break;

      case "route-change":
        if (finding.change === "added") {
          score += 5;
          factors.push({
            kind: "route-added",
            weight: 5,
            explanation: `Route added: ${finding.routeId}`,
            evidence: finding.evidence,
          });
        } else if (finding.change === "deleted") {
          score += 10;
          evidenceBullets.push(`ℹ️ Route deleted: ${finding.routeId}`);
          factors.push({
            kind: "route-deleted",
            weight: 10,
            explanation: `Route deleted: ${finding.routeId}`,
            evidence: finding.evidence,
          });
        }
        break;

      case "dependency-change":
        {
          let weight = 0;
          if (finding.impact === "major") {
            weight = 15;
          } else if (finding.impact === "minor") {
            weight = 5;
          }
          // Risky packages get additional points (already flagged via risk-flag)
          if (finding.riskCategory && finding.impact === "new") {
            weight += 10;
          }
          if (weight > 0) {
            score += weight;
            factors.push({
              kind: `dependency-${finding.impact}`,
              weight,
              explanation: `${finding.name}: ${finding.from ?? "new"} → ${finding.to ?? "removed"}`,
              evidence: finding.evidence,
            });
          }
        }
        break;

      case "env-var":
        if (finding.change === "added") {
          score += 5;
          evidenceBullets.push(`ℹ️ New env var: ${finding.name}`);
          factors.push({
            kind: "env-var-added",
            weight: 5,
            explanation: `New env var: ${finding.name}`,
            evidence: finding.evidence,
          });
        }
        break;

      case "security-file":
        // Additional points for security files (already adds risk-flag)
        score += 15;
        factors.push({
          kind: "security-file",
          weight: 15,
          explanation: `Security-sensitive files changed: ${finding.files.length} file(s)`,
          evidence: finding.evidence,
        });
        break;

      case "convention-violation":
        {
          const violationFinding = finding as ConventionViolationFinding;
          const fileCount = violationFinding.files.length;
          // Only add risk if significant number of files lack tests
          if (fileCount > 5) {
            const weight = 10;
            score += weight;
            evidenceBullets.push(`⚡ ${fileCount} source files lack test coverage`);
            factors.push({
              kind: "test-coverage-gap",
              weight,
              explanation: `${fileCount} source files lack test coverage`,
              evidence: violationFinding.evidence.slice(0, 3),
            });
          }
        }
        break;

      case "large-diff":
        {
          const largeDiffFinding = finding as LargeDiffFinding;
          const weight = largeDiffFinding.linesChanged > 1000 
            ? 15 
            : largeDiffFinding.linesChanged > 500 
            ? 10 
            : 5;
          score += weight;
          evidenceBullets.push(
            `ℹ️ Large diff: ${largeDiffFinding.filesChanged} files, ${largeDiffFinding.linesChanged} lines`
          );
          factors.push({
            kind: "large-diff",
            weight,
            explanation: `Large diff: ${largeDiffFinding.filesChanged} files, ${largeDiffFinding.linesChanged} lines`,
            evidence: largeDiffFinding.evidence,
          });
        }
        break;
    }
  }

  // Check for core module changes (types.ts, index.ts in core directories)
  const coreFilePatterns = [/\/types\.ts$/, /\/core\/.*\.ts$/, /\/index\.ts$/];
  const fileSummary = findings.find(f => f.type === "file-summary") as FileSummaryFinding | undefined;
  if (fileSummary) {
    const coreFilesModified = fileSummary.modified.filter(file => 
      coreFilePatterns.some(p => p.test(file))
    );
    if (coreFilesModified.length > 0) {
      const weight = 10;
      score += weight;
      evidenceBullets.push(`ℹ️ Core module files modified: ${coreFilesModified.join(", ")}`);
      factors.push({
        kind: "core-module-change",
        weight,
        explanation: `Core module files modified (types.ts, index.ts): ${coreFilesModified.length} file(s)`,
        evidence: [],
      });
    }
  }

  // Ensure score stays within bounds
  score = Math.max(0, Math.min(score, 100));

  // Determine level
  let level: RiskLevel;
  if (score >= 50) {
    level = "high";
  } else if (score >= 20) {
    level = "medium";
  } else {
    level = "low";
  }

  return { score, level, factors, evidenceBullets };
}
