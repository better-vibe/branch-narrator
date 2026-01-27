/**
 * Finding-to-flag conversion rules.
 * 
 * This module contains rules that convert findings into risk flags.
 * Each rule examines findings and produces risk flags with:
 * - Stable flagId
 * - ruleKey
 * - relatedFindingIds (links back to findings)
 * - Score and confidence
 * - Evidence and suggested checks
 *
 * ## Canonical mapping (legacy detectors → analyzers/findings → rule keys)
 *
 * `risk-report` is derived from analyzer findings (single analysis pipeline).
 * The legacy detector system in `src/commands/risk/detectors/*` duplicated this
 * logic and used some inconsistent rule keys and thresholds.
 *
 * The rule keys in this module are the canonical identifiers:
 *
 * - Security / CI:
 *   - `detectWorkflowPermissionsBroadened` → `CIWorkflowFinding(riskType=permissions_broadened)` → `security.workflow_permissions_broadened`
 *   - `detectPullRequestTarget` → `CIWorkflowFinding(riskType=pull_request_target)` → `security.workflow_uses_pull_request_target`
 *   - `detectRemoteScriptDownload` → `CIWorkflowFinding(riskType=remote_script_download)` → `security.workflow_downloads_remote_script`
 *   - `detectCIPipelineChanged` → `CIWorkflowFinding(riskType=pipeline_changed)` → `ci.pipeline_changed`
 *
 * - Database:
 *   - `detectDestructiveSQL` → `SQLRiskFinding(riskType=destructive)` → `db.destructive_sql`
 *   - `detectRiskySchemaChange` → `SQLRiskFinding(riskType=schema_change)` → `db.schema_change_risky`
 *   - `detectUnscopedDataModification` → `SQLRiskFinding(riskType=unscoped_modification)` → `db.unscoped_data_modification`
 *   - `detectMigrationsChanged` → `DbMigrationFinding` → `db.migrations_changed`
 *
 * - Dependencies:
 *   - `detectNewProdDependency` → `DependencyChangeFinding(impact=new, section=dependencies)` → `deps.new_prod_dependency`
 *   - `detectMajorBump` (legacy id `deps.major_bump`) → `DependencyChangeFinding(impact=major)` → `deps.major_version_bump`
 *   - `detectLockfileWithoutManifest` (legacy id `deps.lockfile_changed_without_manifest`) → `LockfileFinding` → `deps.lockfile_without_manifest`
 *
 * - Infrastructure:
 *   - `detectDockerfileChanged` → `InfraChangeFinding(infraType=dockerfile)` → `infra.dockerfile_changed`
 *   - `detectTerraformChanged` → `InfraChangeFinding(infraType=terraform)` → `infra.terraform_changed`
 *   - `detectK8sManifestChanged` (legacy id `infra.k8s_manifest_changed`) → `InfraChangeFinding(infraType=k8s)` → `infra.k8s_changed`
 *
 * - API:
 *   - `detectAPIContractChanged` → `APIContractChangeFinding` → `api.contract_changed`
 *
 * - Tests:
 *   - `detectTestsChanged` → `TestChangeFinding` → `tests.changed`
 * - Churn:
 *   - `detectLargeDiff` → `LargeDiffFinding` → `churn.large_diff`
 */

import type {
  Finding,
  RiskFlag,
  RiskFlagEvidence,
  CIWorkflowFinding,
  SQLRiskFinding,
  InfraChangeFinding,
  APIContractChangeFinding,
  LargeDiffFinding,
  LockfileFinding,
  DependencyChangeFinding,
  DbMigrationFinding,
  TestChangeFinding,
  StencilComponentChangeFinding,
  StencilPropChangeFinding,
  StencilEventChangeFinding,
  StencilMethodChangeFinding,
  StencilSlotChangeFinding,
} from "../../core/types.js";
import { buildFlagId } from "../../core/ids.js";

/**
 * Convert evidence from findings to risk flag evidence format.
 */
function convertEvidence(finding: Finding): RiskFlagEvidence[] {
  return finding.evidence.map(ev => ({
    file: ev.file,
    hunk: ev.hunk ? `@@ -${ev.hunk.oldStart},${ev.hunk.oldLines} +${ev.hunk.newStart},${ev.hunk.newLines} @@` : undefined,
    lines: ev.excerpt.split("\n").slice(0, 5),
  }));
}

/**
 * Convert CI workflow findings to flags.
 */
