-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "highlightsToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "auctions_highlightsToken_key" ON "auctions"("highlightsToken");

