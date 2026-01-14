/**
 * Risk report renderers (JSON, Markdown, Text).
 */

import type { RiskReport, RiskFlag } from "../../core/types.js";

/**
 * Render risk report as JSON.
 */
export function renderRiskReportJSON(
  report: RiskReport,
  pretty: boolean = false
): string {
  return pretty ? JSON.stringify(report, null, 2) : JSON.stringify(report);
}

/**
 * Render risk report as Markdown.
 */
export function renderRiskReportMarkdown(report: RiskReport): string {
  const lines: string[] = [];

  // Header
  lines.push("# Risk Report");
  lines.push("");
  lines.push(`**Range:** \`${report.range.base}..${report.range.head}\``);
  lines.push("");

  // Overall score
  const emoji = getLevelEmoji(report.riskLevel);
  lines.push(`## Overall Risk: ${emoji} ${report.riskLevel.toUpperCase()}`);
  lines.push("");
  lines.push(`**Score:** ${report.riskScore}/100`);
  lines.push("");

  // Category scores
  lines.push("### Category Scores");
  lines.push("");
  const categories = Object.entries(report.categoryScores)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [category, score] of categories) {
    if (score > 0) {
      const bar = "█".repeat(Math.floor(score / 10));
      lines.push(`- **${category}**: ${score}/100 ${bar}`);
    }
  }
  lines.push("");

  // Flags
  if (report.flags.length > 0) {
    lines.push("## Risk Flags");
    lines.push("");

    const groupedFlags = groupFlagsByCategory(report.flags);
    for (const [category, flags] of Object.entries(groupedFlags)) {
      if (flags.length === 0) continue;

      lines.push(`### ${category.toUpperCase()}`);
      lines.push("");

      for (const flag of flags) {
        lines.push(`#### ${flag.title}`);
        lines.push("");
        lines.push(`**Rule:** \`${flag.ruleKey}\``);
        lines.push(`**Flag ID:** \`${flag.flagId}\``);
        lines.push(`**Score:** ${flag.effectiveScore}/100 (base: ${flag.score}, confidence: ${flag.confidence})`);
        lines.push("");
        lines.push(flag.summary);
        lines.push("");

        if (flag.evidence.length > 0) {
          lines.push("**Evidence:**");
          lines.push("");
          for (const ev of flag.evidence) {
            lines.push(`- **${ev.file}**`);
            if (ev.hunk) {
              lines.push(`  \`${ev.hunk}\``);
            }
            if (ev.lines.length > 0) {
              lines.push("  ```");
              for (const line of ev.lines) {
                lines.push(`  ${line}`);
              }
              lines.push("  ```");
            }
          }
          lines.push("");
        }

        if (flag.suggestedChecks.length > 0) {
          lines.push("**Suggested Checks:**");
          lines.push("");
          for (const check of flag.suggestedChecks) {
            lines.push(`- ${check}`);
          }
          lines.push("");
        }
      }
    }
  }

  // Score breakdown
  if (report.scoreBreakdown) {
    lines.push("## Score Breakdown");
    lines.push("");
    lines.push(`**Max Category:** ${report.scoreBreakdown.maxCategory.category} (${report.scoreBreakdown.maxCategory.score})`);
    lines.push("");
    lines.push("**Top 3 Categories:**");
    for (const cat of report.scoreBreakdown.topCategories) {
      lines.push(`- ${cat.category}: ${cat.score}`);
    }
    lines.push("");
    lines.push(`**Formula:** \`${report.scoreBreakdown.formula}\``);
    lines.push("");
  }

  // Skipped files
  if (report.skippedFiles.length > 0) {
    lines.push("## Skipped Files");
    lines.push("");
    lines.push(`${report.skippedFiles.length} files were skipped:`);
    lines.push("");
    for (const skip of report.skippedFiles.slice(0, 20)) {
      lines.push(`- \`${skip.file}\` (${skip.reason})`);
    }
    if (report.skippedFiles.length > 20) {
      lines.push(`- ... and ${report.skippedFiles.length - 20} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render risk report as plain text.
 */
export function renderRiskReportText(report: RiskReport): string {
  const lines: string[] = [];

  // Header
  lines.push("RISK REPORT");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Range: ${report.range.base}..${report.range.head}`);
  lines.push("");

  // Overall score
  lines.push(`Overall Risk: ${report.riskLevel.toUpperCase()}`);
  lines.push(`Score: ${report.riskScore}/100`);
  lines.push("");

  // Category scores
  lines.push("Category Scores:");
  lines.push("-".repeat(40));
  const categories = Object.entries(report.categoryScores)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [category, score] of categories) {
    if (score > 0) {
      const bar = "#".repeat(Math.floor(score / 5));
      lines.push(`  ${category.padEnd(12)} ${score.toString().padStart(3)}/100 ${bar}`);
    }
  }
  lines.push("");

  // Flags
  if (report.flags.length > 0) {
    lines.push("Risk Flags:");
    lines.push("-".repeat(40));

    for (const flag of report.flags) {
      lines.push("");
      lines.push(`[${flag.ruleKey}] ${flag.title}`);
      lines.push(`  Score: ${flag.effectiveScore}/100`);
      lines.push(`  ${flag.summary}`);
      
      if (flag.evidence.length > 0) {
        lines.push(`  Evidence: ${flag.evidence.length} location(s)`);
        for (const ev of flag.evidence.slice(0, 2)) {
          lines.push(`    - ${ev.file}`);
        }
      }
    }
    lines.push("");
  }

  // Skipped files
  if (report.skippedFiles.length > 0) {
    lines.push(`Skipped Files: ${report.skippedFiles.length}`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Get emoji for risk level.
 */
function getLevelEmoji(level: string): string {
  switch (level) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "elevated": return "🟡";
    case "moderate": return "🔵";
    case "low": return "🟢";
    default: return "⚪";
  }
}

/**
 * Group flags by category.
 */
function groupFlagsByCategory(flags: RiskFlag[]): Record<string, RiskFlag[]> {
  const groups: Record<string, RiskFlag[]> = {};
  
  for (const flag of flags) {
    if (!groups[flag.category]) {
      groups[flag.category] = [];
    }
    groups[flag.category].push(flag);
  }

  return groups;
}
