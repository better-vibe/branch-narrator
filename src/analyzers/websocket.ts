/**
 * WebSocket analyzer for Socket.io and native WebSocket API.
 *
 * Detects changes to WebSocket event handlers, room usage, namespaces,
 * and identifies breaking changes like removed or renamed events.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  WebSocketChangeFinding,
  Confidence,
} from "../core/types.js";

// WebSocket file patterns
const WEBSOCKET_FILE_PATTERNS = [
  /\.socket\.(ts|js|mjs|cjs)$/,
  /socket\.(ts|js|mjs|cjs)$/,
  /[\/\\]ws[\/\\].+\.(ts|js|mjs|cjs)$/,
  /[\/\\]websocket[\/\\].+\.(ts|js|mjs|cjs)$/,
  /[\/\\]server[\/\\].*socket.*\.(ts|js|mjs|cjs)$/,
  /[\/\\]io[\/\\].+\.(ts|js|mjs|cjs)$/,
];

// Socket.io import patterns
const SOCKET_IO_IMPORT_PATTERNS = [
  /import\s+.*\s+from\s+['"]socket\.io['"]/,
  /import\s+.*\s+from\s+['"]socket\.io-client['"]/,
  /require\s*\(\s*['"]socket\.io['"]\s*\)/,
  /require\s*\(\s*['"]socket\.io-client['"]\s*\)/,
];

// Native WebSocket patterns
const NATIVE_WEBSOCKET_PATTERNS = [
  /new\s+WebSocket\s*\(/,
  /ws:\/\//,
  /wss:\/\//,
];

// ws library patterns
const WS_LIBRARY_PATTERNS = [
  /import\s+.*\s+from\s+['"]ws['"]/,
  /require\s*\(\s*['"]ws['"]\s*\)/,
];

/**
 * Check if a file is a WebSocket-related file by path pattern.
 */
