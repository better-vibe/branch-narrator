# Getting Started

Guide to setting up local development for branch-narrator.

## Prerequisites

- **Node.js**: >= 18.0.0
- **Bun**: Latest version (recommended)
- **Git**: For version control

## Setup

```bash
# Clone the repository
git clone https://github.com/your-org/branch-narrator.git
cd branch-narrator

# Install dependencies
bun install

# Verify setup
bun run test
bun run build
```

## Running Locally

### Development Mode

```bash
# Run CLI directly
bun src/cli.ts pr-body

# With options
bun src/cli.ts facts -u
bun src/cli.ts pr-body --interactive
```

### Built Version

```bash
# Build
bun run build

# Run from dist
node dist/cli.js pr-body
```

### Watch Mode

```bash
# Rebuild on file changes
bun run dev
```

## Project Commands

| Command | Description |
|---------|-------------|
| `bun run test` | Run all tests (excludes benchmarks) |
| `bun run test:watch` | Watch mode for tests |
| `bun run test:benchmarks` | Run benchmark tests |
| `bun run test:all` | Run all tests including benchmarks |
| `bun run build` | Production build |
| `bun run dev` | Watch mode build |
| `bun run typecheck` | Type checking only |

## Testing Changes

```bash
# Run specific test file
bun test tests/route-mapping.test.ts

# Run tests matching pattern
bun test -t "should detect"

# Watch specific test
bun test --watch tests/dependencies.test.ts
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
```

### 2. Make Changes

Edit files in `src/`

### 3. Run Tests

```bash
bun run test
```

### 4. Type Check

```bash
bun run typecheck
```

### 5. Build

```bash
bun run build
```

### 6. Test Locally

```bash
node dist/cli.js pr-body -u
```

### 7. Create a Changeset

```bash
bun run changeset:add
# Follow prompts to describe your changes
```

### 8. Commit

```bash
git add .
git commit -m "feat: add my feature"
```

## Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

### When to Add a Changeset

Create a changeset for any PR that includes:
- New features
- Bug fixes
- Documentation updates
- Dependency updates
- Breaking changes

Skip changesets for:
- Internal refactoring (no user-facing changes)
- Test-only changes
- CI/CD configuration

### Creating a Changeset

```bash
# After making your changes
bun run changeset:add

# Or use the shorthand
bun run changeset
```

The CLI will prompt you to:
1. Select the package (always `@better-vibe/branch-narrator`)
2. Select change type: `patch`, `minor`, or `major`
3. Write a user-facing summary

**Important:** The package name is `@better-vibe/branch-narrator` (NOT `branch-narrator`).

### Version Guidelines

- **patch** (0.0.x): Bug fixes, docs, small improvements
- **minor** (0.x.0): New features, new CLI options
- **major** (x.0.0): Breaking changes, removed features

### Example

```bash
$ bun run changeset:add
🦋  Which packages would you like to include?
✔ @better-vibe/branch-narrator

🦋  What kind of change is this for @better-vibe/branch-narrator?
✔ minor

🦋  Please enter a summary for this change:
Add support for Tailwind CSS configuration detection

✔ Changeset created: .changeset/funny-cats-dance.md
```

Then commit the changeset with your code:

```bash
git add .changeset/funny-cats-dance.md
git commit -m "feat: add Tailwind CSS analyzer"
```

## Debugging

### Enable Debug Output

```bash
DEBUG=1 bun src/cli.ts pr-body
```

### Inspect ChangeSet

Add temporary logging:

```typescript
// In src/cli.ts
const changeSet = await collectChangeSet({ base, head });
console.error("ChangeSet:", JSON.stringify(changeSet, null, 2));
```

### VS Code Debug Config

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug CLI",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["src/cli.ts", "pr-body", "-u"],
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

## Common Issues

| Issue | Solution |
|-------|----------|
| "Not a git repository" | Run from a git repo root |
| "Invalid git reference" | Ensure ref exists |
| Build errors | Run `bun run typecheck` first |
| Test failures | Check test fixtures are up to date |

