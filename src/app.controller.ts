import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { DatabaseService } from '@database/database.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ArtifactStorageClient } from '@integrations/artifact-storage';
import { EventsClient } from '@integrations/events';
import { ProjectsClient } from '@integrations/projects';
import { VariablesClient } from '@integrations/variables';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectsClient: ProjectsClient,
    private readonly variablesClient: VariablesClient,
    private readonly artifactStorageClient: ArtifactStorageClient,
    private readonly eventsClient: EventsClient,
  ) {}

  @Get('healthz')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  healthz(): { status: string } {
    return { status: 'OK' };
  }

  @GrpcMethod('SnapperService', 'HealthCheck')
  healthCheck(data: { service?: string }): { status: string; message: string } {
    const service = data.service?.trim() || 'snapper-microservice';
    return {
      status: 'OK',
      message: `${service} is healthy`,
    };
  }

  @Get('readyz')
  @ApiOperation({ summary: 'Readiness probe - checks database and gRPC client initialization' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service is not ready' })
  async readyz(): Promise<{
    status: string;
    database: string;
    integrations: {
      projects: string;
      variables: string;
      artifactStorage: string;
      events: string;
    };
  }> {
    const integrations = {
      projects: this.projectsClient.isInitialized() ? 'ready' : 'not_initialized',
      variables: this.variablesClient.isInitialized() ? 'ready' : 'not_initialized',
      artifactStorage: this.artifactStorageClient.isInitialized() ? 'ready' : 'not_initialized',
      events: this.eventsClient.isInitialized() ? 'ready' : 'not_initialized',
    };

    const allIntegrationsReady = Object.values(integrations).every((status) => status === 'ready');

    try {
      await this.db.$queryRaw`SELECT 1`;
      if (!allIntegrationsReady) {
        throw new HttpException(
          {
            status: 'NOT_READY',
            database: 'connected',
            integrations,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      return {
        status: 'OK',
        database: 'connected',
        integrations,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          status: 'NOT_READY',
          database: 'disconnected',
          integrations,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
