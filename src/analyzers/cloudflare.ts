/**
 * Cloudflare change detector.
 */

import { getAdditions } from "../git/parser.js";
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
    const areaFiles = new Map<CloudflareArea, string[]>();

    // Check for wrangler config changes
    for (const file of changeSet.files) {
      if (isWranglerConfig(file.path)) {
        if (!areaFiles.has("wrangler")) {
          areaFiles.set("wrangler", []);
        }
        areaFiles.get("wrangler")!.push(file.path);
      }
    }

    // Check for CI changes that mention Cloudflare
    for (const diff of changeSet.diffs) {
      if (isGitHubWorkflow(diff.path)) {
        const additions = getAdditions(diff).join("\n");
        if (workflowMentionsCloudflare(additions)) {
          if (!areaFiles.has("ci")) {
            areaFiles.set("ci", []);
          }
          areaFiles.get("ci")!.push(diff.path);
        }
      }
    }

    // Create findings
    for (const [area, files] of areaFiles) {
      const finding: CloudflareChangeFinding = {
        type: "cloudflare-change",
        area,
        files,
      };
      findings.push(finding);
    }

    return findings;
  },
};

