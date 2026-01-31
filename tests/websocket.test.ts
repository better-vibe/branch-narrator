/**
 * Tests for the WebSocket analyzer.
 */

import { describe, it, expect } from "bun:test";
import {
  websocketAnalyzer,
  isWebSocketFile,
  detectWebSocketLibrary,
  detectSocketIOEvents,
  detectNativeWebSocketEvents,
  detectRoomChanges,
  detectNamespaceChanges,
} from "../src/analyzers/websocket.js";
import type { ChangeSet, FileDiff } from "../src/core/types.js";

function createChangeSet(diffs: FileDiff[]): ChangeSet {
  return {
    base: "main",
    head: "feature",
    files: diffs.map((d) => ({
      path: d.path,
      status: d.status,
      oldPath: d.oldPath,
    })),
    diffs,
    headPackageJson: {
      dependencies: {
        "socket.io": "^4.0.0",
        ws: "^8.0.0",
      },
    },
  };
}

function createHunk(oldStart: number, oldLines: number, newStart: number, newLines: number, additions: string[], deletions: string[]) {
  return {
    oldStart,
    oldLines,
    newStart,
    newLines,
    content: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
    additions,
    deletions,
  };
}

describe("isWebSocketFile", () => {
  it("should detect *.socket.ts files", () => {
    expect(isWebSocketFile("src/chat.socket.ts")).toBe(true);
    expect(isWebSocketFile("server/socket.ts")).toBe(true);
  });

  it("should detect ws/ directory files", () => {
    expect(isWebSocketFile("src/ws/handlers.ts")).toBe(true);
    expect(isWebSocketFile("src/ws/index.ts")).toBe(true);
  });

  it("should detect websocket/ directory files", () => {
    expect(isWebSocketFile("src/websocket/server.ts")).toBe(true);
  });

  it("should detect server/**/*socket* files", () => {
    expect(isWebSocketFile("src/server/socket-handler.ts")).toBe(true);
    expect(isWebSocketFile("src/server/websocket-server.ts")).toBe(true);
  });

  it("should detect io/ directory files", () => {
    expect(isWebSocketFile("src/io/index.ts")).toBe(true);
  });

  it("should not detect regular files", () => {
    expect(isWebSocketFile("src/utils.ts")).toBe(false);
    expect(isWebSocketFile("src/components/Button.tsx")).toBe(false);
  });
});

describe("detectWebSocketLibrary", () => {
  it("should detect socket.io imports", () => {
    const content = `import { Server } from 'socket.io';`;
    expect(detectWebSocketLibrary(content)).toBe("socket.io");
  });

  it("should detect socket.io-client imports", () => {
    const content = `import io from 'socket.io-client';`;
    expect(detectWebSocketLibrary(content)).toBe("socket.io");
  });

  it("should detect ws library imports", () => {
    const content = `import WebSocket from 'ws';`;
    expect(detectWebSocketLibrary(content)).toBe("ws");
  });

  it("should detect native WebSocket usage", () => {
    const content = `const ws = new WebSocket('ws://localhost:8080');`;
    expect(detectWebSocketLibrary(content)).toBe("native");
  });

  it("should detect wss protocol", () => {
    const content = `const ws = new WebSocket('wss://secure.example.com');`;
    expect(detectWebSocketLibrary(content)).toBe("native");
  });

  it("should return unknown when no library detected", () => {
    const content = `console.log('hello world');`;
    expect(detectWebSocketLibrary(content)).toBe("unknown");
  });
});

describe("detectSocketIOEvents", () => {
  it("should detect socket.on handlers", () => {
    const content = `
      socket.on('message', (data) => {
        console.log(data);
      });
    `;
    const events = detectSocketIOEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("message");
    expect(events[0].direction).toBe("incoming");
  });

  it("should detect socket.emit calls", () => {
    const content = `
      socket.emit('broadcast', { msg: 'hello' });
    `;
    const events = detectSocketIOEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("broadcast");
    expect(events[0].direction).toBe("outgoing");
  });

  it("should detect bidirectional events", () => {
    const content = `
      socket.on('chat', (msg) => {
        console.log(msg);
      });
      socket.emit('chat', { text: 'hello' });
    `;
    const events = detectSocketIOEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("chat");
    expect(events[0].direction).toBe("bidirectional");
  });

  it("should detect io.on connection handlers", () => {
    const content = `
      io.on('connection', (socket) => {
        console.log('connected');
      });
    `;
    const events = detectSocketIOEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("connection");
  });

  it("should detect socket.to().emit() calls", () => {
    const content = `
      socket.to('room1').emit('notification', { text: 'alert' });
    `;
    const events = detectSocketIOEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("notification");
    expect(events[0].direction).toBe("outgoing");
  });

  it("should detect io.emit() broadcast calls", () => {
    const content = `
      io.emit('global-event', { data: 'test' });
    `;
    const events = detectSocketIOEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("global-event");
    expect(events[0].direction).toBe("outgoing");
  });
});

