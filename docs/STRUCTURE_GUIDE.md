# Руководство по структуре кода — Snapper Microservice

## Быстрый старт структуры

Этот документ описывает детальные примеры кода для каждого слоя snapper-microservice.

## Примеры структуры файлов

### 1. Модуль (Module)

**`snapshots/snapshots.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { SnapshotsController } from './controllers/snapshots.controller';
import { SnapshotsGrpcController } from './grpc/snapshots.grpc.controller';
import { SnapshotsService } from './services/snapshots.service';
import { SnapshotBuilderService } from './services/snapshot-builder.service';
import { SnapshotsRepository } from './repositories/snapshots.repository';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [SnapshotsController, SnapshotsGrpcController],
  providers: [SnapshotsService, SnapshotBuilderService, SnapshotsRepository],
  exports: [SnapshotsService, SnapshotBuilderService],
})
export class SnapshotsModule {}
```

**`orchestration/orchestration.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { OrchestrationController } from './controllers/orchestration.controller';
import { OrchestrationGrpcController } from './grpc/orchestration.grpc.controller';
import { ReleaseOrchestratorService } from './services/release-orchestrator.service';
import { ConfigCollectorService } from './services/config-collector.service';
import { ConfigValidatorService } from './services/config-validator.service';
import { TemplateRendererService } from './services/template-renderer.service';
// SecretsResolverService removed: секреты разрешаются в Variables/Processes
import { OrchestrationsRepository } from './repositories/orchestrations.repository';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [SnapshotsModule, IntegrationsModule],
  controllers: [OrchestrationController, OrchestrationGrpcController],
  providers: [
    ReleaseOrchestratorService,
    ConfigCollectorService,
    ConfigValidatorService,
    TemplateRendererService,
    OrchestrationsRepository,
  ],
  exports: [ReleaseOrchestratorService],
})
export class OrchestrationModule {}
```

### 2. Entity (Сущность)

**`src/database/schema.prisma` (Snapshot model)**
```prisma
enum SnapshotStatus {
  BUILDING
  READY
  FAILED
  ARCHIVED
}

model Snapshot {
  id              String         @id @default(uuid())
  projectId       String
  version         String
  status          SnapshotStatus @default(BUILDING)
  artifactKey     String
  artifactBackend String
  checksum        String?
  sizeBytes       BigInt         @default(0)
  config          Json           @default({})
  metadata        Json           @default({})
  createdBy       String?
  companyId       String
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  expiresAt       DateTime?

  @@index([projectId])
  @@index([companyId])
  @@index([status])
  @@unique([projectId, version])
}
```

**`src/database/schema.prisma` (Orchestration model)**
```prisma
enum OrchestrationStatus {
  IN_PROGRESS
  COMPLETED
  FAILED
  CANCELLED
}

model Orchestration {
  id           String              @id @default(uuid())
  snapshotId   String?
  projectId    String
  companyId    String
  status       OrchestrationStatus @default(IN_PROGRESS)
  steps        Json                @default([])
  errorMessage String?
  createdBy    String?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt
  completedAt  DateTime?

  @@index([snapshotId])
  @@index([projectId])
  @@index([status])
}
```

**`src/database/schema.prisma` (CompanyConfig model)**
```prisma
model CompanyConfig {
  id                     String   @id @default(uuid())
  companyId              String   @unique

  // Artifact Storage backend settings (локальная FS / S3-compatible)
  artifactEndpoint      String?
  artifactRegion        String?
  artifactBucket        String?
  artifactAccessKey     String?
  artifactSecretKey     String?

  notificationEmail      String?
  notificationSlackWebhook String?

  maxSnapshotSizeMb      Int      @default(500)
  snapshotRetentionDays  Int      @default(90)
  metadata                Json     @default({})

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt
}
```

### 3. Repository (Репозиторий)

