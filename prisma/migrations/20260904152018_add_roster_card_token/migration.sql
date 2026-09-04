-- AlterTable
ALTER TABLE "team_auction_entries" ADD COLUMN     "rosterCardToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "team_auction_entries_rosterCardToken_key" ON "team_auction_entries"("rosterCardToken");

