-- CreateEnum
CREATE TYPE "AuctionType" AS ENUM ('LIVE', 'SILENT', 'FIXED_PRICE');

-- AlterTable
ALTER TABLE "auctions" ADD COLUMN     "auctionType" "AuctionType" NOT NULL DEFAULT 'LIVE';
