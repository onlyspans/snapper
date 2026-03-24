import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { existsSync } from 'fs';
import { join } from 'path';
import { ConfigModule } from '@config/config.module';
import { ConfigService } from '@config/config.service';
import { ArtifactStorageClient } from './artifact-storage/artifact-storage.client';
import { EventsClient } from './events/events.client';
import { ProjectsClient } from './projects/projects.client';
import { VariablesClient } from './variables/variables.client';
import {
  ARTIFACT_STORAGE_CLIENT,
  EVENTS_CLIENT,
  PROJECTS_CLIENT,
  VARIABLES_CLIENT,
} from './integrations.constants';

function resolveProtoPath(fileName: string): string {
  const distProtoPath = join(process.cwd(), 'dist/proto', fileName);
  const srcProtoPath = join(process.cwd(), 'src/proto', fileName);
  return existsSync(distProtoPath) ? distProtoPath : srcProtoPath;
}

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: PROJECTS_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.grpc.projectsUrl,
            package: 'projects.v1',
            protoPath: resolveProtoPath('projects.proto'),
          },
        }),
      },
      {
        name: VARIABLES_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.grpc.variablesUrl,
            package: 'variables',
            protoPath: resolveProtoPath('variables.proto'),
          },
        }),
      },
      {
        name: ARTIFACT_STORAGE_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.grpc.artifactStorageUrl,
            package: 'artifactstorage',
            protoPath: resolveProtoPath('artifact-storage.proto'),
          },
        }),
      },
      {
        name: EVENTS_CLIENT,
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.grpc.eventsUrl,
            package: 'events.v1',
            protoPath: resolveProtoPath('events.proto'),
          },
        }),
      },
    ]),
  ],
  providers: [ProjectsClient, VariablesClient, ArtifactStorageClient, EventsClient],
  exports: [ProjectsClient, VariablesClient, ArtifactStorageClient, EventsClient],
})
export class IntegrationsModule {}
