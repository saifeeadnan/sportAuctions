-- AlterTable
ALTER TABLE "leagues" ALTER COLUMN "mandatoryRosterFields" SET DEFAULT '["email","phone"]';

-- AlterTable
ALTER TABLE "players" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- Backfill: every league that existed before this migration now requires
-- email and phone too, in addition to whatever it already required. No
-- existing league's mandatoryRosterFields could already contain "email" or
-- "phone" (those keys didn't exist before this migration), so a plain
-- concat can't introduce a duplicate.
UPDATE "leagues" SET "mandatoryRosterFields" = "mandatoryRosterFields" || '["email","phone"]'::jsonb;
