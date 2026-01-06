/**
 * Renderers for zoom command output.
 */

import type { ZoomOutput, ZoomFindingOutput, ZoomFlagOutput } from "../../core/types.js";

/**
 * Render zoom output as JSON.
 */
export function renderZoomJSON(output: ZoomOutput, pretty: boolean): string {
  return pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
}

/**
 * Render zoom output as Markdown.
 */
export function renderZoomMarkdown(output: ZoomOutput): string {
  if (output.itemType === "finding") {
    return renderFindingMarkdown(output);
  } else {
    return renderFlagMarkdown(output);
  }
}

/**
 * Render finding output as Markdown.
 */
function renderFindingMarkdown(output: ZoomFindingOutput): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Finding: ${output.findingId}`);
  lines.push("");

  // Metadata
  lines.push(`**Type:** ${output.finding.type}`);
  lines.push(`**Category:** ${output.finding.category}`);
  lines.push(`**Confidence:** ${output.finding.confidence}`);
  lines.push("");

  // Range
  lines.push(`**Range:** ${output.range.base}..${output.range.head}`);
  lines.push("");

  // Finding details based on type
  lines.push("## Details");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(output.finding, null, 2));
  lines.push("```");
  lines.push("");

  // Evidence
  if (output.evidence.length > 0) {
    lines.push("## Evidence");
    lines.push("");

    for (const ev of output.evidence) {
      lines.push(`### ${ev.file}`);
      if (ev.line !== undefined) {
        lines.push(`Line ${ev.line}`);
      }
      if (ev.hunk) {
        lines.push(
          `Hunk: @@ -${ev.hunk.oldStart},${ev.hunk.oldLines} +${ev.hunk.newStart},${ev.hunk.newLines} @@`
        );
      }
      lines.push("");
      lines.push("```");
      lines.push(ev.excerpt);
      lines.push("```");
      lines.push("");
    }
  }

  // Patch context
  if (output.patchContext && output.patchContext.length > 0) {
    lines.push("## Patch Context");
    lines.push("");

    for (const patch of output.patchContext) {
      lines.push(`### ${patch.file} (${patch.status})`);
      lines.push("");

      for (const hunk of patch.hunks) {
        lines.push(
          `\`\`\`diff\n@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
        );
        lines.push(hunk.content);
        lines.push("```");
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render flag output as Markdown.
 */
function renderFlagMarkdown(output: ZoomFlagOutput): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Flag: ${output.flagId}`);
  lines.push("");

  // Metadata
  lines.push(`**Rule:** ${output.flag.ruleKey || output.flag.id}`);
  lines.push(`**Category:** ${output.flag.category}`);
  lines.push(`**Score:** ${output.flag.effectiveScore} (base: ${output.flag.score}, confidence: ${output.flag.confidence})`);
  lines.push("");

  // Range
  lines.push(`**Range:** ${output.range.base}..${output.range.head}`);
  lines.push("");

  // Flag details
  lines.push("## Details");
  lines.push("");
  lines.push(`**Title:** ${output.flag.title}`);
  lines.push("");
  lines.push(`**Summary:** ${output.flag.summary}`);
  lines.push("");

  // Suggested checks
  if (output.flag.suggestedChecks && output.flag.suggestedChecks.length > 0) {
    lines.push("### Suggested Checks");
    lines.push("");
    for (const check of output.flag.suggestedChecks) {
      lines.push(`- ${check}`);
    }
    lines.push("");
  }

  // Evidence
  if (output.evidence.length > 0) {
    lines.push("## Evidence");
    lines.push("");

    for (const ev of output.evidence) {
      lines.push(`### ${ev.file}`);
      if (ev.hunk) {
        lines.push(`Hunk: ${ev.hunk}`);
      }
      lines.push("");
      lines.push("```");
      lines.push(ev.lines.join("\n"));
      lines.push("```");
      lines.push("");
    }
  }

  // Related findings
  if (output.relatedFindings && output.relatedFindings.length > 0) {
    lines.push("## Related Findings");
    lines.push("");

    for (const finding of output.relatedFindings) {
      lines.push(`- **${finding.findingId}** (${finding.type}, ${finding.category})`);
    }
    lines.push("");
  }

  // Patch context
  if (output.patchContext && output.patchContext.length > 0) {
    lines.push("## Patch Context");
    lines.push("");

    for (const patch of output.patchContext) {
      lines.push(`### ${patch.file} (${patch.status})`);
      lines.push("");

      for (const hunk of patch.hunks) {
        lines.push(
          `\`\`\`diff\n@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
        );
        lines.push(hunk.content);
        lines.push("```");
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render zoom output as plain text.
 */
export function renderZoomText(output: ZoomOutput): string {
  if (output.itemType === "finding") {
    return renderFindingText(output);
  } else {
    return renderFlagText(output);
  }
}

/**
 * Render finding output as plain text.
 */
function renderFindingText(output: ZoomFindingOutput): string {
  const lines: string[] = [];

  // Header
  lines.push(`Finding: ${output.findingId}`);
  lines.push("=".repeat(60));
  lines.push("");

  // Metadata
  lines.push(`Type: ${output.finding.type}`);
  lines.push(`Category: ${output.finding.category}`);
  lines.push(`Confidence: ${output.finding.confidence}`);
  lines.push(`Range: ${output.range.base}..${output.range.head}`);
  lines.push("");

  // Evidence
  if (output.evidence.length > 0) {
    lines.push("Evidence:");
    lines.push("-".repeat(60));

    for (const ev of output.evidence) {
      lines.push(`File: ${ev.file}`);
      if (ev.line !== undefined) {
        lines.push(`  Line: ${ev.line}`);
      }
      if (ev.hunk) {
        lines.push(
          `  Hunk: @@ -${ev.hunk.oldStart},${ev.hunk.oldLines} +${ev.hunk.newStart},${ev.hunk.newLines} @@`
        );
      }
      lines.push("");
      lines.push(ev.excerpt);
      lines.push("");
    }
  }

  // Patch context
  if (output.patchContext && output.patchContext.length > 0) {
    lines.push("Patch Context:");
    lines.push("-".repeat(60));

    for (const patch of output.patchContext) {
      lines.push(`File: ${patch.file} (${patch.status})`);
      lines.push("");

      for (const hunk of patch.hunks) {
        lines.push(
          `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
        );
        lines.push(hunk.content);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render flag output as plain text.
 */
function renderFlagText(output: ZoomFlagOutput): string {
  const lines: string[] = [];

  // Header
  lines.push(`Flag: ${output.flagId}`);
  lines.push("=".repeat(60));
  lines.push("");

  // Metadata
  lines.push(`Rule: ${output.flag.ruleKey || output.flag.id}`);
  lines.push(`Category: ${output.flag.category}`);
  lines.push(`Score: ${output.flag.effectiveScore} (base: ${output.flag.score}, confidence: ${output.flag.confidence})`);
  lines.push(`Range: ${output.range.base}..${output.range.head}`);
  lines.push("");

  // Details
  lines.push(`Title: ${output.flag.title}`);
  lines.push(`Summary: ${output.flag.summary}`);
  lines.push("");

  // Suggested checks
  if (output.flag.suggestedChecks && output.flag.suggestedChecks.length > 0) {
    lines.push("Suggested Checks:");
    for (const check of output.flag.suggestedChecks) {
      lines.push(`  - ${check}`);
    }
    lines.push("");
  }

  // Evidence
  if (output.evidence.length > 0) {
    lines.push("Evidence:");
    lines.push("-".repeat(60));

    for (const ev of output.evidence) {
      lines.push(`File: ${ev.file}`);
      if (ev.hunk) {
        lines.push(`  Hunk: ${ev.hunk}`);
      }
      lines.push("");
      lines.push(ev.lines.join("\n"));
      lines.push("");
    }
  }

  // Related findings
  if (output.relatedFindings && output.relatedFindings.length > 0) {
    lines.push("Related Findings:");
    lines.push("-".repeat(60));

    for (const finding of output.relatedFindings) {
      lines.push(`  - ${finding.findingId} (${finding.type}, ${finding.category})`);
    }
    lines.push("");
  }

  // Patch context
  if (output.patchContext && output.patchContext.length > 0) {
    lines.push("Patch Context:");
    lines.push("-".repeat(60));

    for (const patch of output.patchContext) {
      lines.push(`File: ${patch.file} (${patch.status})`);
      lines.push("");

      for (const hunk of patch.hunks) {
        lines.push(
          `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
        );
        lines.push(hunk.content);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}
