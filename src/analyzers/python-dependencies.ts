/**
 * Python dependencies analyzer - detects changes to Python dependency files.
 *
 * Supports:
 * - requirements.txt (and variants like requirements-dev.txt)
 * - pyproject.toml
 * - setup.py / setup.cfg
 * - Pipfile / Pipfile.lock
 * - poetry.lock
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  FileDiff,
  Finding,
} from "../core/types.js";

// Python package file patterns
const REQUIREMENTS_PATTERN = /requirements.*\.txt$/;
const PYPROJECT_PATTERN = /pyproject\.toml$/;
const SETUP_PATTERN = /^setup\.(py|cfg)$/;
const PIPFILE_PATTERN = /^Pipfile(\.lock)?$/;
const POETRY_LOCK_PATTERN = /^poetry\.lock$/;

// Risky Python packages by category
const RISKY_PACKAGES: Record<string, "auth" | "database" | "native" | "payment"> = {
  // Auth packages
  "django-allauth": "auth",
  "python-social-auth": "auth",
  "authlib": "auth",
  "oauthlib": "auth",
  "python-jose": "auth",
  "pyjwt": "auth",
  "passlib": "auth",
  "argon2-cffi": "auth",
  "bcrypt": "auth",

  // Database packages
  "django": "database",
  "sqlalchemy": "database",
  "alembic": "database",
  "psycopg2": "database",
  "psycopg2-binary": "database",
  "asyncpg": "database",
  "pymysql": "database",
  "mysqlclient": "database",
  "pymongo": "database",
  "motor": "database",
  "redis": "database",
  "aioredis": "database",
  "tortoise-orm": "database",
  "peewee": "database",
  "sqlmodel": "database",
  "databases": "database",
  "prisma": "database",

  // Native/system packages (includes cryptography libraries)
  "numpy": "native",
  "pandas": "native",
  "scipy": "native",
  "pillow": "native",
  "opencv-python": "native",
  "tensorflow": "native",
  "torch": "native",
  "cryptography": "native",
  "pycryptodome": "native",
  "pynacl": "native",

  // Payment packages
  "stripe": "payment",
  "braintree": "payment",
  "paypalrestsdk": "payment",
};

/**
 * Check if a file is a Python dependency file.
 */
export function isPythonDependencyFile(path: string): boolean {
  const fileName = path.split("/").pop() ?? "";
  return (
    REQUIREMENTS_PATTERN.test(fileName) ||
    PYPROJECT_PATTERN.test(fileName) ||
    SETUP_PATTERN.test(fileName) ||
    PIPFILE_PATTERN.test(fileName) ||
    POETRY_LOCK_PATTERN.test(fileName)
  );
}

/**
 * Get the dependency file type.
 */
export function getDependencyFileType(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  if (REQUIREMENTS_PATTERN.test(fileName)) return "requirements";
  if (PYPROJECT_PATTERN.test(fileName)) return "pyproject";
  if (SETUP_PATTERN.test(fileName)) return "setup";
  if (PIPFILE_PATTERN.test(fileName)) return "pipfile";
  if (POETRY_LOCK_PATTERN.test(fileName)) return "poetry";
  return "unknown";
}

/**
 * Parse package name from requirements.txt line.
 * Handles formats like: package==1.0.0, package>=1.0.0, package~=1.0.0, package[extra]
 */
function parseRequirementsLine(line: string): { name: string; version?: string } | null {
  // Skip comments, blank lines, and options
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) {
    return null;
  }

  // Handle -r includes
  if (trimmed.startsWith("-r ")) {
    return null;
  }

  // Parse package name and version
  // Match: package[extras]>=version or package>=version
  const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:\[[^\]]+\])?(?:[><=~!]+(.+))?/);
  if (match) {
    return {
      name: match[1].toLowerCase(),
      version: match[2]?.trim(),
    };
  }

  return null;
}

/**
 * Parse package from pyproject.toml dependency line.
 */
function parsePyprojectLine(line: string): { name: string; version?: string } | null {
  // Match patterns like: "package>=1.0.0" or package = ">=1.0.0" or package = {version = ">=1.0.0"}
  const stringMatch = line.match(/["']([a-zA-Z0-9_-]+)(?:\[[^\]]+\])?(?:[><=~!]+([^"']+))?["']/);
  if (stringMatch) {
    return {
      name: stringMatch[1].toLowerCase(),
      version: stringMatch[2]?.trim(),
    };
  }

  // Match table format: package = ...
  const tableMatch = line.match(/^([a-zA-Z0-9_-]+)\s*=/);
  if (tableMatch) {
    return {
      name: tableMatch[1].toLowerCase(),
      version: undefined,
    };
  }

  return null;
}