export function isWebSocketFile(path: string): boolean {
  return WEBSOCKET_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Detect which WebSocket library is used in the content.
 */
export function detectWebSocketLibrary(content: string): "socket.io" | "native" | "ws" | "unknown" {
  // Check for ws library imports first (higher priority for ws)
  if (WS_LIBRARY_PATTERNS.some((pattern) => pattern.test(content))) {
    return "ws";
  }

  // Check for ws library usage patterns (including wss.on('connection') and WebSocket.Server)
  if (/wss?\.on\s*\(\s*['"]|WebSocket\.Server/.test(content)) {
    return "ws";
  }

  // Check for Socket.io imports
  if (SOCKET_IO_IMPORT_PATTERNS.some((pattern) => pattern.test(content))) {
    return "socket.io";
  }

  // Check for socket.io usage patterns even without imports (e.g., in handler files)
  // Make sure it's not ws library by excluding patterns with wss/ws variable names
  if (/socket\.on\s*\(|io\.on\s*\(|socket\.emit\s*\(|io\.emit\s*\(/.test(content)) {
    // Double-check it's not ws library content
    if (!/wss?\.on\s*\(\s*['"]/.test(content) && !/WebSocket\.Server/.test(content)) {
      return "socket.io";
    }
  }

  // Check for native WebSocket
  if (NATIVE_WEBSOCKET_PATTERNS.some((pattern) => pattern.test(content))) {
    return "native";
  }

  return "unknown";
}

/**
 * Detect Socket.io event handlers from content.
 * Returns events with their name, operation type, and direction.
 */
export function detectSocketIOEvents(content: string): Array<{
  eventName: string;
  operation: "added" | "removed" | "modified";
  direction: "incoming" | "outgoing" | "bidirectional";
}> {
  const events: Array<{
    eventName: string;
    operation: "added" | "removed" | "modified";
    direction: "incoming" | "outgoing" | "bidirectional";
  }> = [];

  // Match socket.on('eventName', ...) or socket.on("eventName", ...) - incoming
  const onPattern = /socket\.on\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  let match;
  while ((match = onPattern.exec(content)) !== null) {
    const eventName = match[1];
    if (!events.some((e) => e.eventName === eventName)) {
      events.push({
        eventName,
        operation: "added",
        direction: "incoming",
      });
    }
  }

  // Match io.on('connection', ...) - connection handler
  const ioOnPattern = /io\.on\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  while ((match = ioOnPattern.exec(content)) !== null) {
    const eventName = match[1];
    if (!events.some((e) => e.eventName === eventName)) {
      events.push({
        eventName,
        operation: "added",
        direction: "incoming",
      });
    }
  }

  // Match socket.emit('eventName', ...) - outgoing
  const emitPattern = /socket\.emit\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  while ((match = emitPattern.exec(content)) !== null) {
    const eventName = match[1];
    const existing = events.find((e) => e.eventName === eventName);
    if (existing) {
      // If already exists as incoming, make it bidirectional
      if (existing.direction === "incoming") {
        existing.direction = "bidirectional";
      }
    } else {
      events.push({
        eventName,
        operation: "added",
        direction: "outgoing",
      });
    }
  }

  // Match socket.to(...).emit('eventName', ...) - outgoing to room
  const toEmitPattern = /socket\.to\s*\([^)]+\)\.emit\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  while ((match = toEmitPattern.exec(content)) !== null) {
    const eventName = match[1];
    const existing = events.find((e) => e.eventName === eventName);
    if (!existing) {
      events.push({
        eventName,
        operation: "added",
        direction: "outgoing",
      });
    }
  }

  // Match io.emit('eventName', ...) - broadcast outgoing
  const ioEmitPattern = /io\.emit\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  while ((match = ioEmitPattern.exec(content)) !== null) {
    const eventName = match[1];
    const existing = events.find((e) => e.eventName === eventName);
    if (!existing) {
      events.push({
        eventName,
        operation: "added",
        direction: "outgoing",
      });
    }
  }

  return events;
}

/**
 * Detect native WebSocket events from content.
 */
export function detectNativeWebSocketEvents(content: string): Array<{
  eventName: string;
  operation: "added" | "removed" | "modified";
  direction: "incoming" | "outgoing" | "bidirectional";
}> {
  const events: Array<{
    eventName: string;
    operation: "added" | "removed" | "modified";
    direction: "incoming" | "outgoing" | "bidirectional";
  }> = [];

  // Match ws.onmessage or addEventListener('message', ...) - incoming
  if (/ws\.onmessage|\.addEventListener\s*\(\s*['"]message['"]\s*,/.test(content)) {
    if (!events.some((e) => e.eventName === "message")) {
      events.push({
        eventName: "message",
        operation: "added",
        direction: "incoming",
      });
    }
  }

  // Match ws.send(...) - outgoing
  if (/ws\.send\s*\(/.test(content)) {
    const existing = events.find((e) => e.eventName === "message");
    if (existing) {
      existing.direction = "bidirectional";
    } else {
      events.push({
        eventName: "message",
        operation: "added",
        direction: "outgoing",
      });
    }
  }

  // Match addEventListener for custom events (native WebSocket typically uses 'open', 'close', 'error', 'message')
  const eventListenerPattern = /\.addEventListener\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  let match;
  while ((match = eventListenerPattern.exec(content)) !== null) {
    const eventName = match[1];
    if (["open", "close", "error", "message"].includes(eventName)) {
      if (!events.some((e) => e.eventName === eventName)) {
        events.push({
          eventName,
          operation: "added",
          direction: "incoming",
        });
      }
    }
  }

  // Match onopen, onclose, onerror, onmessage handlers
  const onHandlerPattern = /ws\.on(\w+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g;
  while ((match = onHandlerPattern.exec(content)) !== null) {
    const eventName = match[1];
    if (!events.some((e) => e.eventName === eventName)) {
      events.push({
        eventName,
        operation: "added",
        direction: "incoming",
      });
    }
  }

  return events;
}

/**
 * Detect ws library events from content.
 * The ws library uses EventEmitter-style patterns like wss.on('connection', callback).
 */
export function detectWsLibraryEvents(content: string): Array<{
  eventName: string;
  operation: "added" | "removed" | "modified";
  direction: "incoming" | "outgoing" | "bidirectional";
}> {
  const events: Array<{
    eventName: string;
    operation: "added" | "removed" | "modified";
    direction: "incoming" | "outgoing" | "bidirectional";
  }> = [];

  // Match wss.on('event', ...) or ws.on('event', ...) - ws library EventEmitter style
  const onPattern = /(?:wss|ws)\.on\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  let match;
  while ((match = onPattern.exec(content)) !== null) {
    const eventName = match[1];
    if (!events.some((e) => e.eventName === eventName)) {
      events.push({
        eventName,
        operation: "added",
        direction: "incoming",
      });
    }
  }

  // Match ws.send(...) - outgoing
  if (/ws\.send\s*\(/.test(content)) {
    const existing = events.find((e) => e.eventName === "message");
    if (existing) {
      existing.direction = "bidirectional";
    } else {
      events.push({
        eventName: "message",
        operation: "added",
        direction: "outgoing",
      });
    }
  }

  return events;
}

/**
 * Detect room changes (socket.io specific).
 */
export function detectRoomChanges(content: string): string[] {
  const rooms: string[] = [];

  // Match socket.join('roomName')
  const joinPattern = /socket\.join\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = joinPattern.exec(content)) !== null) {
    const roomName = match[1];
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
    }
  }

  // Match socket.leave('roomName')
  const leavePattern = /socket\.leave\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = leavePattern.exec(content)) !== null) {
    const roomName = match[1];
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
    }
  }

  // Match socket.to('roomName')
  const toPattern = /socket\.to\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = toPattern.exec(content)) !== null) {
    const roomName = match[1];
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
    }
  }

  // Match io.to('roomName')
  const ioToPattern = /io\.to\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = ioToPattern.exec(content)) !== null) {
    const roomName = match[1];
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
    }
  }

  // Match io.in('roomName')
  const ioInPattern = /io\.in\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = ioInPattern.exec(content)) !== null) {
    const roomName = match[1];
    if (!rooms.includes(roomName)) {
      rooms.push(roomName);
    }
  }

  return rooms;
}

