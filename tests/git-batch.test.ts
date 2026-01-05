
import { describe, expect, it, beforeAll, beforeEach, afterAll, afterEach, mock, type Mock, spyOn } from "bun:test";
import { Buffer } from "node:buffer";

// We need to declare these at module scope but initialize them in beforeAll
// to ensure proper mock lifecycle management
let batchGetFileContent: typeof import("../src/git/batch.js").batchGetFileContent;
let execa: typeof import("execa").execa;

describe("batchGetFileContent", () => {
  beforeAll(async () => {
    // Set up the mock BEFORE importing the module that uses it
    mock.module("execa", () => {
      return {
        execa: mock(),
      };
    });

    // Now import the modules that depend on the mock
    const batchModule = await import("../src/git/batch.js");
    batchGetFileContent = batchModule.batchGetFileContent;

    const execaModule = await import("execa");
    execa = execaModule.execa;
  });

  beforeEach(() => {
    // mockReset() clears both call history AND implementation, preventing leaks between tests
    (execa as unknown as Mock<typeof import("execa").execa>).mockReset();
  });

  afterAll(() => {
    // Restore the original modules to avoid affecting other tests
    mock.restore();
  });

  it("should parse git cat-file output correctly", async () => {
    const items = [
      { ref: "HEAD", path: "file1.txt" },
      { ref: "HEAD", path: "file2.txt" },
    ];

    // Simulate stdout from git cat-file --batch
    // Format: <sha1> <type> <size>\n<content>\n
    const file1Content = "Hello World";
    const file2Content = "Another file";

    const outputString = [
      `hash1 blob ${Buffer.byteLength(file1Content)}`,
      file1Content,
      `hash2 blob ${Buffer.byteLength(file2Content)}`,
      file2Content,
      "" // Trailing newline
    ].join("\n");

    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({ stdout: Buffer.from(outputString) } as any);

    const result = await batchGetFileContent(items);

    expect(result.size).toBe(2);
    expect(result.get("HEAD:file1.txt")).toBe(file1Content);
    expect(result.get("HEAD:file2.txt")).toBe(file2Content);
  });

  it("should handle multi-byte characters correctly", async () => {
    const items = [
      { ref: "HEAD", path: "emoji.txt" },
    ];

    // "👋" is 4 bytes
    const content = "Hello 👋 World";
    const size = Buffer.byteLength(content); // 14 bytes (6 + 4 + 4) -> actually Hello=5, space=1, wave=4, space=1, World=5 => 16 bytes?
    // 'Hello ' = 6
    // '👋' = 4
    // ' World' = 6
    // Total 16 bytes. Let's rely on Buffer.byteLength

    const outputBuffer = Buffer.concat([
      Buffer.from(`hash1 blob ${size}\n`),
      Buffer.from(content),
      Buffer.from("\n")
    ]);

    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({ stdout: outputBuffer } as any);

    const result = await batchGetFileContent(items);

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
      ""
    ].join("\n");

    (execa as unknown as Mock<typeof import("execa").execa>).mockResolvedValue({ stdout: Buffer.from(outputString) } as any);

    const result = await batchGetFileContent(items);

    expect(result.size).toBe(1);
    expect(result.get("HEAD:exists.txt")).toBe(content);
    expect(result.get("HEAD:missing.txt")).toBeUndefined();
  });

  it("should return empty map for empty input", async () => {
    const result = await batchGetFileContent([]);
    expect(result.size).toBe(0);
  });

  it("should handle execa failure gracefully", async () => {
    (execa as unknown as Mock<typeof import("execa").execa>).mockRejectedValue(new Error("Git failed"));

    // Silence console.warn for this test
    const spy = spyOn(console, "warn").mockImplementation(() => {});

    const result = await batchGetFileContent([{ ref: "HEAD", path: "file.txt" }]);

    expect(result.size).toBe(0);
    spy.mockRestore();
  });
});
