-- AlterTable
ALTER TABLE "auction_players" ADD COLUMN     "bidCooldownUntil" TIMESTAMP(3),
ADD COLUMN     "currentBidAmount" DECIMAL(12,2),
ADD COLUMN     "currentBidderEntryId" TEXT;

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "auctionPlayerId" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bids_auctionPlayerId_createdAt_idx" ON "bids"("auctionPlayerId", "createdAt");

-- AddForeignKey
ALTER TABLE "auction_players" ADD CONSTRAINT "auction_players_currentBidderEntryId_fkey" FOREIGN KEY ("currentBidderEntryId") REFERENCES "team_auction_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_auctionPlayerId_fkey" FOREIGN KEY ("auctionPlayerId") REFERENCES "auction_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
