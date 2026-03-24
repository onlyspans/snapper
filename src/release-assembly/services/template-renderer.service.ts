import { Injectable } from '@nestjs/common';
import { CollectedConfig } from '../interfaces';

@Injectable()
export class TemplateRendererService {
  normalize(collected: CollectedConfig): Record<string, unknown> {
    return {
      projectId: collected.releaseStructure.project_id,
      projectName: collected.releaseStructure.project_name,
      version: collected.releaseStructure.version,
      snapshotId: collected.releaseStructure.snapshot_id ?? null,
      config: collected.releaseStructure.config,
      metadata: collected.releaseStructure.metadata,
      sourceSnapshot: collected.sourceSnapshot.success
        ? {
            id: collected.sourceSnapshot.success.id,
            key: collected.sourceSnapshot.success.key,
            version: collected.sourceSnapshot.success.version,
            checksum: collected.sourceSnapshot.success.checksum_sha256,
          }
        : null,
      // Variables keys stay as placeholders by design; no secret resolution here.
      variableKeys:
        collected.variables.success?.variables.map((variable) => ({
          key: variable.key,
          source: variable.source,
        })) ?? [],
    };
  }
}
