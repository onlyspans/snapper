import type { Observable } from 'rxjs';

export interface GetResolvedVariablesInput {
  project_id: string;
  environment_id: string;
}

export interface Variable {
  key: string;
  value: string;
  environment_id?: string;
  source: string;
}

export type GetResolvedVariablesSuccess = {
  success: {
    variables: Variable[];
  };
};

export type GetResolvedVariablesConflict = {
  conflict_error: {
    key: string;
    conflicting_sources: string[];
  };
};

export type GetResolvedVariablesInternal = {
  internal_error: {
    message: string;
  };
};

/** Matches variables.proto `GetResolvedVariablesResult` oneof `result`. */
export type GetResolvedVariablesResult =
  | GetResolvedVariablesSuccess
  | GetResolvedVariablesConflict
  | GetResolvedVariablesInternal;

export function isResolvedVariablesSuccess(r: GetResolvedVariablesResult): r is GetResolvedVariablesSuccess {
  return 'success' in r && r.success !== undefined;
}

export function isResolvedVariablesConflict(r: GetResolvedVariablesResult): r is GetResolvedVariablesConflict {
  return 'conflict_error' in r && r.conflict_error !== undefined;
}

export function isResolvedVariablesInternalError(r: GetResolvedVariablesResult): r is GetResolvedVariablesInternal {
  return 'internal_error' in r && r.internal_error !== undefined;
}

export interface VariablesGrpcService {
  GetResolvedVariables(request: GetResolvedVariablesInput, metadata?: unknown): Observable<GetResolvedVariablesResult>;
}
