import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { reduceAuctionEvent, type AuctionSocketEvent, type AuctionState } from "@/lib/auctionState/reduceAuctionEvent";
import { useAuth } from "@/context/AuthContext";

export type SaleAnnouncement = { playerName: string; teamName: string; price: string };

const EVENT_TYPES: AuctionSocketEvent["type"][] = [
  "player:on-clock",
  "bid:placed",
  "player:sold",
  "player:unsold",
  "team:budget-updated",
  "player:removed",
  "auction:completed",
  "auction:reset",
];

/** Mirrors the web app's hooks/useAuctionSocket.ts, ported rather than
 * cross-root-imported (it has a real `react` import, which would otherwise
 * resolve to the web app's own React copy — see mobile/README's monorepo
 * note). Shares the same patch logic via the repo-root reduceAuctionEvent
 * function so the two platforms' live-update behavior can't drift apart. */
export function useAuctionSocket(auctionId: string, initialState: AuctionState) {
  const { token } = useAuth();
  const [state, setState] = useState<AuctionState>(initialState);
  const [connected, setConnected] = useState(false);
  const [lastSale, setLastSale] = useState<SaleAnnouncement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const socket = io(process.env.EXPO_PUBLIC_API_URL, { path: "/socket.io", auth: { token } });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join", auctionId);
    });
    socket.on("disconnect", () => setConnected(false));

    for (const type of EVENT_TYPES) {
      socket.on(type, (payload: unknown) => {
        setState((prev) => reduceAuctionEvent(prev, { type, payload } as AuctionSocketEvent));
        if (type === "player:sold") {
          const p = payload as { playerName: string; teamName: string; price: string };
          setLastSale({ playerName: p.playerName, teamName: p.teamName, price: p.price });
        }
      });
    }

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, token]);

  return { state, connected, lastSale };
}
