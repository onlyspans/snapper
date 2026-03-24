import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { IntegrationsModule } from '@integrations/integrations.module';
import { MetricsModule } from '@metrics/metrics.module';
import { SnapshotsGrpcController } from './grpc';
import { SnapshotsRepository } from './repositories';
import { SnapshotBuilderService, SnapshotCleanupService, SnapshotsService } from './services';

@Module({
  imports: [DatabaseModule, IntegrationsModule, MetricsModule],
  controllers: [SnapshotsGrpcController],
  providers: [SnapshotsRepository, SnapshotsService, SnapshotBuilderService, SnapshotCleanupService],
  exports: [SnapshotsService, SnapshotBuilderService],
})
export class SnapshotsModule {}
