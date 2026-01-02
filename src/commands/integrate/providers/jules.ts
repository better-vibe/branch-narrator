
import type { Provider, FileOperation } from "../types.js";
import { BRANCH_NARRATOR_USAGE } from "../shared.js";

export const julesProvider: Provider = {
  name: "jules",
  description: "Integrate with AGENTS.md (Jules)",
  generate: () => {
    // Wrap the usage instructions in a section suitable for AGENTS.md
    const content = `\n\n## Branch Narrator Usage\n\n${BRANCH_NARRATOR_USAGE}`;

    return [
      {
        path: "AGENTS.md",
        content: content,
      },
    ];
  },
};
