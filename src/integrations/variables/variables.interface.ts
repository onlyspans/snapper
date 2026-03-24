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

export interface GetResolvedVariablesResult {
  success?: {
    variables: Variable[];
  };
  conflict_error?: {
    key: string;
    conflicting_sources: string[];
  };
  internal_error?: {
    message: string;
  };
}

export interface VariablesGrpcService {
  GetResolvedVariables(request: GetResolvedVariablesInput): unknown;
}
