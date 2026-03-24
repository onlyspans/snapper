import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SnapshotQueryDto } from '../dto';
import { SnapshotsService } from '../services';

interface IdRequest {
  id: string;
}

@Controller()
export class SnapshotsGrpcController {
  constructor(private readonly snapshotsService: SnapshotsService) {}

  @GrpcMethod('SnapperService', 'GetSnapshot')
  async getSnapshot(data: IdRequest) {
    return this.snapshotsService.getById(data.id);
  }

  @GrpcMethod('SnapperService', 'ListSnapshots')
  async listSnapshots(data: SnapshotQueryDto) {
    return this.snapshotsService.list(data);
  }
}
