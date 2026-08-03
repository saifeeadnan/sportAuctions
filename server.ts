import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import { getToken } from "next-auth/jwt";
import { setIO } from "./server/ws/broadcaster";
import { prisma } from "./lib/prisma";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, { path: "/socket.io" });
  io.on("connection", (socket) => {
    // Mirrors the same role/league scoping every other read path enforces
    // (lib/auth/scope.ts's assertInScope) — without this, anyone who can
    // open a raw Socket.IO connection and knows/guesses an auctionId could
    // listen in on another league's live bids and budgets.
    socket.on("join", async (auctionId: string) => {
      if (typeof auctionId !== "string" || !auctionId) return;

      // Which cookie name NextAuth used (__Secure-authjs.session-token vs
      // plain) depends on whether the browser sees the site as HTTPS — true
      // when this dev server is reached through the Cloudflare tunnel, even
      // though NODE_ENV still says "development". Reading it off the actual
      // cookie header (rather than guessing from NODE_ENV) works in every
      // setup: plain localhost dev, tunneled dev, and a real prod deploy.
      const rawCookies = (socket.request.headers as Record<string, string | undefined>).cookie ?? "";
      const secureCookie = rawCookies.includes("__Secure-authjs.session-token=");

      const token = await getToken({
        req: socket.request as unknown as { headers: Record<string, string> },
        secret: process.env.NEXTAUTH_SECRET,
        secureCookie,
      }).catch(() => null);
      if (!token) return;

      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { tournament: { select: { leagueId: true } } },
      });
      if (!auction) return;

      const role = token.role as string | undefined;
      const leagueId = token.leagueId as string | null | undefined;
      const inScope = role === "ADMIN" || leagueId === auction.tournament.leagueId;
      if (!inScope) return;

      socket.join(`auction:${auctionId}`);
    });
  });
  setIO(io);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
