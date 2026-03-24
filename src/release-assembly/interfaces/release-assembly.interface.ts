import { AssemblyStatus } from '@database/generated/client';
import { AssemblyStep } from './assembly-step.interface';

export interface ReleaseAssemblyEntity {
  id: string;
  snapshotId: string | null;
  projectId: string;
  status: AssemblyStatus;
  steps: AssemblyStep[];
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}