**`snapshots/repositories/snapshots.repository.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@database/database.service';
import { Prisma } from '@prisma/client';
import { SnapshotQueryDto } from '../dto/snapshot-query.dto';

@Injectable()
export class SnapshotsRepository {
  private readonly logger = new Logger(SnapshotsRepository.name);

  constructor(private readonly db: DatabaseService) {}

  async findById(id: string) {
    return this.db.snapshot.findUnique({ where: { id } });
  }

  async findAll(query: SnapshotQueryDto) {
    const { page = 1, pageSize = 20, projectId, status, version } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SnapshotWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(version ? { version: { contains: version, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.db.$transaction([
      this.db.snapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.snapshot.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async create(data: Prisma.SnapshotCreateInput) {
    return this.db.snapshot.create({ data });
  }

  async updateStatus(id: string, status: Prisma.SnapshotStatus) {
    await this.db.snapshot.update({ where: { id }, data: { status } });
  }

  async updateChecksumAndSize(
    id: string,
    checksum: string,
    sizeBytes: bigint,
  ) {
    await this.db.snapshot.update({ where: { id }, data: { checksum, sizeBytes } });
  }

  async findByProjectAndVersion(
    projectId: string,
    version: string,
  ) {
    return this.db.snapshot.findUnique({
      where: { projectId_version: { projectId, version } },
    });
  }

  async findExpired() {
    const now = new Date();
    return this.db.snapshot.findMany({
      where: {
        expiresAt: { lt: now },
        status: { not: 'ARCHIVED' },
      },
    });
  }
}
```

### 4. Service (Сервис)

**`snapshots/services/snapshots.service.ts`**
```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { SnapshotsRepository } from '../repositories/snapshots.repository';
import { ArtifactStorageClient } from '../../integrations/artifact-storage/artifact-storage.client';
import { CompanyConfigService } from '../../company-config/services/company-config.service';
import { CreateSnapshotDto } from '../dto/create-snapshot.dto';
import { SnapshotQueryDto } from '../dto/snapshot-query.dto';
import { SnapshotStatus } from '@prisma/client';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly repository: SnapshotsRepository,
    private readonly storageService: ArtifactStorageClient,
    private readonly companyConfigService: CompanyConfigService,
  ) {}

  async findAll(query: SnapshotQueryDto) {
    return this.repository.findAll(query);
  }

  async findById(id: string) {
    const snapshot = await this.repository.findById(id);
    if (!snapshot) {
      throw new NotFoundException(`Snapshot with ID ${id} not found`);
    }
    return snapshot;
  }

  async create(dto: CreateSnapshotDto, companyId: string) {
    // Проверка уникальности версии в рамках проекта
    const existing = await this.repository.findByProjectAndVersion(
      dto.projectId,
      dto.version,
    );
    if (existing) {
      throw new ConflictException(
        `Snapshot for project ${dto.projectId} version ${dto.version} already exists`,
      );
    }

    // Получить конфигурацию backend для Artifact Storage (FS default / S3 opt-in)
    const companyConfig = await this.companyConfigService.getByCompanyId(companyId);
    const artifactKey = `snapshots/${dto.projectId}/${dto.version}/${Date.now()}.json`;

    const snapshot = await this.repository.create({
      projectId: dto.projectId,
      version: dto.version,
      status: SnapshotStatus.BUILDING,
      artifactKey,
      artifactBackend: companyConfig.artifactBucket,
      createdBy: dto.createdBy,
      companyId,
    });

    this.logger.log(`Snapshot created: ${snapshot.id} for project ${dto.projectId}`);
    return snapshot;
  }

  async getDownloadUrl(id: string): Promise<string> {
    const snapshot = await this.findById(id);
    return this.storageService.getSignedUrl(snapshot.artifactBackend, snapshot.artifactKey);
  }

  async updateStatus(id: string, status: SnapshotStatus) {
    await this.findById(id);
    await this.repository.updateStatus(id, status);
    this.logger.log(`Snapshot ${id} status updated to ${status}`);
  }
}
```

**`orchestration/services/release-orchestrator.service.ts`** (ключевой сервис)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigCollectorService } from './config-collector.service';
import { ConfigValidatorService } from './config-validator.service';
import { TemplateRendererService } from './template-renderer.service';
// SecretsResolverService removed: секреты выдаются Variables по запросу Processes
import { SnapshotBuilderService } from '../../snapshots/services/snapshot-builder.service';
import { OrchestrationsRepository } from '../repositories/orchestrations.repository';
import { ProjectsClient } from '../../integrations/projects/projects.client';
import { GithubAgentsClient } from '../../integrations/github-agents/github-agents.client';
import { EventsClient } from '../../integrations/events/events.client';
import { CreateReleaseDto } from '../dto/create-release.dto';
import { OrchestrationStatus } from '../entities/orchestration.entity';

