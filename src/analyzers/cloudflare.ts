/**
 * Cloudflare change detector.
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  CloudflareArea,
  CloudflareChangeFinding,
  Finding,
} from "../core/types.js";

// Wrangler config patterns
const WRANGLER_PATTERNS = [/^wrangler\.toml$/, /^wrangler\.json$/];

// GitHub workflow patterns
const WORKFLOW_PATTERN = /^\.github\/workflows\/.*\.(yml|yaml)$/;

// Cloudflare keywords in CI
const CLOUDFLARE_CI_KEYWORDS = /\b(wrangler|cloudflare|workers|pages)\b/i;

/**
 * Check if a file is a wrangler config.
 */
export function isWranglerConfig(path: string): boolean {
  return WRANGLER_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a file is a GitHub workflow.
 */
export function isGitHubWorkflow(path: string): boolean {
  return WORKFLOW_PATTERN.test(path);
}

/**
 * Check if workflow content mentions Cloudflare.
 */
export function workflowMentionsCloudflare(content: string): boolean {
  return CLOUDFLARE_CI_KEYWORDS.test(content);
}

export const cloudflareAnalyzer: Analyzer = {
  name: "cloudflare",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const areaFilesAndEvidence = new Map<
      CloudflareArea,
      Array<{ file: string; excerpt: string }>
    >();

    // Check for wrangler config changes
    for (const file of changeSet.files) {
      if (isWranglerConfig(file.path)) {
        if (!areaFilesAndEvidence.has("wrangler")) {
          areaFilesAndEvidence.set("wrangler", []);
        }
        // Try to get excerpt from diff
        const diff = changeSet.diffs.find((d) => d.path === file.path);
        const excerpt = diff
          ? extractRepresentativeExcerpt(getAdditions(diff))
          : file.path;
        areaFilesAndEvidence.get("wrangler")!.push({
          file: file.path,
          excerpt,
        });
      }
    }

    // Check for CI changes that mention Cloudflare
    for (const diff of changeSet.diffs) {
      if (isGitHubWorkflow(diff.path)) {
        const additions = getAdditions(diff);
        const additionsText = additions.join("\n");
        if (workflowMentionsCloudflare(additionsText)) {
          if (!areaFilesAndEvidence.has("ci")) {
            areaFilesAndEvidence.set("ci", []);
          }
          const excerpt = extractRepresentativeExcerpt(additions);
          areaFilesAndEvidence.get("ci")!.push({
            file: diff.path,
            excerpt,
          });
        }
      }
    }

    // Create findings
    for (const [area, fileExcerpts] of areaFilesAndEvidence) {
      const files = fileExcerpts.map((fe) => fe.file);
      const evidence = fileExcerpts
        .slice(0, 3)
        .map((fe) => createEvidence(fe.file, fe.excerpt));

      const finding: CloudflareChangeFinding = {
        type: "cloudflare-change",
        kind: "cloudflare-change",
        category: "cloudflare",
        confidence: "high",
        evidence,
        area,
        files,
      };
      findings.push(finding);
    }

    return findings;
  },
};

