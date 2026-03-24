import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@config/config.module';
import { DatabaseModule } from '@database/database.module';
import { CommonModule } from '@common/common.module';
import { IntegrationsModule } from '@integrations/integrations.module';
import { SnapshotsModule } from '@snapshots/snapshots.module';
import { ReleaseAssemblyModule } from '@release-assembly/release-assembly.module';
import { MetricsModule } from '@/metrics';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CommonModule,
    IntegrationsModule,
    SnapshotsModule,
    ReleaseAssemblyModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
