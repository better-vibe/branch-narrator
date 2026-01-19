---
"@better-vibe/branch-narrator": patch
---

Fix lockfile mismatch detection to only flag when dependencies change, not scripts or metadata

The lockfile analyzer now checks the actual diff content to determine if dependency-related fields changed. Previously, any change to package.json would trigger a lockfile mismatch warning. Now it only flags when:
- Dependency field names (dependencies, devDependencies, peerDependencies, etc.) are modified
- Individual package version entries are added, removed, or changed

Changes to scripts, name, version, description, repository, and other metadata fields no longer trigger false lockfile mismatch warnings.
