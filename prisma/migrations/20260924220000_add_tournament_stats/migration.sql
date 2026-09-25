-- CreateTable
CREATE TABLE "tournament_stats_uploads" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "label" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,

    CONSTRAINT "tournament_stats_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_stats_sheets" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "display" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,

    CONSTRAINT "tournament_stats_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_stats_shares" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "uploadId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_stats_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_stats_uploads_leagueId_uploadedAt_idx" ON "tournament_stats_uploads"("leagueId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stats_sheets_uploadId_position_key" ON "tournament_stats_sheets"("uploadId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stats_shares_leagueId_key" ON "tournament_stats_shares"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stats_shares_token_key" ON "tournament_stats_shares"("token");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_stats_shares_uploadId_key" ON "tournament_stats_shares"("uploadId");

-- AddForeignKey
ALTER TABLE "tournament_stats_uploads" ADD CONSTRAINT "tournament_stats_uploads_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stats_uploads" ADD CONSTRAINT "tournament_stats_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stats_sheets" ADD CONSTRAINT "tournament_stats_sheets_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "tournament_stats_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stats_shares" ADD CONSTRAINT "tournament_stats_shares_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_stats_shares" ADD CONSTRAINT "tournament_stats_shares_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "tournament_stats_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

