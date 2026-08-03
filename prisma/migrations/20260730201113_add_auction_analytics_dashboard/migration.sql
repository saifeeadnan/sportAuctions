-- CreateEnum
CREATE TYPE "StrategyPreferenceType" AS ENUM ('MUST_HAVE', 'AVOID');

-- AlterTable
ALTER TABLE "team_auction_entries" ADD COLUMN     "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auction_player_preferences" (
    "id" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "auctionPlayerId" TEXT NOT NULL,
    "type" "StrategyPreferenceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_player_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_category_budget_targets" (
    "id" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "targetAvgPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_category_budget_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_player_predictions" (
    "id" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "auctionPlayerId" TEXT NOT NULL,
    "predictedWinnerEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auction_player_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auction_player_preferences_teamAuctionEntryId_type_idx" ON "auction_player_preferences"("teamAuctionEntryId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "auction_player_preferences_teamAuctionEntryId_auctionPlayer_key" ON "auction_player_preferences"("teamAuctionEntryId", "auctionPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "auction_category_budget_targets_teamAuctionEntryId_category_key" ON "auction_category_budget_targets"("teamAuctionEntryId", "categoryId");

-- CreateIndex
CREATE INDEX "auction_player_predictions_teamAuctionEntryId_idx" ON "auction_player_predictions"("teamAuctionEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "auction_player_predictions_teamAuctionEntryId_auctionPlayer_key" ON "auction_player_predictions"("teamAuctionEntryId", "auctionPlayerId");

-- AddForeignKey
ALTER TABLE "auction_player_preferences" ADD CONSTRAINT "auction_player_preferences_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_player_preferences" ADD CONSTRAINT "auction_player_preferences_auctionPlayerId_fkey" FOREIGN KEY ("auctionPlayerId") REFERENCES "auction_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_category_budget_targets" ADD CONSTRAINT "auction_category_budget_targets_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_category_budget_targets" ADD CONSTRAINT "auction_category_budget_targets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "auction_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_player_predictions" ADD CONSTRAINT "auction_player_predictions_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_player_predictions" ADD CONSTRAINT "auction_player_predictions_auctionPlayerId_fkey" FOREIGN KEY ("auctionPlayerId") REFERENCES "auction_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_player_predictions" ADD CONSTRAINT "auction_player_predictions_predictedWinnerEntryId_fkey" FOREIGN KEY ("predictedWinnerEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
