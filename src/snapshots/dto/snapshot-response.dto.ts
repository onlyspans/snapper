import { SnapshotStatus } from '@database/generated/client';

export class SnapshotResponseDto {
  id!: string;
  projectId!: string;
  version!: string;
  status!: SnapshotStatus;
  artifactKey!: string;
  checksum!: string;
  sizeBytes!: string;
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
  expiresAt?: Date;
}
