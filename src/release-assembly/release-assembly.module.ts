import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/database.module';
import { IntegrationsModule } from '@integrations/integrations.module';
import { SnapshotsModule } from '@/snapshots';
import { ReleaseAssemblyGrpcController } from './grpc';
import { ReleaseAssembliesRepository } from './repositories';
import {
  ConfigCollectorService,
  ConfigValidatorService,
  ReleaseAssemblyService,
  TemplateRendererService,
} from './services';

@Module({
  imports: [DatabaseModule, IntegrationsModule, SnapshotsModule],
  controllers: [ReleaseAssemblyGrpcController],
  providers: [
    ReleaseAssembliesRepository,
    ReleaseAssemblyService,
    ConfigCollectorService,
    ConfigValidatorService,
    TemplateRendererService,
  ],
  exports: [ReleaseAssemblyService],
})
export class ReleaseAssemblyModule {}
