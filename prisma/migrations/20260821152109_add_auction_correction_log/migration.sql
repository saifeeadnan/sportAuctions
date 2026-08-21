-- CreateEnum
CREATE TYPE "AuctionCorrectionType" AS ENUM ('SOLD_PRICE', 'CATEGORY_BASE_PRICE', 'TEAM_BUDGET');

-- CreateTable
CREATE TABLE "auction_correction_logs" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "correctionType" "AuctionCorrectionType" NOT NULL,
    "targetId" TEXT,
    "oldValue" DECIMAL(12,2) NOT NULL,
    "newValue" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_correction_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auction_correction_logs_auctionId_idx" ON "auction_correction_logs"("auctionId");

-- CreateIndex
CREATE INDEX "auction_correction_logs_adminUserId_idx" ON "auction_correction_logs"("adminUserId");

-- CreateIndex
CREATE INDEX "auction_correction_logs_createdAt_idx" ON "auction_correction_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "auction_correction_logs" ADD CONSTRAINT "auction_correction_logs_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_correction_logs" ADD CONSTRAINT "auction_correction_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
