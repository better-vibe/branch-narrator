/**
 * File category classifier - groups files into meaningful categories.
 */

import type {
  Analyzer,
  ChangeSet,
  FileCategory,
  FileCategoryFinding,
  Finding,
} from "../core/types.js";

// Category detection rules (order matters - first match wins)
const CATEGORY_RULES: Array<{
  category: FileCategory;
  patterns: RegExp[];
}> = [
  // Tests (check before product to exclude test files from product)
  {
    category: "tests",
    patterns: [
      /^tests?\//i,
      /^__tests__\//i,
      /\/tests?\//i, // matches src/tests/, lib/tests/, etc.
      /\/__tests__\//i,
      /\.test\.[jt]sx?$/i,
      /\.spec\.[jt]sx?$/i,
      /\.e2e\.[jt]sx?$/i,
      /vitest\.config/i,
      /jest\.config/i,
      /cypress\//i,
      /playwright\//i,
    ],
  },
  // CI/CD
  {
    category: "ci",
    patterns: [
      /^\.github\/workflows\//,
      /^\.github\/actions\//,
      /^\.gitlab-ci\.yml$/,
      /^\.circleci\//,
      /^Jenkinsfile$/,
      /^\.travis\.yml$/,
      /^azure-pipelines\.yml$/,
      /^bitbucket-pipelines\.yml$/,
    ],
  },
  // Infrastructure
  {
    category: "infra",
    patterns: [
      /^Dockerfile/i,
      /^docker-compose/i,
      /^\.dockerignore$/,
      /^helm\//i,
      /^charts?\//i,
      /^terraform\//i,
      /^\.tf$/,
      /^k8s\//i,
      /^kubernetes\//i,
      /^pulumi\//i,
      /^ansible\//i,
      /^Vagrantfile$/,
    ],
  },
  // Database (migrations, schemas, seeds)
  {
    category: "database",
    patterns: [
      /^supabase\/migrations\//,
      /^supabase\/seed/,
      /^prisma\/migrations\//,
      /^prisma\/schema\.prisma$/,
      /^drizzle\/migrations\//,
      /^drizzle\.config/,
      /^migrations?\//i,
      /\/migrations?\//i, // matches db/migrations/, database/migrations/, etc.
      /\.sql$/i,
    ],
  },
  // Documentation
  {
    category: "docs",
    patterns: [
      /^docs?\//i,
      /^documentation\//i,
      /\.md$/i,
      /\.mdx$/i,
      /^README/i,
      /^CHANGELOG/i,
      /^CONTRIBUTING/i,
      /^LICENSE/i,
      /^\.all-contributorsrc$/,
    ],
  },
  // Dependencies
  {
    category: "dependencies",
    patterns: [
      /^package\.json$/,
      /^package-lock\.json$/,
      /^yarn\.lock$/,
      /^pnpm-lock\.yaml$/,
      /^bun\.lock$/,
      /^bun\.lockb$/,
      /^requirements\.txt$/,
      /^Pipfile(\.lock)?$/,
      /^poetry\.lock$/,
      /^pyproject\.toml$/,
      /^Cargo\.(toml|lock)$/,
      /^go\.(mod|sum)$/,
      /^Gemfile(\.lock)?$/,
      /^composer\.(json|lock)$/,
    ],
  },
  // Configuration
  {
    category: "config",
    patterns: [
      /^\.[a-z]+rc(\.json|\.js|\.cjs|\.mjs|\.yaml|\.yml)?$/i,
      /\.config\.[jt]s$/i,
      /\.config\.[a-z]+\.[jt]s$/i, // e.g., vite.config.e2e.ts
      /^\.env/i,
      /^wrangler\.(toml|json)$/i,
      /^tsconfig.*\.json$/i,
      /^\.eslintrc/i,
      /^\.prettierrc/i,
      /^\.editorconfig$/,
      /^\.gitignore$/,
      /^\.nvmrc$/,
      /^\.node-version$/,
    ],
  },
  // Artifacts (build outputs, packages, binaries)
  {
    category: "artifacts",
    patterns: [
      /\.tgz$/i, // npm/bun pack tarballs
      /\.tar\.gz$/i, // compressed archives
      /\.zip$/i, // zip archives
      /\.whl$/i, // Python wheels
      /\.jar$/i, // Java archives
      /\.war$/i, // Java web archives
      /\.gem$/i, // Ruby gems
      /\.nupkg$/i, // NuGet packages
      /\.deb$/i, // Debian packages
      /\.rpm$/i, // RPM packages
      /\.dmg$/i, // macOS disk images
      /\.exe$/i, // Windows executables
      /\.dll$/i, // Windows libraries
      /\.so$/i, // Linux shared objects
      /\.dylib$/i, // macOS dynamic libraries
      /\.a$/i, // Static libraries
      /\.o$/i, // Object files
      /\.wasm$/i, // WebAssembly binaries
    ],
  },
  // Product code (src, lib, app - excluding already matched patterns)
  {
    category: "product",
    patterns: [
      /^src\//,
      /^lib\//,
      /^app\//,
      /^pages\//,
      /^components\//,
      /^hooks\//,
      /^utils\//,
      /^services\//,
      /^api\//,
      /^server\//,
      /^client\//,
      /\.[jt]sx?$/, // Any JS/TS file not matched above
      /\.svelte$/,
      /\.vue$/,
      /\.astro$/,
    ],
  },
];

/**
 * Determine the category of a file path.
 */
export function categorizeFile(path: string): FileCategory {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(path))) {
      return rule.category;
    }
  }
  return "other";
}

/**
 * Get a human-readable label for a category.
 */
export function getCategoryLabel(category: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    product: "Product Code",
    tests: "Tests",
    ci: "CI/CD",
    infra: "Infrastructure",
    database: "Database",
    docs: "Documentation",
    dependencies: "Dependencies",
    config: "Configuration",
    artifacts: "Build Artifacts",
    other: "Other",
  };
  return labels[category];
}

export const fileCategoryAnalyzer: Analyzer = {
  name: "file-category",

  analyze(changeSet: ChangeSet): Finding[] {
    const categories: Record<FileCategory, string[]> = {
      product: [],
      tests: [],
      ci: [],
      infra: [],
      database: [],
      docs: [],
      dependencies: [],
      config: [],
      artifacts: [],
      other: [],
    };

    // Categorize all changed files
    for (const file of changeSet.files) {
      const category = categorizeFile(file.path);
      categories[category].push(file.path);
    }

    // Build summary (only categories with files)
    const summary = (Object.entries(categories) as [FileCategory, string[]][])
      .filter(([, files]) => files.length > 0)
      .map(([category, files]) => ({
        category,
        count: files.length,
      }))
      .sort((a, b) => b.count - a.count);

    // Only emit if there are categorized files
    if (summary.length === 0) {
      return [];
    }

    const finding: FileCategoryFinding = {
      type: "file-category",
      kind: "file-category",
      category: "unknown",
      confidence: "high",
      evidence: [],
      categories,
      summary,
    };

    return [finding as unknown as Finding];
  },
};

