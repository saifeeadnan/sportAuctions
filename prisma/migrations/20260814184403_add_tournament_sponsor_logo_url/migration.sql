-- AlterTable
ALTER TABLE "tournament_sponsors" ADD COLUMN     "logoUrl" TEXT,
ALTER COLUMN "mimeType" DROP NOT NULL,
ALTER COLUMN "data" DROP NOT NULL;
