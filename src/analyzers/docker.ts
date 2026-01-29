/**
 * Docker configuration change detector.
 *
 * Detects changes to Dockerfiles, docker-compose files, and .dockerignore,
 * identifying potentially breaking changes like base image modifications.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  DockerChangeFinding,
  Confidence,
} from "../core/types.js";

// Dockerfile patterns
const DOCKERFILE_PATTERNS = [
  /Dockerfile(\.[a-z0-9-]+)?$/i,
];

// Docker Compose patterns
const COMPOSE_PATTERNS = [
  /^docker-compose(\.[a-z0-9-]+)?\.(yml|yaml)$/,
  /^compose(\.[a-z0-9-]+)?\.(yml|yaml)$/,
];

// Dockerignore pattern
const DOCKERIGNORE_PATTERN = /^\.dockerignore$/;

type DockerfileType = "dockerfile" | "compose" | "dockerignore";

/**
 * Detect the Docker file type.
 */
export function detectDockerFileType(path: string): DockerfileType | null {
  if (DOCKERFILE_PATTERNS.some((p) => p.test(path))) {
    return "dockerfile";
  }
  if (COMPOSE_PATTERNS.some((p) => p.test(path))) {
    return "compose";
  }
  if (DOCKERIGNORE_PATTERN.test(path)) {
    return "dockerignore";
  }
  return null;
}

/**
 * Extract base image changes from Dockerfile diffs.
 */
function extractBaseImageChanges(
  additions: string[],
  deletions: string[]
): string[] {
  const changes: string[] = [];

  const removedImages = deletions
    .filter((l) => /^FROM\s+/i.test(l.trim()))
    .map((l) => l.trim().replace(/^FROM\s+/i, "").split(/\s/)[0]);

  const addedImages = additions
    .filter((l) => /^FROM\s+/i.test(l.trim()))
    .map((l) => l.trim().replace(/^FROM\s+/i, "").split(/\s/)[0]);

  for (const img of removedImages) {
    if (!addedImages.includes(img)) {
      changes.push(`Removed base image: ${img}`);
    }
  }

  for (const img of addedImages) {
    if (!removedImages.includes(img)) {
      changes.push(`Added base image: ${img}`);
    }
  }

  return changes;
}

/**
 * Detect breaking changes in Docker files.
 */
function detectBreakingChanges(
  dockerfileType: DockerfileType,
  additions: string[],
  deletions: string[]
): string[] {
  const reasons: string[] = [];
  const deletedContent = deletions.join("\n");
  const addedContent = additions.join("\n");

  if (dockerfileType === "dockerfile") {
    // Base image changed
    const oldFroms = deletions.filter((l) => /^FROM\s+/i.test(l.trim()));
    const newFroms = additions.filter((l) => /^FROM\s+/i.test(l.trim()));
    if (oldFroms.length > 0 && newFroms.length > 0) {
      reasons.push("Base image changed");
    }

    // Exposed ports changed
    if (/EXPOSE\s+\d+/.test(deletedContent)) {
      reasons.push("Exposed ports changed");
    }

    // Entrypoint changed
    if (/ENTRYPOINT\s+/.test(deletedContent)) {
      reasons.push("Entrypoint changed");
    }

    // CMD changed
    if (/CMD\s+/.test(deletedContent) && /CMD\s+/.test(addedContent)) {
      reasons.push("Default command changed");
    }
  }

  if (dockerfileType === "compose") {
    // Service removed
    if (/^\s{2}\w+:\s*$/m.test(deletedContent)) {
      reasons.push("Service definition changed");
    }

    // Port mapping changed
    if (/ports:/i.test(deletedContent)) {
      reasons.push("Port mappings changed");
    }

    // Volume mapping changed
    if (/volumes:/i.test(deletedContent)) {
      reasons.push("Volume mappings changed");
    }

    // Network changed
    if (/networks:/i.test(deletedContent)) {
      reasons.push("Network configuration changed");
    }
  }

  return reasons;
}

export const dockerAnalyzer: Analyzer = {
  name: "docker",
  cache: {
    includeGlobs: [
      "**/Dockerfile*",
      "**/docker-compose*",
      "**/compose.*",
      "**/.dockerignore",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      const dockerfileType = detectDockerFileType(diff.path);

      if (!dockerfileType) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const breakingReasons = detectBreakingChanges(dockerfileType, additions, deletions);
      const baseImageChanges = dockerfileType === "dockerfile"
        ? extractBaseImageChanges(additions, deletions)
        : [];

      const isBreaking = breakingReasons.length > 0;

      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );

      const confidence: Confidence = isBreaking ? "high" : "medium";

      const finding: DockerChangeFinding = {
        type: "docker-change",
        kind: "docker-change",
        category: "infra",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        dockerfileType,
        isBreaking,
        breakingReasons,
        baseImageChanges,
      };

      findings.push(finding);
    }

    return findings;
  },
};
