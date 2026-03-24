# Руководство по структуре кода — Snapper Microservice

## Быстрый старт структуры

Этот документ описывает детальные примеры кода для каждого слоя snapper-microservice.

## Примеры структуры файлов

### 1. Модуль (Module)

**`snapshots/snapshots.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { SnapshotsGrpcController } from './grpc/snapshots.grpc.controller';
import { SnapshotsService } from './services/snapshots.service';
import { SnapshotBuilderService } from './services/snapshot-builder.service';
import { SnapshotsRepository } from './repositories/snapshots.repository';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [SnapshotsGrpcController],
  providers: [SnapshotsService, SnapshotBuilderService, SnapshotsRepository],
  exports: [SnapshotsService, SnapshotBuilderService],
})
export class SnapshotsModule {}
```

**`release-assembly/release-assembly.module.ts`**
```typescript
import { Module } from '@nestjs/common';
import { ReleaseAssemblyGrpcController } from './grpc/release-assembly.grpc.controller';
import { ReleaseAssemblyService } from './services/release-assembly.service';
import { ConfigCollectorService } from './services/config-collector.service';
import { ConfigValidatorService } from './services/config-validator.service';
import { TemplateRendererService } from './services/template-renderer.service';
import { ReleaseAssembliesRepository } from './repositories/release-assemblies.repository';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [SnapshotsModule, IntegrationsModule],
  controllers: [ReleaseAssemblyGrpcController],
  providers: [
    ReleaseAssemblyService,
    ConfigCollectorService,
    ConfigValidatorService,
    TemplateRendererService,
    ReleaseAssembliesRepository,
  ],
  exports: [ReleaseAssemblyService],
})
export class ReleaseAssemblyModule {}
```

### 2. Prisma Schema

**`src/database/schema.prisma`**
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

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
  checksum        String?
  sizeBytes       BigInt         @default(0)
  config          Json           @default("{}")
  metadata        Json           @default("{}")
  createdBy       String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  expiresAt       DateTime?

  @@index([projectId])
  @@index([status])
  @@unique([projectId, version])
}

enum AssemblyStatus {
  IN_PROGRESS
  COMPLETED
  FAILED
  CANCELLED
}

model ReleaseAssembly {
  id           String         @id @default(uuid())
  snapshotId   String?
  projectId    String
  status       AssemblyStatus @default(IN_PROGRESS)
  steps        Json           @default("[]")
  errorMessage String?
  createdBy    String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  completedAt  DateTime?

  @@index([snapshotId])
  @@index([projectId])
  @@index([status])
}
```

### 3. Repository (Prisma)

**`snapshots/repositories/snapshots.repository.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@database/database.service';
import { Prisma, SnapshotStatus } from '@prisma/client';
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
      ...(projectId && { projectId }),
      ...(status && { status }),
      ...(version && { version: { contains: version, mode: 'insensitive' } }),
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

  async updateStatus(id: string, status: SnapshotStatus) {
    await this.db.snapshot.update({ where: { id }, data: { status } });
  }

  async updateChecksumAndSize(id: string, checksum: string, sizeBytes: bigint) {
    await this.db.snapshot.update({ where: { id }, data: { checksum, sizeBytes } });
  }

  async findByProjectAndVersion(projectId: string, version: string) {
    return this.db.snapshot.findUnique({
      where: { projectId_version: { projectId, version } },
    });
  }

  async findExpired() {
    return this.db.snapshot.findMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { not: 'ARCHIVED' },
      },
    });
  }
}
```

### 4. Service

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
import { CreateSnapshotDto } from '../dto/create-snapshot.dto';
import { SnapshotQueryDto } from '../dto/snapshot-query.dto';
import { SnapshotStatus } from '@prisma/client';

@Injectable()
export class SnapshotsService {
  private readonly logger = new Logger(SnapshotsService.name);

  constructor(
    private readonly repository: SnapshotsRepository,
    private readonly artifactStorageClient: ArtifactStorageClient,
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

  async create(dto: CreateSnapshotDto) {
    const existing = await this.repository.findByProjectAndVersion(
      dto.projectId,
      dto.version,
    );
    if (existing) {
      throw new ConflictException(
        `Snapshot for project ${dto.projectId} version ${dto.version} already exists`,
      );
    }

    const artifactKey = `snapshots/${dto.projectId}/${dto.version}/${Date.now()}.json`;

    const snapshot = await this.repository.create({
      projectId: dto.projectId,
      version: dto.version,
      status: SnapshotStatus.BUILDING,
      artifactKey,
      createdBy: dto.createdBy,
    });

    this.logger.log(`Snapshot created: ${snapshot.id} for project ${dto.projectId}`);
    return snapshot;
  }

  async updateStatus(id: string, status: SnapshotStatus) {
    await this.findById(id);
    await this.repository.updateStatus(id, status);
    this.logger.log(`Snapshot ${id} status updated to ${status}`);
  }
}
```

