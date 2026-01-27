# Infrastructure Analyzer

**File:** `src/analyzers/infra.ts`
**Finding Type:** `infra-change`

## Purpose

Detects infrastructure-as-code changes (Docker, Terraform, Kubernetes).

## Finding Type

```typescript
type InfraChangeType = "dockerfile" | "terraform" | "k8s";

interface InfraChangeFinding {
  type: "infra-change";
  infraType: InfraChangeType;
  files: string[];
}
```

## Detection Rules

| Trigger | infraType |
|---------|-----------|
| File path contains `Dockerfile` | `dockerfile` |
| `*.tf` or `*.tfvars` file | `terraform` |
| `k8s/` or `kubernetes/` paths, or YAML with deployment/service/ingress | `k8s` |

## Example Output

```json
{
  "type": "infra-change",
  "infraType": "terraform",
  "files": ["infra/main.tf", "infra/variables.tf"]
}
```

## Usage in Markdown

```markdown
### Infrastructure

**Terraform:**
- `infra/main.tf`
- `infra/variables.tf`
```
