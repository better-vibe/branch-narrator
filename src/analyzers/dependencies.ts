/**
 * Dependency change analyzer.
 */

import * as semver from "semver";
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

const RISKY_PACKAGES: Record<RiskyCategory, string[]> = {
  auth: [
    "passport",
    "jsonwebtoken",
    "bcrypt",
    "bcryptjs",
    "oauth",
    "auth0",
    "@auth0/auth0-spa-js",
    "clerk",
    "@clerk/clerk-sdk-node",
    "@clerk/nextjs",
    "next-auth",
    "@auth/core",
    "@auth/sveltekit",
    "lucia",
    "lucia-auth",
    "arctic",
    "oslo",
    "express-session",
    "cookie-session",
    "passport-local",
    "passport-jwt",
    "passport-oauth2",
    "jose",
    "jwks-rsa",
    "supertokens-node",
    "@supabase/auth-helpers-sveltekit",
    "@supabase/ssr",
  ],
  database: [
    "prisma",
    "@prisma/client",
    "drizzle-orm",
    "typeorm",
    "sequelize",
    "knex",
    "mongoose",
    "pg",
    "mysql",
    "mysql2",
    "sqlite3",
    "better-sqlite3",
    "mongodb",
    "redis",
    "ioredis",
    "@neondatabase/serverless",
    "@planetscale/database",
    "@libsql/client",
    "kysely",
  ],
  native: [
    "sharp",
    "canvas",
    "node-gyp",
    "node-pre-gyp",
    "node-addon-api",
    "nan",
    "ffi-napi",
    "ref-napi",
    "bcrypt",
    "argon2",
    "libsodium-wrappers",
    "sodium-native",
    "cpu-features",
    "usb",
    "serialport",
  ],
  payment: [
    "stripe",
    "@stripe/stripe-js",
    "paypal-rest-sdk",
    "@paypal/checkout-server-sdk",
    "braintree",
    "square",
    "@square/web-sdk",
    "adyen-api-library",
    "razorpay",
    "mollie-api-node",
    "lemon-squeezy",
    "@polar-sh/sdk",
    "polar-sdk",
  ],
};

/**
 * Check if a package is in a risky category.
 */
function getRiskyCategory(packageName: string): RiskyCategory | undefined {
  for (const [category, packages] of Object.entries(RISKY_PACKAGES)) {
    if (packages.includes(packageName)) {
      return category as RiskyCategory;
    }
  }
  return undefined;
}

/**
 * Clean version string for semver parsing.
 */
function cleanVersion(version: string): string {
  // Remove common prefixes: ^, ~, >=, etc.
  return version.replace(/^[\^~>=<]+/, "").trim();
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
        findings.push({
          type: "dependency-change",
          name,
          section,
          to,
          impact: "new",
          riskCategory,
        });
      } else if (from && !to) {
        // Removed
        findings.push({
          type: "dependency-change",
          name,
          section,
          from,
          impact: "removed",
          riskCategory,
        });
      } else {
        // Changed
        const impact = determineImpact(from, to);
        findings.push({
          type: "dependency-change",
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
        const riskFinding: RiskFlagFinding = {
          type: "risk-flag",
          risk: "high",
          evidence: `Major version bump: ${depFinding.name} ${depFinding.from} → ${depFinding.to}`,
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
        const riskFinding: RiskFlagFinding = {
          type: "risk-flag",
          risk: "medium",
          evidence: `New ${categoryLabels[depFinding.riskCategory]} package: ${depFinding.name}`,
        };
        findings.push(riskFinding);
      }
    }

    return findings;
  },
};

