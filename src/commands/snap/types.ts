/**
 * Snapshot types for the snap command.
 *
 * These types define the schema for local workspace snapshots that capture
 * staged, unstaged, and untracked changes along with embedded analysis.
 */

import type { FactsOutput, Finding, RiskFlag, RiskReport } from "../../core/types.js";

// ============================================================================
// Snapshot Manifest Types
// ============================================================================

/**
 * Entry in the untracked files manifest.
 * Maps a file path to its stored blob and metadata.
 */
export interface SnapshotManifestEntry {
  /** Relative file path from repo root */
  path: string;
  /** SHA256 hash of file content (also used as blob filename) */
  blobSha256: string;
  /** File mode (e.g., 0o644 for regular, 0o755 for executable) */
  mode: number;
  /** File size in bytes */
  bytes: number;
}

/**
 * Manifest for untracked files in a snapshot.
 */
export interface SnapshotManifest {
  /** List of untracked file entries, sorted by path */
  entries: SnapshotManifestEntry[];
}

// ============================================================================
// Snapshot Patch Types
// ============================================================================

/**
 * Information about a stored patch file.
 */
export interface SnapshotPatchInfo {
  /** Relative path to patch file within snapshot directory */
  path: string;
  /** SHA256 hash of patch content */
  sha256: string;
  /** Patch file size in bytes */
  bytes: number;
}

// ============================================================================
// Snapshot Workspace State
// ============================================================================

/**
 * Workspace state captured in a snapshot.
 */
export interface SnapshotWorkspace {
  /** Patch files for staged and unstaged changes */
  patches: {
    /** Staged changes (index vs HEAD) */
    staged: SnapshotPatchInfo;
    /** Unstaged changes (working tree vs index) */
    unstaged: SnapshotPatchInfo;
  };
  /** Untracked files information */
  untracked: {
    /** Relative path to manifest.json within snapshot directory */
    manifestPath: string;
    /** Number of untracked files */
    fileCount: number;
    /** Total bytes of all untracked files */
    totalBytes: number;
  };
}

// ============================================================================
// Snapshot Git Info
// ============================================================================

/**
 * Git repository state at snapshot time.
 */
export interface SnapshotGitInfo {
  /** Full SHA of HEAD commit */
  headSha: string;
  /** Current branch name (empty if detached HEAD) */
  branch: string;
}

// ============================================================================
// Snapshot Tool Info
// ============================================================================

/**
 * Tool information embedded in snapshot.
 */
export interface SnapshotToolInfo {
  /** Tool name (always "branch-narrator") */
  name: "branch-narrator";
  /** Tool version at snapshot time */
  version: string;
}

// ============================================================================
// Main Snapshot JSON Schema
// ============================================================================

/**
 * Full snapshot JSON schema (v1.0).
 * This is the primary structure stored in snapshot.json.
 */
export interface SnapshotJson {
  /** Schema version for future compatibility */
  schemaVersion: "1.0";
  /** Unique snapshot identifier (12 hex chars) */
  snapshotId: string;
  /** User-provided label or auto-generated */
  label: string;
  /** ISO 8601 timestamp of snapshot creation */
  createdAt: string;
  /** Tool information */
  tool: SnapshotToolInfo;
  /** Git repository state */
  git: SnapshotGitInfo;
  /** Workspace state (patches + untracked) */
  workspace: SnapshotWorkspace;
  /** Embedded analysis results */
  analysis: {
    /** Facts output (without timestamp for determinism) */
    facts: FactsOutput;
    /** Risk report output (without timestamp for determinism) */
    riskReport: RiskReport;
  };
}

// ============================================================================
// Snapshot Index Types
// ============================================================================

/**
 * Entry in the snapshot index.
 * Contains summary information for quick listing.
 */
export interface SnapshotIndexEntry {
  /** Unique snapshot identifier */
  snapshotId: string;
  /** User-provided label */
  label: string;
  /** ISO 8601 timestamp of snapshot creation */
  createdAt: string;
  /** HEAD SHA at snapshot time */
  headSha: string;
  /** Branch name at snapshot time */
  branch: string;
  /** Number of changed files */
  filesChanged: number;
  /** Risk score (0-100) */
  riskScore: number;
  /** Number of risk flags */
  flagCount: number;
  /** Number of findings */
  findingCount: number;
}

