import { GetResolvedVariablesResult } from '@integrations/variables';
import { GetSnapshotInfoResponse } from '@integrations/artifact-storage';
import { ProjectReleaseStructure } from '@integrations/projects';

export interface CollectedConfig {
  releaseStructure: ProjectReleaseStructure;
  variables: GetResolvedVariablesResult;
  sourceSnapshot: GetSnapshotInfoResponse;
}
