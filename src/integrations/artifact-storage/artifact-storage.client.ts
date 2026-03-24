import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { CorrelationContextService } from '@common/logging';
import { lastValueFrom, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { retryWithExponentialBackoff } from '@common/utils';
import { ARTIFACT_STORAGE_CLIENT } from '../integrations.constants';
import { createCorrelationMetadata } from '../correlation-metadata.util';
import {
  ArtifactStorageGrpcService,
  GetSnapshotInfoRequest,
  GetSnapshotInfoResponse,
  UploadSnapshotRequest,
  UploadSnapshotResponse,
} from './artifact-storage.interface';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class ArtifactStorageClient implements OnModuleInit {
  private artifactStorageService!: ArtifactStorageGrpcService;

  constructor(
    @Inject(ARTIFACT_STORAGE_CLIENT) private readonly client: ClientGrpc,
    private readonly correlationContext: CorrelationContextService,
  ) {}

  onModuleInit(): void {
    this.artifactStorageService = this.client.getService<ArtifactStorageGrpcService>('ArtifactStorageService');
  }

  isInitialized(): boolean {
    return Boolean(this.artifactStorageService);
  }

  async getSnapshotInfo(request: GetSnapshotInfoRequest): Promise<GetSnapshotInfoResponse> {
    return this.executeWithResilience<GetSnapshotInfoResponse>(
      () =>
        this.artifactStorageService.GetSnapshotInfo(
          request,
          createCorrelationMetadata(this.correlationContext.getCorrelationId()),
        ) as Observable<GetSnapshotInfoResponse>,
    );
  }

  async uploadSnapshot(request: UploadSnapshotRequest): Promise<UploadSnapshotResponse> {
    return this.executeWithResilience<UploadSnapshotResponse>(
      () =>
        this.artifactStorageService.UploadSnapshot(
          request,
          createCorrelationMetadata(this.correlationContext.getCorrelationId()),
        ) as Observable<UploadSnapshotResponse>,
    );
  }

  private async executeWithResilience<T>(operation: () => Observable<T>): Promise<T> {
    return retryWithExponentialBackoff(async () => lastValueFrom(operation().pipe(timeout(REQUEST_TIMEOUT_MS))), {
      shouldRetry: (error) => {
        const code = (error as { code?: number })?.code;
        return code === 4 || code === 8 || code === 13 || code === 14;
      },
    });
  }
}
