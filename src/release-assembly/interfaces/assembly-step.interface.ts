export type AssemblyStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface AssemblyStep {
  name: string;
  status: AssemblyStepStatus;
  message?: string;
  updatedAt?: string | Date;
}