describe("detectNativeWebSocketEvents", () => {
  it("should detect ws.onmessage handlers", () => {
    const content = `
      ws.onmessage = (event) => {
        console.log(event.data);
      };
    `;
    const events = detectNativeWebSocketEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("message");
    expect(events[0].direction).toBe("incoming");
  });

  it("should detect addEventListener('message')", () => {
    const content = `
      ws.addEventListener('message', (event) => {
        console.log(event.data);
      });
    `;
    const events = detectNativeWebSocketEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("message");
    expect(events[0].direction).toBe("incoming");
  });

  it("should detect ws.send() calls", () => {
    const content = `
      ws.send(JSON.stringify({ type: 'ping' }));
    `;
    const events = detectNativeWebSocketEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("message");
    expect(events[0].direction).toBe("outgoing");
  });

  it("should detect bidirectional native WebSocket usage", () => {
    const content = `
      ws.onmessage = (event) => {
        console.log(event.data);
      };
      ws.send('hello');
    `;
    const events = detectNativeWebSocketEvents(content);
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe("message");
    expect(events[0].direction).toBe("bidirectional");
  });

  it("should detect standard WebSocket events via addEventListener", () => {
    const content = `
      ws.addEventListener('open', handleOpen);
      ws.addEventListener('close', handleClose);
      ws.addEventListener('error', handleError);
    `;
    const events = detectNativeWebSocketEvents(content);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const eventNames = events.map((e) => e.eventName);
    expect(eventNames).toContain("open");
    expect(eventNames).toContain("close");
    expect(eventNames).toContain("error");
  });

  it("should detect standard WebSocket events via on* handlers", () => {
    const content = `
      ws.onopen = () => console.log('open');
      ws.onclose = () => console.log('close');
      ws.onerror = (err) => console.error(err);
    `;
    const events = detectNativeWebSocketEvents(content);
    expect(events.length).toBeGreaterThanOrEqual(3);
    const eventNames = events.map((e) => e.eventName);
    expect(eventNames).toContain("open");
    expect(eventNames).toContain("close");
    expect(eventNames).toContain("error");
  });
});

describe("detectRoomChanges", () => {
  it("should detect socket.join() calls", () => {
    const content = `
      socket.join('general');
      socket.join('private-room');
    `;
    const rooms = detectRoomChanges(content);
    expect(rooms).toContain("general");
    expect(rooms).toContain("private-room");
  });

  it("should detect socket.leave() calls", () => {
    const content = `
      socket.leave('old-room');
    `;
    const rooms = detectRoomChanges(content);
    expect(rooms).toContain("old-room");
  });

  it("should detect socket.to() calls", () => {
    const content = `
      socket.to('target-room').emit('event', data);
    `;
    const rooms = detectRoomChanges(content);
    expect(rooms).toContain("target-room");
  });

  it("should detect io.to() calls", () => {
    const content = `
      io.to('broadcast-room').emit('announcement', msg);
    `;
    const rooms = detectRoomChanges(content);
    expect(rooms).toContain("broadcast-room");
  });

  it("should detect io.in() calls", () => {
    const content = `
      io.in('admin-room').emit('admin-event', data);
    `;
    const rooms = detectRoomChanges(content);
    expect(rooms).toContain("admin-room");
  });
});

describe("detectNamespaceChanges", () => {
  it("should detect io.of() namespace definitions", () => {
    const content = `
      const chatNamespace = io.of('/chat');
      const adminNamespace = io.of('/admin');
    `;
    const namespaces = detectNamespaceChanges(content);
    expect(namespaces).toContain("/chat");
    expect(namespaces).toContain("/admin");
  });

  it("should not duplicate namespace entries", () => {
    const content = `
      const nsp = io.of('/test');
      io.of('/test').on('connection', () => {});
    `;
    const namespaces = detectNamespaceChanges(content);
    expect(namespaces).toHaveLength(1);
    expect(namespaces[0]).toBe("/test");
  });
});

