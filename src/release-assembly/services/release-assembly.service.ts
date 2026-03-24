import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AssemblyStatus, Prisma } from '@database/generated/client';
import { EventsClient } from '@integrations/events';
import { ProjectsClient } from '@integrations/projects';
import { CreateSnapshotDto, SnapshotsService } from '@/snapshots';
import { ArtifactNotificationDto, AssemblyStatusDto, ValidateConfigDto } from '../dto';
import { AssemblyStep } from '../interfaces';
import { ReleaseAssembliesRepository } from '../repositories';
import { ConfigCollectorService } from '@/release-assembly';
import { ConfigValidatorService } from '@/release-assembly';
import { TemplateRendererService } from '@/release-assembly';

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
  ) {}

  async notifyArtifactsReady(dto: ArtifactNotificationDto): Promise<AssemblyStatusDto> {
    const assembly = await this.releaseAssembliesRepository.create({
      projectId: dto.projectId,
      status: AssemblyStatus.IN_PROGRESS,
      createdBy: dto.triggeredBy,
      steps: this.initialSteps() as unknown as Prisma.InputJsonValue,
    });

    try {
      await this.updateStep(assembly.id, 'collect', 'in_progress');
      const collected = await this.configCollectorService.collect({
        projectId: dto.projectId,
        artifactKey: dto.artifactKey,
        version: dto.version,
        environmentId: dto.environmentId,
      });
      await this.updateStep(assembly.id, 'collect', 'completed');

      await this.updateStep(assembly.id, 'validate', 'in_progress');
      const validation = this.configValidatorService.validate(collected);
      if (!validation.valid) {
        await this.updateStep(assembly.id, 'validate', 'failed', validation.errors.join('; '));
        throw new UnprocessableEntityException('Configuration validation failed', {
          description: validation.errors.join('; '),
        });
      }
      await this.updateStep(assembly.id, 'validate', 'completed');

      await this.updateStep(assembly.id, 'normalize', 'in_progress');
      const normalizedPayload = this.templateRendererService.normalize(collected);
      await this.updateStep(assembly.id, 'normalize', 'completed');

      await this.updateStep(assembly.id, 'build_snapshot', 'in_progress');
      const snapshot = await this.snapshotsService.create({
        projectId: dto.projectId,
        version: dto.version,
        artifactKey: `snapshots/${dto.projectId}/${dto.version}.json`,
        payload: normalizedPayload,
        createdBy: dto.triggeredBy,
      } satisfies CreateSnapshotDto);
      await this.releaseAssembliesRepository.updateSnapshotId(assembly.id, snapshot.id);
      await this.updateStep(assembly.id, 'build_snapshot', 'completed');

      await this.updateStep(assembly.id, 'register_release', 'in_progress');
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
      await this.updateStep(assembly.id, 'register_release', 'completed');

      await this.updateStep(assembly.id, 'audit', 'in_progress');
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
      await this.updateStep(assembly.id, 'audit', 'completed');

      await this.releaseAssembliesRepository.updateStatus(assembly.id, AssemblyStatus.COMPLETED);
      return this.getAssemblyStatus(assembly.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown release assembly failure';
      this.logger.error(`Release assembly ${assembly.id} failed: ${message}`);
      await this.releaseAssembliesRepository.updateStatus(assembly.id, AssemblyStatus.FAILED, message);
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
}
