import { AssemblyStatus } from '@database/generated/client';

export class AssemblyStatusDto {
  id!: string;
  snapshotId!: string;
  projectId!: string;
  status!: AssemblyStatus;
  steps!: Array<{ name: string; status: string }>;
  errorMessage!: string;
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
  completedAt?: Date;
}
