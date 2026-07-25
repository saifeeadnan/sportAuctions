-- CreateTable
CREATE TABLE "fantasy_teams" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fantasy_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fantasy_team_players" (
    "id" TEXT NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "auctionPlayerId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "fantasy_team_players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_teams_auctionId_userId_key" ON "fantasy_teams"("auctionId", "userId");

-- CreateIndex
CREATE INDEX "fantasy_team_players_fantasyTeamId_idx" ON "fantasy_team_players"("fantasyTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "fantasy_team_players_fantasyTeamId_auctionPlayerId_key" ON "fantasy_team_players"("fantasyTeamId", "auctionPlayerId");

-- AddForeignKey
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_team_players" ADD CONSTRAINT "fantasy_team_players_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "fantasy_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fantasy_team_players" ADD CONSTRAINT "fantasy_team_players_auctionPlayerId_fkey" FOREIGN KEY ("auctionPlayerId") REFERENCES "auction_players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
