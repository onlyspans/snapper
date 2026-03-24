-- Add version column for idempotent assembly key
ALTER TABLE "release_assemblies"
ADD COLUMN "version" TEXT;

-- Backfill NULL version with a per-row unique value so (projectId, version) can be indexed
UPDATE "release_assemblies"
SET "version" = COALESCE("version", 'unknown-' || "id"::text);

-- Enforce NOT NULL and uniqueness for project/version pair
ALTER TABLE "release_assemblies"
ALTER COLUMN "version" SET NOT NULL;

CREATE UNIQUE INDEX "release_assemblies_projectId_version_key"
ON "release_assemblies"("projectId", "version");
