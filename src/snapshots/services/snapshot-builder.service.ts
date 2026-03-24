import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createChecksum } from '@common/utils';
import { ArtifactStorageClient } from '@integrations/artifact-storage';
import { SnapshotConfig } from '../interfaces';

interface BuildSnapshotInput {
  artifactKey: string;
  version: string;
  payload: Record<string, unknown>;
  artifactIds?: string[];
  labels?: Record<string, string>;
  contentType?: string;
}

interface BuildSnapshotResult {
  checksum: string;
  sizeBytes: bigint;
}

@Injectable()
export class SnapshotBuilderService {
  constructor(private readonly artifactStorageClient: ArtifactStorageClient) {}

  async buildImmutableSnapshot(input: BuildSnapshotInput): Promise<BuildSnapshotResult> {
    const snapshotConfig: SnapshotConfig = {
      payload: input.payload,
      artifactIds: input.artifactIds,
      labels: input.labels,
      contentType: input.contentType,
    };

    const serialized = JSON.stringify(snapshotConfig.payload);
    const checksum = createChecksum(serialized);
    const chunk = Buffer.from(serialized, 'utf8');

    const uploadResult = await this.artifactStorageClient.uploadSnapshot({
      header: {
        key: input.artifactKey,
        version: input.version,
        content_type: snapshotConfig.contentType ?? 'application/json',
        artifact_ids: snapshotConfig.artifactIds ?? [],
        labels: snapshotConfig.labels ?? {},
      },
      chunk,
    });

    if (uploadResult.error) {
      throw new InternalServerErrorException(`Failed to upload snapshot: ${uploadResult.error.message}`);
    }

    const infoResult = await this.artifactStorageClient.getSnapshotInfo({
      key: input.artifactKey,
      version: input.version,
    });

    if (infoResult.error) {
      throw new InternalServerErrorException(`Failed to fetch snapshot info: ${infoResult.error.message}`);
    }

    const sizeBytes = BigInt(infoResult.success?.size_bytes ?? chunk.length);

    return {
      checksum,
      sizeBytes,
    };
  }
}
