-- CreateTable
CREATE TABLE "league_logos" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_logos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "league_logos_leagueId_key" ON "league_logos"("leagueId");

-- AddForeignKey
ALTER TABLE "league_logos" ADD CONSTRAINT "league_logos_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
