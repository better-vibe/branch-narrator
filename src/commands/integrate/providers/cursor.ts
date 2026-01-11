import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Provider } from "../types.js";
import { BRANCH_NARRATOR_USAGE, PR_DESCRIPTION_TEMPLATE } from "../shared.js";

/**
 * Detect whether to use .mdc or .md format based on existing rules.
 * If .mdc files exist in .cursor/rules/, use .mdc format with frontmatter.
 */
async function detectCursorFormat(cwd: string): Promise<"mdc" | "md"> {
  try {
    const rulesDir = join(cwd, ".cursor", "rules");
    const files = await readdir(rulesDir);
    const hasMdcFiles = files.some((f) => f.endsWith(".mdc"));
    return hasMdcFiles ? "mdc" : "md";
  } catch {
    // Directory doesn't exist or can't be read - use default .md
    return "md";
  }
}

/**
 * Wrap content with .mdc frontmatter.
 */
function wrapWithFrontmatter(content: string): string {
  return `---
alwaysApply: true
---

${content}`;
}

export const cursorProvider: Provider = {
  name: "cursor",
  description: "Generate Cursor rules (.cursor/rules/*.md or *.mdc)",
  generate: async (cwd: string) => {
    const format = await detectCursorFormat(cwd);
    const extension = format === "mdc" ? ".mdc" : ".md";

    const branchNarratorContent =
      format === "mdc"
        ? wrapWithFrontmatter(BRANCH_NARRATOR_USAGE)
        : BRANCH_NARRATOR_USAGE;

    const prDescriptionContent =
      format === "mdc"
        ? wrapWithFrontmatter(PR_DESCRIPTION_TEMPLATE)
        : PR_DESCRIPTION_TEMPLATE;

    return [
      {
        path: `.cursor/rules/branch-narrator${extension}`,
        content: branchNarratorContent,
      },
      {
        path: `.cursor/rules/pr-description${extension}`,
        content: prDescriptionContent,
      },
    ];
  },
};
