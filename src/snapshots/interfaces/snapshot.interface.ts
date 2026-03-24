import { SnapshotStatus } from '@database/generated/client';

export interface SnapshotEntity {
  id: string;
  projectId: string;
  version: string;
  status: SnapshotStatus;
  artifactKey: string;
  checksum: string | null;
  sizeBytes: bigint;
  config: unknown;
  metadata: unknown;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}
