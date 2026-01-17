import { join } from "node:path";
import { Provider } from "../types.js";
import { BRANCH_NARRATOR_USAGE } from "../shared.js";
import { isFile } from "../fs.js";

const CLAUDE_FILE = "CLAUDE.md";

export const claudeProvider: Provider = {
  name: "claude",
  description: "Integrate with CLAUDE.md (Claude Code)",
  detect: async (cwd: string) => isFile(join(cwd, CLAUDE_FILE)),
  generate: () => {
    const content = `\n\n## Branch Narrator Usage\n\n${BRANCH_NARRATOR_USAGE}`;
    return [
      {
        path: CLAUDE_FILE,
        content,
      },
    ];
  },
};
