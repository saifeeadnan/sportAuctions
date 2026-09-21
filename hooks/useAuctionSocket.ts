"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { AuctionState } from "@/lib/services/auctionState.service";
import { reduceAuctionEvent, type AuctionSocketEvent } from "@/lib/auctionState/reduceAuctionEvent";

export type SaleAnnouncement = {
  id: string;
  playerName: string;
  teamName: string;
  price: string;
};

/** A bid that lost the optimistic-concurrency race in placeBid — two bids
 * evaluated against the same stale currentBid snapshot, one of which lost
 * purely to commit order. Auctioneer-only, so it's delivered via a direct
 * callback instead of the shared/mobile-mirrored reduceAuctionEvent. */
export type ContestedBid = {
  auctionPlayerId: string;
  teamAuctionEntryId: string;
  teamName: string;
  amount: string;
  attemptedAt: string;
};

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

export function useAuctionSocket(
  auctionId: string,
  initialState: AuctionState,
  options: { public?: boolean; onContestedBid?: (payload: ContestedBid) => void } = {}
) {
  const isPublic = options.public ?? false;
  const [state, setState] = useState<AuctionState>(initialState);
  const [connected, setConnected] = useState(false);
  const [lastSale, setLastSale] = useState<SaleAnnouncement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // Kept in a ref, not the connecting effect's dependency array — a fresh
  // inline callback every render (the common case for a caller's handler)
  // must not tear down and reopen the socket connection.
  const onContestedBidRef = useRef(options.onContestedBid);
  onContestedBidRef.current = options.onContestedBid;

  // useState's initializer only runs on mount — without this, a fresh
  // server refetch (e.g. router.refresh() after editing a player's roster
  // details elsewhere) would never reach this already-mounted component,
  // since the socket below only ever patches specific bid/sale fields, never
  // player bio data. Only fires when the parent actually passes a new
  // initialState object (a real refetch), not on every socket-driven
  // re-render, since those never touch this prop.
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  useEffect(() => {
    const socket = io({ path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit(isPublic ? "join:public" : "join", auctionId);
    });
    socket.on("disconnect", () => setConnected(false));

    for (const type of EVENT_TYPES) {
      socket.on(type, (payload: unknown) => {
        setState((prev) => reduceAuctionEvent(prev, { type, payload } as AuctionSocketEvent));
        if (type === "player:sold") {
          const p = payload as { auctionPlayerId: string; playerName: string; teamName: string; price: string; soldAt: string };
          setLastSale({ id: `${p.auctionPlayerId}-${p.soldAt}`, playerName: p.playerName, teamName: p.teamName, price: p.price });
        }
      });
    }

    // Auctioneer-only notice — deliberately not added to EVENT_TYPES/
    // reduceAuctionEvent, which is mirrored verbatim with the mobile app.
    socket.on("bid:contested", (payload: unknown) => {
      onContestedBidRef.current?.(payload as ContestedBid);
    });

    return () => {
      socket.disconnect();
    };
  }, [auctionId]);

  return { state, connected, lastSale };
}
