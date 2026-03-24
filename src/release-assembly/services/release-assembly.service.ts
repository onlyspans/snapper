import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AssemblyStatus, Prisma } from '@database/generated/client';
import { EventsClient } from '@integrations/events';
import { MetricsService } from '@metrics/metrics.service';
import { ProjectsClient } from '@integrations/projects';
import { CreateSnapshotDto } from '@snapshots/dto';
import { SnapshotsService } from '@snapshots/services';
import { ArtifactNotificationDto, AssemblyStatusDto, ValidateConfigDto } from '../dto';
import { AssemblyStep } from '../interfaces';
import { ReleaseAssembliesRepository } from '../repositories';
import { ConfigCollectorService } from './config-collector.service';
import { ConfigValidatorService } from './config-validator.service';
import { TemplateRendererService } from './template-renderer.service';

@Injectable()
export class ReleaseAssemblyService {
  private readonly logger = new Logger(ReleaseAssemblyService.name);

  constructor(
    private readonly releaseAssembliesRepository: ReleaseAssembliesRepository,
    private readonly configCollectorService: ConfigCollectorService,
    private readonly configValidatorService: ConfigValidatorService,
    private readonly templateRendererService: TemplateRendererService,
    private readonly snapshotsService: SnapshotsService,
    private readonly projectsClient: ProjectsClient,
    private readonly eventsClient: EventsClient,
    private readonly metricsService: MetricsService,
  ) {}

  async notifyArtifactsReady(dto: ArtifactNotificationDto): Promise<AssemblyStatusDto> {
    const existingAssembly = await this.releaseAssembliesRepository.findByProjectAndVersion(dto.projectId, dto.version);
    if (
      existingAssembly &&
      (existingAssembly.status === AssemblyStatus.IN_PROGRESS || existingAssembly.status === AssemblyStatus.COMPLETED)
    ) {
      this.logger.log({
        message: 'Idempotent assembly hit',
        assemblyId: existingAssembly.id,
        projectId: dto.projectId,
        version: dto.version,
        status: existingAssembly.status,
      });
      return this.getAssemblyStatus(existingAssembly.id);
    }

    const assemblyCreation = await this.createAssemblyWithIdempotency(dto);
    if (assemblyCreation.isExisting) {
      return this.getAssemblyStatus(assemblyCreation.assembly.id);
    }
    const assembly = assemblyCreation.assembly;

    try {
      const collected = await this.runMeasuredStep(assembly.id, 'collect', async () => {
        return this.configCollectorService.collect({
          projectId: dto.projectId,
          artifactKey: dto.artifactKey,
          version: dto.version,
          environmentId: dto.environmentId,
        });
      });

      const validation = await this.runMeasuredStep(assembly.id, 'validate', async () =>
        Promise.resolve(this.configValidatorService.validate(collected)),
      );
      if (!validation.valid) {
        throw new UnprocessableEntityException('Configuration validation failed', {
          description: validation.errors.join('; '),
        });
      }

      const normalizedPayload = await this.runMeasuredStep(assembly.id, 'normalize', async () =>
        Promise.resolve(this.templateRendererService.normalize(collected)),
      );

      const snapshot = await this.runMeasuredStep(assembly.id, 'build_snapshot', async () =>
        this.snapshotsService.create({
          projectId: dto.projectId,
          version: dto.version,
          artifactKey: `snapshots/${dto.projectId}/${dto.version}.json`,
          payload: normalizedPayload,
          createdBy: dto.triggeredBy,
        } satisfies CreateSnapshotDto),
      );
      await this.releaseAssembliesRepository.updateSnapshotId(assembly.id, snapshot.id);

      await this.runMeasuredStep(assembly.id, 'register_release', async () => {
        await this.projectsClient.updateReleaseStructure({
          id: dto.projectId,
          snapshot_id: snapshot.id,
          structure: {
            project_id: dto.projectId,
            project_name: collected.releaseStructure.project_name,
            version: dto.version,
            snapshot_id: snapshot.id,
            config: collected.releaseStructure.config,
            metadata: collected.releaseStructure.metadata,
          },
        });
      });

      await this.runMeasuredStep(assembly.id, 'audit', async () => {
        await this.eventsClient.ingestEvent({
          entity_id: snapshot.id,
          entity_name: 'snapshot',
          action: 'release.assembled',
          user_id: dto.triggeredBy ?? 'system',
          ip_address: '0.0.0.0',
          user_agent: 'snapper-microservice',
          tenant: dto.projectId,
          changes: [
            {
              field: 'version',
              old_value: '',
              new_value: dto.version,
            },
          ],
        });
      });

      await this.releaseAssembliesRepository.updateStatus(assembly.id, AssemblyStatus.COMPLETED);
      this.metricsService.recordAssemblyCompleted();
      return this.getAssemblyStatus(assembly.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown release assembly failure';
      this.logger.error(
        {
          message: 'Release assembly failed',
          assemblyId: assembly.id,
          projectId: dto.projectId,
          version: dto.version,
          error: message,
        },
        undefined,
      );
      await this.releaseAssembliesRepository.updateStatus(assembly.id, AssemblyStatus.FAILED, message);
      this.metricsService.recordAssemblyFailed();
      throw error;
    }
  }

  private async createAssemblyWithIdempotency(
    dto: ArtifactNotificationDto,
  ): Promise<{ assembly: { id: string }; isExisting: boolean }> {
    try {
      const assembly = await this.releaseAssembliesRepository.create({
        projectId: dto.projectId,
        version: dto.version,
        status: AssemblyStatus.IN_PROGRESS,
        createdBy: dto.triggeredBy,
        steps: this.initialSteps() as unknown as Prisma.InputJsonValue,
      });
      return { assembly, isExisting: false };
    } catch (error) {
      const isUniqueConstraintViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!isUniqueConstraintViolation) {
        throw error;
      }

      const existingAssembly = await this.releaseAssembliesRepository.findByProjectAndVersion(
        dto.projectId,
        dto.version,
      );
      if (
        existingAssembly &&
        (existingAssembly.status === AssemblyStatus.IN_PROGRESS || existingAssembly.status === AssemblyStatus.COMPLETED)
      ) {
        this.logger.log({
          message: 'Concurrent idempotent assembly hit',
          assemblyId: existingAssembly.id,
          projectId: dto.projectId,
          version: dto.version,
          status: existingAssembly.status,
        });
        return { assembly: existingAssembly, isExisting: true };
      }
      throw error;
    }
  }

