-- CreateTable
CREATE TABLE "rival_category_budget_estimates" (
    "id" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "targetEntryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "estimatedBudget" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rival_category_budget_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rival_category_budget_estimates_teamAuctionEntryId_targetEn_key" ON "rival_category_budget_estimates"("teamAuctionEntryId", "targetEntryId", "categoryId");

-- AddForeignKey
ALTER TABLE "rival_category_budget_estimates" ADD CONSTRAINT "rival_category_budget_estimates_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rival_category_budget_estimates" ADD CONSTRAINT "rival_category_budget_estimates_targetEntryId_fkey" FOREIGN KEY ("targetEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rival_category_budget_estimates" ADD CONSTRAINT "rival_category_budget_estimates_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "auction_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
