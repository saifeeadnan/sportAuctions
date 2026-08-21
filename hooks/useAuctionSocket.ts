"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { AuctionState } from "@/lib/services/auctionState.service";

export type SaleAnnouncement = {
  id: string;
  playerName: string;
  teamName: string;
  price: string;
};

export function useAuctionSocket(auctionId: string, initialState: AuctionState) {
  const [state, setState] = useState<AuctionState>(initialState);
  const [connected, setConnected] = useState(false);
  const [lastSale, setLastSale] = useState<SaleAnnouncement | null>(null);
  const socketRef = useRef<Socket | null>(null);

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
      socket.emit("join", auctionId);
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on(
      "player:on-clock",
      (payload: { auctionPlayerId: string; basePrice: string; lotTimerDeadline: string | null }) => {
        setState((prev) => ({
          ...prev,
          players: prev.players.map((p) =>
            p.id === payload.auctionPlayerId
              ? {
                  ...p,
                  status: "IN_BIDDING",
                  // Fresh start — any bid state is from a previous round this
                  // same player might have been on the clock for.
                  currentBid: null,
                  currentBidderEntryId: null,
                  currentBidderTeamName: null,
                  bidCooldownUntil: null,
                  basePrice: payload.basePrice,
                  lotTimerDeadline: payload.lotTimerDeadline,
                }
              : p
          ),
        }));
      }
    );

    socket.on(
      "bid:placed",
      (payload: {
        auctionPlayerId: string;
        teamAuctionEntryId: string;
        teamName: string;
        amount: string;
        cooldownUntil: string;
        lotTimerDeadline: string | null;
      }) => {
        setState((prev) => ({
          ...prev,
          players: prev.players.map((p) =>
            p.id === payload.auctionPlayerId
              ? {
                  ...p,
                  currentBid: payload.amount,
                  currentBidderEntryId: payload.teamAuctionEntryId,
                  currentBidderTeamName: payload.teamName,
                  bidCooldownUntil: payload.cooldownUntil,
                  lotTimerDeadline: payload.lotTimerDeadline,
                }
              : p
          ),
        }));
      }
    );

    socket.on(
      "player:sold",
      (payload: {
        auctionPlayerId: string;
        playerName: string;
        teamAuctionEntryId: string;
        teamName: string;
        price: string;
        soldAt: string;
      }) => {
        setState((prev) => ({
          ...prev,
          players: prev.players.map((p) =>
            p.id === payload.auctionPlayerId
              ? {
                  ...p,
                  status: "SOLD",
                  soldPrice: payload.price,
                  soldToEntryId: payload.teamAuctionEntryId,
                  soldToTeamName: payload.teamName,
                  soldAt: payload.soldAt,
                  currentBid: null,
                  currentBidderEntryId: null,
                  currentBidderTeamName: null,
                  bidCooldownUntil: null,
                  lotTimerDeadline: null,
                }
              : p
          ),
        }));
        setLastSale({
          id: `${payload.auctionPlayerId}-${payload.soldAt}`,
          playerName: payload.playerName,
          teamName: payload.teamName,
          price: payload.price,
        });
      }
    );

    socket.on("player:unsold", (payload: { auctionPlayerId: string; basePrice: string }) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === payload.auctionPlayerId
            ? { ...p, status: "UNSOLD", basePrice: payload.basePrice, lotTimerDeadline: null }
            : p
        ),
      }));
    });

    socket.on(
      "team:budget-updated",
      (payload: {
        teamAuctionEntryId: string;
        budgetRemaining: string;
        slotsFilled: number;
        slotsTotal: number;
      }) => {
        setState((prev) => ({
          ...prev,
          teams: prev.teams.map((t) =>
            t.id === payload.teamAuctionEntryId
              ? {
                  ...t,
                  budgetRemaining: payload.budgetRemaining,
                  slotsFilled: payload.slotsFilled,
                  slotsTotal: payload.slotsTotal,
                }
              : t
          ),
        }));
      }
    );

    socket.on("player:removed", (payload: { auctionPlayerId: string }) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === payload.auctionPlayerId
            ? {
                ...p,
                status: "AVAILABLE",
                soldVia: null,
                soldToEntryId: null,
                soldToTeamName: null,
                soldPrice: null,
                soldAt: null,
              }
            : p
        ),
      }));
    });

    socket.on("auction:completed", () => {
      setState((prev) => ({ ...prev, status: "COMPLETED" }));
    });

    socket.on("auction:reset", (payload: AuctionState) => {
      setState(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [auctionId]);

  return { state, connected, lastSale };
}
