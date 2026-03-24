import { AssemblyStatus } from '@database/generated/client';
import { AssemblyStep } from '@/release-assembly';

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
