import { describe, it, expect } from "bun:test";
import { dockerAnalyzer, detectDockerFileType } from "../src/analyzers/docker.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

describe("dockerAnalyzer", () => {
  describe("detectDockerFileType", () => {
    it("should detect Dockerfiles", () => {
      expect(detectDockerFileType("Dockerfile")).toBe("dockerfile");
      expect(detectDockerFileType("Dockerfile.prod")).toBe("dockerfile");
      expect(detectDockerFileType("Dockerfile.dev")).toBe("dockerfile");
    });

    it("should detect docker-compose files", () => {
      expect(detectDockerFileType("docker-compose.yml")).toBe("compose");
      expect(detectDockerFileType("docker-compose.yaml")).toBe("compose");
      expect(detectDockerFileType("docker-compose.prod.yml")).toBe("compose");
      expect(detectDockerFileType("compose.yml")).toBe("compose");
      expect(detectDockerFileType("compose.yaml")).toBe("compose");
    });

    it("should detect .dockerignore", () => {
      expect(detectDockerFileType(".dockerignore")).toBe("dockerignore");
    });

    it("should return null for non-docker files", () => {
      expect(detectDockerFileType("src/index.ts")).toBeNull();
    });
  });

  describe("analyze", () => {
    it("should detect Dockerfile changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("Dockerfile", [
            "FROM node:20-alpine",
            "WORKDIR /app",
            "COPY . .",
            "RUN npm install",
            "EXPOSE 3000",
            'CMD ["node", "server.js"]',
          ], [], "added"),
        ],
      });

      const findings = dockerAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      expect(findings[0].type).toBe("docker-change");
      const finding = findings[0] as any;
      expect(finding.dockerfileType).toBe("dockerfile");
    });

    it("should detect base image changes as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "Dockerfile",
            ["FROM node:20-alpine"],
            ["FROM node:18-alpine"]
          ),
        ],
      });

      const findings = dockerAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons).toContain("Base image changed");
      expect(finding.baseImageChanges.length).toBeGreaterThan(0);
    });

    it("should detect docker-compose changes", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("docker-compose.yml", [
            "services:",
            "  web:",
            "    build: .",
            "    ports:",
            '      - "3000:3000"',
          ]),
        ],
      });

      const findings = dockerAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.dockerfileType).toBe("compose");
    });

    it("should detect compose port mapping changes as breaking", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff(
            "docker-compose.yml",
            ['    ports:', '      - "8080:8080"'],
            ['    ports:', '      - "3000:3000"']
          ),
        ],
      });

      const findings = dockerAnalyzer.analyze(changeSet);

      expect(findings).toHaveLength(1);
      const finding = findings[0] as any;
      expect(finding.isBreaking).toBe(true);
      expect(finding.breakingReasons).toContain("Port mappings changed");
    });

    it("should return empty for non-docker files", () => {
      const changeSet = createChangeSet({
        diffs: [
          createFileDiff("src/index.ts", ["export const foo = 1;"]),
        ],
      });

      const findings = dockerAnalyzer.analyze(changeSet);
      expect(findings).toHaveLength(0);
    });
  });
});
