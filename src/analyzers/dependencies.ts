/**
 * Dependency change analyzer.
 */

import * as semver from "semver";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  DependencyChangeFinding,
  Finding,
  RiskFlagFinding,
} from "../core/types.js";

type DependencySection = "dependencies" | "devDependencies";

interface PackageDeps {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// Critical packages that warrant a risk flag on major bump
const CRITICAL_PACKAGES = ["@sveltejs/kit", "svelte", "vite"];

// Risky package categories
type RiskyCategory = "auth" | "database" | "native" | "payment";

/**
 * Pre-built Map for O(1) risky package category lookup.
 * Built at module load time for maximum performance.
 */
const RISKY_PACKAGE_MAP: Map<string, RiskyCategory> = new Map([
  // auth packages
  ...["passport", "jsonwebtoken", "bcrypt", "bcryptjs", "oauth", "auth0",
    "@auth0/auth0-spa-js", "clerk", "@clerk/clerk-sdk-node", "@clerk/nextjs",
    "next-auth", "@auth/core", "@auth/sveltekit", "lucia", "lucia-auth",
    "arctic", "oslo", "express-session", "cookie-session", "passport-local",
    "passport-jwt", "passport-oauth2", "jose", "jwks-rsa", "supertokens-node",
    "@supabase/auth-helpers-sveltekit", "@supabase/ssr"
  ].map(pkg => [pkg, "auth" as RiskyCategory] as const),

  // database packages
  ...["prisma", "@prisma/client", "drizzle-orm", "typeorm", "sequelize",
    "knex", "mongoose", "pg", "mysql", "mysql2", "sqlite3", "better-sqlite3",
    "mongodb", "redis", "ioredis", "@neondatabase/serverless",
    "@planetscale/database", "@libsql/client", "kysely"
  ].map(pkg => [pkg, "database" as RiskyCategory] as const),

  // native packages (note: bcrypt appears in both auth and native)
  ...["sharp", "canvas", "node-gyp", "node-pre-gyp", "node-addon-api",
    "nan", "ffi-napi", "ref-napi", "argon2", "libsodium-wrappers",
    "sodium-native", "cpu-features", "usb", "serialport"
  ].map(pkg => [pkg, "native" as RiskyCategory] as const),

  // payment packages
  ...["stripe", "@stripe/stripe-js", "paypal-rest-sdk",
    "@paypal/checkout-server-sdk", "braintree", "square", "@square/web-sdk",
    "adyen-api-library", "razorpay", "mollie-api-node", "lemon-squeezy",
    "@polar-sh/sdk", "polar-sdk"
  ].map(pkg => [pkg, "payment" as RiskyCategory] as const),
]);

/**
 * Check if a package is in a risky category.
 * Uses Map lookup for O(1) performance.
 */
function getRiskyCategory(packageName: string): RiskyCategory | undefined {
  return RISKY_PACKAGE_MAP.get(packageName);
}

/**
 * Pre-compiled regex for version string cleaning.
 * Compiled once at module load time for performance.
 */
const VERSION_PREFIX_REGEX = /^[\^~>=<]+/;

/**
 * Clean version string for semver parsing.
 */
function cleanVersion(version: string): string {
  // Remove common prefixes: ^, ~, >=, etc.
  return version.replace(VERSION_PREFIX_REGEX, "").trim();
}

/**
 * Determine version impact.
 */
export function determineImpact(
  from: string | undefined,
  to: string | undefined
): "major" | "minor" | "patch" | "unknown" {
  if (!from || !to) {
    return "unknown";
  }

  const cleanFrom = cleanVersion(from);
  const cleanTo = cleanVersion(to);

  const parsedFrom = semver.parse(cleanFrom);
  const parsedTo = semver.parse(cleanTo);

  if (!parsedFrom || !parsedTo) {
    return "unknown";
  }

  if (parsedTo.major > parsedFrom.major) {
    return "major";
  }
  if (parsedTo.minor > parsedFrom.minor) {
    return "minor";
  }
  if (parsedTo.patch > parsedFrom.patch) {
    return "patch";
  }

  return "unknown";
}

/**
 * Compare dependencies between two package.json versions.
 */
export function compareDependencies(
  basePkg: PackageDeps | undefined,
  headPkg: PackageDeps | undefined
): DependencyChangeFinding[] {
  const findings: DependencyChangeFinding[] = [];

  const sections: DependencySection[] = ["dependencies", "devDependencies"];

  for (const section of sections) {
    const baseDeps = basePkg?.[section] ?? {};
    const headDeps = headPkg?.[section] ?? {};

    const allPackages = new Set([
      ...Object.keys(baseDeps),
      ...Object.keys(headDeps),
    ]);

    for (const name of allPackages) {
      const from = baseDeps[name];
      const to = headDeps[name];

      if (from === to) {
        continue; // No change
      }

      const riskCategory = getRiskyCategory(name);

      if (!from && to) {
        // Added
        const excerpt = `"${name}": "${to}"`;
        findings.push({
          type: "dependency-change",
          kind: "dependency-change",
          category: "dependencies",
          confidence: "high",
          evidence: [createEvidence("package.json", excerpt)],
          name,
          section,
          to,
          impact: "new",
          riskCategory,
        });
      } else if (from && !to) {
        // Removed
        const excerpt = `"${name}": "${from}" (removed)`;
        findings.push({
          type: "dependency-change",
          kind: "dependency-change",
          category: "dependencies",
          confidence: "high",
          evidence: [createEvidence("package.json", excerpt)],
          name,
          section,
          from,
          impact: "removed",
          riskCategory,
        });
      } else {
        // Changed
        const impact = determineImpact(from, to);
        const excerpt = `"${name}": "${from}" → "${to}"`;
        findings.push({
          type: "dependency-change",
          kind: "dependency-change",
          category: "dependencies",
          confidence: "high",
          evidence: [createEvidence("package.json", excerpt)],
          name,
          section,
          from,
          to,
          impact,
          riskCategory,
        });
      }
    }
  }

  return findings;
}

export const dependencyAnalyzer: Analyzer = {
  name: "dependencies",
  cacheScope: "files",
  filePatterns: ["package.json", "**/package.json"],

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    const depFindings = compareDependencies(
      changeSet.basePackageJson as PackageDeps | undefined,
      changeSet.headPackageJson as PackageDeps | undefined
    );

    findings.push(...depFindings);

    // Check for critical package major bumps
    for (const depFinding of depFindings) {
      if (
        CRITICAL_PACKAGES.includes(depFinding.name) &&
        depFinding.impact === "major" &&
        depFinding.from &&
        depFinding.to
      ) {
        const excerpt = `${depFinding.name}: ${depFinding.from} → ${depFinding.to}`;
        const riskFinding: RiskFlagFinding = {
          type: "risk-flag",
          kind: "risk-flag",
          category: "dependencies",
          confidence: "high",
          evidence: [createEvidence("package.json", excerpt)],
          risk: "high",
          evidenceText: `Major version bump: ${depFinding.name} ${depFinding.from} → ${depFinding.to}`,
        };
        findings.push(riskFinding);
      }

      // Flag risky packages
      if (depFinding.riskCategory && depFinding.impact === "new") {
        const categoryLabels: Record<RiskyCategory, string> = {
          auth: "Authentication/Security",
          database: "Database/ORM",
          native: "Native Module",
          payment: "Payment Processing",
        };
        const excerpt = `${depFinding.name}: ${depFinding.to}`;
        const riskFinding: RiskFlagFinding = {
          type: "risk-flag",
          kind: "risk-flag",
          category: "dependencies",
          confidence: "medium",
          evidence: [createEvidence("package.json", excerpt)],
          risk: "medium",
          evidenceText: `New ${categoryLabels[depFinding.riskCategory]} package: ${depFinding.name}`,
        };
        findings.push(riskFinding);
      }
    }

    return findings;
  },
};