**`release-assembly/services/release-assembly.service.ts`** (ключевой сервис)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigCollectorService } from './config-collector.service';
import { ConfigValidatorService } from './config-validator.service';
import { TemplateRendererService } from './template-renderer.service';
import { SnapshotBuilderService } from '../../snapshots/services/snapshot-builder.service';
import { ReleaseAssembliesRepository } from '../repositories/release-assemblies.repository';
import { ProjectsClient } from '../../integrations/projects/projects.client';
import { EventsClient } from '../../integrations/events/events.client';
import { ArtifactNotificationDto } from '../dto/artifact-notification.dto';

@Injectable()
export class ReleaseAssemblyService {
  private readonly logger = new Logger(ReleaseAssemblyService.name);

  constructor(
    private readonly configCollector: ConfigCollectorService,
    private readonly configValidator: ConfigValidatorService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly snapshotBuilder: SnapshotBuilderService,
    private readonly assembliesRepo: ReleaseAssembliesRepository,
    private readonly projectsClient: ProjectsClient,
    private readonly eventsClient: EventsClient,
  ) {}

  async assembleRelease(notification: ArtifactNotificationDto) {
    const assembly = await this.assembliesRepo.create({
      projectId: notification.projectId,
      createdBy: notification.triggeredBy,
      steps: this.buildInitialSteps(),
    });

    this.logger.log(`Starting assembly ${assembly.id} for project ${notification.projectId}`);

    try {
      // Шаг 1: Сбор данных из сервисов (параллельно)
      await this.updateStep(assembly.id, 'collect_data', 'in_progress');
      const collectedData = await this.configCollector.collectAll(
        notification.projectId,
        notification.artifactKey,
      );
      await this.updateStep(assembly.id, 'collect_data', 'completed');

      // Шаг 2: Валидация конфигурации
      await this.updateStep(assembly.id, 'validate_config', 'in_progress');
      const validationResult = await this.configValidator.validate(collectedData);
      if (!validationResult.valid) {
        throw new Error(`Config validation failed: ${validationResult.errors.join(', ')}`);
      }
      await this.updateStep(assembly.id, 'validate_config', 'completed');

      // Шаг 3: Нормализация шаблонов (плейсхолдеры переменных остаются как есть)
      await this.updateStep(assembly.id, 'normalize_templates', 'in_progress');
      const normalized = await this.templateRenderer.normalize(collectedData);
      await this.updateStep(assembly.id, 'normalize_templates', 'completed');

      // Шаг 4: Создание иммутабельного снапшота и сохранение в Artifact Storage
      await this.updateStep(assembly.id, 'create_snapshot', 'in_progress');
      const snapshot = await this.snapshotBuilder.build(normalized, notification);
      await this.assembliesRepo.updateSnapshotId(assembly.id, snapshot.id);
      await this.updateStep(assembly.id, 'create_snapshot', 'completed');

      // Шаг 5: Регистрация Release в Projects
      await this.updateStep(assembly.id, 'register_release', 'in_progress');
      await this.projectsClient.createRelease({
        projectId: notification.projectId,
        version: notification.version,
        snapshotId: snapshot.id,
      });
      await this.updateStep(assembly.id, 'register_release', 'completed');

      // Шаг 6: Аудит
      await this.updateStep(assembly.id, 'send_audit', 'in_progress');
      await this.eventsClient.sendReleaseCreated({
        snapshotId: snapshot.id,
        projectId: notification.projectId,
        version: notification.version,
      });
      await this.updateStep(assembly.id, 'send_audit', 'completed');

      await this.assembliesRepo.updateStatus(assembly.id, 'COMPLETED');
      this.logger.log(`Assembly ${assembly.id} completed successfully`);
      return this.assembliesRepo.findById(assembly.id);
    } catch (error) {
      this.logger.error(`Assembly ${assembly.id} failed: ${error.message}`, error.stack);
      await this.assembliesRepo.updateStatus(assembly.id, 'FAILED', error.message);
      throw error;
    }
  }

