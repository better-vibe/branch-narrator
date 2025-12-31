# Security Files Analyzer

**File:** `src/analyzers/security-files.ts`
**Finding Types:** `security-file`, `risk-flag`

## Purpose

Detects changes to security-sensitive files like authentication, authorization, and middleware.

## Finding Types

```typescript
type SecurityFileReason =
  | "auth-path"
  | "session-path"
  | "permission-path"
  | "middleware"
  | "guard"
  | "policy";

interface SecurityFileFinding {
  type: "security-file";
  files: string[];
  reasons: SecurityFileReason[];
}
```

## Detection Patterns

### Auth-Related Paths

| Pattern | Matches |
|---------|---------|
| `auth` | `src/lib/auth.ts`, `src/routes/auth/` |
| `login` | `src/routes/login/+page.svelte` |
| `logout` | `src/routes/logout/+server.ts` |
| `signin` | `src/routes/signin/` |
| `signout` | `src/routes/signout/` |
| `signup` | `src/routes/signup/` |
| `register` | `src/routes/register/` |

### Session-Related Paths

| Pattern | Matches |
|---------|---------|
| `session` | `src/lib/session.ts` |
| `jwt` | `src/lib/jwt.ts` |
| `token` | `src/hooks/token.ts` |
| `cookie` | `src/lib/cookie.ts` |
| `oauth` | `src/lib/oauth.ts` |

### Permission-Related Paths

| Pattern | Matches |
|---------|---------|
| `permission` | `src/lib/permissions.ts` |
| `rbac` | `src/lib/rbac.ts` |
| `acl` | `src/lib/acl.ts` |
| `role` | `src/lib/roles.ts` |
| `authoriz*` | `src/lib/authorization.ts` |

### Special Files

| Pattern | Reason |
|---------|--------|
| `middleware.ts` | `middleware` |
| `/middleware/` | `middleware` |
| `guard.ts` | `guard` |
| `/guards/` | `guard` |
| `policy.ts` | `policy` |
| `/policies/` | `policy` |

## Example Output

```json
{
  "type": "security-file",
  "files": [
    "src/lib/auth.ts",
    "src/routes/login/+page.svelte",
    "src/middleware.ts"
  ],
  "reasons": ["auth-path", "middleware"]
}
```

## Risk Flag

Security file changes emit a medium risk flag:

```json
{
  "type": "risk-flag",
  "risk": "medium",
  "evidence": "Security-sensitive files changed (Authentication, Middleware): 3 file(s)"
}
```

## Usage in Markdown

Security files are mentioned in the **Summary** section:

```markdown
## Summary

- 10 file(s) changed
- 3 security-sensitive file(s) changed
```

And flagged in **Risks / Notes**:

```markdown
## Risks / Notes

- ⚡ Security-sensitive files changed (Authentication, Middleware): 3 file(s)
```

## Risk Scoring

| Event | Points |
|-------|--------|
| Security file changed | +15 |
| Medium risk flag | +20 |

Total: +35 points for security file changes.

