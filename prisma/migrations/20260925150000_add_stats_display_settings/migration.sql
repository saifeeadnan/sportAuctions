-- AlterTable
ALTER TABLE "tournament_stats_sheets" ADD COLUMN     "hiddenColumns" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "label" TEXT;

-- AlterTable
ALTER TABLE "tournament_stats_uploads" ADD COLUMN     "landingTab" TEXT;

