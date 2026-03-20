# Руководство по масштабированию — Snapper Microservice

## Принципы работы с кодом

### 1. Добавление новой фичи

#### Шаг 1: Создать модуль (если новый домен)
```bash
src/
└── new-feature/
    ├── new-feature.module.ts
    ├── controllers/
    ├── grpc/
    ├── services/
    ├── repositories/
    ├── entities/
    ├── dto/
    ├── interfaces/
    └── __tests__/
```

#### Шаг 2: Регистрация в app.module.ts
```typescript
import { NewFeatureModule } from './new-feature/new-feature.module';

@Module({
  imports: [
    // ... существующие модули
    NewFeatureModule,
  ],
})
export class AppModule {}
```

#### Шаг 3: Добавить миграции (если нужна новая таблица)
```bash
src/database/migrations/
└── 0004-CreateNewFeatureTable.ts
```

#### Шаг 4: Обновить proto файлы (если нужен gRPC)
```bash
src/proto/
└── new-feature.proto
```

### 2. Добавление нового поля в существующую сущность

#### Шаг 1: Обновить Entity
```typescript
// snapshots/entities/snapshot.entity.ts
@Column({ type: 'varchar', length: 255, nullable: true, name: 'new_field' })
newField: string | null;
```

#### Шаг 2: Создать миграцию
```typescript
// database/migrations/0005-AddNewFieldToSnapshots.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewFieldToSnapshots0005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE snapshots ADD COLUMN new_field VARCHAR(255);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE snapshots DROP COLUMN new_field;
    `);
  }
}
```

#### Шаг 3: Обновить DTOs
```typescript
// snapshots/dto/create-snapshot.dto.ts
@IsString()
@IsOptional()
newField?: string;
```

#### Шаг 4: Обновить сервис (если нужна бизнес-логика)

### 3. Добавление нового эндпоинта

#### REST эндпоинт
```typescript
// snapshots/controllers/snapshots.controller.ts
@Get(':id/compare/:otherId')
async compare(
  @Param('id') id: string,
  @Param('otherId') otherId: string,
) {
  return this.service.compare(id, otherId);
}
```

#### gRPC метод
```typescript
// snapshots/grpc/snapshots.grpc.controller.ts
@GrpcMethod('SnapperService', 'CompareSnapshots')
async compareSnapshots(data: { id: string; otherId: string }) {
  return this.service.compare(data.id, data.otherId);
}
```

#### Не забыть обновить proto
```protobuf
// proto/snapper.proto
service SnapperService {
  // ... существующие методы
  rpc CompareSnapshots(CompareSnapshotsRequest) returns (CompareSnapshotsResponse);
}
```

### 4. Добавление интеграции с новым сервисом

#### Шаг 1: Создать клиент
```bash
src/integrations/
└── new-service/
    ├── index.ts
    ├── new-service.client.ts
    ├── new-service.interface.ts
    └── new-service.client.spec.ts
```

#### Шаг 2: Реализовать клиент
```typescript
// integrations/new-service/new-service.client.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { timeout, retry } from 'rxjs/operators';

@Injectable()
export class NewServiceClient implements OnModuleInit {
  private readonly logger = new Logger(NewServiceClient.name);
  private service: any;

