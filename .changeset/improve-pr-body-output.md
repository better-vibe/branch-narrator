---
"@better-vibe/branch-narrator": patch
---

**Improved `pr-body` output formatting**

Significantly reduced redundancy and improved readability of PR body output:

1. **Eliminated duplicate blast radius information** - Blast radius details now only appear in the "Top findings" section, removing duplication from Summary bullets and Details section

2. **Fixed risk scoring for high blast radius** - Files with high blast radius (>10 dependents) in product code now automatically increase risk score by 20 points, ensuring that files with many dependents (like `types.ts` with 41 dependents) properly elevate the overall risk to HIGH

3. **Condensed changeset display** - Summary section now shows "X changesets added" instead of individual file listings. In the "What changed" section, only up to 5 changesets are listed individually, with the rest summarized as "...and X more"

4. **Removed redundant dependency table** - Dependencies are now shown only once in the primary "Dependencies" section, eliminating duplication in the Details collapsible section

5. **Cleaner Summary section** - Removed individual finding descriptions from Summary bullets; they now only appear in "Top findings" section for better organization

These changes make the PR body output more concise and easier to scan while preserving all important information.