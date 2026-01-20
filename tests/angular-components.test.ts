/**
 * Angular components analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import { angularComponentsAnalyzer } from "../src/analyzers/angular-components.js";
import type { AngularComponentChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange, createFileDiff } from "./fixtures/index.js";

describe("angularComponentsAnalyzer", () => {
  it("should detect component changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/user/user.component.ts", "modified")],
      diffs: [createFileDiff("src/app/user/user.component.ts", "modified", [
        {
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 10,
          content: "@Component({\\n  selector: 'app-user'\\n})\\nexport class UserComponent {}",
          additions: [
            "@Component({",
            "  selector: 'app-user',",
            "  template: '<div>User</div>'",
            "})",
          ],
          deletions: [],
        },
      ])],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("component");
    expect(finding.change).toBe("modified");
    expect(finding.file).toBe("src/app/user/user.component.ts");
  });

  it("should detect module changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/app.module.ts", "modified")],
      diffs: [createFileDiff("src/app/app.module.ts", "modified", [
        {
          oldStart: 1,
          oldLines: 5,
          newStart: 1,
          newLines: 10,
          content: "@NgModule({\\n  declarations: []\\n})\\nexport class AppModule {}",
          additions: ["@NgModule({", "  declarations: []", "})"],
          deletions: [],
        },
      ])],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("module");
    expect(finding.change).toBe("modified");
  });

  it("should detect service changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/user/user.service.ts", "added")],
      diffs: [createFileDiff("src/app/user/user.service.ts", "added", [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 5,
          content: "@Injectable()\\nexport class UserService {}",
          additions: ["@Injectable()", "export class UserService {}"],
          deletions: [],
        },
      ])],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("service");
    expect(finding.change).toBe("added");
  });

  it("should detect directive changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/directives/highlight.directive.ts", "modified")],
      diffs: [createFileDiff("src/app/directives/highlight.directive.ts", "modified")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("directive");
  });

  it("should detect pipe changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/pipes/format.pipe.ts", "modified")],
      diffs: [createFileDiff("src/app/pipes/format.pipe.ts", "modified")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("pipe");
  });

  it("should detect guard changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/guards/auth.guard.ts", "modified")],
      diffs: [createFileDiff("src/app/guards/auth.guard.ts", "modified")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("guard");
  });

  it("should detect interceptor changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/interceptors/http.interceptor.ts", "modified")],
      diffs: [createFileDiff("src/app/interceptors/http.interceptor.ts", "modified")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("interceptor");
  });

  it("should detect deleted components", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/old/old.component.ts", "deleted")],
      diffs: [createFileDiff("src/app/old/old.component.ts", "deleted")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.change).toBe("deleted");
  });

  it("should skip non-Angular files", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/utils/helper.ts", "modified"),
        createFileChange("README.md", "modified"),
      ],
      diffs: [
        createFileDiff("src/utils/helper.ts", "modified"),
        createFileDiff("README.md", "modified"),
      ],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);
    expect(findings.length).toBe(0);
  });

  it("should extract selector from component decorator", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/user/user.component.ts", "added")],
      diffs: [createFileDiff("src/app/user/user.component.ts", "added", [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 10,
          content: "@Component({\\n  selector: 'app-user'\\n})\\nexport class UserComponent {}",
          additions: [
            "@Component({",
            "  selector: 'app-user',",
            "  templateUrl: './user.component.html'",
            "})",
            "export class UserComponent {",
            "}",
          ],
          deletions: [],
        },
      ])],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.selector).toBe("app-user");
  });

  it("should detect standalone components", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/standalone.component.ts", "added")],
      diffs: [createFileDiff("src/app/standalone.component.ts", "added", [
        {
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 10,
          content: "@Component({\\n  standalone: true\\n})\\nexport class StandaloneComponent {}",
          additions: [
            "@Component({",
            "  selector: 'app-standalone',",
            "  standalone: true",
            "})",
          ],
          deletions: [],
        },
      ])],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.standalone).toBe(true);
  });
});
