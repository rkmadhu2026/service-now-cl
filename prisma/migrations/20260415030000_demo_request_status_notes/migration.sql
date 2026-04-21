ALTER TABLE "DemoRequest"
ADD COLUMN "contacted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notes" TEXT;

CREATE INDEX "DemoRequest_company_contacted_createdAt_idx"
ON "DemoRequest"("company", "contacted", "createdAt");
