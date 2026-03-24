export interface UploadSnapshotHeader {
  key: string;
  version: string;
  content_type: string;
  artifact_ids: string[];
  labels: Record<string, string>;
}

export interface UploadSnapshotRequest {
  header?: UploadSnapshotHeader;
  chunk?: Uint8Array;
}

export interface SnapshotInfo {
  id: string;
  key: string;
  version: string;
  content_type: string;
  size_bytes: string;
  checksum_sha256: string;
  artifact_ids: string[];
  labels: Record<string, string>;
}

export interface UploadSnapshotResponse {
  success?: SnapshotInfo;
  error?: {
    code: string;
    message: string;
    trace?: string;
  };
}

export interface GetSnapshotInfoRequest {
  key: string;
  version: string;
}

export interface GetSnapshotInfoResponse {
  success?: SnapshotInfo;
  error?: {
    code: string;
    message: string;
    trace?: string;
  };
}

export interface ArtifactStorageGrpcService {
  UploadSnapshot(request: UploadSnapshotRequest, metadata?: unknown): unknown;
  GetSnapshotInfo(request: GetSnapshotInfoRequest, metadata?: unknown): unknown;
}
