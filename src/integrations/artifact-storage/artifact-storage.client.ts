import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { retryWithExponentialBackoff } from '@common/utils';
import { ARTIFACT_STORAGE_CLIENT } from '@/integrations';
import {
  ArtifactStorageGrpcService,
  GetSnapshotInfoRequest,
  GetSnapshotInfoResponse,
} from '@/integrations/artifact-storage';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class ArtifactStorageClient implements OnModuleInit {
  private artifactStorageService!: ArtifactStorageGrpcService;

  constructor(@Inject(ARTIFACT_STORAGE_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.artifactStorageService = this.client.getService<ArtifactStorageGrpcService>('ArtifactStorageService');
  }

  async getSnapshotInfo(request: GetSnapshotInfoRequest): Promise<GetSnapshotInfoResponse> {
    return this.executeWithResilience<GetSnapshotInfoResponse>(
      () => this.artifactStorageService.GetSnapshotInfo(request) as Observable<GetSnapshotInfoResponse>,
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