  constructor(
    @Inject('NEW_SERVICE_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.service = this.client.getService('NewServiceService');
  }

  async getData(id: string) {
    this.logger.debug(`Getting data from new-service for ${id}`);
    return firstValueFrom(
      this.service.GetData({ id }).pipe(
        timeout(5000),
        retry(3),
      ),
    );
  }
}
```

#### Шаг 3: Зарегистрировать в integrations.module.ts
```typescript
import { NewServiceClient } from './new-service/new-service.client';

@Module({
  imports: [
    ClientsModule.register([{
      name: 'NEW_SERVICE_PACKAGE',
      transport: Transport.GRPC,
      options: {
        package: 'newservice.v1',
        protoPath: join(__dirname, '../proto/new-service.proto'),
        url: process.env.NEW_SERVICE_GRPC_URL,
      },
    }]),
  ],
  providers: [NewServiceClient],
  exports: [NewServiceClient],
})
export class IntegrationsModule {}
```

#### Шаг 4: Использовать в сервисе
```typescript
// orchestration/services/config-collector.service.ts
constructor(
  // ... существующие клиенты
  private readonly newServiceClient: NewServiceClient,
) {}
```

#### Шаг 5: Добавить ENV переменную
```env
NEW_SERVICE_GRPC_URL=new-service:50051
```

### 5. Добавление нового шага оркестрации

#### Шаг 1: Создать сервис для нового шага
```typescript
// orchestration/services/new-step.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CollectedConfig } from '../interfaces/collected-config.interface';

@Injectable()
export class NewStepService {
  private readonly logger = new Logger(NewStepService.name);

