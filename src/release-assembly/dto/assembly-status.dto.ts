import { AssemblyStatus } from '@database/generated/client';
import { AssemblyStep } from '../interfaces';

export class AssemblyStatusDto {
  id!: string;
  snapshotId!: string;
  projectId!: string;
  status!: AssemblyStatus;
  steps!: AssemblyStep[];
  errorMessage!: string;
  createdBy!: string;
  createdAt!: Date;
  updatedAt!: Date;
  completedAt?: Date;
}
