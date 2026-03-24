import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, Snapshot, SnapshotStatus } from '@database/generated/client';
import { Pagination } from '@common/interfaces/pagination.interface';
import { MetricsService } from '@metrics/metrics.service';
import { CreateSnapshotDto, SnapshotQueryDto, SnapshotResponseDto } from '../dto';
import { SnapshotEntity } from '../interfaces';
import { SnapshotsRepository } from '../repositories';
import { SnapshotBuilderService } from './snapshot-builder.service';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly repository: SnapshotsRepository,
    private readonly snapshotBuilderService: SnapshotBuilderService,
    private readonly metricsService: MetricsService,
  ) {}

  async getById(id: string): Promise<SnapshotResponseDto> {
    const snapshot = await this.repository.findById(id);
    if (!snapshot) {
      throw new NotFoundException(`Snapshot with id "${id}" not found`);
    }

    return this.toResponseDto(snapshot);
  }

  async list(query: SnapshotQueryDto): Promise<Pagination<SnapshotResponseDto>> {
    const result = await this.repository.findAll(query);
    return {
      ...result,
      items: result.items.map((item) => this.toResponseDto(item)),
    };
  }

  async create(dto: CreateSnapshotDto): Promise<SnapshotResponseDto> {
    const existing = await this.repository.findByProjectAndVersion(dto.projectId, dto.version);
    if (existing) {
      throw new ConflictException(
        `Snapshot for project "${dto.projectId}" and version "${dto.version}" already exists`,
      );
    }

    const artifactKey = dto.artifactKey ?? `snapshots/${dto.projectId}/${dto.version}.json`;

    let buildingSnapshot: Snapshot;
    try {
      buildingSnapshot = await this.repository.create({
        projectId: dto.projectId,
        version: dto.version,
        artifactKey,
        status: SnapshotStatus.BUILDING,
        createdBy: dto.createdBy,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        config: dto.payload as Prisma.InputJsonValue,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Snapshot for project "${dto.projectId}" and version "${dto.version}" already exists`,
        );
      }
      throw error;
    }

    try {
      const { checksum, sizeBytes } = await this.snapshotBuilderService.buildImmutableSnapshot({
        artifactKey,
        version: dto.version,
        payload: dto.payload,
      });

      const readySnapshot = await this.repository.updateById(buildingSnapshot.id, {
        status: SnapshotStatus.READY,
        checksum,
        sizeBytes,
      });

      this.metricsService.recordSnapshotCreated();
      this.logger.log({
        message: 'Snapshot created',
        snapshotId: readySnapshot.id,
        projectId: dto.projectId,
        version: dto.version,
        artifactKey,
      });
      return this.toResponseDto(readySnapshot);
    } catch (error) {
      await this.repository.updateStatus(buildingSnapshot.id, SnapshotStatus.FAILED);
      if (this.isSnapshotBuildInfrastructureError(error)) {
        throw error;
      }
      throw new UnprocessableEntityException('Snapshot build failed', {
        cause: error as Error,
      });
    }
  }

  private isSnapshotBuildInfrastructureError(error: unknown): boolean {
    if (error instanceof HttpException && error.getStatus() >= 500) {
      return true;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const infrastructureCodes = new Set([
        'P1000',
        'P1001',
        'P1002',
        'P1003',
        'P1008',
        'P1010',
        'P1011',
        'P1017',
        'P2024',
        'P2034',
      ]);
      return infrastructureCodes.has(error.code);
    }
    const name = error instanceof Error ? error.name : '';
    if (
      name === 'PrismaClientUnknownRequestError' ||
      name === 'PrismaClientRustPanicError' ||
      name === 'PrismaClientInitializationError'
    ) {
      return true;
    }
    const statusCode = (error as { statusCode?: number })?.statusCode;
    return typeof statusCode === 'number' && statusCode >= 500;
  }

  async updateStatus(id: string, status: SnapshotStatus): Promise<SnapshotResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repository.updateStatus(id, status);
    return this.toResponseDto(updated);
  }

  async remove(id: string): Promise<void> {
    await this.ensureExists(id);
    await this.repository.removeById(id);
  }

  async findExpired(): Promise<SnapshotResponseDto[]> {
    const expired = await this.repository.findExpired();
    return expired.map((item) => this.toResponseDto(item));
  }

  private async ensureExists(id: string): Promise<void> {
    const snapshot = await this.repository.findById(id);
    if (!snapshot) {
      throw new NotFoundException(`Snapshot with id "${id}" not found`);
    }
  }

  private toResponseDto(snapshot: SnapshotEntity): SnapshotResponseDto {
    return {
      id: snapshot.id,
      projectId: snapshot.projectId,
      version: snapshot.version,
      status: snapshot.status,
      artifactKey: snapshot.artifactKey,
      checksum: snapshot.checksum ?? '',
      sizeBytes: snapshot.sizeBytes.toString(),
      createdBy: snapshot.createdBy ?? '',
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      expiresAt: snapshot.expiresAt ?? undefined,
    };
  }
}
