export function formatSoldVia(soldVia: string | null): string {
  if (soldVia === "PRE_AUCTION_DRAFT") return "Pre-auction draft";
  if (soldVia === "ADMIN_ASSIGNED") return "Admin assigned";
  if (soldVia === "LIVE_BID") return "Live bid";
  return "—";
}