/**
 * Snapshot index stored in index.json.
 * Provides quick access to all snapshots without loading full snapshot.json files.
 */
export interface SnapshotIndex {
  /** Schema version for future compatibility */
  schemaVersion: "1.0";
  /** List of snapshot entries, sorted by createdAt descending */
  snapshots: SnapshotIndexEntry[];
}

// ============================================================================
// Snapshot Delta Types
// ============================================================================

/**
 * Change record for a finding.
 */
export interface FindingChange {
  /** Finding ID that changed */
  findingId: string;
  /** Finding state in the "from" snapshot */
  before: Finding;
  /** Finding state in the "to" snapshot */
  after: Finding;
}

/**
 * Change record for a risk flag.
 */
export interface FlagChange {
  /** Flag ID that changed */
  flagId: string;
  /** Flag state in the "from" snapshot */
  before: RiskFlag;
  /** Flag state in the "to" snapshot */
  after: RiskFlag;
}

/**
 * Delta between two snapshots.
 * Used by `snap diff` to show what changed between iterations.
 */
export interface SnapshotDelta {
  /** Schema version for future compatibility */
  schemaVersion: "1.0";
  /** Source snapshot ID */
  from: string;
  /** Target snapshot ID */
  to: string;
  /** Delta details */
  delta: {
    /** Risk score change */
    riskScore: {
      from: number;
      to: number;
      delta: number;
    };
    /** Finding changes */
    findings: {
      /** Finding IDs added in target */
      added: string[];
      /** Finding IDs removed in target */
      removed: string[];
      /** Findings that changed between snapshots */
      changed: FindingChange[];
    };
    /** Flag changes */
    flags: {
      /** Flag IDs added in target */
      added: string[];
      /** Flag IDs removed in target */
      removed: string[];
      /** Flags that changed between snapshots */
      changed: FlagChange[];
    };
    /** File changes based on manifests and patches */
    files: {
      /** Files added in target */
      added: string[];
      /** Files removed in target */
      removed: string[];
      /** Files modified in target */
      modified: string[];
    };
  };
  /** Summary counts */
  summary: {
    findingsAdded: number;
    findingsRemoved: number;
    findingsChanged: number;
    flagsAdded: number;
    flagsRemoved: number;
    flagsChanged: number;
    filesAdded: number;
    filesRemoved: number;
    filesModified: number;
  };
}

// ============================================================================
// Command Options Types
// ============================================================================

/**
 * Options for snap save command.
 */
export interface SnapSaveOptions {
  /** Optional label for the snapshot */
  label?: string;
  /** Write snapshotId to file instead of stdout */
  out?: string;
  /** Working directory */
  cwd?: string;
}

/**
 * Options for snap list command.
 */
export interface SnapListOptions {
  /** Pretty-print JSON output */
  pretty?: boolean;
  /** Working directory */
  cwd?: string;
}

/**
 * Options for snap show command.
 */
export interface SnapShowOptions {
  /** Pretty-print JSON output */
  pretty?: boolean;
  /** Working directory */
  cwd?: string;
}

/**
 * Options for snap diff command.
 */
export interface SnapDiffOptions {
  /** Pretty-print JSON output */
  pretty?: boolean;
  /** Working directory */
  cwd?: string;
}

/**
 * Options for snap restore command.
 */
export interface SnapRestoreOptions {
  /** Working directory */
  cwd?: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of snap save command.
 */
export interface SnapSaveResult {
  /** Created snapshot ID */
  snapshotId: string;
  /** Snapshot label */
  label: string;
  /** Path to snapshot directory */
  snapshotPath: string;
}

/**
 * Result of snap restore command.
 */
export interface SnapRestoreResult {
  /** Restored snapshot ID */
  snapshotId: string;
  /** Pre-restore backup snapshot ID */
  backupSnapshotId: string;
  /** Whether restore was successful */
  success: boolean;
  /** Verification status */
  verified: boolean;
}