describe("websocketAnalyzer.analyze", () => {
  it("should detect Socket.io event additions", () => {
    const diff: FileDiff = {
      path: "src/chat.socket.ts",
      status: "modified",
      hunks: [
        createHunk(1, 1, 1, 10, [
          `import { Server } from 'socket.io';`,
          `socket.on('chat-message', (msg) => {`,
          `  console.log(msg);`,
          `});`,
          `socket.emit('user-joined', { id: 1 });`,
        ], []),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0];
    expect(finding.type).toBe("websocket-change");
    expect(finding.library).toBe("socket.io");
    expect(finding.eventChanges).toHaveLength(2);

    const eventNames = finding.eventChanges.map((e) => e.eventName);
    expect(eventNames).toContain("chat-message");
    expect(eventNames).toContain("user-joined");
  });

  it("should detect breaking changes (removed events)", () => {
    const diff: FileDiff = {
      path: "src/chat.socket.ts",
      status: "modified",
      hunks: [
        createHunk(1, 10, 1, 5, [
          `socket.on('new-message', (msg) => {`,
          `  console.log(msg);`,
          `});`,
        ], [
          `socket.on('old-event', (data) => {`,
          `  console.log(data);`,
          `});`,
        ]),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0];
    expect(finding.isBreaking).toBe(true);
    expect(finding.breakingReasons.length).toBeGreaterThan(0);

    const removedEvent = finding.eventChanges.find((e) => e.eventName === "old-event");
    expect(removedEvent).toBeDefined();
    expect(removedEvent?.operation).toBe("removed");
    expect(removedEvent?.isBreaking).toBe(true);
  });

  it("should detect native WebSocket changes", () => {
    const diff: FileDiff = {
      path: "src/ws/client.ts",
      status: "modified",
      hunks: [
        createHunk(1, 1, 1, 8, [
          `const ws = new WebSocket('ws://localhost:8080');`,
          `ws.onmessage = (event) => {`,
          `  handleMessage(event.data);`,
          `};`,
          `ws.send('hello');`,
        ], []),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0];
    expect(finding.library).toBe("native");
    expect(finding.eventChanges.length).toBeGreaterThan(0);
  });

  it("should detect ws library usage", () => {
    const diff: FileDiff = {
      path: "src/ws/server.ts",
      status: "added",
      hunks: [
        createHunk(0, 0, 1, 8, [
          `import WebSocket from 'ws';`,
          `const wss = new WebSocket.Server({ port: 8080 });`,
          `wss.on('connection', (ws) => {`,
          `  ws.on('message', (data) => {`,
          `    console.log(data);`,
          `  });`,
          `});`,
        ], []),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0];
    expect(finding.library).toBe("ws");
  });

  it("should detect room and namespace changes", () => {
    const diff: FileDiff = {
      path: "src/io/namespaces.ts",
      status: "modified",
      hunks: [
        createHunk(1, 1, 1, 15, [
          `import { Server } from 'socket.io';`,
          `const adminNamespace = io.of('/admin');`,
          `adminNamespace.on('connection', (socket) => {`,
          `  socket.join('admin-room');`,
          `  socket.to('admin-room').emit('admin-msg', 'Welcome');`,
          `});`,
        ], []),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0];
    expect(finding.roomChanges).toContain("admin-room");
    expect(finding.namespaceChanges).toContain("/admin");
  });

  it("should skip files with no WebSocket content", () => {
    const diff: FileDiff = {
      path: "src/utils.ts",
      status: "modified",
      hunks: [
        createHunk(1, 1, 1, 5, [
          `export function add(a: number, b: number) {`,
          `  return a + b;`,
          `}`,
        ], []),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should handle WebSocket files by path pattern even without imports", () => {
    const diff: FileDiff = {
      path: "src/ws/handlers.ts",
      status: "modified",
      hunks: [
        createHunk(1, 1, 1, 5, [
          `socket.on('test', () => {});`,
        ], []),
      ],
    };
    const changeSet = createChangeSet([diff]);

    const findings = websocketAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);
    expect(findings[0].file).toBe("src/ws/handlers.ts");
  });
});

describe("websocketAnalyzer cache configuration", () => {
  it("should have cache metadata with includeGlobs", () => {
    expect(websocketAnalyzer.cache).toBeDefined();
    expect(websocketAnalyzer.cache?.includeGlobs).toBeDefined();
    expect(websocketAnalyzer.cache?.includeGlobs?.length).toBeGreaterThan(0);
  });

  it("should include socket file patterns in cache", () => {
    const globs = websocketAnalyzer.cache?.includeGlobs || [];
    expect(globs.some((g) => g.includes("socket"))).toBe(true);
    expect(globs.some((g) => g.includes("ws"))).toBe(true);
  });
});
