// Deliberately NOT imported from lib/services/auctionState.service.ts — that
// file has a real (non-type) import of lib/prisma.ts, which would otherwise
// drag the whole Prisma-generated-client type surface into any consumer's
// type-check (harmless for the web app's own tsc, but the mobile app's tsc
// resolves "@/..." against its own src/ root, not the repo root, so that
// chain fails to resolve there). This local shape is structurally identical
// to the real AuctionState/AuctionStatePlayer/AuctionStateTeam types — keep
// it in sync if those ever change. lib/onClockDisplay.ts is safe to import
// directly (its own header documents it as free of server-only imports).
import type { OnClockTemplate, OnClockFieldKey } from "@/lib/onClockDisplay";

export type AuctionState = {
  id: string;
  name: string;
  status: string;
  tournamentName: string;
  onClockTemplate: OnClockTemplate;
  onClockVisibleFields: OnClockFieldKey[];
  lotTimerSeconds: number | null;
  players: AuctionStatePlayer[];
  teams: AuctionStateTeam[];
};

export type AuctionStatePlayer = {
  id: string;
  name: string;
  position: string | null;
  age: number | null;
  photoUrl: string | null;
  previousTeam: string | null;
  categoryName: string;
  basePrice: string;
  bidIncrement: string | null;
  status: string;
  soldPrice: string | null;
  soldToEntryId: string | null;
  soldToTeamName: string | null;
  isCaptain: boolean;
  soldVia: string | null;
  soldAt: string | null;
  currentBid: string | null;
  currentBidderEntryId: string | null;
  currentBidderTeamName: string | null;
  bidCount: number;
  bidCooldownUntil: string | null;
  lotTimerDeadline: string | null;
  rating: string | null;
  battingRating: string | null;
  bowlingRating: string | null;
  fieldingRating: string | null;
};

export type AuctionStateTeam = {
  id: string;
  teamId: string;
  teamName: string;
  status: string;
  budgetRemaining: string;
  slotsFilled: number;
  slotsTotal: number;
  hasSponsorImage: boolean;
};

export type AuctionSocketEvent =
  | { type: "player:on-clock"; payload: { auctionPlayerId: string; basePrice: string; lotTimerDeadline: string | null } }
  | {
      type: "bid:placed";
      payload: {
        auctionPlayerId: string;
        teamAuctionEntryId: string;
        teamName: string;
        amount: string;
        cooldownUntil: string;
        lotTimerDeadline: string | null;
      };
    }
  | {
      type: "player:sold";
      payload: {
        auctionPlayerId: string;
        playerName: string;
        teamAuctionEntryId: string;
        teamName: string;
        price: string;
        soldAt: string;
      };
    }
  | { type: "player:unsold"; payload: { auctionPlayerId: string; basePrice: string } }
  | {
      type: "team:budget-updated";
      payload: { teamAuctionEntryId: string; budgetRemaining: string; slotsFilled: number; slotsTotal: number };
    }
  | { type: "player:removed"; payload: { auctionPlayerId: string } }
  | { type: "auction:completed"; payload: Record<string, never> }
  | { type: "auction:reset"; payload: AuctionState };

/** Pure, framework-agnostic patch step for one live-auction socket event —
 * single source of truth for how each event mutates AuctionState, shared by
 * the web (`hooks/useAuctionSocket.ts`) and the mobile app's socket hook so
 * the two platforms' live-update behavior can't silently drift apart.
 * Deliberately has zero real (non-type) imports — no react, no
 * socket.io-client — so it's safe to cross-root-import into the mobile app. */
export function reduceAuctionEvent(state: AuctionState, event: AuctionSocketEvent): AuctionState {
  switch (event.type) {
    case "player:on-clock": {
      const { auctionPlayerId, basePrice, lotTimerDeadline } = event.payload;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === auctionPlayerId
            ? {
                ...p,
                status: "IN_BIDDING",
                currentBid: null,
                currentBidderEntryId: null,
                currentBidderTeamName: null,
                bidCooldownUntil: null,
                basePrice,
                lotTimerDeadline,
              }
            : p
        ),
      };
    }
    case "bid:placed": {
      const { auctionPlayerId, teamAuctionEntryId, teamName, amount, cooldownUntil, lotTimerDeadline } = event.payload;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === auctionPlayerId
            ? {
                ...p,
                currentBid: amount,
                currentBidderEntryId: teamAuctionEntryId,
                currentBidderTeamName: teamName,
                bidCooldownUntil: cooldownUntil,
                lotTimerDeadline,
              }
            : p
        ),
      };
    }
    case "player:sold": {
      const { auctionPlayerId, teamAuctionEntryId, teamName, price, soldAt } = event.payload;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === auctionPlayerId
            ? {
                ...p,
                status: "SOLD",
                soldPrice: price,
                soldToEntryId: teamAuctionEntryId,
                soldToTeamName: teamName,
                soldAt,
                currentBid: null,
                currentBidderEntryId: null,
                currentBidderTeamName: null,
                bidCooldownUntil: null,
                lotTimerDeadline: null,
              }
            : p
        ),
      };
    }
    case "player:unsold": {
      const { auctionPlayerId, basePrice } = event.payload;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === auctionPlayerId ? { ...p, status: "UNSOLD", basePrice, lotTimerDeadline: null } : p
        ),
      };
    }
    case "team:budget-updated": {
      const { teamAuctionEntryId, budgetRemaining, slotsFilled, slotsTotal } = event.payload;
      return {
        ...state,
        teams: state.teams.map((t) =>
          t.id === teamAuctionEntryId ? { ...t, budgetRemaining, slotsFilled, slotsTotal } : t
        ),
      };
    }
    case "player:removed": {
      const { auctionPlayerId } = event.payload;
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === auctionPlayerId
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
      };
    }
    case "auction:completed":
      return { ...state, status: "COMPLETED" };
    case "auction:reset":
      return event.payload;
  }
}
