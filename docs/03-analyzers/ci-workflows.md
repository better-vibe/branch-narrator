# CI Workflows Analyzer
+
+**File:** `src/analyzers/ci-workflows.ts`
+**Finding Type:** `ci-workflow`
+
+## Purpose
+
+Detects risky changes in CI/CD workflow configurations.
+
+## Finding Type
+
+```typescript
+type CIWorkflowRisk =
+  | "permissions_broadened"
+  | "pull_request_target"
+  | "remote_script_download"
+  | "pipeline_changed";
+
+interface CIWorkflowFinding {
+  type: "ci-workflow";
+  file: string;
+  riskType: CIWorkflowRisk;
+  details: string;
+}
+```
+
+## Detection Rules
+
+| Trigger | riskType |
+|---------|----------|
+| Workflow permissions include `write` for sensitive scopes | `permissions_broadened` |
+| `pull_request_target` event detected | `pull_request_target` |
+| `curl`/`wget` piped to `sh` or `bash` | `remote_script_download` |
+| Any workflow file modified | `pipeline_changed` |
+
+**Workflow files include:**
+- `.github/workflows/*.yml` / `.yaml`
+- `.gitlab-ci.yml`
+- `Jenkinsfile`
+- `azure-pipelines.yml`
+- `bitbucket-pipelines.yml`
+
+## Example Output
+
+```json
+{
+  "type": "ci-workflow",
+  "file": ".github/workflows/ci.yml",
+  "riskType": "permissions_broadened",
+  "details": "Workflow has broadened permissions (write access)"
+}
+```
+
+## Usage in Markdown
+
+```markdown
+### CI Workflows
+
+**permissions broadened**
+- File: `.github/workflows/ci.yml`
+- Workflow has broadened permissions (write access)
+```
