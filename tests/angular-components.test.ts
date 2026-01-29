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
      diffs: [createFileDiff("src/app/user/user.component.ts", [
        "@Component({",
        "  selector: 'app-user',",
        "  template: '<div>User</div>'",
        "})",
      ], [], "modified")],
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
      diffs: [createFileDiff("src/app/app.module.ts", [
        "@NgModule({",
        "  declarations: []",
        "})",
      ], [], "modified")],
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
      diffs: [createFileDiff("src/app/user/user.service.ts", [
        "@Injectable()",
        "export class UserService {}",
      ], [], "added")],
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
      diffs: [createFileDiff("src/app/directives/highlight.directive.ts", [], [], "modified")],
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
      diffs: [createFileDiff("src/app/pipes/format.pipe.ts", [], [], "modified")],
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
      diffs: [createFileDiff("src/app/guards/auth.guard.ts", [], [], "modified")],
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
      diffs: [createFileDiff("src/app/interceptors/http.interceptor.ts", [], [], "modified")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("interceptor");
  });

  it("should detect resolver changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/resolvers/user.resolver.ts", "modified")],
      diffs: [createFileDiff("src/app/resolvers/user.resolver.ts", [], [], "modified")],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.type).toBe("angular-component-change");
    expect(finding.componentType).toBe("resolver");
  });

  it("should detect deleted components", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/old/old.component.ts", "deleted")],
      diffs: [createFileDiff("src/app/old/old.component.ts", [], [], "deleted")],
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
        createFileDiff("src/utils/helper.ts", [], [], "modified"),
        createFileDiff("README.md", [], [], "modified"),
      ],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);
    expect(findings.length).toBe(0);
  });

  it("should extract selector from component decorator", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/user/user.component.ts", "added")],
      diffs: [createFileDiff(
        "src/app/user/user.component.ts",
        [
          "@Component({",
          "  selector: 'app-user',",
          "  templateUrl: './user.component.html'",
          "})",
          "export class UserComponent {",
          "}",
        ],
        [],
        "added"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.selector).toBe("app-user");
  });

  it("should detect standalone components", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/standalone.component.ts", "added")],
      diffs: [createFileDiff(
        "src/app/standalone.component.ts",
        [
          "@Component({",
          "  selector: 'app-standalone',",
          "  standalone: true",
          "})",
        ],
        [],
        "added"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.standalone).toBe(true);
  });

  it("should detect change detection strategy", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/fast.component.ts", "added")],
      diffs: [createFileDiff(
        "src/app/fast.component.ts",
        [
          "@Component({",
          "  selector: 'app-fast',",
          "  changeDetection: ChangeDetectionStrategy.OnPush",
          "})",
        ],
        [],
        "added"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.changeDetection).toBe("OnPush");
  });

  it("should extract @Input and @Output properties via regex", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/card.component.ts", "added")],
      diffs: [createFileDiff(
        "src/app/card.component.ts",
        [
          "@Component({ selector: 'app-card' })",
          "export class CardComponent {",
          "  @Input() title: string;",
          "  @Input() subtitle: string;",
          "  @Output() clicked = new EventEmitter();",
          "}",
        ],
        [],
        "added"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.inputs).toContain("title");
    expect(finding.inputs).toContain("subtitle");
    expect(finding.outputs).toContain("clicked");
  });

  it("should extract signal-based inputs and outputs via regex", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/signal.component.ts", "added")],
      diffs: [createFileDiff(
        "src/app/signal.component.ts",
        [
          "@Component({ selector: 'app-signal' })",
          "export class SignalComponent {",
          "  name = input<string>();",
          "  age = input.required<number>();",
          "  clicked = output<void>();",
          "}",
        ],
        [],
        "added"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.inputs).toContain("name");
    expect(finding.inputs).toContain("age");
    expect(finding.outputs).toContain("clicked");
  });

  it("should detect lifecycle hook tags", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/lifecycle.component.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/lifecycle.component.ts",
        [
          "ngOnInit() { }",
          "ngOnDestroy() { }",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("on-init");
    expect(finding.tags).toContain("on-destroy");
  });

  it("should detect RxJS usage tags", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/data.service.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/data.service.ts",
        [
          "import { Observable, BehaviorSubject } from 'rxjs';",
          "import { switchMap } from 'rxjs/operators';",
          "data$ = new BehaviorSubject([]);",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("uses-observable");
    expect(finding.tags).toContain("uses-behavior-subject");
    expect(finding.tags).toContain("uses-switchmap");
  });

  it("should detect signal usage tags", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/counter.component.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/counter.component.ts",
        [
          "count = signal(0);",
          "doubled = computed(() => this.count() * 2);",
          "effect(() => console.log(this.count()));",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("uses-signals");
    expect(finding.tags).toContain("uses-computed");
    expect(finding.tags).toContain("uses-effect");
  });

  it("should detect companion template/style file changes", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("src/app/user/user.component.ts", "modified"),
        createFileChange("src/app/user/user.component.html", "modified"),
        createFileChange("src/app/user/user.component.scss", "modified"),
      ],
      diffs: [
        createFileDiff("src/app/user/user.component.ts", [], [], "modified"),
        createFileDiff("src/app/user/user.component.html", [], [], "modified"),
        createFileDiff("src/app/user/user.component.scss", [], [], "modified"),
      ],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("has-template-style-changes");
    expect(finding.tags).toContain("template-changed");
    expect(finding.tags).toContain("style-changed");
  });

  it("should detect reactive forms usage", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/form.component.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/form.component.ts",
        [
          "form = new FormGroup({",
          "  name: new FormControl(''),",
          "});",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("reactive-forms");
  });

  it("should detect HttpClient usage", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/api.service.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/api.service.ts",
        [
          "constructor(private http: HttpClient) {}",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("http-client");
    expect(finding.tags).toContain("constructor-di");
  });

  it("should detect inject() function usage", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/modern.service.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/modern.service.ts",
        [
          "private http = inject(HttpClient);",
          "providedIn: 'root'",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("inject-fn");
    expect(finding.tags).toContain("provided-in-root");
  });

  it("should detect control flow and defer blocks", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/app/list.component.ts", "modified")],
      diffs: [createFileDiff(
        "src/app/list.component.ts",
        [
          "@if (items.length > 0) {",
          "@for (item of items; track item.id) {",
          "@defer (on viewport) {",
        ],
        [],
        "modified"
      )],
    });

    const findings = angularComponentsAnalyzer.analyze(changeSet);

    expect(findings.length).toBe(1);
    const finding = findings[0] as AngularComponentChangeFinding;
    expect(finding.tags).toContain("control-flow");
    expect(finding.tags).toContain("defer-block");
  });
});