  private buildInitialSteps() {
    return [
      { name: 'collect_data', status: 'pending' as const },
      { name: 'validate_config', status: 'pending' as const },
      { name: 'normalize_templates', status: 'pending' as const },
      { name: 'create_snapshot', status: 'pending' as const },
      { name: 'register_release', status: 'pending' as const },
      { name: 'send_audit', status: 'pending' as const },
    ];
  }

  private async updateStep(assemblyId: string, stepName: string, status: string) {
    await this.assembliesRepo.updateStep(assemblyId, stepName, status);
  }
}
```

**`release-assembly/services/config-collector.service.ts`**
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ProjectsClient } from '../../integrations/projects/projects.client';
import { VariablesClient } from '../../integrations/variables/variables.client';
import { ArtifactStorageClient } from '../../integrations/artifact-storage/artifact-storage.client';
import { CollectedConfig } from '../interfaces/collected-config.interface';

@Injectable()
export class ConfigCollectorService {
  private readonly logger = new Logger(ConfigCollectorService.name);

  constructor(
    private readonly projectsClient: ProjectsClient,
    private readonly variablesClient: VariablesClient,
    private readonly artifactStorageClient: ArtifactStorageClient,
  ) {}

  async collectAll(projectId: string, artifactKey: string): Promise<CollectedConfig> {
    this.logger.log(`Collecting config for project ${projectId}`);

    const [project, variableDefinitions, artifacts] = await Promise.all([
      this.projectsClient.getProject(projectId),
      this.variablesClient.getVariableDefinitions(projectId),
      this.artifactStorageClient.getArtifacts(artifactKey),
    ]);

    this.logger.log(
      `Config collected for project ${projectId}: ` +
      `${variableDefinitions.length} variable definitions, ` +
      `${artifacts.length} artifacts`,
    );

    return { project, variableDefinitions, artifacts };
  }
}
```

### 5. gRPC Controller

**`release-assembly/grpc/release-assembly.grpc.controller.ts`**
```typescript
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ReleaseAssemblyService } from '../services/release-assembly.service';

@Controller()
export class ReleaseAssemblyGrpcController {
  constructor(private readonly service: ReleaseAssemblyService) {}

  @GrpcMethod('SnapperService', 'NotifyArtifactsReady')
  async notifyArtifactsReady(data: {
    projectId: string;
    artifactKey: string;
    version: string;
    triggeredBy?: string;
  }) {
    return this.service.assembleRelease(data);
  }

  @GrpcMethod('SnapperService', 'GetAssemblyStatus')
  async getAssemblyStatus(data: { id: string }) {
    return this.service.getStatus(data.id);
  }

  @GrpcMethod('SnapperService', 'ValidateConfig')
  async validateConfig(data: { projectId: string }) {
    return this.service.validateOnly(data.projectId);
  }
}
```

**`snapshots/grpc/snapshots.grpc.controller.ts`**
```typescript
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SnapshotsService } from '../services/snapshots.service';

@Controller()
export class SnapshotsGrpcController {
  constructor(private readonly service: SnapshotsService) {}

  @GrpcMethod('SnapperService', 'GetSnapshot')
  async getSnapshot(data: { id: string }) {
    return this.service.findById(data.id);
  }

  @GrpcMethod('SnapperService', 'ListSnapshots')
  async listSnapshots(data: { projectId: string; page: number; pageSize: number }) {
    return this.service.findAll({
      projectId: data.projectId,
      page: data.page,
      pageSize: data.pageSize,
    });
  }
}
```

### 6. DTO

**`release-assembly/dto/artifact-notification.dto.ts`**
```typescript
import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';

export class ArtifactNotificationDto {
  @IsUUID()
  projectId: string;

  @IsString()
  artifactKey: string;

  @IsString()
  @MaxLength(50)
  version: string;

  @IsString()
  @IsOptional()
  triggeredBy?: string;
}
```

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

### 7. Integration Client (gRPC)

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

