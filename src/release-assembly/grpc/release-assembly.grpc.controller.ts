import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ArtifactNotificationDto, ValidateConfigDto } from '../dto';
import { ReleaseAssemblyService } from '../services';

@Controller()
export class ReleaseAssemblyGrpcController {
  constructor(private readonly releaseAssemblyService: ReleaseAssemblyService) {}

  @GrpcMethod('SnapperService', 'NotifyArtifactsReady')
  async notifyArtifactsReady(data: ArtifactNotificationDto) {
    const result = await this.releaseAssemblyService.notifyArtifactsReady(data);
    return {
      assemblyId: result.id,
      snapshotId: result.snapshotId,
      projectId: result.projectId,
      status: result.status,
      errorMessage: result.errorMessage,
      steps: result.steps,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      completedAt: result.completedAt,
    };
  }

  @GrpcMethod('SnapperService', 'GetAssemblyStatus')
  async getAssemblyStatus(data: { id: string }) {
    return this.releaseAssemblyService.getAssemblyStatus(data.id);
  }

  @GrpcMethod('SnapperService', 'ValidateConfig')
  async validateConfig(data: ValidateConfigDto) {
    return this.releaseAssemblyService.validateConfig(data);
  }
}