@Injectable()
export class ReleaseOrchestratorService {
  private readonly logger = new Logger(ReleaseOrchestratorService.name);

  constructor(
    private readonly configCollector: ConfigCollectorService,
    private readonly configValidator: ConfigValidatorService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly snapshotBuilder: SnapshotBuilderService,
    private readonly orchestrationsRepo: OrchestrationsRepository,
    private readonly projectsClient: ProjectsClient,
    private readonly githubAgentsClient: GithubAgentsClient,
    private readonly eventsClient: EventsClient,
  ) {}

  async orchestrateRelease(dto: CreateReleaseDto, companyId: string) {
    const orchestration = await this.orchestrationsRepo.create({
      projectId: dto.projectId,
      companyId,
      createdBy: dto.createdBy,
      steps: this.buildInitialSteps(dto),
    });

    this.logger.log(`Starting orchestration ${orchestration.id} for project ${dto.projectId}`);

    try {
      // Шаг 1: Сбор данных из всех сервисов (параллельно)
      await this.updateStep(orchestration.id, 'collect_data', 'in_progress');
      const collectedData = await this.configCollector.collectAll(dto.projectId);
      await this.updateStep(orchestration.id, 'collect_data', 'completed');

      // Шаг 2: Валидация конфигурации
      await this.updateStep(orchestration.id, 'validate_config', 'in_progress');
      const validationResult = await this.configValidator.validate(collectedData);
      if (!validationResult.valid) {
        throw new Error(`Config validation failed: ${validationResult.errors.join(', ')}`);
      }
      await this.updateStep(orchestration.id, 'validate_config', 'completed');

      // Шаг 3: Обработка шаблонов
      await this.updateStep(orchestration.id, 'process_templates', 'in_progress');
      const withTemplates = await this.templateRenderer.render(collectedData);
      await this.updateStep(orchestration.id, 'process_templates', 'completed');

      // Шаг 4: Подготовка снапшота (без разрешения секретов)
      const withSecrets = withTemplates;

      // Шаг 5: Создание снапшота и сохранение в Artifact Storage
      await this.updateStep(orchestration.id, 'create_snapshot', 'in_progress');
      const snapshot = await this.snapshotBuilder.build(withSecrets, dto, companyId);
      await this.orchestrationsRepo.updateSnapshotId(orchestration.id, snapshot.id);
      await this.updateStep(orchestration.id, 'create_snapshot', 'completed');

      // Шаг 6: Создание Release в projects
      await this.updateStep(orchestration.id, 'create_release', 'in_progress');
      await this.projectsClient.createRelease({
        projectId: dto.projectId,
        version: dto.version,
        snapshotId: snapshot.id,
        changelog: dto.changelog,
      });
      await this.updateStep(orchestration.id, 'create_release', 'completed');

      // Шаг 7: GitHub релиз (опционально)
      if (dto.options?.createGithubRelease) {
        await this.updateStep(orchestration.id, 'create_github_release', 'in_progress');
        await this.githubAgentsClient.createRelease(snapshot);
        await this.updateStep(orchestration.id, 'create_github_release', 'completed');
      } else {
        await this.updateStep(orchestration.id, 'create_github_release', 'skipped');
      }

      // Шаг 8: Отправка событий
      await this.updateStep(orchestration.id, 'send_events', 'in_progress');
      await this.eventsClient.sendReleaseCreated({
        snapshotId: snapshot.id,
        projectId: dto.projectId,
        version: dto.version,
        createdBy: dto.createdBy,
      });
      await this.updateStep(orchestration.id, 'send_events', 'completed');

      // Завершение
      await this.orchestrationsRepo.updateStatus(
        orchestration.id,
        OrchestrationStatus.COMPLETED,
      );

      this.logger.log(`Orchestration ${orchestration.id} completed successfully`);
      return this.orchestrationsRepo.findById(orchestration.id);
    } catch (error) {
      this.logger.error(
        `Orchestration ${orchestration.id} failed: ${error.message}`,
        error.stack,
      );
      await this.orchestrationsRepo.updateStatus(
        orchestration.id,
        OrchestrationStatus.FAILED,
        error.message,
      );
      throw error;
    }
  }

