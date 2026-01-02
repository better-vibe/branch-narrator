
import type { Provider, FileOperation } from "../types.js";
import { BRANCH_NARRATOR_USAGE, PR_DESCRIPTION_TEMPLATE } from "../shared.js";

export const cursorProvider: Provider = {
  name: "cursor",
  description: "Generate Cursor rules (.cursor/rules/*.md)",
  generate: () => {
    return [
      {
        path: ".cursor/rules/branch-narrator.md",
        content: BRANCH_NARRATOR_USAGE,
      },
      {
        path: ".cursor/rules/pr-description.md",
        content: PR_DESCRIPTION_TEMPLATE,
      },
    ];
  },
};
