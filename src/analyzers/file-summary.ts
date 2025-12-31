/**
 * File summary analyzer - lists added/modified/deleted/renamed paths.
 */

import { shouldExcludeFile } from "../core/filters.js";
import type {
  Analyzer,
  ChangeSet,
  FileSummaryFinding,
  Finding,
} from "../core/types.js";

export const fileSummaryAnalyzer: Analyzer = {
  name: "file-summary",

  analyze(changeSet: ChangeSet): Finding[] {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const renamed: Array<{ from: string; to: string }> = [];

    for (const file of changeSet.files) {
      // Skip build artifacts and generated files
      if (shouldExcludeFile(file.path)) {
        continue;
      }

      switch (file.status) {
        case "added":
          added.push(file.path);
          break;
        case "modified":
          modified.push(file.path);
          break;
        case "deleted":
          deleted.push(file.path);
          break;
        case "renamed":
          renamed.push({
            from: file.oldPath ?? file.path,
            to: file.path,
          });
          break;
      }
    }

    // Only emit if there are changes
    if (
      added.length === 0 &&
      modified.length === 0 &&
      deleted.length === 0 &&
      renamed.length === 0
    ) {
      return [];
    }

    const finding: FileSummaryFinding = {
      type: "file-summary",
      added,
      modified,
      deleted,
      renamed,
    };

    return [finding];
  },
};

