import { join } from "node:path";
import { Provider } from "../types.js";
import { BRANCH_NARRATOR_USAGE } from "../shared.js";
import { isDirectory } from "../fs.js";

export const julesRulesProvider: Provider = {
  name: "jules-rules",
  description: "Generate Jules rules in .jules/rules/branch-narrator.md",
  detect: async (cwd: string) => isDirectory(join(cwd, ".jules")),
  generate: () => [
    {
      path: ".jules/rules/branch-narrator.md",
      content: BRANCH_NARRATOR_USAGE,
    },
  ],
};
