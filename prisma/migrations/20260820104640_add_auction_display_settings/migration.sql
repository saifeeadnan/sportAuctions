-- CreateEnum
CREATE TYPE "OnClockTemplate" AS ENUM ('CLASSIC', 'PHOTO_FOCUS', 'STATS_TABLE');

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "onClockTemplate" "OnClockTemplate" NOT NULL DEFAULT 'CLASSIC',
ADD COLUMN     "onClockVisibleFields" TEXT[] NOT NULL DEFAULT ARRAY['photoUrl', 'previousTeam']::TEXT[],
ADD COLUMN     "skipPreAuctionDraft" BOOLEAN NOT NULL DEFAULT false;
