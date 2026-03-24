import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { retryWithExponentialBackoff } from '@common/utils';
import { PROJECTS_CLIENT } from '../integrations.constants';
import {
  GetReleaseStructureRequest,
  ProjectReleaseStructure,
  ReleasesGrpcService,
  UpdateReleaseStructureRequest,
} from './projects.interface';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class ProjectsClient implements OnModuleInit {
  private releasesService!: ReleasesGrpcService;

  constructor(@Inject(PROJECTS_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.releasesService = this.client.getService<ReleasesGrpcService>('ReleasesService');
  }

  isInitialized(): boolean {
    return Boolean(this.releasesService);
  }

  async getReleaseStructure(request: GetReleaseStructureRequest): Promise<ProjectReleaseStructure> {
    return this.executeWithResilience<ProjectReleaseStructure>(
      () => this.releasesService.GetReleaseStructure(request) as Observable<ProjectReleaseStructure>,
    );
  }

  async updateReleaseStructure(request: UpdateReleaseStructureRequest): Promise<ProjectReleaseStructure> {
    return this.executeWithResilience<ProjectReleaseStructure>(
      () => this.releasesService.UpdateReleaseStructure(request) as Observable<ProjectReleaseStructure>,
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
