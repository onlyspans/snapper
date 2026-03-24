export interface SnapshotConfig {
  payload: Record<string, unknown>;
  artifactIds?: string[];
  labels?: Record<string, string>;
  contentType?: string;
}