function ciWorkflowToFlags(findings: Array<CIWorkflowFinding & { findingId: string }>): RiskFlag[] {
  const flags: RiskFlag[] = [];
  
  for (const finding of findings) {
    const relatedFindingIds = [finding.findingId];
    
    switch (finding.riskType) {
      case "permissions_broadened": {
        const ruleKey = "security.workflow_permissions_broadened";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "security",
          score: 35,
          confidence: 0.9,
          title: "Workflow permissions broadened",
          summary: `Workflow ${finding.file} has broadened permissions (write access)`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Review if write permissions are necessary",
            "Ensure principle of least privilege",
            "Check if GITHUB_TOKEN usage is secure",
          ],
          effectiveScore: Math.round(35 * 0.9),
        });
        break;
      }
      
      case "pull_request_target": {
        const ruleKey = "security.workflow_uses_pull_request_target";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "security",
          score: 40,
          confidence: 0.9,
          title: "Workflow uses pull_request_target",
          summary: `Workflow ${finding.file} uses pull_request_target event (can expose secrets)`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Ensure no untrusted code is executed in this context",
            "Review if pull_request_target is necessary (vs pull_request)",
            "Verify secrets are not exposed to PR authors",
          ],
          effectiveScore: Math.round(40 * 0.9),
        });
        break;
      }
      
      case "remote_script_download": {
        const ruleKey = "security.workflow_downloads_remote_script";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "security",
          score: 45,
          confidence: 0.85,
          title: "Workflow downloads and executes remote scripts",
          summary: `Workflow ${finding.file} downloads and pipes to shell (supply chain risk)`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Pin script sources to specific commit SHAs",
            "Verify script integrity with checksums",
            "Consider vendoring the script instead",
          ],
          effectiveScore: Math.round(45 * 0.85),
        });
        break;
      }
      
      case "pipeline_changed": {
        const ruleKey = "ci.pipeline_changed";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "ci",
          score: 10,
          confidence: 0.7,
          title: "CI/CD pipeline configuration changed",
          summary: `Pipeline ${finding.file} was modified`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Review pipeline changes for security implications",
            "Test pipeline changes in a non-production environment",
          ],
          effectiveScore: Math.round(10 * 0.7),
        });
        break;
      }
    }
  }
  
  return flags;
}

/**
 * Convert SQL risk findings to flags.
 */
function sqlRiskToFlags(findings: Array<SQLRiskFinding & { findingId: string }>): RiskFlag[] {
  const flags: RiskFlag[] = [];
  
  for (const finding of findings) {
    const relatedFindingIds = [finding.findingId];
    
    switch (finding.riskType) {
      case "destructive": {
        const ruleKey = "db.destructive_sql";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "db",
          score: 45,
          confidence: 0.9,
          title: "Destructive SQL detected",
          summary: `Migration ${finding.file} contains DROP TABLE/COLUMN or TRUNCATE`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Backup data before running migration",
            "Verify this is intentional data deletion",
            "Test migration rollback procedure",
            "Consider making column nullable instead of dropping",
          ],
          effectiveScore: Math.round(45 * 0.9),
        });
        break;
      }
      
      case "schema_change": {
        const ruleKey = "db.schema_change_risky";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "db",
          score: 30,
          confidence: 0.85,
          title: "Risky schema change detected",
          summary: `Migration ${finding.file} contains ALTER COLUMN or TYPE change`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Test schema changes on production-like data",
            "Check for data type compatibility",
            "Monitor migration execution time (may lock table)",
          ],
          effectiveScore: Math.round(30 * 0.85),
        });
        break;
      }
      
      case "unscoped_modification": {
        const ruleKey = "db.unscoped_data_modification";
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "db",
          score: 35,
          confidence: 0.75,
          title: "Unscoped data modification detected",
          summary: `Migration ${finding.file} contains UPDATE/DELETE without WHERE clause`,
          evidence: convertEvidence(finding),
          suggestedChecks: [
            "Verify this affects all rows intentionally",
            "Add WHERE clause if only subset should be modified",
            "Test on staging data first",
          ],
          effectiveScore: Math.round(35 * 0.75),
        });
        break;
      }
    }
  }
  
  return flags;
}

/**
 * Convert Stencil findings to flags.
 */
