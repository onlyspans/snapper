export const ASSEMBLY_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type AssemblyStatus = (typeof ASSEMBLY_STATUS)[keyof typeof ASSEMBLY_STATUS];
