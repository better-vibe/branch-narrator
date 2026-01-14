/**
 * Risk scoring engine for risk-report command.
 */

import type {
  DiffMode,
  RiskCategory,
  RiskFlag,
  RiskReport,
  RiskReportLevel,
  ScoreBreakdown,
} from "../../core/types.js";
import { sortRiskFlags } from "../../core/sorting.js";

/**
 * Compute category scores from flags.
 */
function computeCategoryScores(flags: RiskFlag[]): Record<RiskCategory, number> {
  // Create categories in alphabetical order for determinism
  const scores: Record<RiskCategory, number> = {
    api: 0,
    churn: 0,
    ci: 0,
    db: 0,
    deps: 0,
    infra: 0,
    security: 0,
    tests: 0,
  };

  for (const flag of flags) {
    scores[flag.category] += flag.effectiveScore;
  }

  // Cap each category at 100
  for (const category of Object.keys(scores) as RiskCategory[]) {
    scores[category] = Math.min(100, scores[category]);
  }

  return scores;
}

/**
 * Compute overall risk score from category scores.
 */
function computeOverallScore(categoryScores: Record<RiskCategory, number>): number {
  const scores = Object.values(categoryScores);

  if (scores.length === 0) return 0;

  // Get max category score
  const maxCat = Math.max(...scores);

  // Get top 3 scores
  const sortedScores = [...scores].sort((a, b) => b - a);
  const top3 = sortedScores.slice(0, 3);

  // Pad with zeros if less than 3
  while (top3.length < 3) {
    top3.push(0);
  }

  const top3Avg = top3.reduce((sum, score) => sum + score, 0) / 3;

  // Formula: 0.6 * maxCat + 0.4 * top3Avg
  const overall = 0.6 * maxCat + 0.4 * top3Avg;

  return Math.round(Math.max(0, Math.min(100, overall)));
}

/**
 * Determine risk level from score.
 */
function computeRiskLevel(score: number): RiskReportLevel {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 41) return "elevated";
  if (score >= 21) return "moderate";
  return "low";
}

/**
 * Build score breakdown for --explain-score.
 */
function buildScoreBreakdown(
  categoryScores: Record<RiskCategory, number>
): ScoreBreakdown {
  const entries = Object.entries(categoryScores) as Array<[RiskCategory, number]>;
  const sorted = entries.sort((a, b) => b[1] - a[1]);

  const maxCategory = sorted.length > 0 ? sorted[0] : (["security", 0] as [RiskCategory, number]);
  const topCategories = sorted.slice(0, 3).map(([category, score]) => ({ category, score }));

  const maxCat = maxCategory[1];
  const top3 = topCategories.map(t => t.score);
  while (top3.length < 3) top3.push(0);
  const top3Avg = top3.reduce((sum, s) => sum + s, 0) / 3;

  const formula = `riskScore = round(0.6 * ${maxCat} + 0.4 * ${top3Avg.toFixed(2)})`;

  return {
    maxCategory: { category: maxCategory[0], score: maxCat },
    topCategories,
    formula,
  };
}

/**
 * Filter flags by category.
 */
export function filterFlagsByCategory(
  flags: RiskFlag[],
  only?: string[],
  exclude?: string[]
): RiskFlag[] {
  let filtered = flags;

  if (only && only.length > 0) {
    filtered = filtered.filter(f => only.includes(f.category));
  }

  if (exclude && exclude.length > 0) {
    filtered = filtered.filter(f => !exclude.includes(f.category));
  }

  return filtered;
}

/**
 * Compute risk report from flags.
 */
export function computeRiskReport(
  base: string,
  head: string,
  flags: RiskFlag[],
  skippedFiles: Array<{ file: string; reason: string }>,
  options?: {
    explainScore?: boolean;
    noTimestamp?: boolean;
    mode?: DiffMode;
    only?: string[];
    exclude?: string[];
  }
): RiskReport {
  const categoryScores = computeCategoryScores(flags);
  const riskScore = computeOverallScore(categoryScores);
  const riskLevel = computeRiskLevel(riskScore);

  const report: RiskReport = {
    schemaVersion: "2.0",
    range: { base, head, mode: options?.mode },
    riskScore,
    riskLevel,
    categoryScores,
    flags: sortRiskFlags(flags),
    skippedFiles,
  };

  // Add timestamp unless --no-timestamp is specified
  if (!options?.noTimestamp) {
    report.generatedAt = new Date().toISOString();
  }

  if (options?.explainScore) {
    report.scoreBreakdown = buildScoreBreakdown(categoryScores);
  }

  // Store filters if provided
  if (options?.only || options?.exclude) {
    report.filters = {
      only: options.only,
      exclude: options.exclude,
    };
  }

  return report;
}