  private buildInitialSteps(dto: CreateReleaseDto) {
    const steps = [
      { name: 'collect_data', status: 'pending' as const },
      { name: 'validate_config', status: 'pending' as const },
      { name: 'process_templates', status: 'pending' as const },
      { name: 'create_snapshot', status: 'pending' as const },
      { name: 'create_release', status: 'pending' as const },
      { name: 'create_github_release', status: 'pending' as const },
      { name: 'send_events', status: 'pending' as const },
    ];
    return steps;
  }

  private async updateStep(
    orchestrationId: string,
    stepName: string,
    status: string,
  ) {
    await this.orchestrationsRepo.updateStep(orchestrationId, stepName, status);
  }
}
```

**`orchestration/services/config-collector.service.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProjectsClient } from '../../integrations/projects/projects.client';
import { ProcessesClient } from '../../integrations/processes/processes.client';
import { VariablesClient } from '../../integrations/variables/variables.client';
import { AssetsClient } from '../../integrations/assets/assets.client';
import { TargetsPlaneClient } from '../../integrations/targets-plane/targets-plane.client';
import { CollectedConfig } from '../interfaces/collected-config.interface';

@Injectable()
export class ConfigCollectorService {
  private readonly logger = new Logger(ConfigCollectorService.name);

  constructor(
    private readonly projectsClient: ProjectsClient,
    private readonly processesClient: ProcessesClient,
    private readonly variablesClient: VariablesClient,
    private readonly assetsClient: AssetsClient,
    private readonly targetsPlaneClient: TargetsPlaneClient,
  ) {}

  async collectAll(projectId: string): Promise<CollectedConfig> {
    this.logger.log(`Collecting config for project ${projectId}`);

    // Параллельный сбор данных из всех сервисов
    const [project, processes, variables, assets, targets] = await Promise.all([
      this.projectsClient.getProject(projectId),
      this.processesClient.getProcesses(projectId),
      this.variablesClient.getVariables(projectId),
      this.assetsClient.getAssets(projectId),
      this.targetsPlaneClient.getTargets(projectId),
    ]);

    this.logger.log(
      `Config collected for project ${projectId}: ` +
      `${processes.length} processes, ${Object.keys(variables.plain || {}).length} variables, ` +
      `${assets.length} assets, ${targets.length} targets`,
    );

    return { project, processes, variables, assets, targets };
  }
}
```

### 5. Controller (REST)

**`snapshots/controllers/snapshots.controller.ts`**
```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SnapshotsService } from '../services/snapshots.service';
import { CreateSnapshotDto } from '../dto/create-snapshot.dto';
import { SnapshotQueryDto } from '../dto/snapshot-query.dto';
import { CompanyId } from '../../common/decorators/company-id.decorator';

@Controller('api/snapshots')
export class SnapshotsController {
  constructor(private readonly service: SnapshotsService) {}

  @Get()
  async findAll(@Query() query: SnapshotQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Get(':id/config')
  async getConfig(@Param('id') id: string) {
    const snapshot = await this.service.findById(id);
    return snapshot.config;
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const downloadUrl = await this.service.getDownloadUrl(id);
    res.redirect(downloadUrl);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateSnapshotDto,
    @CompanyId() companyId: string,
  ) {
    return this.service.create(dto, companyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    await this.service.updateStatus(id, 'archived' as any);
  }
}
```

**`orchestration/controllers/orchestration.controller.ts`**
```typescript
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReleaseOrchestratorService } from '../services/release-orchestrator.service';
import { ConfigValidatorService } from '../services/config-validator.service';
import { CreateReleaseDto } from '../dto/create-release.dto';
import { ValidateConfigDto } from '../dto/validate-config.dto';
import { CompanyId } from '../../common/decorators/company-id.decorator';

@Controller('api/orchestration')
export class OrchestrationController {
  constructor(
    private readonly orchestrator: ReleaseOrchestratorService,
    private readonly validator: ConfigValidatorService,
  ) {}

