-- AlterTable
ALTER TABLE "team_auction_entries" ADD COLUMN     "captainAuctionPlayerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "team_auction_entries_captainAuctionPlayerId_key" ON "team_auction_entries"("captainAuctionPlayerId");

-- AddForeignKey
ALTER TABLE "team_auction_entries" ADD CONSTRAINT "team_auction_entries_captainAuctionPlayerId_fkey" FOREIGN KEY ("captainAuctionPlayerId") REFERENCES "auction_players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

