import { describe, expect, it, beforeEach, mock, type Mock, spyOn } from "bun:test";
import { Buffer } from "node:buffer";
import { batchGetFileContent } from "../src/git/batch.js";

describe("batchGetFileContent", () => {
  let execaMock: Mock<any>;

  beforeEach(() => {
    execaMock = mock();
  });

  it("should parse git cat-file output correctly", async () => {
    const items = [
      { ref: "HEAD", path: "file1.txt" },
      { ref: "HEAD", path: "file2.txt" },
    ];

    const file1Content = "Hello World";
    const file2Content = "Another file";

    const outputString = [
      `hash1 blob ${Buffer.byteLength(file1Content)}`,
      file1Content,
      `hash2 blob ${Buffer.byteLength(file2Content)}`,
      file2Content,
      "",
    ].join("\n");

    execaMock.mockResolvedValue({ stdout: Buffer.from(outputString) });

    const result = await batchGetFileContent(items, process.cwd(), execaMock as any);

    expect(result.size).toBe(2);
    expect(result.get("HEAD:file1.txt")).toBe(file1Content);
    expect(result.get("HEAD:file2.txt")).toBe(file2Content);
  });

  it("should handle multi-byte characters correctly", async () => {
    const items = [{ ref: "HEAD", path: "emoji.txt" }];

    const content = "Hello 👋 World";
    const size = Buffer.byteLength(content);

    const outputBuffer = Buffer.concat([
      Buffer.from(`hash1 blob ${size}\n`),
      Buffer.from(content),
      Buffer.from("\n"),
    ]);

    execaMock.mockResolvedValue({ stdout: outputBuffer });

    const result = await batchGetFileContent(items, process.cwd(), execaMock as any);
    expect(result.get("HEAD:emoji.txt")).toBe(content);
  });

  it("should handle missing files", async () => {
    const items = [
      { ref: "HEAD", path: "exists.txt" },
      { ref: "HEAD", path: "missing.txt" },
    ];

    const content = "content";
    const outputString = [
      `hash1 blob ${Buffer.byteLength(content)}`,
      content,
      `HEAD:missing.txt missing`,
      "",
    ].join("\n");

    execaMock.mockResolvedValue({ stdout: Buffer.from(outputString) });

    const result = await batchGetFileContent(items, process.cwd(), execaMock as any);

    expect(result.size).toBe(1);
    expect(result.get("HEAD:exists.txt")).toBe(content);
    expect(result.get("HEAD:missing.txt")).toBeUndefined();
  });

  it("should return empty map for empty input", async () => {
    const result = await batchGetFileContent([]);
    expect(result.size).toBe(0);
  });

  it("should handle execa failure gracefully", async () => {
    execaMock.mockRejectedValue(new Error("Git failed"));

    const spy = spyOn(console, "warn").mockImplementation(() => {});

    const result = await batchGetFileContent(
      [{ ref: "HEAD", path: "file.txt" }],
      process.cwd(),
      execaMock as any
    );

    expect(result.size).toBe(0);
    spy.mockRestore();
  });
});