function stencilToFlags(findings: Array<Finding & { findingId: string }>): RiskFlag[] {
  const flags: RiskFlag[] = [];

  const componentFindings = findings.filter(f => f.type === "stencil-component-change") as Array<StencilComponentChangeFinding & { findingId: string }>;
  const propFindings = findings.filter(f => f.type === "stencil-prop-change") as Array<StencilPropChangeFinding & { findingId: string }>;
  const eventFindings = findings.filter(f => f.type === "stencil-event-change") as Array<StencilEventChangeFinding & { findingId: string }>;
  const methodFindings = findings.filter(f => f.type === "stencil-method-change") as Array<StencilMethodChangeFinding & { findingId: string }>;
  const slotFindings = findings.filter(f => f.type === "stencil-slot-change") as Array<StencilSlotChangeFinding & { findingId: string }>;

  // High severity: Tag changed
  for (const f of componentFindings) {
    if (f.change === "tag-changed") {
      const ruleKey = "stencil.tag_changed";
      const relatedFindingIds = [f.findingId];
      flags.push({
        ruleKey,
        flagId: buildFlagId(ruleKey, relatedFindingIds),
        relatedFindingIds,
        category: "api",
        score: 45,
        confidence: 0.95,
        title: "Component tag changed",
        summary: `Tag changed from "${f.fromTag}" to "${f.toTag}"`,
        evidence: convertEvidence(f),
        suggestedChecks: [
          "Update all usages of this component",
          "This is a breaking change",
        ],
        effectiveScore: Math.round(45 * 0.95),
      });
    }

    if (f.change === "shadow-changed") {
      const ruleKey = "stencil.shadow_changed";
      const relatedFindingIds = [f.findingId];
      flags.push({
        ruleKey,
        flagId: buildFlagId(ruleKey, relatedFindingIds),
        relatedFindingIds,
        category: "api",
        score: 25,
        confidence: 0.9,
        title: "Shadow DOM configuration changed",
        summary: `Shadow DOM enabled changed from ${f.fromShadow} to ${f.toShadow}`,
        evidence: convertEvidence(f),
        suggestedChecks: [
          "Check styles and global styling impact",
        ],
        effectiveScore: Math.round(25 * 0.9),
      });
    }
  }

  // High severity: Prop removed or changed
  for (const f of propFindings) {
    if (f.change === "removed") {
      const ruleKey = "stencil.prop_removed";
      const relatedFindingIds = [f.findingId];
      flags.push({
        ruleKey,
        flagId: buildFlagId(ruleKey, relatedFindingIds),
        relatedFindingIds,
        category: "api",
        score: 40,
        confidence: 0.95,
        title: "Component prop removed",
        summary: `Prop "${f.propName}" removed from <${f.tag}>`,
        evidence: convertEvidence(f),
        suggestedChecks: [
          "This is a breaking change",
          "Check usages",
        ],
        effectiveScore: Math.round(40 * 0.95),
      });
    } else if (f.change === "changed") {
      const ruleKey = "stencil.prop_changed";
      const relatedFindingIds = [f.findingId];
      flags.push({
        ruleKey,
        flagId: buildFlagId(ruleKey, relatedFindingIds),
        relatedFindingIds,
        category: "api",
        score: 35,
        confidence: 0.9,
        title: "Component prop modified",
        summary: `Prop "${f.propName}" options changed`,
        evidence: convertEvidence(f),
        suggestedChecks: [
          "Check for attribute/reflect/mutable changes",
        ],
        effectiveScore: Math.round(35 * 0.9),
      });
    }
  }

  // High severity: Event removed or changed
  for (const f of eventFindings) {
      if (f.change === "removed") {
        const ruleKey = "stencil.event_removed";
        const relatedFindingIds = [f.findingId];
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "api",
          score: 40,
          confidence: 0.95,
          title: "Component event removed",
          summary: `Event "${f.eventName}" removed from <${f.tag}>`,
          evidence: convertEvidence(f),
          suggestedChecks: [
            "This is a breaking change",
            "Check event listeners",
          ],
          effectiveScore: Math.round(40 * 0.95),
        });
      } else if (f.change === "changed") {
        const ruleKey = "stencil.event_changed";
        const relatedFindingIds = [f.findingId];
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "api",
          score: 35,
          confidence: 0.9,
          title: "Component event modified",
          summary: `Event "${f.eventName}" options changed`,
          evidence: convertEvidence(f),
          suggestedChecks: [
            "Check bubbles/composed/cancelable options",
          ],
          effectiveScore: Math.round(35 * 0.9),
        });
      }
    }

  // High severity: Method removed or changed
  for (const f of methodFindings) {
      if (f.change === "removed") {
        const ruleKey = "stencil.method_removed";
        const relatedFindingIds = [f.findingId];
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "api",
          score: 40,
          confidence: 0.95,
          title: "Component method removed",
          summary: `Method "${f.methodName}" removed from <${f.tag}>`,
          evidence: convertEvidence(f),
          suggestedChecks: [
            "This is a breaking change",
            "Check usages",
          ],
          effectiveScore: Math.round(40 * 0.95),
        });
      }
      // Changed not fully implemented yet in analyzer, but if it were:
      else if (f.change === "changed") {
         // ...
      }
    }

  // High severity: Slot removed
  for (const f of slotFindings) {
      if (f.change === "removed") {
        const ruleKey = "stencil.slot_removed";
        const relatedFindingIds = [f.findingId];
        flags.push({
          ruleKey,
          flagId: buildFlagId(ruleKey, relatedFindingIds),
          relatedFindingIds,
          category: "api",
          score: 35,
          confidence: 0.9,
          title: "Component slot removed",
          summary: `Slot "${f.slotName}" removed from <${f.tag}>`,
          evidence: convertEvidence(f),
          suggestedChecks: [
             "Check content projection usages",
          ],
          effectiveScore: Math.round(35 * 0.9),
        });
      }
    }

  return flags;
}