/**
 * Detect namespace changes (socket.io specific).
 */
export function detectNamespaceChanges(content: string): string[] {
  const namespaces: string[] = [];

  // Match io.of('/namespace')
  const ofPattern = /io\.of\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = ofPattern.exec(content)) !== null) {
    const namespace = match[1];
    if (!namespaces.includes(namespace)) {
      namespaces.push(namespace);
    }
  }

  // Match namespace declaration: const nsp = io.of('/namespace')
  const namespacePattern = /io\.of\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = namespacePattern.exec(content)) !== null) {
    const namespace = match[1];
    if (!namespaces.includes(namespace)) {
      namespaces.push(namespace);
    }
  }

  return namespaces;
}

/**
 * Detect breaking changes between base and head content.
 */
function detectBreakingChanges(
  baseEvents: Array<{ eventName: string; direction: string }>,
  headEvents: Array<{ eventName: string; direction: string }>,
  deletions: string[]
): string[] {
  const breakingReasons: string[] = [];
  const deletedContent = deletions.join("\n");

  // Check for removed events
  for (const baseEvent of baseEvents) {
    const stillExists = headEvents.some((e) => e.eventName === baseEvent.eventName);
    if (!stillExists) {
      breakingReasons.push(`Removed event: ${baseEvent.eventName}`);
    }
  }

  // Check for event handler removals (detect removed .on handlers)
  const removedHandlerPattern = /socket\.on\s*\(\s*['"]([^'"]+)['"]\s*,/g;
  let match;
  while ((match = removedHandlerPattern.exec(deletedContent)) !== null) {
    const eventName = match[1];
    const stillExists = headEvents.some((e) => e.eventName === eventName);
    if (!stillExists && !breakingReasons.some((r) => r.includes(eventName))) {
      breakingReasons.push(`Removed handler for: ${eventName}`);
    }
  }

  // Check for message schema changes (complex object modifications in event handlers)
  if (/socket\.on\s*\([^)]+\)\s*\{[\s\S]*?\{[\s\S]*?\}/.test(deletedContent)) {
    // Complex nested objects changed
    const complexSchemaPattern = /socket\.on\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\)\s*\{)/g;
    while ((match = complexSchemaPattern.exec(deletedContent)) !== null) {
      const eventName = match[1];
      const stillExists = headEvents.some((e) => e.eventName === eventName);
      if (stillExists && !breakingReasons.some((r) => r === `Modified schema for: ${eventName}`)) {
        breakingReasons.push(`Modified schema for: ${eventName}`);
      }
    }
  }

  return breakingReasons;
}