  async execute(config: CollectedConfig): Promise<CollectedConfig> {
    this.logger.log('Executing new step...');
    // Логика нового шага
    return config;
  }
}
```

#### Шаг 2: Добавить в orchestration.module.ts
```typescript
providers: [
  // ... существующие сервисы
  NewStepService,
],
```

#### Шаг 3: Интегрировать в release-orchestrator.service.ts
```typescript
// В buildInitialSteps — добавить новый шаг
{ name: 'new_step', status: 'pending' },

// В orchestrateRelease — вызвать новый шаг
await this.updateStep(orchestration.id, 'new_step', 'in_progress');
const afterNewStep = await this.newStepService.execute(withTemplates);
await this.updateStep(orchestration.id, 'new_step', 'completed');
```

## Паттерны для масштабирования

### 1. Разделение ответственности в оркестрации

#### Плохо: Вся логика в оркестраторе
```typescript
async orchestrateRelease(dto: CreateReleaseDto) {
  // Сбор данных
  const project = await this.projectsClient.getProject(dto.projectId);
  const processes = await this.processesClient.getProcesses(dto.projectId);
  const variables = await this.variablesClient.getVariables(dto.projectId);

  // Валидация (прямо тут)
  if (!project) throw new Error('Project not found');
  if (processes.length === 0) throw new Error('No processes');

  // Шаблоны (прямо тут)
  for (const process of processes) {
    process.config = this.renderTemplate(process.config, variables);
  }

  // ... и т.д. — 200 строк
}
```

#### Хорошо: Каждый шаг — отдельный сервис
```typescript
async orchestrateRelease(dto: CreateReleaseDto) {
  const config = await this.configCollector.collectAll(dto.projectId);
  await this.configValidator.validate(config);
  const rendered = await this.templateRenderer.render(config);
  // Snapper не разрешает секреты: секреты выдаются Variables по запросу Processes
  const snapshot = await this.snapshotBuilder.build(rendered, dto, companyId);
  await this.projectsClient.createRelease({ snapshotId: snapshot.id, ...dto });
}
```

### 2. Параллельный сбор данных

#### Плохо: Последовательные вызовы
```typescript
const project = await this.projectsClient.getProject(projectId);
const processes = await this.processesClient.getProcesses(projectId);
const variables = await this.variablesClient.getVariables(projectId);
const assets = await this.assetsClient.getAssets(projectId);
const targets = await this.targetsPlaneClient.getTargets(projectId);
// ~5 * RTT (round-trip time)
```

#### Хорошо: Параллельные вызовы
```typescript
const [project, processes, variables, assets, targets] = await Promise.all([
  this.projectsClient.getProject(projectId),
  this.processesClient.getProcesses(projectId),
  this.variablesClient.getVariables(projectId),
  this.assetsClient.getAssets(projectId),
  this.targetsPlaneClient.getTargets(projectId),
]);
// ~1 * max(RTT) — значительно быстрее
```

#### Ещё лучше: Graceful degradation
```typescript
const results = await Promise.allSettled([
  this.projectsClient.getProject(projectId),
  this.processesClient.getProcesses(projectId),
  this.variablesClient.getVariables(projectId),
  this.assetsClient.getAssets(projectId),
  this.targetsPlaneClient.getTargets(projectId),
]);

const [project, processes, variables, assets, targets] = results.map(
  (result, index) => {
    if (result.status === 'fulfilled') return result.value;
    this.logger.warn(`Service ${serviceNames[index]} failed: ${result.reason}`);
    return null;
  },
);

// Проверить обязательные данные
if (!project) throw new Error('Project data is required');
```

### 3. Retry и Circuit Breaker для gRPC вызовов

```typescript
import { timeout, retry, catchError } from 'rxjs/operators';
import { throwError, timer } from 'rxjs';

// Retry с exponential backoff
async callWithRetry<T>(observable: Observable<T>): Promise<T> {
  return firstValueFrom(
    observable.pipe(
      timeout(5000),
      retry({
        count: 3,
        delay: (error, retryCount) => {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          this.logger.warn(`Retry ${retryCount}, delay ${delay}ms: ${error.message}`);
          return timer(delay);
        },
      }),
      catchError((error) => {
        this.logger.error(`All retries failed: ${error.message}`);
        return throwError(() => error);
      }),
    ),
  );
}
```

### 4. Artifact Storage backend configuration

```typescript
// Работа с Artifact Storage (FS default / S3 opt-in) для конкретной компании/бэкенда
async uploadSnapshot(
  snapshotData: Buffer,
  companyId: string,
  artifactKey: string,
) {
  const companyConfig = await this.companyConfigService.getByCompanyId(companyId);

  // Создать backend-клиент для компании
  const backendClient = this.storageService.createClientForCompany({
    endpoint: companyConfig.s3Endpoint,
    region: companyConfig.s3Region,
    accessKey: companyConfig.s3AccessKey,
    secretKey: companyConfig.s3SecretKey,
  });

  await this.storageService.upload(
    companyConfig.s3Bucket,
    artifactKey,
    snapshotData,
    backendClient,
  );
}
```

### 5. Поток снапшота (через Artifact Storage)

```typescript
// Поток снапшота — зона Artifact Storage/Processes/Worker
@GrpcStreamMethod('ArtifactStorageService', 'GetSnapshotStream')
async *downloadSnapshot(data: { snapshotId: string }) {
  const snapshot = await this.snapshotsService.findById(data.snapshotId);
  const fileStream = await this.storageService.getStream(
    snapshot.artifactBackend,
    snapshot.artifactKey,
  );

  const chunkSize = 64 * 1024; // 64KB chunks
  let offset = 0;

  for await (const chunk of fileStream) {
    yield {
      data: chunk,
      offset,
      totalSize: snapshot.sizeBytes,
    };
    offset += chunk.length;
  }
}
```

### 6. Обработка ошибок в оркестрации

```typescript
// Специфичные ошибки
import { HttpException, HttpStatus } from '@nestjs/common';

// NotFoundException
if (!snapshot) {
  throw new NotFoundException(`Snapshot ${id} not found`);
}

// ConflictException
if (existing) {
  throw new ConflictException(`Snapshot for version ${version} already exists`);
}

// Ошибка валидации конфигурации
class ConfigValidationException extends HttpException {
  constructor(errors: string[], warnings: string[]) {
    super(
      { message: 'Configuration validation failed', errors, warnings },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

// Ошибка внешнего сервиса
class ServiceUnavailableException extends HttpException {
  constructor(serviceName: string) {
    super(
      `External service ${serviceName} is unavailable`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
```

## Оптимизация производительности

### 1. Пагинация для списков снапшотов

```typescript
async findAll(query: SnapshotQueryDto) {
  const { page = 1, pageSize = 20 } = query;
  const skip = (page - 1) * pageSize;

  const [items, total] = await this.repository.findAndCount({
    where: this.buildWhereClause(query),
    skip,
    take: pageSize,
    order: { createdAt: 'DESC' },
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
```

### 2. Индексы в БД

```typescript
// Entity с индексами
@Entity('snapshots')
@Index(['projectId'])
@Index(['companyId'])
@Index(['status'])
@Index(['projectId', 'version'], { unique: true })
@Index(['createdAt'])
export class SnapshotEntity {
  // ...
}
```

### 3. Кэширование company_config

```typescript
@Injectable()
export class CompanyConfigService {
  private cache = new Map<string, { config: CompanyConfigEntity; expiresAt: number }>();

  async getByCompanyId(companyId: string): Promise<CompanyConfigEntity> {
    const cached = this.cache.get(companyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.config;
    }

    const config = await this.repository.findByCompanyId(companyId);
    if (!config) {
      throw new NotFoundException(`Company config for ${companyId} not found`);
    }

    this.cache.set(companyId, {
      config,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 минут
    });

    return config;
  }

  invalidateCache(companyId: string) {
    this.cache.delete(companyId);
  }
}
```

### 4. Автоочистка просроченных снапшотов

```typescript
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SnapshotCleanupService {
  private readonly logger = new Logger(SnapshotCleanupService.name);

  constructor(
    private readonly repository: SnapshotsRepository,
    private readonly storageService: ArtifactStorageService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredSnapshots() {
    this.logger.log('Starting expired snapshot cleanup');

    const expired = await this.repository.findExpired();
    let cleaned = 0;

    for (const snapshot of expired) {
      try {
        await this.storageService.delete(snapshot.artifactBackend, snapshot.artifactKey);
        await this.repository.updateStatus(snapshot.id, SnapshotStatus.ARCHIVED);
        cleaned++;
      } catch (error) {
        this.logger.error(`Failed to cleanup snapshot ${snapshot.id}: ${error.message}`);
      }
    }

    this.logger.log(`Cleanup complete: ${cleaned}/${expired.length} snapshots archived`);
  }
}
```

## Тестирование

### 1. Unit тесты для оркестратора

```typescript
describe('ReleaseOrchestratorService', () => {
  let service: ReleaseOrchestratorService;
  let configCollector: ConfigCollectorService;
  let configValidator: ConfigValidatorService;
  let snapshotBuilder: SnapshotBuilderService;
  let projectsClient: ProjectsClient;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReleaseOrchestratorService,
        { provide: ConfigCollectorService, useValue: mockConfigCollector },
        { provide: ConfigValidatorService, useValue: mockConfigValidator },
        { provide: TemplateRendererService, useValue: mockTemplateRenderer },
        // SecretsResolverService removed: секреты выдаются Variables по запросу Processes
        { provide: SnapshotBuilderService, useValue: mockSnapshotBuilder },
        { provide: OrchestrationsRepository, useValue: mockOrchestrationsRepo },
        { provide: ProjectsClient, useValue: mockProjectsClient },
        { provide: GithubAgentsClient, useValue: mockGithubAgentsClient },
        { provide: EventsClient, useValue: mockEventsClient },
      ],
    }).compile();

    service = module.get(ReleaseOrchestratorService);
  });

  it('should orchestrate release creation successfully', async () => {
    // Arrange
    const dto: CreateReleaseDto = {
      projectId: 'project-1',
      version: '1.0.0',
      createdBy: 'user-1',
    };

    jest.spyOn(mockConfigCollector, 'collectAll').mockResolvedValue(mockCollectedConfig);
    jest.spyOn(mockConfigValidator, 'validate').mockResolvedValue({ valid: true });
    jest.spyOn(mockSnapshotBuilder, 'build').mockResolvedValue(mockSnapshot);

    // Act
    const result = await service.orchestrateRelease(dto, 'company-1');

    // Assert
    expect(mockConfigCollector.collectAll).toHaveBeenCalledWith('project-1');
    expect(mockConfigValidator.validate).toHaveBeenCalled();
    expect(mockSnapshotBuilder.build).toHaveBeenCalled();
    expect(mockProjectsClient.createRelease).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotId: mockSnapshot.id }),
    );
  });

  it('should fail orchestration on validation error', async () => {
    jest.spyOn(mockConfigCollector, 'collectAll').mockResolvedValue(mockCollectedConfig);
    jest.spyOn(mockConfigValidator, 'validate').mockResolvedValue({
      valid: false,
      errors: ['Missing required variable: DATABASE_URL'],
    });

    await expect(
      service.orchestrateRelease(dto, 'company-1'),
    ).rejects.toThrow('Config validation failed');
  });
});
```

### 2. Integration тесты для Artifact Storage

```typescript
describe('ArtifactStorageService (integration)', () => {
  let service: ArtifactStorageService;
  // Использовать MinIO в Docker через testcontainers

  it('should upload and download snapshot', async () => {
    const data = Buffer.from(JSON.stringify({ test: true }));
    const bucket = 'test-bucket';
    const key = 'test/snapshot.json';

    await service.upload(bucket, key, data);
    const downloaded = await service.download(bucket, key);

    expect(downloaded.toString()).toEqual(data.toString());
  });
});
```

## Работа с миграциями

### Создание миграции
```bash
# Генерация миграции из изменений entities
npx typeorm migration:generate src/database/migrations/MigrationName -d src/database/data-source.ts

# Создание пустой миграции
npx typeorm migration:create src/database/migrations/MigrationName
```

### Применение миграций
```bash
npx typeorm migration:run -d src/database/data-source.ts
```

### Откат миграции
```bash
npx typeorm migration:revert -d src/database/data-source.ts
```

## Логирование

### Структурированное логирование

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class ReleaseOrchestratorService {
  private readonly logger = new Logger(ReleaseOrchestratorService.name);

  async orchestrateRelease(dto: CreateReleaseDto, companyId: string) {
    this.logger.log({
      message: 'Starting release orchestration',
      projectId: dto.projectId,
      version: dto.version,
      companyId,
    });

    try {
      // ...
      this.logger.log({
        message: 'Release orchestration completed',
        snapshotId: snapshot.id,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      this.logger.error({
        message: 'Release orchestration failed',
        projectId: dto.projectId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}
```

## Best Practices

### Делать

1. Каждый шаг оркестрации — отдельный сервис (Single Responsibility)
2. Параллельный сбор данных из сервисов (Promise.all)
3. Retry с exponential backoff для gRPC вызовов
4. Стриминг для больших снапшотов
5. Кэширование company_config
6. Пагинация для списков
7. Структурированное логирование
8. Индексы в БД
9. Per-backend Artifact Storage конфигурация
10. Автоочистка просроченных снапшотов

### Не делать

1. Не смешивать бизнес-логику в контроллерах
2. Не делать последовательные gRPC вызовы, когда можно параллельно
3. Не хранить секреты в открытом виде
4. Не делать запросы без пагинации
5. Не игнорировать ошибки внешних сервисов
6. Не хардкодить URL-ы сервисов (использовать ENV)
7. Не загружать весь снапшот в память (стриминг)
8. Не создавать backend клиент на каждый запрос (переиспользовать)

## Чеклист для новой фичи

- [ ] Создать модуль (если новый домен)
- [ ] Создать entity с индексами
- [ ] Создать миграцию
- [ ] Создать repository
- [ ] Создать DTOs с валидацией
- [ ] Создать service с бизнес-логикой
- [ ] Создать REST controller
- [ ] Создать gRPC controller (если нужно)
- [ ] Обновить proto файлы (если gRPC)
- [ ] Добавить интеграцию (если новый сервис)
- [ ] Добавить обработку ошибок
- [ ] Добавить логирование
- [ ] Написать unit тесты
- [ ] Написать integration тесты
- [ ] Обновить ENV переменные
- [ ] Обновить документацию
