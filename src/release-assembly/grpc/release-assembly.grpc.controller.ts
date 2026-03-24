import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ArtifactNotificationDto, ValidateConfigDto } from '../dto';
import { ReleaseAssemblyService } from '../services';

@Controller()
export class ReleaseAssemblyGrpcController {
  constructor(private readonly releaseAssemblyService: ReleaseAssemblyService) {}

  @GrpcMethod('SnapperService', 'NotifyArtifactsReady')
  async notifyArtifactsReady(data: ArtifactNotificationDto) {
    return this.releaseAssemblyService.notifyArtifactsReady(data);
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