  @Post('releases')
  @HttpCode(HttpStatus.ACCEPTED)
  async createRelease(
    @Body() dto: CreateReleaseDto,
    @CompanyId() companyId: string,
  ) {
    return this.orchestrator.orchestrateRelease(dto, companyId);
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.orchestrator.getStatus(id);
  }

  @Post('validate')
  async validate(
    @Body() dto: ValidateConfigDto,
    @CompanyId() companyId: string,
  ) {
    return this.validator.validateForProject(dto.projectId, companyId);
  }
}
```

### 6. DTO (Data Transfer Object)

**`snapshots/dto/create-snapshot.dto.ts`**
```typescript
import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class CreateSnapshotDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(50)
  version: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}
```

**`orchestration/dto/create-release.dto.ts`**
```typescript
import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateReleaseOptions {
  @IsBoolean()
  @IsOptional()
  createGithubRelease?: boolean;

  @IsBoolean()
  @IsOptional()
  notifyOnComplete?: boolean;
}

export class CreateReleaseDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(50)
  version: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  changelog?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @ValidateNested()
  @Type(() => CreateReleaseOptions)
  @IsOptional()
  options?: CreateReleaseOptions;
}
```

### 7. gRPC Controller

**`snapshots/grpc/snapshots.grpc.controller.ts`**
```typescript
import { Controller } from '@nestjs/common';
import { GrpcMethod, GrpcStreamMethod } from '@nestjs/microservices';
import { SnapshotsService } from '../services/snapshots.service';
import { Observable, Subject } from 'rxjs';

@Controller()
export class SnapshotsGrpcController {
  constructor(private readonly service: SnapshotsService) {}

  @GrpcMethod('SnapperService', 'GetSnapshot')
  async getSnapshot(data: { id: string }) {
    const snapshot = await this.service.findById(data.id);
    return this.toGrpcSnapshot(snapshot);
  }

  @GrpcMethod('SnapperService', 'GetSnapshotConfig')
  async getSnapshotConfig(data: { snapshotId: string }) {
    const snapshot = await this.service.findById(data.snapshotId);
    return snapshot.config;
  }

  @GrpcMethod('SnapperService', 'ListSnapshots')
  async listSnapshots(data: { projectId: string; page: number; pageSize: number }) {
    return this.service.findAll({
      projectId: data.projectId,
      page: data.page,
      pageSize: data.pageSize,
    });
  }

  @GrpcMethod('SnapperService', 'UpdateSnapshotStatus')
  async updateSnapshotStatus(data: { id: string; status: string }) {
    await this.service.updateStatus(data.id, data.status as any);
    return this.service.findById(data.id);
  }

  private toGrpcSnapshot(entity: any) {
    return {
      id: entity.id,
      projectId: entity.projectId,
      version: entity.version,
      status: entity.status,
      artifactKey: entity.artifactKey,
      artifactBackend: entity.artifactBackend,
      checksum: entity.checksum,
      sizeBytes: entity.sizeBytes,
      createdBy: entity.createdBy,
      companyId: entity.companyId,
    };
  }
}
```

### 8. Integration Client (gRPC клиент)

**`integrations/projects/projects.client.ts`**
```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { retry, timeout } from 'rxjs/operators';

export interface IProjectsService {
  GetProject(data: { id: string }): any;
  CreateRelease(data: any): any;
}

@Injectable()
export class ProjectsClient implements OnModuleInit {
  private readonly logger = new Logger(ProjectsClient.name);
  private projectsService: IProjectsService;

