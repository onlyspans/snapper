export const SNAPSHOT_STATUS = {
  BUILDING: 'BUILDING',
  READY: 'READY',
  FAILED: 'FAILED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type SnapshotStatus = (typeof SNAPSHOT_STATUS)[keyof typeof SNAPSHOT_STATUS];