**`integrations/variables/variables.client.ts`**
```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { timeout, retry } from 'rxjs/operators';

export interface IVariablesService {
  GetVariableDefinitions(data: { projectId: string }): any;
}

@Injectable()
export class VariablesClient implements OnModuleInit {
  private readonly logger = new Logger(VariablesClient.name);
  private variablesService: IVariablesService;

  constructor(
    @Inject('VARIABLES_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.variablesService =
      this.client.getService<IVariablesService>('VariablesService');
  }

  async getVariableDefinitions(projectId: string) {
    this.logger.debug(`Getting variable definitions for project ${projectId}`);
    return firstValueFrom(
      this.variablesService.GetVariableDefinitions({ projectId }).pipe(
        timeout(5000),
        retry(3),
      ),
    );
  }
}
```

**`integrations/artifact-storage/artifact-storage.client.ts`**
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { timeout, retry } from 'rxjs/operators';

export interface IArtifactStorageService {
  GetArtifacts(data: { key: string }): any;
  SaveSnapshot(data: { key: string; data: Buffer }): any;
}

@Injectable()
export class ArtifactStorageClient implements OnModuleInit {
  private readonly logger = new Logger(ArtifactStorageClient.name);
  private storageService: IArtifactStorageService;

  constructor(
    @Inject('ARTIFACT_STORAGE_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.storageService =
      this.client.getService<IArtifactStorageService>('ArtifactStorageService');
  }

  async getArtifacts(key: string) {
    this.logger.debug(`Getting artifacts for key=${key}`);
    return firstValueFrom(
      this.storageService.GetArtifacts({ key }).pipe(timeout(10000), retry(3)),
    );
  }

  async saveSnapshot(key: string, data: Buffer) {
    this.logger.debug(`Saving snapshot key=${key}`);
    return firstValueFrom(
      this.storageService.SaveSnapshot({ key, data }).pipe(timeout(30000), retry(2)),
    );
  }
}
```

### 8. Interface

**`release-assembly/interfaces/collected-config.interface.ts`**
```typescript
export interface CollectedConfig {
  project: {
    id: string;
    name: string;
    slug: string;
    environments: Array<{
      id: string;
      name: string;
    }>;
    targets: Array<{
      id: string;
      name: string;
      type: string;
    }>;
  };
  variableDefinitions: Array<{
    key: string;
    scope: string;
    isSecret: boolean;
  }>;
  artifacts: Array<{
    name: string;
    key: string;
    sizeBytes: number;
    checksum: string;
  }>;
}
```

## Правила именования

### Файлы
- **Prisma models**: `src/database/schema.prisma`
- **DTOs**: `*.dto.ts` (например, `artifact-notification.dto.ts`)
- **Services**: `*.service.ts` (например, `release-assembly.service.ts`)
- **gRPC Controllers**: `*.grpc.controller.ts` (например, `snapshots.grpc.controller.ts`)
- **Repositories**: `*.repository.ts` (например, `snapshots.repository.ts`)
- **Modules**: `*.module.ts` (например, `snapshots.module.ts`)
- **Interfaces**: `*.interface.ts` (например, `collected-config.interface.ts`)
- **Clients**: `*.client.ts` (например, `projects.client.ts`)
- **Tests**: `*.spec.ts` (например, `release-assembly.service.spec.ts`)

### Классы
- **Prisma types**: из `@prisma/client` (`Snapshot`, `ReleaseAssembly`, `SnapshotStatus`)
- **DTOs**: `*Dto` (например, `ArtifactNotificationDto`)
- **Services**: `*Service` (например, `ReleaseAssemblyService`)
- **gRPC Controllers**: `*GrpcController` (например, `SnapshotsGrpcController`)
- **Repositories**: `*Repository` (например, `SnapshotsRepository`)
- **Clients**: `*Client` (например, `ProjectsClient`)

## Экспорты (index.ts)

Каждая папка должна иметь `index.ts` для удобного импорта:

**`snapshots/dto/index.ts`**
```typescript
export * from './create-snapshot.dto';
export * from './snapshot-query.dto';
export * from './snapshot-response.dto';
```

## Импорты

### Правильный способ
```typescript
import { SnapshotsService } from '../services';
import { CreateSnapshotDto } from '../dto';
```

### Неправильный способ
```typescript
import { SnapshotsService } from '../services/snapshots.service';
import { CreateSnapshotDto } from '../dto/create-snapshot.dto';
```
