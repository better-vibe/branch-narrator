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
bun test
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
| `bun test` | Run all tests |
| `bun run test:watch` | Watch mode for tests |
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
bun test
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

### 7. Commit

```bash
git add .
git commit -m "feat: add my feature"
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

