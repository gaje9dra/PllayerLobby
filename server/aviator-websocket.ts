import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { eventForSnapshot } from "@/lib/games/aviator/events";
import { getAviatorRoundSnapshot, subscribeToAviatorRounds } from "@/lib/games/aviator/server";
import { isAviatorClientMessage } from "@/lib/games/aviator/state";
import type { AviatorRoundSnapshot } from "@/lib/games/aviator/types";

export const AVIATOR_WEBSOCKET_PATH = "/api/games/aviator/ws";

const MAX_MESSAGE_BYTES = 2048;
const MAX_MESSAGES_PER_WINDOW = 20;
const MESSAGE_WINDOW_MS = 10_000;

type SocketLike = Duplex & { __playerLobbyAviator?: AviatorSocketState };

type AviatorSocketState = {
  buffer: Buffer;
  messages: number;
  windowStartedAt: number;
  unsubscribe: (() => void) | null;
  lastPhase: AviatorRoundSnapshot["phase"] | null;
};

function frameText(payload: string) {
  const body = Buffer.from(payload, "utf8");
  if (body.length > 65_535) throw new Error("WEBSOCKET_FRAME_TOO_LARGE");
  if (body.length > 125) {
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame[0] = 0x81;
    frame[1] = 126;
    frame.writeUInt16BE(body.length, 2);
    body.copy(frame, 4);
    return frame;
  }
  const frame = Buffer.allocUnsafe(2 + body.length);
  frame[0] = 0x81;
  frame[1] = body.length;
  body.copy(frame, 2);
  return frame;
}

function frameControl(opcode: number, payload = Buffer.alloc(0)) {
  if (payload.length > 125) throw new Error("WEBSOCKET_CONTROL_FRAME_TOO_LARGE");
  return Buffer.concat([Buffer.from([0x80 | opcode, payload.length]), payload]);
}

function frameClose(code = 1000) {
  const payload = Buffer.allocUnsafe(2);
  payload.writeUInt16BE(code, 0);
  return frameControl(0x8, payload);
}

function send(socket: Duplex, payload: unknown) {
  if (!socket.destroyed && socket.writable) socket.write(frameText(JSON.stringify(payload)));
}

function sendError(socket: Duplex, error: string) {
  send(socket, { type: "error", error });
}

function parseFrames(socket: SocketLike, chunk: Buffer, onMessage: (value: unknown) => void) {
  const state = socket.__playerLobbyAviator;
  if (!state) return;
  state.buffer = Buffer.concat([state.buffer, chunk]);

  while (state.buffer.length >= 2) {
    const first = state.buffer[0];
    const second = state.buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let offset = 2;
    let length = second & 0x7f;

    if (!fin) {
      socket.write(frameClose(1003));
      socket.destroy();
      return;
    }

    if (length === 126) {
      if (state.buffer.length < 4) return;
      length = state.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      socket.write(frameClose(1009));
      socket.destroy();
      return;
    }

    if (length > MAX_MESSAGE_BYTES) {
      socket.write(frameClose(1009));
      socket.destroy();
      return;
    }

    if (!masked) {
      socket.write(frameClose(1002));
      socket.destroy();
      return;
    }

    if (state.buffer.length < offset + 4 + length) return;
    const mask = state.buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(state.buffer.subarray(offset, offset + length));
    state.buffer = state.buffer.subarray(offset + length);

    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];

    if (opcode === 0x8) {
      socket.write(frameClose());
      socket.end();
      return;
    }
    if (opcode === 0x9) {
      socket.write(frameControl(0xa, payload));
      continue;
    }
    if (opcode !== 0x1) {
      socket.write(frameClose(1003));
      socket.destroy();
      return;
    }

    try {
      onMessage(JSON.parse(payload.toString("utf8")));
    } catch {
      sendError(socket, "INVALID_MESSAGE");
    }
  }
}

function authorizedOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = request.headers.host;
    return host ? originUrl.host === host : false;
  } catch {
    return false;
  }
}

export function attachAviatorWebSocket(request: IncomingMessage, socket: Duplex, head: Buffer) {
  if (!authorizedOrigin(request)) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }

  const key = request.headers["sec-websocket-key"];
  const version = request.headers["sec-websocket-version"];
  if (typeof key !== "string" || version !== "13") {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    return;
  }

  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );

  const ws = socket as SocketLike;
  ws.__playerLobbyAviator = {
    buffer: head.length ? Buffer.from(head) : Buffer.alloc(0),
    messages: 0,
    windowStartedAt: Date.now(),
    unsubscribe: null,
    lastPhase: null,
  };

  const state = ws.__playerLobbyAviator;
  state.unsubscribe = subscribeToAviatorRounds((snapshot) => {
    const event = eventForSnapshot(snapshot, state.lastPhase);
    state.lastPhase = snapshot.phase;
    send(ws, event);
  });

  const handleMessage = (value: unknown) => {
    const now = Date.now();
    if (now - state.windowStartedAt >= MESSAGE_WINDOW_MS) {
      state.windowStartedAt = now;
      state.messages = 0;
    }
    state.messages += 1;

    if (state.messages > MAX_MESSAGES_PER_WINDOW) {
      sendError(ws, "RATE_LIMITED");
      ws.write(frameClose(1008));
      ws.destroy();
      return;
    }

    if (!isAviatorClientMessage(value)) {
      sendError(ws, "INVALID_MESSAGE");
      return;
    }

    const current = getAviatorRoundSnapshot();
    if (value.roundId && value.roundId !== current.roundId) {
      sendError(ws, "STALE_ROUND");
      return;
    }

    send(ws, { type: "round:sync", snapshot: current });
  };

  ws.on("data", (chunk: Buffer) => parseFrames(ws, chunk, handleMessage));
  ws.on("close", () => state.unsubscribe?.());
  ws.on("error", () => state.unsubscribe?.());
}
