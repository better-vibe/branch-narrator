---
"branch-narrator": minor
---

Improve detection coverage and package manager support:

- **Fix `bun.lock` detection**: The lockfile analyzer now correctly recognizes `bun.lock` (text format) in addition to `bun.lockb` (binary format)
- **Add `database` file category**: New category for database-related files including Supabase, Prisma, Drizzle migrations, and SQL files
- **Smart package manager detection**: Suggested actions (test, check) now detect and use the correct package manager (bun/pnpm/yarn/npm) based on lockfiles in the changeset
- **Improved test file detection**: Test files under `src/tests/` and similar nested paths are now correctly categorized
- **Archive files excluded by default**: `.tgz`, `.tar.gz`, and `.zip` files are now excluded from analysis by default

