/**
 * Evidence extraction and redaction utilities.
 */

import type { Evidence, Hunk } from "./types.js";

/**
 * Create evidence from a file with excerpt.
 */
export function createEvidence(
  file: string,
  excerpt: string,
  options?: {
    line?: number;
    hunk?: Hunk;
  }
): Evidence {
  return {
    file,
    excerpt: excerpt.trim(),
    line: options?.line,
    hunk: options?.hunk
      ? {
          oldStart: options.hunk.oldStart,
          oldLines: options.hunk.oldLines,
          newStart: options.hunk.newStart,
          newLines: options.hunk.newLines,
        }
      : undefined,
  };
}

/**
 * Redact obvious secrets from evidence excerpts.
 * Masks values but preserves keys for env vars.
 */
export function redactEvidence(evidence: Evidence): Evidence {
  return {
    ...evidence,
    excerpt: redactSecrets(evidence.excerpt),
  };
}

/**
 * Redact secrets from text.
 * Patterns:
 * - API keys: sk_live_..., pk_test_..., etc.
 * - JWT tokens: eyJ...
 * - AWS keys: AKIA...
 * - Generic secrets: password=..., secret=..., token=...
 */
export function redactSecrets(text: string): string {
  let redacted = text;

  // Stripe-like keys (must be at least 24 chars after prefix)
  redacted = redacted.replace(
    /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{24,}/g,
    "$1_$2_***REDACTED***"
  );

  // JWT tokens (must have 3 base64 parts separated by dots)
  redacted = redacted.replace(
    /\beyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/g,
    "eyJ***REDACTED***"
  );

  // AWS keys (exactly 20 chars: AKIA + 16 alphanumeric)
  redacted = redacted.replace(
    /\bAKIA[0-9A-Z]{16}\b/g,
    "AKIA***REDACTED***"
  );

  // Generic secret patterns (only match assignment contexts)
  // Match: password=value, secret: value, token="value", api_key='value'
  redacted = redacted.replace(
    /(password|secret|token|apikey|api_key)(\s*[:=]\s*)(["'])([^"']+)\3/gi,
    "$1$2$3***REDACTED***$3"
  );
  
  // Also match unquoted values
  redacted = redacted.replace(
    /(password|secret|token|apikey|api_key)(\s*[:=]\s*)([^\s"',;)]+)/gi,
    "$1$2***REDACTED***"
  );

  return redacted;
}

/**
 * Truncate excerpt to max length.
 */
export function truncateExcerpt(
  excerpt: string,
  maxLength: number = 200
): string {
  if (excerpt.length <= maxLength) {
    return excerpt;
  }
  return excerpt.substring(0, maxLength - 3) + "...";
}

/**
 * Extract a representative excerpt from additions.
 */
export function extractRepresentativeExcerpt(
  additions: string[],
  maxLength: number = 200
): string {
  if (additions.length === 0) {
    return "";
  }

  // Find first non-empty, non-comment line
  for (const line of additions) {
    const trimmed = line.trim();
    if (
      trimmed.length > 0 &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/*") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("#")
    ) {
      return truncateExcerpt(trimmed, maxLength);
    }
  }

  // Fallback to first line
  return truncateExcerpt(additions[0].trim(), maxLength);
}
