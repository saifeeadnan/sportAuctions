-- AlterTable
ALTER TABLE "auction_players" ADD COLUMN     "discountedBasePrice" DECIMAL(12,2),
ADD COLUMN     "lotTimerDeadline" TIMESTAMP(3),
ADD COLUMN     "reAuctionDiscountUsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "lotTimerSeconds" INTEGER,
ADD COLUMN     "reAuctionDiscountPercent" INTEGER,
ADD COLUMN     "reAuctionEnabled" BOOLEAN NOT NULL DEFAULT false;
