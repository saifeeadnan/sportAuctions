// Shared between the server (validation) and the client (New Auction form)
// — kept free of server-only imports (Prisma, etc.) so it's safe to bundle
// into client components.

export const AUCTION_TYPES = ["LIVE", "SILENT", "FIXED_PRICE"] as const;
export type AuctionType = (typeof AUCTION_TYPES)[number];

// Only LIVE is implemented today; the others are reserved for future auction
// formats and are rejected at creation time until their flows exist.
export const IMPLEMENTED_AUCTION_TYPES: AuctionType[] = ["LIVE"];

export const AUCTION_TYPE_LABELS: Record<AuctionType, string> = {
  LIVE: "Live Auction",
  SILENT: "Silent Auction",
  FIXED_PRICE: "Fixed Price",
};
