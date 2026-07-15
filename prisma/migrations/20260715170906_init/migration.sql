-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEAM_MANAGER', 'AUCTIONEER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('CREATED', 'PRE_AUCTION_OPEN', 'PRE_AUCTION_LOCKED', 'BIDDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AuctionPlayerStatus" AS ENUM ('AVAILABLE', 'IN_PRE_AUCTION_POOL', 'IN_BIDDING', 'SOLD', 'UNSOLD');

-- CreateEnum
CREATE TYPE "SoldVia" AS ENUM ('PRE_AUCTION_DRAFT', 'LIVE_BID', 'ADMIN_ASSIGNED');

-- CreateEnum
CREATE TYPE "TeamAuctionEntryStatus" AS ENUM ('CREATED', 'PRE_AUCTION_DRAFTING', 'PRE_AUCTION_SUBMITTED', 'ALLOCATED_PRE_AUCTION', 'AUCTION_LIVE', 'FINAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "managerBasePrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_rosters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_rosters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "age" INTEGER,
    "loginId" TEXT,
    "defaultCategory" TEXT,
    "previousTeam" TEXT,
    "photoUrl" TEXT,
    "rating" DECIMAL(6,2),
    "battingRating" DECIMAL(6,2),
    "bowlingRating" DECIMAL(6,2),
    "fieldingRating" DECIMAL(6,2),
    "priorStats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "numTeams" INTEGER NOT NULL,
    "squadSize" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "managerOccupiesSlot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamBudget" DECIMAL(12,2) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'CREATED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_categories" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "auction_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_players" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "AuctionPlayerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "soldVia" "SoldVia",
    "soldToEntryId" TEXT,
    "soldPrice" DECIMAL(12,2),
    "soldAt" TIMESTAMP(3),
    "biddingOrder" INTEGER,

    CONSTRAINT "auction_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_auction_entries" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "status" "TeamAuctionEntryStatus" NOT NULL DEFAULT 'CREATED',
    "budgetRemaining" DECIMAL(12,2) NOT NULL,
    "managerPriceOverride" DECIMAL(10,2),
    "slotsFilled" INTEGER NOT NULL DEFAULT 0,
    "slotsTotal" INTEGER NOT NULL,

    CONSTRAINT "team_auction_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pre_auction_submissions" (
    "id" TEXT NOT NULL,
    "teamAuctionEntryId" TEXT NOT NULL,
    "auctionPlayerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pre_auction_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_loginId_key" ON "users"("loginId");

-- CreateIndex
CREATE INDEX "players_rosterId_idx" ON "players"("rosterId");

-- CreateIndex
CREATE INDEX "tournaments_rosterId_idx" ON "tournaments"("rosterId");

-- CreateIndex
CREATE INDEX "teams_managerId_idx" ON "teams"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_tournamentId_name_key" ON "teams"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "auctions_tournamentId_idx" ON "auctions"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "auction_categories_auctionId_name_key" ON "auction_categories"("auctionId", "name");

-- CreateIndex
CREATE INDEX "auction_players_auctionId_status_idx" ON "auction_players"("auctionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "auction_players_auctionId_playerId_key" ON "auction_players"("auctionId", "playerId");

-- CreateIndex
CREATE INDEX "team_auction_entries_auctionId_idx" ON "team_auction_entries"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "team_auction_entries_teamId_auctionId_key" ON "team_auction_entries"("teamId", "auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "pre_auction_submissions_teamAuctionEntryId_auctionPlayerId_key" ON "pre_auction_submissions"("teamAuctionEntryId", "auctionPlayerId");

-- AddForeignKey
ALTER TABLE "player_rosters" ADD CONSTRAINT "player_rosters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "player_rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "player_rosters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_categories" ADD CONSTRAINT "auction_categories_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_players" ADD CONSTRAINT "auction_players_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_players" ADD CONSTRAINT "auction_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_players" ADD CONSTRAINT "auction_players_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "auction_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_players" ADD CONSTRAINT "auction_players_soldToEntryId_fkey" FOREIGN KEY ("soldToEntryId") REFERENCES "team_auction_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_auction_entries" ADD CONSTRAINT "team_auction_entries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_auction_entries" ADD CONSTRAINT "team_auction_entries_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_auction_submissions" ADD CONSTRAINT "pre_auction_submissions_teamAuctionEntryId_fkey" FOREIGN KEY ("teamAuctionEntryId") REFERENCES "team_auction_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pre_auction_submissions" ADD CONSTRAINT "pre_auction_submissions_auctionPlayerId_fkey" FOREIGN KEY ("auctionPlayerId") REFERENCES "auction_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
