/**
 * Evidence redaction utilities for sensitive data.
 */

/**
 * Patterns for detecting secrets.
 */
const SECRET_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /auth[_-]?token/i,
];

// Pre-compiled regex patterns for secret keys
const COMPILED_SECRET_PATTERNS = SECRET_KEY_PATTERNS.map((pattern) => ({
  eqPattern: new RegExp(
    `(${pattern.source})\\s*=\\s*['"]?([^'"\\s}<]+)['"]?`,
    "gi"
  ),
  colonPattern: new RegExp(
    `(${pattern.source})\\s*:\\s*['"]?([^'"\\s,}<]+)['"]?`,
    "gi"
  ),
}));

/**
 * GitHub token patterns.
 */
const GITHUB_TOKEN_PATTERN = /(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]+)/g;

/**
 * Long base64/hex-like strings (likely secrets).
 * Avoid matching short sequences that are part of identifiers.
 */
const LONG_SECRET_PATTERN = /\b[a-zA-Z0-9+/=]{32,}\b/g;

/**
 * Redact secret values in a line of code.
 */
export function redactLine(line: string): string {
  let redacted = line;

  // Redact GitHub tokens FIRST (before other patterns)
  redacted = redacted.replace(GITHUB_TOKEN_PATTERN, "<redacted-github-token>");

  // Redact values after = or : for secret keys
  for (const { eqPattern, colonPattern } of COMPILED_SECRET_PATTERNS) {
    // Reset lastIndex for global patterns to ensure consistent matching
    eqPattern.lastIndex = 0;
    colonPattern.lastIndex = 0;

    redacted = redacted.replace(
      eqPattern,
      (_match, key) => `${key}=<redacted>`
    );
    redacted = redacted.replace(
      colonPattern,
      (_match, key) => `${key}: <redacted>`
    );
  }

  // Redact long base64/hex strings (but not if they look like hashes in code)
  // Only do this if not already redacted
  if (
    !redacted.includes("<redacted") &&
    !redacted.includes("hash") &&
    !redacted.includes("checksum")
  ) {
    redacted = redacted.replace(LONG_SECRET_PATTERN, "<redacted-value>");
  }

  return redacted;
}

/**
 * Redact an array of evidence lines.
 */
export function redactLines(lines: string[]): string[] {
  return lines.map(redactLine);
}
