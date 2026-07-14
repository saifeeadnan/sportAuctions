import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./server/ws/broadcaster";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, { path: "/socket.io" });
  io.on("connection", (socket) => {
    socket.on("join", (auctionId: string) => {
      socket.join(`auction:${auctionId}`);
    });
  });
  setIO(io);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