/**
 * Convert findings to risk flags using rules.
 */
export function findingsToFlags(findings: Array<Finding & { findingId: string }>): RiskFlag[] {
  const flags: RiskFlag[] = [];
  
  // Group findings by type
  const ciWorkflowFindings = findings.filter(f => f.type === "ci-workflow") as Array<CIWorkflowFinding & { findingId: string }>;
  const sqlRiskFindings = findings.filter(f => f.type === "sql-risk") as Array<SQLRiskFinding & { findingId: string }>;
  const infraFindings = findings.filter(f => f.type === "infra-change") as Array<InfraChangeFinding & { findingId: string }>;
  const apiContractFindings = findings.filter(f => f.type === "api-contract-change") as Array<APIContractChangeFinding & { findingId: string }>;
  const largeDiffFindings = findings.filter(f => f.type === "large-diff") as Array<LargeDiffFinding & { findingId: string }>;
  const lockfileFindings = findings.filter(f => f.type === "lockfile-mismatch") as Array<LockfileFinding & { findingId: string }>;
  const depChanges = findings.filter(f => f.type === "dependency-change") as Array<DependencyChangeFinding & { findingId: string }>;
  const dbMigrations = findings.filter(f => f.type === "db-migration") as Array<DbMigrationFinding & { findingId: string }>;
  const testChanges = findings.filter(f => f.type === "test-change") as Array<TestChangeFinding & { findingId: string }>;
  
  // Apply conversion rules
  flags.push(...ciWorkflowToFlags(ciWorkflowFindings));
  flags.push(...sqlRiskToFlags(sqlRiskFindings));
  flags.push(...stencilToFlags(findings));
  
  // Infrastructure changes
  for (const finding of infraFindings) {
    const relatedFindingIds = [finding.findingId];
    const ruleKey = `infra.${finding.infraType}_changed`;
    const titles: Record<typeof finding.infraType, string> = {
      dockerfile: "Dockerfile changed",
      terraform: "Terraform configuration changed",
      k8s: "Kubernetes manifest changed",
    };
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "infra",
      score: 20,
      confidence: 0.8,
      title: titles[finding.infraType],
      summary: `${finding.files.length} ${finding.infraType} ${finding.files.length === 1 ? "file" : "files"} changed`,
      evidence: finding.files.slice(0, 3).map(file => ({ file, lines: [`File changed`] })),
      suggestedChecks: [
        "Review infrastructure changes carefully",
        "Test in staging environment",
        "Verify no unintended resource changes",
      ],
      effectiveScore: Math.round(20 * 0.8),
    });
  }
  
  // API contract changes
  if (apiContractFindings.length > 0) {
    // Collect all findingIds from all API contract findings
    const relatedFindingIds = apiContractFindings.map(f => f.findingId);
    const ruleKey = "api.contract_changed";
    
    // Collect all changed files across all findings
    const allFiles = apiContractFindings.flatMap(f => f.files);
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "api",
      score: 25,
      confidence: 0.85,
      title: "API contract changed",
      summary: `${allFiles.length} API ${allFiles.length === 1 ? "file" : "files"} changed`,
      evidence: allFiles.slice(0, 3).map(file => ({ file, lines: [`File changed`] })),
      suggestedChecks: [
        "Verify backwards compatibility",
        "Update API documentation",
        "Notify API consumers of changes",
      ],
      effectiveScore: Math.round(25 * 0.85),
    });
  }
  
  // Large diff
  if (largeDiffFindings.length > 0) {
    const finding = largeDiffFindings[0];
    const relatedFindingIds = [finding.findingId];
    const ruleKey = "churn.large_diff";
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "churn",
      score: 15,
      confidence: 0.9,
      title: "Large diff detected",
      summary: `${finding.filesChanged} files changed, ${finding.linesChanged} lines modified`,
      evidence: [],
      suggestedChecks: [
        "Consider breaking into smaller PRs",
        "Ensure adequate test coverage",
        "Review carefully for unintended changes",
      ],
      effectiveScore: Math.round(15 * 0.9),
    });
  }
  
  // Lockfile mismatch
  for (const finding of lockfileFindings) {
    const relatedFindingIds = [finding.findingId];
    const ruleKey = "deps.lockfile_without_manifest";
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "deps",
      score: 20,
      confidence: 0.9,
      title: "Lockfile changed without manifest",
      summary: finding.manifestChanged
        ? "package.json changed without lockfile update"
        : "Lockfile changed without package.json update",
      evidence: [],
      suggestedChecks: [
        "Run package manager install to sync lockfile",
        "Verify dependencies are correctly resolved",
      ],
      effectiveScore: Math.round(20 * 0.9),
    });
  }
  
  // New production dependencies
  const newProdDeps = depChanges.filter(d => d.section === "dependencies" && !d.from);
  if (newProdDeps.length > 0) {
    const relatedFindingIds = newProdDeps.map(f => f.findingId);
    const ruleKey = "deps.new_prod_dependency";
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "deps",
      score: 15,
      confidence: 0.85,
      title: "New production dependencies added",
      summary: `${newProdDeps.length} new production ${newProdDeps.length === 1 ? "dependency" : "dependencies"} added`,
      evidence: newProdDeps.slice(0, 5).map(d => ({
        file: "package.json",
        lines: [`+ "${d.name}": "${d.to}"`],
      })),
      suggestedChecks: [
        "Review new dependencies for security vulnerabilities",
        "Check license compatibility",
        "Verify dependencies are actively maintained",
      ],
      tags: newProdDeps.map(d => d.name),
      effectiveScore: Math.round(15 * 0.85),
    });
  }
  
  // Major version bumps
  const majorBumps = depChanges.filter(d => d.impact === "major");
  if (majorBumps.length > 0) {
    const relatedFindingIds = majorBumps.map(f => f.findingId);
    const ruleKey = "deps.major_version_bump";
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "deps",
      score: 25,
      confidence: 0.9,
      title: "Major dependency version bump",
      summary: `${majorBumps.length} ${majorBumps.length === 1 ? "dependency" : "dependencies"} with major version changes`,
      evidence: majorBumps.slice(0, 5).map(d => ({
        file: "package.json",
        lines: [`"${d.name}": "${d.from}" -> "${d.to}"`],
      })),
      suggestedChecks: [
        "Review breaking changes in dependency changelogs",
        "Update code for API changes",
        "Run full test suite",
      ],
      tags: majorBumps.map(d => d.name),
      effectiveScore: Math.round(25 * 0.9),
    });
  }
  
  // Database migrations
  if (dbMigrations.length > 0) {
    const relatedFindingIds = dbMigrations.map(f => f.findingId);
    const ruleKey = "db.migrations_changed";
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "db",
      score: 12,
      confidence: 0.8,
      title: "Database migrations changed",
      summary: `${dbMigrations.length} migration/SQL ${dbMigrations.length === 1 ? "file" : "files"} changed`,
      evidence: dbMigrations.slice(0, 3).flatMap(m => m.files.map(file => ({
        file,
        lines: ["Migration file changed"],
      }))),
      suggestedChecks: [
        "Test migrations on a staging database",
        "Ensure migrations are reversible",
        "Check for data loss or downtime impact",
      ],
      effectiveScore: Math.round(12 * 0.8),
    });
  }
  
  // Test changes
  if (testChanges.length > 0) {
    const relatedFindingIds = testChanges.map(f => f.findingId);
    const ruleKey = "tests.changed";
    
    flags.push({
      ruleKey,
      flagId: buildFlagId(ruleKey, relatedFindingIds),
      relatedFindingIds,
      category: "tests",
      score: 5,
      confidence: 0.8,
      title: "Test files changed",
      summary: `${testChanges.length} test ${testChanges.length === 1 ? "file" : "files"} modified`,
      evidence: testChanges.slice(0, 3).flatMap(t => t.files.map(file => ({
        file,
        lines: ["Test file changed"],
      }))),
      suggestedChecks: [
        "Verify tests still pass",
        "Review test coverage changes",
      ],
      effectiveScore: Math.round(5 * 0.8),
    });
  }
  
  return flags;
}
