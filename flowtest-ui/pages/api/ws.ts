import type { NextApiRequest, NextApiResponse } from "next";
import type { Server as HttpServer, IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";

type WsWithState = WebSocket & { __flowtestActive?: boolean };

type NextApiResponseWithSocket = NextApiResponse & {
  socket: Socket & {
    server: HttpServer & {
      __flowtestWss?: WebSocketServer;
      __flowtestWsUpgradeAttached?: boolean;
    };
  };
};

type StartMessage = { type?: string; payload?: unknown };

function buildBaseUrl(req: IncomingMessage): string {
  const protoHeader = String(req.headers["x-forwarded-proto"] || "http");
  const proto = protoHeader.split(",")[0].trim().toLowerCase() === "https" ? "https" : "http";
  const host = String(req.headers.host || "localhost:3006");
  return `${proto}://${host}`;
}

async function relaySseToWebSocket(ws: WsWithState, baseUrl: string, payload: unknown): Promise<void> {
  ws.__flowtestActive = true;
  const res = await fetch(`${baseUrl}/api/intake/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok || !res.body) {
    ws.send(JSON.stringify({ type: "error", payload: { message: `intake stream failed (${res.status})` } }));
    ws.__flowtestActive = false;
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneByFinal = false;
  try {
    while (ws.readyState === WebSocket.OPEN) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf("\n\n");
      while (split >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const dataLines = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        const raw = dataLines.join("\n");
        if (!raw) {
          split = buffer.indexOf("\n\n");
          continue;
        }
        try {
          const parsed = JSON.parse(raw) as { type?: string };
          ws.send(JSON.stringify(parsed));
          if (String(parsed?.type || "") === "final" || String(parsed?.type || "") === "error") {
            doneByFinal = true;
          }
        } catch {
          // ignore malformed chunk
        }
        split = buffer.indexOf("\n\n");
      }
      if (doneByFinal) break;
    }
  } finally {
    ws.__flowtestActive = false;
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

function bindWsServer(res: NextApiResponseWithSocket) {
  if (res.socket.server.__flowtestWss) return;
  const wss = new WebSocketServer({ noServer: true });
  res.socket.server.__flowtestWss = wss;

  if (!res.socket.server.__flowtestWsUpgradeAttached) {
    res.socket.server.__flowtestWsUpgradeAttached = true;
    res.socket.server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
      if (!String(req.url || "").startsWith("/api/ws")) return;
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit("connection", client, req);
      });
    });
  }

  wss.on("connection", (client: WebSocket, req: IncomingMessage) => {
    const ws = client as WsWithState;
    const baseUrl = buildBaseUrl(req);
    ws.send(JSON.stringify({ type: "info", payload: { message: "ws-connected" } }));

    ws.on("message", async (raw) => {
      if (ws.readyState !== WebSocket.OPEN || ws.__flowtestActive) return;
      let message: StartMessage = {};
      try {
        message = JSON.parse(String(raw || "{}")) as StartMessage;
      } catch {
        ws.send(JSON.stringify({ type: "error", payload: { message: "invalid websocket payload" } }));
        return;
      }
      if (String(message?.type || "") !== "start") return;
      try {
        await relaySseToWebSocket(ws, baseUrl, message.payload);
      } catch (error: any) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "error",
              payload: { message: String(error?.message || error || "ws relay failed") }
            })
          );
        }
      }
    });
  });
}

export default function handler(_req: NextApiRequest, res: NextApiResponseWithSocket) {
  bindWsServer(res);
  res.status(200).json({ ok: true, transport: "websocket", endpoint: "/api/ws" });
}

export const config = {
  api: {
    bodyParser: false
  }
};

