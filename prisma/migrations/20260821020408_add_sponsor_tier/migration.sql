-- CreateEnum
CREATE TYPE "SponsorTier" AS ENUM ('TITLE', 'MARQUEE', 'COMMUNITY');

-- AlterTable
ALTER TABLE "tournament_sponsors" ADD COLUMN     "tier" "SponsorTier" NOT NULL DEFAULT 'COMMUNITY';

-- Backfill: every sponsor that existed before tiering shipped is treated as
-- MARQUEE (a one-time goodwill bump), not the COMMUNITY default that only
-- applies to sponsors added from this point forward.
UPDATE "tournament_sponsors" SET "tier" = 'MARQUEE';
