import type { Observable } from 'rxjs';

export type GrpcTimestampField = string | { seconds: number; nanos: number };

export interface Environment {
  id: string;
  name: string;
  description: string;
  position: number;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: number;
  owner_id: string;
  environments: Environment[];
  tag_ids: string[];
  metadata: Record<string, string>;
  created_at?: GrpcTimestampField;
  updated_at?: GrpcTimestampField;
}

export interface GetReleaseStructureRequest {
  id: string;
}

export interface ProjectReleaseStructure {
  project_id: string;
  project_name: string;
  version: string;
  snapshot_id?: string;
  config: {
    processes: Array<{
      id: string;
      name: string;
      config: Record<string, string>;
    }>;
    variables: Record<string, string>;
    assets: Array<{
      id: string;
      name: string;
      url: string;
      metadata: Record<string, string>;
    }>;
  };
  metadata: Record<string, string>;
}

export interface UpdateReleaseStructureRequest {
  id: string;
  snapshot_id: string;
  structure: ProjectReleaseStructure;
}

export interface Release {
  id: string;
  project_id: string;
  version: string;
  snapshot_id: string;
  changelog: string;
  notes: string;
  structure: ProjectReleaseStructure;
  metadata: Record<string, string>;
  created_at?: GrpcTimestampField;
  updated_at?: GrpcTimestampField;
}

export interface ReleasesGrpcService {
  GetReleaseStructure(request: GetReleaseStructureRequest, metadata?: unknown): Observable<ProjectReleaseStructure>;

  UpdateReleaseStructure(request: UpdateReleaseStructureRequest, metadata?: unknown): Observable<Release>;
}
