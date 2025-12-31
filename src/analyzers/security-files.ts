/**
 * Security-sensitive file change detector.
 */

import type {
  Analyzer,
  ChangeSet,
  Finding,
  RiskFlagFinding,
  SecurityFileFinding,
  SecurityFileReason,
} from "../core/types.js";

// Patterns for security-sensitive paths
const SECURITY_PATH_PATTERNS: Array<{
  pattern: RegExp;
  reason: SecurityFileReason;
}> = [
  // Auth-related paths
  { pattern: /\bauth\b/i, reason: "auth-path" },
  { pattern: /\blogin\b/i, reason: "auth-path" },
  { pattern: /\blogout\b/i, reason: "auth-path" },
  { pattern: /\bsignin\b/i, reason: "auth-path" },
  { pattern: /\bsignout\b/i, reason: "auth-path" },
  { pattern: /\bsignup\b/i, reason: "auth-path" },
  { pattern: /\bregister\b/i, reason: "auth-path" },

  // Session-related
  { pattern: /\bsession\b/i, reason: "session-path" },
  { pattern: /\bjwt\b/i, reason: "session-path" },
  { pattern: /\btoken\b/i, reason: "session-path" },
  { pattern: /\bcookie\b/i, reason: "session-path" },
  { pattern: /\boauth\b/i, reason: "session-path" },

  // Permission-related
  { pattern: /\bpermission\b/i, reason: "permission-path" },
  { pattern: /\brbac\b/i, reason: "permission-path" },
  { pattern: /\bacl\b/i, reason: "permission-path" },
  { pattern: /\brole\b/i, reason: "permission-path" },
  { pattern: /\bauthoriz/i, reason: "permission-path" }, // authorize, authorization

  // Middleware (common in auth flows)
  { pattern: /middleware\.[jt]sx?$/i, reason: "middleware" },
  { pattern: /\/middleware\//, reason: "middleware" },

  // Guards (route protection)
  { pattern: /guard\.[jt]sx?$/i, reason: "guard" },
  { pattern: /\/guards?\//, reason: "guard" },

  // Policies
  { pattern: /policy\.[jt]sx?$/i, reason: "policy" },
  { pattern: /\/policies\//, reason: "policy" },
];

/**
 * Check if a file path is security-sensitive.
 */
export function isSecurityFile(path: string): SecurityFileReason | null {
  for (const { pattern, reason } of SECURITY_PATH_PATTERNS) {
    if (pattern.test(path)) {
      return reason;
    }
  }
  return null;
}

/**
 * Get a human-readable label for a security reason.
 */
export function getSecurityReasonLabel(reason: SecurityFileReason): string {
  const labels: Record<SecurityFileReason, string> = {
    "auth-path": "Authentication",
    "session-path": "Session/Token",
    "permission-path": "Permissions/RBAC",
    middleware: "Middleware",
    guard: "Route Guard",
    policy: "Policy",
  };
  return labels[reason];
}

export const securityFilesAnalyzer: Analyzer = {
  name: "security-files",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const securityFiles: string[] = [];
    const reasons = new Set<SecurityFileReason>();

    // Check all changed files
    for (const file of changeSet.files) {
      const reason = isSecurityFile(file.path);
      if (reason) {
        securityFiles.push(file.path);
        reasons.add(reason);
      }
    }

    // Only emit if there are security-sensitive files
    if (securityFiles.length === 0) {
      return [];
    }

    const securityFinding: SecurityFileFinding = {
      type: "security-file",
      files: securityFiles,
      reasons: Array.from(reasons),
    };
    findings.push(securityFinding);

    // Add risk flag for security file changes
    const reasonLabels = Array.from(reasons)
      .map(getSecurityReasonLabel)
      .join(", ");
    const riskFinding: RiskFlagFinding = {
      type: "risk-flag",
      risk: "medium",
      evidence: `Security-sensitive files changed (${reasonLabels}): ${securityFiles.length} file(s)`,
    };
    findings.push(riskFinding);

    return findings;
  },
};

