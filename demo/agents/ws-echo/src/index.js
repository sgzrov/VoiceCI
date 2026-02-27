/**
 * ws-echo — Minimal ws-voice agent that echoes audio back.
 *
 * No API keys needed. Useful for smoke-testing the ws-voice pipeline.
 *
 * Protocol:
 *   Binary frames = PCM 16-bit 24kHz mono (echo back)
 *   GET /health   = { status: "ok" }
 */

import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[ws-echo] connection opened");

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      // Echo audio back
      ws.send(data);
    }
  });

  ws.on("close", () => {
    console.log("[ws-echo] connection closed");
  });
});

server.listen(PORT, () => {
  console.log(`[ws-echo] listening on port ${PORT}`);
});
