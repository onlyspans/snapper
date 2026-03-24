import type { Observable } from 'rxjs';

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
  created_at?: unknown;
  updated_at?: unknown;
}

export interface ReleasesGrpcService {
  GetReleaseStructure(request: GetReleaseStructureRequest, metadata?: unknown): Observable<ProjectReleaseStructure>;

  UpdateReleaseStructure(request: UpdateReleaseStructureRequest, metadata?: unknown): Observable<Release>;
}
