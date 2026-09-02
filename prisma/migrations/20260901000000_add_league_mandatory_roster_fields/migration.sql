-- AlterTable
ALTER TABLE "leagues" ADD COLUMN     "mandatoryRosterFields" JSONB NOT NULL DEFAULT '[]';

