-- AlterTable
ALTER TABLE "players" ADD COLUMN     "seed" INTEGER;

-- CreateTable
CREATE TABLE "player_seeding_windows" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "maxSeed" INTEGER NOT NULL DEFAULT 10,
    "createdById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_seeding_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_seed_submissions" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_seed_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_seeding_windows_rosterId_key" ON "player_seeding_windows"("rosterId");

-- CreateIndex
CREATE INDEX "player_seed_submissions_windowId_playerId_idx" ON "player_seed_submissions"("windowId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "player_seed_submissions_windowId_raterUserId_playerId_key" ON "player_seed_submissions"("windowId", "raterUserId", "playerId");

-- AddForeignKey
ALTER TABLE "player_seeding_windows" ADD CONSTRAINT "player_seeding_windows_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "player_rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_seeding_windows" ADD CONSTRAINT "player_seeding_windows_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_seeding_windows" ADD CONSTRAINT "player_seeding_windows_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_seed_submissions" ADD CONSTRAINT "player_seed_submissions_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "player_seeding_windows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_seed_submissions" ADD CONSTRAINT "player_seed_submissions_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_seed_submissions" ADD CONSTRAINT "player_seed_submissions_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

