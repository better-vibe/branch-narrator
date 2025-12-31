/**
 * Risk score computation.
 */

import type {
  FileCategory,
  FileCategoryFinding,
  Finding,
  RiskLevel,
  RiskScore,
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

  // Check for low-risk only changes first
  const { isLowRisk, category } = checkLowRiskOnlyChanges(findings);
  if (isLowRisk && category) {
    const reductions: Record<string, number> = {
      docs: -15,
      tests: -10,
      config: -5,
      "docs/tests/config": -10,
    };
    score += reductions[category] ?? 0;
    evidenceBullets.push(
      `✅ Changes are only in ${category} (lower risk)`
    );
  }

  for (const finding of findings) {
    switch (finding.type) {
      case "risk-flag":
        if (finding.risk === "high") {
          score += 40;
          evidenceBullets.push(`⚠️ ${finding.evidence}`);
        } else if (finding.risk === "medium") {
          score += 20;
          evidenceBullets.push(`⚡ ${finding.evidence}`);
        } else {
          score += 5;
          evidenceBullets.push(`ℹ️ ${finding.evidence}`);
        }
        break;

      case "db-migration":
        if (finding.risk === "high") {
          score += 30;
          evidenceBullets.push(
            `⚠️ High-risk database migration: ${finding.reasons.join(", ")}`
          );
        } else if (finding.risk === "medium") {
          score += 15;
          evidenceBullets.push(
            `⚡ Database migration detected: ${finding.files.join(", ")}`
          );
        }
        break;

      case "route-change":
        if (finding.change === "added") {
          score += 5;
        } else if (finding.change === "deleted") {
          score += 10;
          evidenceBullets.push(`ℹ️ Route deleted: ${finding.routeId}`);
        }
        break;

      case "dependency-change":
        if (finding.impact === "major") {
          score += 15;
        } else if (finding.impact === "minor") {
          score += 5;
        }
        // Risky packages get additional points (already flagged via risk-flag)
        if (finding.riskCategory && finding.impact === "new") {
          score += 10;
        }
        break;

      case "env-var":
        if (finding.change === "added") {
          score += 5;
          evidenceBullets.push(`ℹ️ New env var: ${finding.name}`);
        }
        break;

      case "security-file":
        // Additional points for security files (already adds risk-flag)
        score += 15;
        break;
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

  return { score, level, evidenceBullets };
}
