-- CreateEnum
CREATE TYPE "FantasyPricingModel" AS ENUM ('SOLD_PRICE', 'CATEGORY_AVERAGE');

-- DropIndex
DROP INDEX "fantasy_teams_auctionId_userId_key";

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "fantasyMaxTeamsPerUser" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "fantasyPricingModel" "FantasyPricingModel" NOT NULL DEFAULT 'SOLD_PRICE',
ADD COLUMN     "fantasySelfPickRequired" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "fantasy_teams_auctionId_userId_idx" ON "fantasy_teams"("auctionId", "userId");

