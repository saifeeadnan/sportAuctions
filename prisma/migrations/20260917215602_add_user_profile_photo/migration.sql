-- AlterTable
ALTER TABLE "users" ADD COLUMN     "photoData" BYTEA,
ADD COLUMN     "photoMimeType" TEXT,
ADD COLUMN     "photoUrl" TEXT;

