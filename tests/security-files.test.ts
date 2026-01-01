/**
 * Security files analyzer tests.
 */

import { describe, expect, it } from "vitest";
import {
  getSecurityReasonLabel,
  isSecurityFile,
  securityFilesAnalyzer,
} from "../src/analyzers/security-files.js";
import type {
  RiskFlagFinding,
  SecurityFileFinding,
} from "../src/core/types.js";
import { createChangeSet, createFileChange } from "./fixtures/index.js";

describe("isSecurityFile", () => {
  it("should detect auth-related paths", () => {
    expect(isSecurityFile("src/routes/auth/+page.svelte")).toBe("auth-path");
    expect(isSecurityFile("src/lib/auth.ts")).toBe("auth-path");
    expect(isSecurityFile("src/routes/login/+page.svelte")).toBe("auth-path");
    expect(isSecurityFile("src/routes/signup/+server.ts")).toBe("auth-path");
  });

  it("should detect session-related paths", () => {
    expect(isSecurityFile("src/lib/session.ts")).toBe("session-path");
    expect(isSecurityFile("src/lib/jwt.ts")).toBe("session-path");
    expect(isSecurityFile("src/hooks/token.ts")).toBe("session-path");
    expect(isSecurityFile("src/lib/oauth-callback.ts")).toBe("session-path");
  });

  it("should detect permission-related paths", () => {
    expect(isSecurityFile("src/lib/permission-check.ts")).toBe("permission-path");
    expect(isSecurityFile("src/lib/rbac.ts")).toBe("permission-path");
    expect(isSecurityFile("src/utils/authorization.ts")).toBe("permission-path");
    expect(isSecurityFile("src/lib/role-manager.ts")).toBe("permission-path");
  });

  it("should detect middleware files", () => {
    expect(isSecurityFile("src/middleware.ts")).toBe("middleware");
    expect(isSecurityFile("middleware.js")).toBe("middleware");
    // Note: middleware/auth.ts matches auth-path first (which is also security-related)
    expect(isSecurityFile("src/middleware/rate-limit.ts")).toBe("middleware");
  });

  it("should detect guard files", () => {
    expect(isSecurityFile("src/guards/admin.ts")).toBe("guard");
    // Note: auth-guard.ts matches auth-path first (which is also security-related)
    expect(isSecurityFile("src/guards/feature.ts")).toBe("guard");
  });

  it("should detect policy files", () => {
    expect(isSecurityFile("src/policies/user.ts")).toBe("policy");
    expect(isSecurityFile("access-policy.ts")).toBe("policy");
  });

  it("should return null for non-security files", () => {
    expect(isSecurityFile("src/lib/utils.ts")).toBe(null);
    expect(isSecurityFile("src/components/Button.svelte")).toBe(null);
    expect(isSecurityFile("README.md")).toBe(null);
  });
});

describe("getSecurityReasonLabel", () => {
  it("should return human-readable labels", () => {
    expect(getSecurityReasonLabel("auth-path")).toBe("Authentication");
    expect(getSecurityReasonLabel("session-path")).toBe("Session/Token");
    expect(getSecurityReasonLabel("permission-path")).toBe("Permissions/RBAC");
    expect(getSecurityReasonLabel("middleware")).toBe("Middleware");
    expect(getSecurityReasonLabel("guard")).toBe("Route Guard");
    expect(getSecurityReasonLabel("policy")).toBe("Policy");
  });
});

describe("securityFilesAnalyzer", () => {
  it("should detect security files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/lib/auth.ts", "modified"),
        createFileChange("src/hooks/session.ts", "added"),
        createFileChange("src/lib/utils.ts", "modified"),
      ],
    });

    const findings = securityFilesAnalyzer.analyze(changeSet);

    const securityFinding = findings.find(
      (f) => f.type === "security-file"
    ) as SecurityFileFinding;
    expect(securityFinding).toBeDefined();
    expect(securityFinding.files).toContain("src/lib/auth.ts");
    expect(securityFinding.files).toContain("src/hooks/session.ts");
    expect(securityFinding.files).not.toContain("src/lib/utils.ts");
  });

  it("should emit risk flag for security files", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/lib/auth.ts", "modified")],
    });

    const findings = securityFilesAnalyzer.analyze(changeSet);

    const riskFinding = findings.find(
      (f) => f.type === "risk-flag"
    ) as RiskFlagFinding;
    expect(riskFinding).toBeDefined();
    expect(riskFinding.risk).toBe("medium");
    expect(riskFinding.evidenceText).toContain("Security-sensitive");
  });

  it("should return empty for no security files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/lib/utils.ts", "modified"),
        createFileChange("README.md", "modified"),
      ],
    });

    const findings = securityFilesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should track multiple reasons", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/lib/auth.ts", "modified"),
        createFileChange("src/middleware.ts", "modified"),
        createFileChange("src/guards/admin.ts", "added"),
      ],
    });

    const findings = securityFilesAnalyzer.analyze(changeSet);
    const securityFinding = findings.find(
      (f) => f.type === "security-file"
    ) as SecurityFileFinding;

    expect(securityFinding.reasons).toContain("auth-path");
    expect(securityFinding.reasons).toContain("middleware");
    expect(securityFinding.reasons).toContain("guard");
  });
});

