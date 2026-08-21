// Declaration order here is the prestige order, highest first — must match
// prisma/schema.prisma's `enum SponsorTier` declaration order exactly.
export const SPONSOR_TIERS = ["TITLE", "MARQUEE", "COMMUNITY"] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

export const DEFAULT_SPONSOR_TIER: SponsorTier = "COMMUNITY";

export const SPONSOR_TIER_LABELS: Record<SponsorTier, string> = {
  TITLE: "Title",
  MARQUEE: "Marquee",
  COMMUNITY: "Community",
};
