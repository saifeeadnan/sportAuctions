-- AlterTable
ALTER TABLE "players" ADD COLUMN     "linkedUserId" TEXT;

-- CreateTable
CREATE TABLE "player_photos" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_photos_playerId_key" ON "player_photos"("playerId");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_linkedUserId_fkey" FOREIGN KEY ("linkedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_photos" ADD CONSTRAINT "player_photos_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

