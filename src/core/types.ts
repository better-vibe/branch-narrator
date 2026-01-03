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
// Evidence and Category Types
// ============================================================================

export interface Evidence {
  file: string;
  excerpt: string;
  line?: number;
  hunk?: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
  };
}

export type Category =
  | "routes"
  | "database"
  | "config_env"
  | "cloudflare"
  | "dependencies"
  | "tests"
  | "ci"
  | "docs"
  | "infra"
  | "unknown";

export type Confidence = "high" | "medium" | "low";

// ============================================================================
// Finding Types (Discriminated Union)
// ============================================================================

export interface FileSummaryFinding {
  type: "file-summary";
  kind: "file-summary";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
  tags?: string[];
}

export interface DependencyChangeFinding {
  type: "dependency-change";
  kind: "dependency-change";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  name: string;
  section: "dependencies" | "devDependencies";
  from?: string;
  to?: string;
  impact?: "major" | "minor" | "patch" | "new" | "removed" | "unknown";
  riskCategory?: "auth" | "database" | "native" | "payment";
  tags?: string[];
}

export type RouteType = "page" | "layout" | "endpoint" | "error" | "unknown";

export interface RouteChangeFinding {
  type: "route-change";
  kind: "route-change";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  routeId: string;
  file: string;
  change: FileStatus;
  routeType: RouteType;
  methods?: string[]; // For endpoints: GET, POST, etc.
  tags?: string[];
}

export type EnvVarChange = "added" | "touched";

export interface EnvVarFinding {
  type: "env-var";
  kind: "env-var";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  name: string;
  change: EnvVarChange;
  evidenceFiles: string[];
  tags?: string[];
}

export type MigrationRisk = "high" | "medium" | "low";

export interface DbMigrationFinding {
  type: "db-migration";
  kind: "db-migration";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  tool: "supabase";
  files: string[];
  risk: MigrationRisk;
  reasons: string[];
  tags?: string[];
}

export type CloudflareArea = "wrangler" | "pages" | "workers" | "ci";

export interface CloudflareChangeFinding {
  type: "cloudflare-change";
  kind: "cloudflare-change";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  area: CloudflareArea;
  files: string[];
  tags?: string[];
}

export interface TestChangeFinding {
  type: "test-change";
  kind: "test-change";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  framework: "vitest";
  files: string[];
  tags?: string[];
}

export type RiskLevel = "high" | "medium" | "low";

export interface RiskFlagFinding {
  type: "risk-flag";
  kind: "risk-flag";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  risk: RiskLevel;
  evidenceText: string; // Legacy field for compatibility
  tags?: string[];
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
  kind: "file-category";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  categories: Record<FileCategory, string[]>;
  summary: Array<{
    category: FileCategory;
    count: number;
  }>;
  tags?: string[];
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
  kind: "security-file";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  files: string[];
  reasons: SecurityFileReason[];
  tags?: string[];
}

export interface ConventionViolationFinding {
  type: "convention-violation";
  kind: "convention-violation";
  category: "tests";
  confidence: Confidence;
  evidence: Evidence[];
  message: string;
  files: string[];
  tags?: string[];
}

export interface ImpactAnalysisFinding {
  type: "impact-analysis";
  kind: "impact-analysis";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  sourceFile: string;
  affectedFiles: string[];
  importedSymbols?: string[];
  usageContext?: string;
  isTestFile?: boolean;
  blastRadius: "low" | "medium" | "high";
  tags?: string[];
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
  | SecurityFileFinding
  | ConventionViolationFinding
  | ImpactAnalysisFinding;

// ============================================================================
// Risk Score
// ============================================================================

export interface RiskFactor {
  kind: string;
  weight: number;
  explanation: string;
  evidence: Evidence[];
}

export interface RiskScore {
  score: number; // 0-100
  level: RiskLevel;
  factors: RiskFactor[];
  // Legacy field for compatibility
  evidenceBullets?: string[];
}

// ============================================================================
// Diff Mode
// ============================================================================

export type DiffMode = "branch" | "unstaged" | "staged" | "all";

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
  analyze(changeSet: ChangeSet): Finding[] | Promise<Finding[]>;
}

// ============================================================================
// Profile
// ============================================================================

export type ProfileName = "auto" | "sveltekit" | "react";

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

// ============================================================================
// Facts Output Schema (Agent-Grade)
// ============================================================================

export interface CategoryAggregate {
  id: Category;
  count: number;
  riskWeight: number;
  topEvidence: Evidence[];
}

export interface GitInfo {
  base: string;
  head: string;
  range: string;
  repoRoot: string;
  isDirty: boolean;
}

export interface ProfileInfo {
  requested: ProfileName;
  detected: ProfileName;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export interface Stats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  skippedFilesCount: number;
}

export interface Filters {
  defaultExcludes: string[];
  excludes: string[];
  includes: string[];
  redact: boolean;
  maxFileBytes: number;
  maxDiffBytes: number;
  maxFindings?: number;
}

export interface Summary {
  byArea: Record<string, number>;
  highlights: string[];
}

export interface Action {
  id: string;
  blocking: boolean;
  reason: string;
  commands: Array<{
    cmd: string;
    when: "local" | "ci" | "local-or-ci";
  }>;
}

export interface SkippedFile {
  file: string;
  reason: string;
  detail?: string;
}

export interface FactsOutput {
  schemaVersion: string;
  generatedAt: string;
  git: GitInfo;
  profile: ProfileInfo;
  stats: Stats;
  filters: Filters;
  summary: Summary;
  categories: CategoryAggregate[];
  risk: RiskScore;
  findings: Finding[];
  actions: Action[];
  skippedFiles: SkippedFile[];
  warnings: string[];
}

// ============================================================================
// Risk Report Schema (for risk-report command)
// ============================================================================

export type RiskReportLevel = "low" | "moderate" | "elevated" | "high" | "critical";

export type RiskCategory =
  | "security"
  | "ci"
  | "deps"
  | "db"
  | "infra"
  | "api"
  | "tests"
  | "churn";

export interface RiskFlagEvidence {
  file: string;
  hunk?: string;
  lines: string[];
}

export interface RiskFlag {
  id: string; // stable identifier, e.g. "db.destructive_sql"
  category: RiskCategory;
  score: number; // 0..100 (base score for this flag)
  confidence: number; // 0..1
  title: string;
  summary: string;
  evidence: RiskFlagEvidence[];
  suggestedChecks: string[];
  tags?: string[];
  effectiveScore: number; // round(score * confidence)
}

export interface ScoreBreakdown {
  maxCategory: { category: RiskCategory; score: number };
  topCategories: Array<{ category: RiskCategory; score: number }>;
  formula: string;
}

export interface RiskReport {
  schemaVersion: "1.0";
  range: { base: string; head: string };
  riskScore: number; // 0..100
  riskLevel: RiskReportLevel;
  categoryScores: Record<RiskCategory, number>; // 0..100 per category
  flags: RiskFlag[];
  skippedFiles: Array<{ file: string; reason: string }>;
  scoreBreakdown?: ScoreBreakdown;
}

