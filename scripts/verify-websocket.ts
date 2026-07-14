import { createServer } from "http";
import { Server } from "socket.io";
import { io as ioClient } from "socket.io-client";
import { setIO, emitAuctionEvent } from "../server/ws/broadcaster";

const PORT = 4177;

function waitForEvent<T>(socket: ReturnType<typeof ioClient>, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`OK: ${msg}`);
};

async function main() {
  const httpServer = createServer();
  const io = new Server(httpServer, { path: "/socket.io" });
  io.on("connection", (socket) => {
    socket.on("join", (auctionId: string) => {
      socket.join(`auction:${auctionId}`);
    });
  });
  setIO(io);

  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));
  console.log(`Test socket.io server listening on ${PORT}`);

  const clientA = ioClient(`http://localhost:${PORT}`, { path: "/socket.io" });
  const clientB = ioClient(`http://localhost:${PORT}`, { path: "/socket.io" });

  await Promise.all([
    new Promise<void>((resolve) => clientA.on("connect", () => resolve())),
    new Promise<void>((resolve) => clientB.on("connect", () => resolve())),
  ]);
  console.log("Both clients connected");

  clientA.emit("join", "auction-1");
  clientB.emit("join", "auction-2");
  await waitMs(200); // let join events land server-side

  const gotEventPromise = waitForEvent<{ auctionPlayerId: string; teamName: string; price: string }>(
    clientA,
    "player:sold"
  );

  // clientB listens for the same event but is in a different room -> should NOT receive it
  let clientBGotEvent = false;
  clientB.once("player:sold", () => {
    clientBGotEvent = true;
  });

  emitAuctionEvent("auction-1", "player:sold", {
    auctionPlayerId: "ap-1",
    teamName: "Team 1",
    price: "500",
  });

  const received = await gotEventPromise;
  assert(received.auctionPlayerId === "ap-1" && received.teamName === "Team 1" && received.price === "500",
    "Client joined to auction-1 room receives the player:sold broadcast with correct payload");

  await waitMs(300);
  assert(!clientBGotEvent, "Client joined to a different auction room does NOT receive the broadcast (room isolation)");

  clientA.disconnect();
  clientB.disconnect();
  io.close();
  httpServer.close();
  console.log("\nAll WebSocket broadcaster assertions passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