  constructor(
    @Inject('PROJECTS_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.projectsService = this.client.getService<IProjectsService>('ProjectsService');
  }

  async getProject(projectId: string) {
    this.logger.debug(`Getting project ${projectId}`);
    return firstValueFrom(
      this.projectsService.GetProject({ id: projectId }).pipe(
        timeout(5000),
        retry(3),
      ),
    );
  }

  async createRelease(data: {
    projectId: string;
    version: string;
    snapshotId: string;
    changelog?: string;
  }) {
    this.logger.log(`Creating release for project ${data.projectId} v${data.version}`);
    return firstValueFrom(
      this.projectsService.CreateRelease(data).pipe(
        timeout(10000),
        retry(2),
      ),
    );
  }
}
```

### 9. Integration Client (Artifact Storage)

**`integrations/artifact-storage/artifact-storage.client.ts`**
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { timeout, retry } from 'rxjs/operators';

export interface IArtifactStorageService {
  // Пример: Artifact Storage отдаёт signed URL для чтения артефакта
  GetSignedUrl(data: { backend: string; key: string; expiresIn?: number }): any;
}

@Injectable()
export class ArtifactStorageClient implements OnModuleInit {
  private readonly logger = new Logger(ArtifactStorageClient.name);
  private artifactStorageService: IArtifactStorageService;

  constructor(
    @Inject('ARTIFACT_STORAGE_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.artifactStorageService =
      this.client.getService<IArtifactStorageService>('ArtifactStorageService');
  }

  async getSignedUrl(backend: string, key: string, expiresIn = 3600) {
    this.logger.debug(`GetSignedUrl for backend=${backend}, key=${key}`);
    return firstValueFrom(
      this.artifactStorageService
        .GetSignedUrl({ backend, key, expiresIn })
        .pipe(timeout(5000), retry(3)),
    );
  }
}
```

### 10. Interface (Интерфейс)

**`storage/interfaces/storage.interface.ts`**
```typescript
export interface IStorageService {
  upload(bucket: string, key: string, data: Buffer): Promise<void>;
  download(bucket: string, key: string): Promise<Buffer>;
  getSignedUrl(bucket: string, key: string, expiresIn?: number): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
}
```

**`orchestration/interfaces/collected-config.interface.ts`**
```typescript
export interface CollectedConfig {
  project: {
    id: string;
    name: string;
    slug: string;
  };
  processes: Array<{
    id: string;
    name: string;
    type: string;
    config: Record<string, any>;
  }>;
  variables: {
    plain: Record<string, string>;
    secrets: Record<string, string>;
  };
  assets: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    metadata: Record<string, any>;
  }>;
  targets: Array<{
    id: string;
    platform: string;
    config: Record<string, any>;
  }>;
}
```

## Правила именования

### Файлы
- **Prisma models**: `src/database/schema.prisma`
- **DTOs**: `*.dto.ts` (например, `create-snapshot.dto.ts`)
- **Services**: `*.service.ts` (например, `snapshots.service.ts`)
- **Controllers**: `*.controller.ts` (например, `snapshots.controller.ts`)
- **Repositories**: `*.repository.ts` (например, `snapshots.repository.ts`)
- **Modules**: `*.module.ts` (например, `snapshots.module.ts`)
- **Interfaces**: `*.interface.ts` (например, `storage.interface.ts`)
- **Clients**: `*.client.ts` (например, `projects.client.ts`)
- **Tests**: `*.spec.ts` (например, `snapshots.service.spec.ts`)

### Классы
- **Prisma types**: берутся из сгенерированных типов Prisma (`@prisma/client`)
- **DTOs**: `*Dto` (например, `CreateSnapshotDto`)
- **Services**: `*Service` (например, `SnapshotsService`)
- **Controllers**: `*Controller` (например, `SnapshotsController`)
- **Repositories**: `*Repository` (например, `SnapshotsRepository`)
- **Clients**: `*Client` (например, `ProjectsClient`)

## Экспорты (index.ts)

Каждая папка должна иметь `index.ts` для удобного импорта:

**`snapshots/dto/index.ts`**
```typescript
export * from './create-snapshot.dto';
export * from './update-snapshot.dto';
export * from './snapshot-query.dto';
export * from './snapshot-response.dto';
```

## Импорты

### Правильный способ
```typescript
import { SnapshotsService } from '../services';
import { CreateSnapshotDto } from '../dto';
// Prisma types (например, SnapshotStatus) импортируются из @prisma/client при необходимости
```

### Неправильный способ
```typescript
import { SnapshotsService } from '../services/snapshots.service';
import { CreateSnapshotDto } from '../dto/create-snapshot.dto';
```
