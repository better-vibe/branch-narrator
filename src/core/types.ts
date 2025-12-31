/**
 * Core types for branch-narrator findings and change analysis.
 */

// ============================================================================
// File Change Types
// ============================================================================

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
  path: string;
  status: FileStatus;
  oldPath?: string; // For renames
}

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  additions: string[];
  deletions: string[];
}

export interface FileDiff {
  path: string;
  status: FileStatus;
  oldPath?: string;
  hunks: Hunk[];
}

// ============================================================================
// Finding Types (Discriminated Union)
// ============================================================================

export interface FileSummaryFinding {
  type: "file-summary";
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}

export interface DependencyChangeFinding {
  type: "dependency-change";
  name: string;
  section: "dependencies" | "devDependencies";
  from?: string;
  to?: string;
  impact?: "major" | "minor" | "patch" | "new" | "removed" | "unknown";
  riskCategory?: "auth" | "database" | "native" | "payment";
}

export type RouteType = "page" | "layout" | "endpoint" | "error" | "unknown";

export interface RouteChangeFinding {
  type: "route-change";
  routeId: string;
  file: string;
  change: FileStatus;
  routeType: RouteType;
  methods?: string[]; // For endpoints: GET, POST, etc.
}

export type EnvVarChange = "added" | "touched";

export interface EnvVarFinding {
  type: "env-var";
  name: string;
  change: EnvVarChange;
  evidenceFiles: string[];
}

export type MigrationRisk = "high" | "medium" | "low";

export interface DbMigrationFinding {
  type: "db-migration";
  tool: "supabase";
  files: string[];
  risk: MigrationRisk;
  reasons: string[];
}

export type CloudflareArea = "wrangler" | "pages" | "workers" | "ci";

export interface CloudflareChangeFinding {
  type: "cloudflare-change";
  area: CloudflareArea;
  files: string[];
}

export interface TestChangeFinding {
  type: "test-change";
  framework: "vitest";
  files: string[];
}

export type RiskLevel = "high" | "medium" | "low";

export interface RiskFlagFinding {
  type: "risk-flag";
  risk: RiskLevel;
  evidence: string;
}

export type FileCategory =
  | "product"
  | "tests"
  | "ci"
  | "infra"
  | "docs"
  | "dependencies"
  | "config"
  | "other";

export interface FileCategoryFinding {
  type: "file-category";
  categories: Record<FileCategory, string[]>;
  summary: Array<{
    category: FileCategory;
    count: number;
  }>;
}

export type SecurityFileReason =
  | "auth-path"
  | "session-path"
  | "permission-path"
  | "middleware"
  | "guard"
  | "policy";

export interface SecurityFileFinding {
  type: "security-file";
  files: string[];
  reasons: SecurityFileReason[];
}

export type RiskyPackageCategory =
  | "auth"
  | "database"
  | "native"
  | "payment";

export type Finding =
  | FileSummaryFinding
  | DependencyChangeFinding
  | RouteChangeFinding
  | EnvVarFinding
  | DbMigrationFinding
  | CloudflareChangeFinding
  | TestChangeFinding
  | RiskFlagFinding
  | FileCategoryFinding
  | SecurityFileFinding;

// ============================================================================
// Risk Score
// ============================================================================

export interface RiskScore {
  score: number; // 0-100
  level: RiskLevel;
  evidenceBullets: string[];
}

// ============================================================================
// ChangeSet (normalized structure from git diff)
// ============================================================================

export interface ChangeSet {
  base: string;
  head: string;
  files: FileChange[];
  diffs: FileDiff[];
  basePackageJson?: Record<string, unknown>;
  headPackageJson?: Record<string, unknown>;
}

// ============================================================================
// Analyzer Interface
// ============================================================================

export interface Analyzer {
  name: string;
  analyze(changeSet: ChangeSet): Finding[];
}

// ============================================================================
// Profile
// ============================================================================

export type ProfileName = "auto" | "sveltekit";

export interface Profile {
  name: ProfileName;
  analyzers: Analyzer[];
}

// ============================================================================
// Render Context
// ============================================================================

export interface RenderContext {
  findings: Finding[];
  riskScore: RiskScore;
  profile: ProfileName;
  interactive?: {
    context?: string;
    testNotes?: string;
  };
}

