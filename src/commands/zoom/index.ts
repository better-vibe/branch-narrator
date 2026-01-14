/**
 * Zoom command - targeted drill-down for findings and flags.
 * 
 * Provides minimal, deterministic, evidence-backed context for a single
 * finding or flag. Designed for interactive AI agent loops.
 */

import type {
  ChangeSet,
  DiffMode,
  Finding,
  ProfileName,
  ZoomOutput,
  ZoomFindingOutput,
  ZoomFlagOutput,
  ZoomEvidence,
  PatchContext,
} from "../../core/types.js";
import { BranchNarratorError } from "../../core/errors.js";
import { getProfile, resolveProfileName } from "../../profiles/index.js";
import { assignFindingId } from "../../core/ids.js";
import { generateRiskReport } from "../risk/index.js";
import { redactSecrets } from "../../core/evidence.js";

/**
 * Options for the zoom command.
 */
export interface ZoomOptions {
  findingId?: string;
  flagId?: string;
  mode: DiffMode;
  base?: string;
  head?: string;
  profile: ProfileName;
  includePatch: boolean;
  unified: number;
  maxEvidenceLines: number;
  redact: boolean;
  noTimestamp: boolean;
}

/**
 * Execute the zoom command.
 */
export async function executeZoom(
  changeSet: ChangeSet,
  options: ZoomOptions
): Promise<ZoomOutput> {
  // Validate that exactly one of findingId or flagId is provided
  if (options.findingId && options.flagId) {
    throw new BranchNarratorError(
      "Cannot specify both --finding and --flag. Use only one.",
      1
    );
  }

  if (!options.findingId && !options.flagId) {
    throw new BranchNarratorError(
      "Must specify either --finding <id> or --flag <id>",
      1
    );
  }

  // Route to appropriate handler
  if (options.findingId) {
    return executeZoomFinding(changeSet, options);
  } else {
    return executeZoomFlag(changeSet, options);
  }
}

/**
 * Zoom into a specific finding by ID.
 */
async function executeZoomFinding(
  changeSet: ChangeSet,
  options: ZoomOptions
): Promise<ZoomFindingOutput> {
  const findingId = options.findingId!;

  // Run analysis to get all findings
  const profileName = resolveProfileName(options.profile, changeSet, process.cwd());
  const profile = getProfile(profileName);

  const rawFindings: Finding[] = [];
  for (const analyzer of profile.analyzers) {
    const analyzerFindings = await analyzer.analyze(changeSet);
    rawFindings.push(...analyzerFindings);
  }

  // Assign IDs to all findings
  const findings = rawFindings.map(assignFindingId);

  // Find the requested finding
  const finding = findings.find((f) => f.findingId === findingId);

  if (!finding) {
    throw new BranchNarratorError(
      `Finding not found: ${findingId}. Run 'facts' or 'risk-report' to see available findings.`,
      1
    );
  }

  // Convert evidence to zoom format with optional redaction
  const evidence: ZoomEvidence[] = finding.evidence.slice(0, options.maxEvidenceLines).map((ev) => ({
    file: ev.file,
    excerpt: options.redact ? redactSecrets(ev.excerpt) : ev.excerpt,
    line: ev.line,
    hunk: ev.hunk,
  }));

  // Optionally fetch patch context
  let patchContext: PatchContext[] | undefined;
  if (options.includePatch) {
    patchContext = await fetchPatchContext(changeSet, finding, options.unified, options.redact);
  }

  const output: ZoomFindingOutput = {
    schemaVersion: "1.0",
    generatedAt: options.noTimestamp ? undefined : new Date().toISOString(),
    range: {
      base: changeSet.base,
      head: changeSet.head,
    },
    itemType: "finding",
    findingId,
    finding,
    evidence,
    patchContext,
  };

  return output;
}

/**
 * Zoom into a specific flag by ID.
 */
async function executeZoomFlag(
  changeSet: ChangeSet,
  options: ZoomOptions
): Promise<ZoomFlagOutput> {
  const flagId = options.flagId!;

  // Run analysis once to get both findings and flags
  const profileName = resolveProfileName(options.profile, changeSet, process.cwd());
  const profile = getProfile(profileName);

  const rawFindings: Finding[] = [];
  for (const analyzer of profile.analyzers) {
    const analyzerFindings = await analyzer.analyze(changeSet);
    rawFindings.push(...analyzerFindings);
  }

  // Assign findingIds to all findings
  const allFindings = rawFindings.map(assignFindingId);

  // Generate risk report to get flags (passing findings avoids re-running analysis)
  const report = await generateRiskReport(changeSet, {
    profile: options.profile,
    redact: options.redact,
    maxEvidenceLines: options.maxEvidenceLines,
    noTimestamp: options.noTimestamp,
  });

  // Find the requested flag
  const flag = report.flags.find((f) => f.flagId === flagId);

  if (!flag) {
    throw new BranchNarratorError(
      `Flag not found: ${flagId}. Run 'risk-report' to see available flags.`,
      1
    );
  }

  // Get related findings (using already computed findings)
  const relatedFindings = allFindings.filter((f) => flag.relatedFindingIds.includes(f.findingId));

  // Optionally fetch patch context from evidence files
  let patchContext: PatchContext[] | undefined;
  if (options.includePatch && flag.evidence.length > 0) {
    patchContext = await fetchPatchContextFromFiles(
      changeSet,
      flag.evidence.map((ev) => ev.file),
      options.unified,
      options.redact
    );
  }

  const output: ZoomFlagOutput = {
    schemaVersion: "1.0",
    generatedAt: options.noTimestamp ? undefined : new Date().toISOString(),
    range: {
      base: changeSet.base,
      head: changeSet.head,
    },
    itemType: "flag",
    flagId,
    flag,
    evidence: flag.evidence.slice(0, options.maxEvidenceLines),
    relatedFindings,
    patchContext,
  };

  return output;
}

/**
 * Fetch patch context for evidence files in a finding.
 */
async function fetchPatchContext(
  changeSet: ChangeSet,
  finding: Finding,
  unified: number,
  redact: boolean
): Promise<PatchContext[]> {
  // Extract unique files from evidence
  const files = new Set<string>();
  for (const ev of finding.evidence) {
    files.add(ev.file);
  }

  return fetchPatchContextFromFiles(changeSet, Array.from(files), unified, redact);
}

/**
 * Fetch patch context for a list of files.
 * Note: unified parameter is reserved for future use when we might fetch
 * diffs with custom unified context. Currently uses hunks from changeSet.
 */
async function fetchPatchContextFromFiles(
  changeSet: ChangeSet,
  files: string[],
  _unified: number,
  redact: boolean
): Promise<PatchContext[]> {
  const patchContext: PatchContext[] = [];

  for (const file of files) {
    // Find the file diff in the changeset
    const fileDiff = changeSet.diffs.find((d) => d.path === file);
    if (!fileDiff) {
      continue;
    }

    patchContext.push({
      file: fileDiff.path,
      status: fileDiff.status,
      hunks: fileDiff.hunks.map((hunk) => ({
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        content: redact ? redactSecrets(hunk.content) : hunk.content,
      })),
    });
  }

  return patchContext;
}
