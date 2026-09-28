-- CreateTable
CREATE TABLE "pickleball_events" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileData" BYTEA,
    "uploadedAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "token" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "pickleball_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickleball_event_teams" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "group" TEXT NOT NULL,

    CONSTRAINT "pickleball_event_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickleball_matches" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "round" TEXT NOT NULL,
    "court" TEXT,
    "group" TEXT NOT NULL,
    "team1Id" TEXT NOT NULL,
    "team2Id" TEXT NOT NULL,
    "gamesToPlay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickleball_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickleball_games" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "team1Player1Id" TEXT,
    "team1Player2Id" TEXT,
    "team2Player1Id" TEXT,
    "team2Player2Id" TEXT,
    "team1Score" INTEGER,
    "team2Score" INTEGER,
    "scoredById" TEXT,
    "scoredAt" TIMESTAMP(3),

    CONSTRAINT "pickleball_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pickleball_events_tournamentId_key" ON "pickleball_events"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "pickleball_events_token_key" ON "pickleball_events"("token");

-- CreateIndex
CREATE INDEX "pickleball_events_auctionId_idx" ON "pickleball_events"("auctionId");

-- CreateIndex
CREATE INDEX "pickleball_event_teams_eventId_group_idx" ON "pickleball_event_teams"("eventId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "pickleball_event_teams_eventId_teamId_key" ON "pickleball_event_teams"("eventId", "teamId");

-- CreateIndex
CREATE INDEX "pickleball_matches_eventId_group_idx" ON "pickleball_matches"("eventId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "pickleball_matches_eventId_matchNumber_key" ON "pickleball_matches"("eventId", "matchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "pickleball_games_matchId_gameNumber_key" ON "pickleball_games"("matchId", "gameNumber");

-- AddForeignKey
ALTER TABLE "pickleball_events" ADD CONSTRAINT "pickleball_events_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_events" ADD CONSTRAINT "pickleball_events_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_events" ADD CONSTRAINT "pickleball_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_events" ADD CONSTRAINT "pickleball_events_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_event_teams" ADD CONSTRAINT "pickleball_event_teams_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "pickleball_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_event_teams" ADD CONSTRAINT "pickleball_event_teams_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_matches" ADD CONSTRAINT "pickleball_matches_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "pickleball_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_matches" ADD CONSTRAINT "pickleball_matches_team1Id_fkey" FOREIGN KEY ("team1Id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_matches" ADD CONSTRAINT "pickleball_matches_team2Id_fkey" FOREIGN KEY ("team2Id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_games" ADD CONSTRAINT "pickleball_games_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "pickleball_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_games" ADD CONSTRAINT "pickleball_games_team1Player1Id_fkey" FOREIGN KEY ("team1Player1Id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_games" ADD CONSTRAINT "pickleball_games_team1Player2Id_fkey" FOREIGN KEY ("team1Player2Id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_games" ADD CONSTRAINT "pickleball_games_team2Player1Id_fkey" FOREIGN KEY ("team2Player1Id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_games" ADD CONSTRAINT "pickleball_games_team2Player2Id_fkey" FOREIGN KEY ("team2Player2Id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pickleball_games" ADD CONSTRAINT "pickleball_games_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

