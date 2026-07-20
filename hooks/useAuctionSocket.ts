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
      (payload: { auctionPlayerId: string }) => {
        setState((prev) => ({
          ...prev,
          players: prev.players.map((p) =>
            p.id === payload.auctionPlayerId ? { ...p, status: "IN_BIDDING" } : p
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

    socket.on("player:unsold", (payload: { auctionPlayerId: string }) => {
      setState((prev) => ({
        ...prev,
        players: prev.players.map((p) =>
          p.id === payload.auctionPlayerId ? { ...p, status: "UNSOLD" } : p
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
