ALTER TABLE "Campaign"
ADD COLUMN "archivedAt" TIMESTAMPTZ;

CREATE INDEX "Campaign_userId_archivedAt_createdAt_idx"
ON "Campaign"("userId", "archivedAt", "createdAt");
