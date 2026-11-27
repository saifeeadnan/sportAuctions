-- AlterTable
ALTER TABLE "team_auction_entries" ADD COLUMN     "activeSavedStrategyId" TEXT;

-- CreateTable
CREATE TABLE "saved_auction_strategies" (
    "id" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mustHaveIds" JSONB NOT NULL,
    "avoidIds" JSONB NOT NULL,
    "budgetTargets" JSONB NOT NULL,
    "rivalEstimates" JSONB NOT NULL,
    "predictions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_auction_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_auction_strategies_teamAuctionEntryId_idx" ON "saved_auction_strategies"("teamAuctionEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_auction_strategies_teamAuctionEntryId_name_key" ON "saved_auction_strategies"("teamAuctionEntryId", "name");

-- AddForeignKey
ALTER TABLE "team_auction_entries" ADD CONSTRAINT "team_auction_entries_activeSavedStrategyId_fkey" FOREIGN KEY ("activeSavedStrategyId") REFERENCES "saved_auction_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_auction_strategies" ADD CONSTRAINT "saved_auction_strategies_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
