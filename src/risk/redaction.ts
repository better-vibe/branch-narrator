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
  for (const pattern of SECRET_KEY_PATTERNS) {
    // Match key=value or key: value patterns
    const eqPattern = new RegExp(`(${pattern.source})\\s*=\\s*['"]?([^'"\\s<]+)['"]?`, "gi");
    const colonPattern = new RegExp(`(${pattern.source})\\s*:\\s*['"]?([^'"\\s,}<]+)['"]?`, "gi");

    redacted = redacted.replace(eqPattern, (match, key) => `${key}=<redacted>`);
    redacted = redacted.replace(colonPattern, (match, key) => `${key}: <redacted>`);
  }

  // Redact long base64/hex strings (but not if they look like hashes in code)
  // Only do this if not already redacted
  if (!redacted.includes("<redacted") && !redacted.includes("hash") && !redacted.includes("checksum")) {
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
