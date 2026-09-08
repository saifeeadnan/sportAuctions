-- CreateTable
CREATE TABLE "fantasy_points_uploads" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "label" TEXT,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL,

    CONSTRAINT "fantasy_points_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_points_upload_entries" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "auctionPlayerId" TEXT NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "fantasy_points_upload_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fantasy_points_uploads_auctionId_uploadedAt_idx" ON "fantasy_points_uploads"("auctionId", "uploadedAt");

-- CreateIndex
CREATE INDEX "fantasy_points_upload_entries_auctionPlayerId_idx" ON "fantasy_points_upload_entries"("auctionPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_points_upload_entries_uploadId_auctionPlayerId_key" ON "fantasy_points_upload_entries"("uploadId", "auctionPlayerId");

-- AddForeignKey
ALTER TABLE "fantasy_points_uploads" ADD CONSTRAINT "fantasy_points_uploads_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points_uploads" ADD CONSTRAINT "fantasy_points_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points_upload_entries" ADD CONSTRAINT "fantasy_points_upload_entries_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "fantasy_points_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_points_upload_entries" ADD CONSTRAINT "fantasy_points_upload_entries_auctionPlayerId_fkey" FOREIGN KEY ("auctionPlayerId") REFERENCES "auction_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Baseline snapshot for every auction that already has points, so the new
-- upload history starts from today's state instead of from nothing: deleting
-- the first post-deploy upload must revert to these points, not wipe them.
WITH baseline AS (
  INSERT INTO "fantasy_points_uploads" ("id", "auctionId", "label", "rowCount")
  SELECT gen_random_uuid()::text, "auctionId", 'Existing points (before upload history)', COUNT(*)
  FROM "auction_players"
  WHERE "points" IS NOT NULL
  GROUP BY "auctionId"
  RETURNING "id", "auctionId"
)
INSERT INTO "fantasy_points_upload_entries" ("id", "uploadId", "auctionPlayerId", "points")
SELECT gen_random_uuid()::text, b."id", ap."id", ap."points"
FROM baseline b
JOIN "auction_players" ap ON ap."auctionId" = b."auctionId" AND ap."points" IS NOT NULL;
