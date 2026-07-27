-- CreateTable
CREATE TABLE "team_sponsor_images" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_sponsor_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_sponsor_images_teamId_key" ON "team_sponsor_images"("teamId");

-- AddForeignKey
ALTER TABLE "team_sponsor_images" ADD CONSTRAINT "team_sponsor_images_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