/**
 * Extract packages from diff additions.
 */
function extractAddedPackages(diff: FileDiff, fileType: string): Array<{ name: string; version?: string }> {
  const additions = getAdditions(diff);
  const packages: Array<{ name: string; version?: string }> = [];

  for (const line of additions) {
    let parsed: { name: string; version?: string } | null = null;

    if (fileType === "requirements") {
      parsed = parseRequirementsLine(line);
    } else if (fileType === "pyproject" || fileType === "pipfile" || fileType === "poetry") {
      parsed = parsePyprojectLine(line);
    }

    if (parsed) {
      packages.push(parsed);
    }
  }

  return packages;
}

/**
 * Extract packages from diff deletions.
 */
function extractRemovedPackages(diff: FileDiff, fileType: string): Array<{ name: string; version?: string }> {
  const deletions = getDeletions(diff);
  const packages: Array<{ name: string; version?: string }> = [];

  for (const line of deletions) {
    let parsed: { name: string; version?: string } | null = null;

    if (fileType === "requirements") {
      parsed = parseRequirementsLine(line);
    } else if (fileType === "pyproject" || fileType === "pipfile" || fileType === "poetry") {
      parsed = parsePyprojectLine(line);
    }

    if (parsed) {
      packages.push(parsed);
    }
  }

  return packages;
}

export const pythonDependenciesAnalyzer: Analyzer = {
  name: "python-dependencies",
  cacheScope: "files",
  filePatterns: [
    "requirements.txt",
    "requirements*.txt",
    "**/requirements.txt",
    "**/requirements*.txt",
    "Pipfile",
    "Pipfile.lock",
    "pyproject.toml",
    "poetry.lock",
  ],

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      if (!isPythonDependencyFile(file.path)) {
        continue;
      }

      const diff = changeSet.diffs.find(d => d.path === file.path);
      const fileType = getDependencyFileType(file.path);

      if (diff) {
        const addedPackages = extractAddedPackages(diff, fileType);
        const removedPackages = extractRemovedPackages(diff, fileType);

        // Create a set of removed package names for comparison
        const removedNames = new Set(removedPackages.map(p => p.name));
        const addedNames = new Set(addedPackages.map(p => p.name));

        // Process added packages
        for (const pkg of addedPackages) {
          const wasRemoved = removedNames.has(pkg.name);
          const removedPkg = wasRemoved
            ? removedPackages.find(p => p.name === pkg.name)
            : undefined;

          // Determine impact
          let impact: "major" | "minor" | "patch" | "new" | "unknown" = "new";
          if (wasRemoved && removedPkg?.version && pkg.version) {
            // Version changed - simple heuristic based on first digit
            const oldMajor = parseInt(removedPkg.version.match(/(\d+)/)?.[1] ?? "0", 10);
            const newMajor = parseInt(pkg.version.match(/(\d+)/)?.[1] ?? "0", 10);
            if (newMajor > oldMajor) {
              impact = "major";
            } else {
              impact = "minor";
            }
          } else if (wasRemoved) {
            impact = "unknown";
          }

          const riskCategory = RISKY_PACKAGES[pkg.name];
          const additions = getAdditions(diff);
          const excerpt = additions.find(l => l.toLowerCase().includes(pkg.name)) ?? pkg.name;

          findings.push({
            type: "dependency-change",
            kind: "dependency-change",
            category: "dependencies",
            confidence: "high",
            evidence: [createEvidence(file.path, excerpt)],
            name: pkg.name,
            section: "dependencies",
            from: removedPkg?.version,
            to: pkg.version,
            impact,
            riskCategory,
          });
        }

        // Process removed packages (that weren't re-added with different version)
        for (const pkg of removedPackages) {
          if (addedNames.has(pkg.name)) {
            continue; // Already handled as update
          }

          const deletions = getDeletions(diff);
          const excerpt = deletions.find(l => l.toLowerCase().includes(pkg.name)) ?? pkg.name;

          findings.push({
            type: "dependency-change",
            kind: "dependency-change",
            category: "dependencies",
            confidence: "high",
            evidence: [createEvidence(file.path, excerpt)],
            name: pkg.name,
            section: "dependencies",
            from: pkg.version,
            to: undefined,
            impact: "removed",
          });
        }
      } else if (file.status === "added" || file.status === "deleted") {
        // File added or deleted without diff details
        findings.push({
          type: "dependency-change",
          kind: "dependency-change",
          category: "dependencies",
          confidence: "medium",
          evidence: [createEvidence(file.path, `${fileType} file ${file.status}`)],
          name: file.path,
          section: "dependencies",
          impact: file.status === "added" ? "new" : "removed",
        });
      }
    }

    return findings;
  },
};
