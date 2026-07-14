import type { Server as IOServer } from "socket.io";

const globalForIO = globalThis as unknown as { io?: IOServer };

export function setIO(io: IOServer) {
  globalForIO.io = io;
}

export function emitAuctionEvent(auctionId: string, event: string, payload: unknown) {
  globalForIO.io?.to(`auction:${auctionId}`).emit(event, payload);
}
