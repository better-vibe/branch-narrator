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
  | "api"
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
  findingId?: string; // Stable ID, format: "finding.file-summary#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.dependency-change#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.route-change#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.env-var#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.db-migration#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.cloudflare-change#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.test-change#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.risk-flag#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.file-category#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.security-file#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.convention-violation#<hash>"
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
  findingId?: string; // Stable ID, format: "finding.impact-analysis#<hash>"
}

export type CIWorkflowRisk =
  | "permissions_broadened"
  | "pull_request_target"
  | "remote_script_download"
  | "pipeline_changed";

export interface CIWorkflowFinding {
  type: "ci-workflow";
  kind: "ci-workflow";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  riskType: CIWorkflowRisk;
  details: string;
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.ci-workflow#<hash>"
}

export type SQLRisk =
  | "destructive"
  | "schema_change"
  | "unscoped_modification";

export interface SQLRiskFinding {
  type: "sql-risk";
  kind: "sql-risk";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  riskType: SQLRisk;
  details: string;
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.sql-risk#<hash>"
}

export type InfraChangeType =
  | "dockerfile"
  | "terraform"
  | "k8s";

export interface InfraChangeFinding {
  type: "infra-change";
  kind: "infra-change";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  infraType: InfraChangeType;
  files: string[];
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.infra-change#<hash>"
}

export interface APIContractChangeFinding {
  type: "api-contract-change";
  kind: "api-contract-change";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  files: string[];
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.api-contract-change#<hash>"
}

export interface LargeDiffFinding {
  type: "large-diff";
  kind: "large-diff";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  filesChanged: number;
  linesChanged: number;
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.large-diff#<hash>"
}

export interface LockfileFinding {
  type: "lockfile-mismatch";
  kind: "lockfile-mismatch";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  manifestChanged: boolean;
  lockfileChanged: boolean;
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.lockfile-mismatch#<hash>"
}

export interface TestGapFinding {
  type: "test-gap";
  kind: "test-gap";
  category: Category;
  confidence: Confidence;
  evidence: Evidence[];
  prodFilesChanged: number;
  testFilesChanged: number;
  tags?: string[];
  findingId?: string; // Stable ID, format: "finding.test-gap#<hash>"
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
  | ImpactAnalysisFinding
  | CIWorkflowFinding
  | SQLRiskFinding
  | InfraChangeFinding
  | APIContractChangeFinding
  | LargeDiffFinding
  | LockfileFinding
  | TestGapFinding;

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
  generatedAt?: string; // ISO timestamp, omitted when --no-timestamp
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
  id: string; // Legacy field - now duplicated as ruleKey
  ruleKey?: string; // Stable rule identifier, e.g. "db.destructive_sql"
  flagId?: string; // Stable instance ID, format: "flag.<ruleKey>#<hash>"
  relatedFindingIds?: string[]; // Links to findings that triggered this flag
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
  generatedAt?: string; // ISO timestamp, omitted when --no-timestamp
  range: { base: string; head: string };
  riskScore: number; // 0..100
  riskLevel: RiskReportLevel;
  categoryScores: Record<RiskCategory, number>; // 0..100 per category
  flags: RiskFlag[];
  skippedFiles: Array<{ file: string; reason: string }>;
  scoreBreakdown?: ScoreBreakdown;
}

// ============================================================================
// Zoom Output Schema (for zoom command)
// ============================================================================

export interface ZoomEvidence {
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

export interface PatchContext {
  file: string;
  status: FileStatus;
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    content: string;
  }>;
}

export interface ZoomFindingOutput {
  schemaVersion: "1.0";
  generatedAt?: string; // ISO timestamp, omitted when --no-timestamp
  range: { base: string; head: string };
  itemType: "finding";
  findingId: string;
  finding: Finding;
  evidence: ZoomEvidence[];
  patchContext?: PatchContext[];
}

export interface ZoomFlagOutput {
  schemaVersion: "1.0";
  generatedAt?: string; // ISO timestamp, omitted when --no-timestamp
  range: { base: string; head: string };
  itemType: "flag";
  flagId: string;
  flag: RiskFlag;
  evidence: RiskFlagEvidence[];
  relatedFindings?: Finding[];
  patchContext?: PatchContext[];
}

export type ZoomOutput = ZoomFindingOutput | ZoomFlagOutput;

// ============================================================================
// Delta Output Schema (for --since comparison)
// ============================================================================

export interface CommandMetadata {
  name: string;
  args: string[];
}

export interface VersionMetadata {
  toolVersion: string;
  schemaVersion: string;
}

export interface ScopeMetadata {
  mode: string;
  base: string | null;
  head: string | null;
  profile?: string;
  include?: string[];
  exclude?: string[];
  only?: string[] | null;
}

export interface ScopeWarning {
  code: string;
  message: string;
}

export interface FindingChange {
  findingId: string;
  before: Finding;
  after: Finding;
}

export interface FactsDelta {
  schemaVersion: "1.0";
  generatedAt: string;
  command: CommandMetadata;
  since: {
    path: string;
    toolVersion: string;
    schemaVersion: string;
  };
  current: VersionMetadata;
  scope: ScopeMetadata;
  warnings: ScopeWarning[];
  delta: {
    added: string[];
    removed: string[];
    changed: FindingChange[];
  };
  summary: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
  };
}

export interface FlagChange {
  flagId: string;
  before: RiskFlag;
  after: RiskFlag;
}

export interface RiskReportDelta {
  schemaVersion: "1.0";
  generatedAt: string;
  command: CommandMetadata;
  since: {
    path: string;
    toolVersion: string;
    schemaVersion: string;
  };
  current: VersionMetadata;
  scope: ScopeMetadata;
  delta: {
    riskScore: {
      from: number;
      to: number;
      delta: number;
    };
    flags: {
      added: string[];
      removed: string[];
      changed: FlagChange[];
    };
  };
  summary: {
    flagAddedCount: number;
    flagRemovedCount: number;
    flagChangedCount: number;
  };
}

