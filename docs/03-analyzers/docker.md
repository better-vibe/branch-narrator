# Docker Analyzer

Detects changes to Docker-related files (Dockerfiles, docker-compose, .dockerignore) and identifies potentially breaking changes.

## File Location
`src/analyzers/docker.ts`

## Finding Type
`DockerChangeFinding`

## Detection Rules
- Detects `Dockerfile` and `Dockerfile.*` variants
- Detects `docker-compose.{yml,yaml}` and `compose.{yml,yaml}` files
- Detects `.dockerignore` files
- Identifies base image changes in Dockerfiles
- Detects breaking changes: base image, exposed ports, entrypoint, CMD, port/volume/network mappings in compose

## Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path to the changed file |
| `status` | `FileStatus` | File change status |
| `dockerfileType` | `"dockerfile" \| "compose" \| "dockerignore"` | Type of Docker file |
| `isBreaking` | `boolean` | Whether the change is breaking |
| `breakingReasons` | `string[]` | Reasons the change is breaking |
| `baseImageChanges` | `string[]` | Base image additions/removals (Dockerfiles only) |

## Example Output
```json
{
  "type": "docker-change",
  "kind": "docker-change",
  "category": "infra",
  "confidence": "high",
  "file": "Dockerfile",
  "status": "modified",
  "dockerfileType": "dockerfile",
  "isBreaking": true,
  "breakingReasons": ["Base image changed"],
  "baseImageChanges": ["Removed base image: node:18-alpine", "Added base image: node:20-alpine"]
}
```
