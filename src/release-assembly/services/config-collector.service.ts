import { Injectable } from '@nestjs/common';
import { ArtifactStorageClient } from '@integrations/artifact-storage';
import { ProjectsClient } from '@integrations/projects';
import { VariablesClient } from '@integrations/variables';
import { ProjectsCacheService } from '@release-assembly/services/projects-cache.service';
import { CollectedConfig } from '../interfaces';

@Injectable()
export class ConfigCollectorService {
  constructor(
    private readonly projectsClient: ProjectsClient,
    private readonly variablesClient: VariablesClient,
    private readonly artifactStorageClient: ArtifactStorageClient,
    private readonly projectsCacheService: ProjectsCacheService,
  ) {}

  async collect(params: {
    projectId: string;
    artifactKey: string;
    version: string;
    environmentId?: string;
  }): Promise<CollectedConfig> {
    const environmentId = params.environmentId ?? 'default';

    const [releaseStructure, variables, sourceSnapshot] = await Promise.all([
      this.projectsCacheService.getReleaseStructure(params.projectId, () =>
        this.projectsClient.getReleaseStructure({ id: params.projectId }),
      ),
      this.variablesClient.getResolvedVariables({
        project_id: params.projectId,
        environment_id: environmentId,
      }),
      this.artifactStorageClient.getSnapshotInfo({
        key: params.artifactKey,
        version: params.version,
      }),
    ]);

    return {
      releaseStructure,
      variables,
      sourceSnapshot,
    };
  }
}
