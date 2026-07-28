-- CreateTable
CREATE TABLE "tournament_sponsors" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_sponsors_tournamentId_idx" ON "tournament_sponsors"("tournamentId");

-- AddForeignKey
ALTER TABLE "tournament_sponsors" ADD CONSTRAINT "tournament_sponsors_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
