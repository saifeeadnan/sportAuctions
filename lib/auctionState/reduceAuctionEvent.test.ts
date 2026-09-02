import { describe, it, expect } from "vitest";
import { reduceAuctionEvent } from "./reduceAuctionEvent";
import type { AuctionState } from "@/lib/services/auctionState.service";

function baseState(): AuctionState {
  return {
    id: "auction-1",
    name: "Test Auction",
    status: "BIDDING",
    tournamentName: "Test Tournament",
    onClockTemplate: "CLASSIC",
    onClockVisibleFields: [],
    lotTimerSeconds: null,
    players: [
      {
        id: "player-1",
        name: "Player One",
        position: null,
        age: null,
        photoUrl: null,
        previousTeam: null,
        categoryName: "Gold",
        basePrice: "100",
        bidIncrement: "10",
        status: "AVAILABLE",
        soldPrice: null,
        soldToEntryId: null,
        soldToTeamName: null,
        isCaptain: false,
        soldVia: null,
        soldAt: null,
        currentBid: null,
        currentBidderEntryId: null,
        currentBidderTeamName: null,
        bidCount: 0,
        bidCooldownUntil: null,
        lotTimerDeadline: null,
        rating: null,
        battingRating: null,
        bowlingRating: null,
        fieldingRating: null,
      },
    ],
    teams: [
      {
        id: "entry-1",
        teamId: "team-1",
        teamName: "Team One",
        status: "AUCTION_LIVE",
        budgetRemaining: "1000",
        slotsFilled: 0,
        slotsTotal: 5,
        hasSponsorImage: false,
      },
    ],
  };
}

describe("reduceAuctionEvent", () => {
  it("player:on-clock puts the player on the clock and clears prior bid state", () => {
    const state = reduceAuctionEvent(baseState(), {
      type: "player:on-clock",
      payload: { auctionPlayerId: "player-1", basePrice: "150", lotTimerDeadline: "2026-01-01T00:00:10.000Z" },
    });
    expect(state.players[0]).toMatchObject({
      status: "IN_BIDDING",
      basePrice: "150",
      lotTimerDeadline: "2026-01-01T00:00:10.000Z",
      currentBid: null,
      currentBidderEntryId: null,
    });
  });

  it("bid:placed patches the current bid fields on the matching player", () => {
    const state = reduceAuctionEvent(baseState(), {
      type: "bid:placed",
      payload: {
        auctionPlayerId: "player-1",
        teamAuctionEntryId: "entry-1",
        teamName: "Team One",
        amount: "150",
        cooldownUntil: "2026-01-01T00:00:02.000Z",
        lotTimerDeadline: null,
      },
    });
    expect(state.players[0]).toMatchObject({
      currentBid: "150",
      currentBidderEntryId: "entry-1",
      currentBidderTeamName: "Team One",
      bidCooldownUntil: "2026-01-01T00:00:02.000Z",
    });
  });

  it("player:sold marks the player SOLD and clears bid state", () => {
    const state = reduceAuctionEvent(baseState(), {
      type: "player:sold",
      payload: {
        auctionPlayerId: "player-1",
        playerName: "Player One",
        teamAuctionEntryId: "entry-1",
        teamName: "Team One",
        price: "200",
        soldAt: "2026-01-01T00:00:05.000Z",
      },
    });
    expect(state.players[0]).toMatchObject({
      status: "SOLD",
      soldPrice: "200",
      soldToEntryId: "entry-1",
      soldToTeamName: "Team One",
      soldAt: "2026-01-01T00:00:05.000Z",
      currentBid: null,
    });
  });

  it("player:unsold marks the player UNSOLD and clears the lot timer", () => {
    const state = reduceAuctionEvent(baseState(), {
      type: "player:unsold",
      payload: { auctionPlayerId: "player-1", basePrice: "100" },
    });
    expect(state.players[0]).toMatchObject({ status: "UNSOLD", basePrice: "100", lotTimerDeadline: null });
  });

  it("team:budget-updated patches the matching team entry", () => {
    const state = reduceAuctionEvent(baseState(), {
      type: "team:budget-updated",
      payload: { teamAuctionEntryId: "entry-1", budgetRemaining: "800", slotsFilled: 1, slotsTotal: 5 },
    });
    expect(state.teams[0]).toMatchObject({ budgetRemaining: "800", slotsFilled: 1, slotsTotal: 5 });
  });

  it("player:removed resets the player back to AVAILABLE", () => {
    const sold = reduceAuctionEvent(baseState(), {
      type: "player:sold",
      payload: {
        auctionPlayerId: "player-1",
        playerName: "Player One",
        teamAuctionEntryId: "entry-1",
        teamName: "Team One",
        price: "200",
        soldAt: "2026-01-01T00:00:05.000Z",
      },
    });
    const state = reduceAuctionEvent(sold, { type: "player:removed", payload: { auctionPlayerId: "player-1" } });
    expect(state.players[0]).toMatchObject({
      status: "AVAILABLE",
      soldVia: null,
      soldToEntryId: null,
      soldToTeamName: null,
      soldPrice: null,
      soldAt: null,
    });
  });

  it("auction:completed sets the auction status to COMPLETED", () => {
    const state = reduceAuctionEvent(baseState(), { type: "auction:completed", payload: {} });
    expect(state.status).toBe("COMPLETED");
  });

  it("auction:reset wholesale-replaces the state", () => {
    const replacement = { ...baseState(), name: "Replacement Auction" };
    const state = reduceAuctionEvent(baseState(), { type: "auction:reset", payload: replacement });
    expect(state).toBe(replacement);
  });
});