export const websocketAnalyzer: Analyzer = {
  name: "websocket",
  cache: {
    includeGlobs: [
      "**/*.socket.{ts,js,mjs,cjs}",
      "**/socket.{ts,js,mjs,cjs}",
      "**/ws/**/*.{ts,js,mjs,cjs}",
      "**/websocket/**/*.{ts,js,mjs,cjs}",
      "**/server/*socket*.{ts,js,mjs,cjs}",
      "**/io/**/*.{ts,js,mjs,cjs}",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      // Check if this is a WebSocket file by path or content
      const isWsFileByPath = isWebSocketFile(diff.path);

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);
      const addedContent = additions.join("\n");
      const deletedContent = deletions.join("\n");

      // Detect library from content (check both added and deleted)
      let library = detectWebSocketLibrary(addedContent);
      if (library === "unknown") {
        library = detectWebSocketLibrary(deletedContent);
      }

      // Skip if not a WebSocket file and no library detected
      if (!isWsFileByPath && library === "unknown") {
        continue;
      }

      // For WebSocket files by path, try to detect events even if library is unknown
      // This handles cases where imports aren't visible in the diff
      const effectiveLibrary = library !== "unknown" ? library : "socket.io"; // Default to socket.io for file pattern matches

      // Detect events based on library
      let headEvents: Array<{ eventName: string; direction: "incoming" | "outgoing" | "bidirectional" }> = [];
      let baseEvents: Array<{ eventName: string; direction: "incoming" | "outgoing" | "bidirectional" }> = [];

      if (effectiveLibrary === "socket.io") {
        headEvents = detectSocketIOEvents(addedContent);
        baseEvents = detectSocketIOEvents(deletedContent);
      } else if (effectiveLibrary === "ws") {
        headEvents = detectWsLibraryEvents(addedContent);
        baseEvents = detectWsLibraryEvents(deletedContent);
      } else if (effectiveLibrary === "native") {
        headEvents = detectNativeWebSocketEvents(addedContent);
        baseEvents = detectNativeWebSocketEvents(deletedContent);
      }

      // Detect rooms and namespaces (Socket.io only)
      const roomChanges = effectiveLibrary === "socket.io" ? detectRoomChanges(addedContent) : [];
      const namespaceChanges = effectiveLibrary === "socket.io" ? detectNamespaceChanges(addedContent) : [];

      // Build event changes
      const eventChanges: WebSocketChangeFinding["eventChanges"] = [];

      // Added events
      for (const event of headEvents) {
        const existedBefore = baseEvents.some((e) => e.eventName === event.eventName);
        if (!existedBefore) {
          eventChanges.push({
            eventName: event.eventName,
            operation: "added",
            direction: event.direction,
            isBreaking: false,
          });
        }
      }

      // Removed events
      for (const event of baseEvents) {
        const stillExists = headEvents.some((e) => e.eventName === event.eventName);
        if (!stillExists) {
          eventChanges.push({
            eventName: event.eventName,
            operation: "removed",
            direction: event.direction,
            isBreaking: true,
          });
        }
      }

      // Modified events (exist in both - check for breaking changes)
      for (const headEvent of headEvents) {
        const baseEvent = baseEvents.find((e) => e.eventName === headEvent.eventName);
        if (baseEvent) {
          // Check if direction changed
          if (baseEvent.direction !== headEvent.direction) {
            eventChanges.push({
              eventName: headEvent.eventName,
              operation: "modified",
              direction: headEvent.direction,
              isBreaking: false, // Direction change is not breaking, just informational
            });
          }
        }
      }

      // If no changes detected, skip
      if (eventChanges.length === 0 && roomChanges.length === 0 && namespaceChanges.length === 0) {
        continue;
      }

      // Detect breaking changes
      const breakingReasons = detectBreakingChanges(baseEvents, headEvents, deletions);
      const isBreaking =
        breakingReasons.length > 0 ||
        eventChanges.some((e) => e.isBreaking);

      // Determine confidence
      let confidence: Confidence = "medium";
      if (isBreaking) {
        confidence = "high";
      } else if (eventChanges.every((e) => e.operation === "added")) {
        confidence = "low";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add breaking change evidence
      for (const reason of breakingReasons) {
        evidence.push(createEvidence(diff.path, `Breaking change: ${reason}`));
      }

      // Add event-specific evidence
      for (const change of eventChanges) {
        const directionLabel = change.direction === "incoming" ? "←" : change.direction === "outgoing" ? "→" : "↔";
        evidence.push(
          createEvidence(diff.path, `${directionLabel} ${change.eventName} (${change.operation})`)
        );
      }

      const finding: WebSocketChangeFinding = {
        type: "websocket-change",
        kind: "websocket-change",
        category: "api",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        library: effectiveLibrary,
        eventChanges,
        roomChanges,
        namespaceChanges,
        isBreaking,
        breakingReasons,
        tags: isBreaking ? ["breaking", "websocket"] : ["websocket"],
      };

      findings.push(finding);
    }

    return findings;
  },
};
