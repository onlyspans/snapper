-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('BUILDING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "snapshots" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'BUILDING',
    "artifactKey" TEXT NOT NULL,
    "checksum" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_assemblies" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT,
    "projectId" TEXT NOT NULL,
    "status" "AssemblyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "release_assemblies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "snapshots_projectId_idx" ON "snapshots"("projectId");

-- CreateIndex
CREATE INDEX "snapshots_status_idx" ON "snapshots"("status");

-- CreateIndex
CREATE INDEX "snapshots_createdAt_idx" ON "snapshots"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_projectId_version_key" ON "snapshots"("projectId", "version");

-- CreateIndex
CREATE INDEX "release_assemblies_snapshotId_idx" ON "release_assemblies"("snapshotId");

-- CreateIndex
CREATE INDEX "release_assemblies_projectId_idx" ON "release_assemblies"("projectId");

-- CreateIndex
CREATE INDEX "release_assemblies_status_idx" ON "release_assemblies"("status");

-- CreateIndex
CREATE INDEX "release_assemblies_createdAt_idx" ON "release_assemblies"("createdAt");

-- AddForeignKey
ALTER TABLE "release_assemblies" ADD CONSTRAINT "release_assemblies_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
