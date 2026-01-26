/**
 * Snap save command implementation.
 *
 * Creates a new snapshot of the current workspace state including:
 * - Staged changes (binary patch)
 * - Unstaged changes (binary patch)
 * - Untracked files (as blobs)
 * - Embedded analysis (facts + risk-report)
 */

import { writeFile as fsWriteFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  SnapshotJson,
  SnapshotManifest,
  SnapshotManifestEntry,
  SnapSaveOptions,
  SnapSaveResult,
} from "./types.js";
import {
  computeSnapshotId,
  computeSha256,
  writePatchFile,
  writeManifest,
  writeBlob,
  writeSnapshotJson,
  addIndexEntry,
  createIndexEntry,
  generateTimestamp,
  UNTRACKED_DIR,
  MANIFEST_FILE,
} from "./storage.js";
import {
  getHeadSha,
  getCurrentBranch,
  getStagedPatch,
  getUnstagedPatch,
  getUntrackedFiles,
  readWorkingFile,
  getFileMode,
} from "./git-ops.js";
import { getVersion } from "../../core/version.js";
import { collectChangeSet } from "../../git/collector.js";
import { getProfile, detectProfileWithReasons } from "../../profiles/index.js";
import { computeRiskScore } from "../../render/risk-score.js";
import { buildFacts } from "../facts/builder.js";
import { generateRiskReport } from "../risk/index.js";
import type { ProfileName } from "../../core/types.js";
import { getRepoRoot, isWorkingDirDirty } from "../../git/collector.js";
import { runAnalyzersIncremental } from "../../core/analyzer-runner.js";

/**
 * Execute the snap save command.
 *
 * Creates a snapshot capturing:
 * 1. Current HEAD SHA and branch
 * 2. Binary patches for staged and unstaged changes
 * 3. Untracked files as content-addressed blobs
 * 4. Embedded analysis using mode=all
 */
export async function executeSnapSave(options: SnapSaveOptions = {}): Promise<SnapSaveResult> {
  const cwd = options.cwd ?? process.cwd();
  const label = options.label ?? `snapshot-${generateTimestamp()}`;

  // 1. Get git info
  const [headSha, branch] = await Promise.all([
    getHeadSha(cwd),
    getCurrentBranch(cwd),
  ]);

  // 2. Generate binary patches
  const [stagedPatchContent, unstagedPatchContent] = await Promise.all([
    getStagedPatch(cwd),
    getUnstagedPatch(cwd),
  ]);

  // 3. Collect untracked files
  const untrackedFilePaths = await getUntrackedFiles(cwd);
  const manifest: SnapshotManifest = { entries: [] };
  const blobContents: Map<string, Buffer> = new Map();

  let totalUntrackedBytes = 0;
  for (const filePath of untrackedFilePaths) {
    try {
      const content = await readWorkingFile(filePath, cwd);
      const mode = await getFileMode(filePath, cwd);
      const blobSha256 = computeSha256(content);

      const entry: SnapshotManifestEntry = {
        path: filePath,
        blobSha256,
        mode,
        bytes: content.length,
      };

      manifest.entries.push(entry);
      blobContents.set(blobSha256, content);
      totalUntrackedBytes += content.length;
    } catch {
      // Skip files that can't be read (e.g., broken symlinks)
      continue;
    }
  }

  // Sort manifest entries by path for determinism
  manifest.entries.sort((a, b) => a.path.localeCompare(b.path));

  // 4. Compute snapshot ID
  const stagedPatchSha = computeSha256(stagedPatchContent);
  const unstagedPatchSha = computeSha256(unstagedPatchContent);
  const manifestContent = JSON.stringify(manifest);
  const snapshotId = computeSnapshotId(headSha, stagedPatchSha, unstagedPatchSha, manifestContent);

  // 5. Run analysis using mode=all
  const changeSet = await collectChangeSet({
    mode: "all",
    cwd,
    includeUntracked: true,
  });

  // Get git metadata for facts
  const [repoRoot, isDirty] = await Promise.all([
    getRepoRoot(cwd),
    isWorkingDirDirty(cwd),
  ]);

  // Resolve profile
  const requestedProfile: ProfileName = "auto";
  const detection = detectProfileWithReasons(changeSet, cwd);
  const detectedProfile = detection.profile;
  const profile = getProfile(detectedProfile);

  // Run analyzers with incremental caching for better performance
  const findings = await runAnalyzersIncremental({
    changeSet,
    analyzers: profile.analyzers,
    profile: detectedProfile,
    mode: "all",
    noCache: false,
    cwd,
  });

  // Compute risk score
  const riskScore = computeRiskScore(findings);

  // Build facts output (without timestamp for determinism)
  const facts = await buildFacts({
    changeSet,
    findings,
    riskScore,
    requestedProfile,
    detectedProfile,
    profileConfidence: detection.confidence,
    profileReasons: detection.reasons,
    filters: {
      excludes: [],
      includes: [],
      redact: false,
      maxFileBytes: 1048576,
      maxDiffBytes: 5242880,
    },
    skippedFiles: [],
    warnings: [],
    noTimestamp: true, // Omit for determinism
    repoRoot,
    isDirty,
    mode: "all",
  });

  // Build risk report (without timestamp for determinism)
  const riskReport = await generateRiskReport(changeSet, {
    noTimestamp: true,
    mode: "all",
    cwd,
  });

  // 6. Get tool version
  const version = await getVersion();

  // 7. Build snapshot JSON
  const createdAt = new Date().toISOString();
  const snapshot: SnapshotJson = {
    schemaVersion: "1.0",
    snapshotId,
    label,
    createdAt,
    tool: {
      name: "branch-narrator",
      version,
    },
    git: {
      headSha,
      branch,
    },
    workspace: {
      patches: {
        staged: {
          path: "staged.patch",
          sha256: stagedPatchSha,
          bytes: stagedPatchContent.length,
        },
        unstaged: {
          path: "unstaged.patch",
          sha256: unstagedPatchSha,
          bytes: unstagedPatchContent.length,
        },
      },
      untracked: {
        manifestPath: `${UNTRACKED_DIR}/${MANIFEST_FILE}`,
        fileCount: manifest.entries.length,
        totalBytes: totalUntrackedBytes,
      },
    },
    analysis: {
      facts,
      riskReport,
    },
  };

  // 8. Write all snapshot files
  // Write patches
  await writePatchFile(snapshotId, "staged", stagedPatchContent, cwd);
  await writePatchFile(snapshotId, "unstaged", unstagedPatchContent, cwd);

  // Write manifest
  await writeManifest(snapshotId, manifest, cwd);

  // Write blobs
  for (const [, content] of blobContents) {
    await writeBlob(snapshotId, content, cwd);
  }

  // Write snapshot.json
  await writeSnapshotJson(snapshotId, snapshot, cwd);

  // 9. Update index
  const indexEntry = createIndexEntry(snapshot);
  await addIndexEntry(indexEntry, cwd);

  // 10. Output result
  const result: SnapSaveResult = {
    snapshotId,
    label,
    snapshotPath: `.branch-narrator/snapshots/${snapshotId}`,
  };

  // Write to file if requested
  if (options.out) {
    await mkdir(dirname(options.out), { recursive: true });
    await fsWriteFile(options.out, snapshotId, "utf-8");
  }

  return result;
}
