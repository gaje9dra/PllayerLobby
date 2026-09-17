import http from "node:http";
import next from "next";
import { attachAviatorWebSocket, AVIATOR_WEBSOCKET_PATH } from "./aviator-websocket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const appHostname = dev ? "localhost" : hostname;
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname: appHostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const handleUpgrade = app.getUpgradeHandler();

const server = http.createServer((request, response) => {
  void handle(request, response);
});

server.on("upgrade", (request, socket, head) => {
  let pathname = "";
  try {
    pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname === AVIATOR_WEBSOCKET_PATH) {
    attachAviatorWebSocket(request, socket, head);
    return;
  }

  handleUpgrade(request, socket, head);
});

server.on("error", (error) => {
  console.error("PlayerLobby server error:", error);
});

server.listen(port, hostname, () => {
  console.log(`PlayerLobby server ready on http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${port}`);
});