  async getAssemblyStatus(id: string): Promise<AssemblyStatusDto> {
    const assembly = await this.releaseAssembliesRepository.findById(id);
    if (!assembly) {
      throw new NotFoundException(`Release assembly with id "${id}" not found`);
    }

    const steps = (assembly.steps as unknown as AssemblyStep[]) ?? [];

    return {
      id: assembly.id,
      snapshotId: assembly.snapshotId ?? '',
      projectId: assembly.projectId,
      status: assembly.status,
      steps,
      errorMessage: assembly.errorMessage ?? '',
      createdBy: assembly.createdBy ?? '',
      createdAt: assembly.createdAt,
      updatedAt: assembly.updatedAt,
      completedAt: assembly.completedAt ?? undefined,
    };
  }

  async validateConfig(dto: ValidateConfigDto): Promise<{ valid: boolean; errors: string[] }> {
    const collected = await this.configCollectorService.collect({
      projectId: dto.projectId,
      artifactKey: dto.artifactKey,
      version: 'validation',
      environmentId: dto.environmentId,
    });
    return this.configValidatorService.validate(collected);
  }

  private initialSteps(): AssemblyStep[] {
    return [
      { name: 'collect', status: 'pending' },
      { name: 'validate', status: 'pending' },
      { name: 'normalize', status: 'pending' },
      { name: 'build_snapshot', status: 'pending' },
      { name: 'register_release', status: 'pending' },
      { name: 'audit', status: 'pending' },
    ];
  }

  private async updateStep(
    assemblyId: string,
    stepName: string,
    status: AssemblyStep['status'],
    message?: string,
  ): Promise<void> {
    await this.releaseAssembliesRepository.updateStep(assemblyId, stepName, status, message);
  }

  private async runMeasuredStep<T>(assemblyId: string, stepName: string, action: () => Promise<T>): Promise<T> {
    const stopTimer = this.metricsService.startPipelineStepTimer(stepName);
    await this.updateStep(assemblyId, stepName, 'in_progress');
    try {
      const result = await action();
      await this.updateStep(assemblyId, stepName, 'completed');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Step failed';
      await this.updateStep(assemblyId, stepName, 'failed', message);
      throw error;
    } finally {
      stopTimer();
    }
  }
}
