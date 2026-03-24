# Руководство по масштабированию — Snapper Microservice

## Принципы работы с кодом

### 1. Добавление новой фичи

#### Шаг 1: Создать модуль (если новый домен)
```bash
src/
└── new-feature/
    ├── new-feature.module.ts
    ├── grpc/
    ├── services/
    ├── repositories/
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

#### Шаг 3: Добавить Prisma model и миграцию (если нужна новая таблица)
```bash
# Добавить model в src/database/schema.prisma, затем:
bunx prisma migrate dev --name add-new-feature-table
```

#### Шаг 4: Обновить proto файлы (если нужен gRPC)
```bash
src/proto/
└── snapper.proto    # Добавить новые rpc методы
```

### 2. Добавление нового поля в существующую модель

#### Шаг 1: Обновить Prisma schema
```prisma
// database/schema.prisma
model Snapshot {
  // ... существующие поля
  newField  String?   @map("new_field")
}
```

#### Шаг 2: Создать миграцию
```bash
bunx prisma migrate dev --name add-new-field-to-snapshots
```

#### Шаг 3: Обновить DTOs
```typescript
// snapshots/dto/create-snapshot.dto.ts
@IsString()
@IsOptional()
newField?: string;
```

#### Шаг 4: Обновить сервис (если нужна бизнес-логика)

### 3. Добавление нового gRPC эндпоинта

#### Обновить proto
```protobuf
// proto/snapper.proto
service SnapperService {
  // ... существующие методы
  rpc CompareSnapshots(CompareSnapshotsRequest) returns (CompareSnapshotsResponse);
}
```

#### Добавить gRPC метод
```typescript
// snapshots/grpc/snapshots.grpc.controller.ts
@GrpcMethod('SnapperService', 'CompareSnapshots')
async compareSnapshots(data: { id: string; otherId: string }) {
  return this.service.compare(data.id, data.otherId);
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
      this.service.GetData({ id }).pipe(timeout(5000), retry(3)),
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

#### Шаг 4: Добавить ENV переменную
```env
NEW_SERVICE_GRPC_URL=new-service:50051
```

### 5. Добавление нового шага в pipeline сборки релиза

#### Шаг 1: Создать сервис для нового шага
```typescript
// release-assembly/services/new-step.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CollectedConfig } from '../interfaces/collected-config.interface';

@Injectable()
export class NewStepService {
  private readonly logger = new Logger(NewStepService.name);

  async execute(config: CollectedConfig): Promise<CollectedConfig> {
    this.logger.log('Executing new step...');
    return config;
  }
}
```

#### Шаг 2: Добавить в release-assembly.module.ts
```typescript
providers: [
  // ... существующие сервисы
  NewStepService,
],
```

#### Шаг 3: Интегрировать в release-assembly.service.ts
```typescript
// В buildInitialSteps — добавить новый шаг
{ name: 'new_step', status: 'pending' },

// В assembleRelease — вызвать новый шаг
await this.updateStep(assembly.id, 'new_step', 'in_progress');
const afterNewStep = await this.newStepService.execute(normalized);
await this.updateStep(assembly.id, 'new_step', 'completed');
```

## Паттерны для масштабирования

### 1. Разделение ответственности в pipeline

#### Плохо: Вся логика в одном сервисе
```typescript
async assembleRelease(notification: ArtifactNotificationDto) {
  const project = await this.projectsClient.getProject(notification.projectId);
  const variables = await this.variablesClient.getVariableDefinitions(notification.projectId);

  if (!project) throw new Error('Project not found');
  if (variables.length === 0) throw new Error('No variables defined');

  // ... 200 строк валидации, нормализации, сборки
}
```

#### Хорошо: Каждый шаг — отдельный сервис
```typescript
async assembleRelease(notification: ArtifactNotificationDto) {
  const config = await this.configCollector.collectAll(notification.projectId, notification.artifactKey);
  await this.configValidator.validate(config);
  const normalized = await this.templateRenderer.normalize(config);
  const snapshot = await this.snapshotBuilder.build(normalized, notification);
  await this.projectsClient.createRelease({ snapshotId: snapshot.id, ...notification });
}
```

### 2. Параллельный сбор данных

#### Плохо: Последовательные вызовы
```typescript
const project = await this.projectsClient.getProject(projectId);
const variables = await this.variablesClient.getVariableDefinitions(projectId);
const artifacts = await this.artifactStorageClient.getArtifacts(artifactKey);
// ~3 * RTT
```

#### Хорошо: Параллельные вызовы
```typescript
const [project, variables, artifacts] = await Promise.all([
  this.projectsClient.getProject(projectId),
  this.variablesClient.getVariableDefinitions(projectId),
  this.artifactStorageClient.getArtifacts(artifactKey),
]);
// ~1 * max(RTT)
```

#### Ещё лучше: Graceful degradation
```typescript
const results = await Promise.allSettled([
  this.projectsClient.getProject(projectId),
  this.variablesClient.getVariableDefinitions(projectId),
  this.artifactStorageClient.getArtifacts(artifactKey),
]);

const [project, variables, artifacts] = results.map(
  (result, index) => {
    if (result.status === 'fulfilled') return result.value;
    this.logger.warn(`Service ${serviceNames[index]} failed: ${result.reason}`);
    return null;
  },
);

if (!project) throw new Error('Project data is required');
if (!artifacts) throw new Error('Artifacts are required');
```

### 3. Retry и Circuit Breaker для gRPC вызовов

```typescript
import { timeout, retry, catchError } from 'rxjs/operators';
import { throwError, timer } from 'rxjs';

async callWithRetry<T>(observable: Observable<T>): Promise<T> {
  return firstValueFrom(
    observable.pipe(
      timeout(5000),
      retry({
        count: 3,
        delay: (error, retryCount) => {
          const delay = Math.pow(2, retryCount) * 1000;
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

### 4. Обработка ошибок в pipeline

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

if (!snapshot) {
  throw new NotFoundException(`Snapshot ${id} not found`);
}

if (existing) {
  throw new ConflictException(`Snapshot for version ${version} already exists`);
}

class ConfigValidationException extends HttpException {
  constructor(errors: string[], warnings: string[]) {
    super(
      { message: 'Configuration validation failed', errors, warnings },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

class ExternalServiceUnavailableException extends HttpException {
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

  const [items, total] = await this.db.$transaction([
    this.db.snapshot.findMany({
      where: this.buildWhereClause(query),
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    this.db.snapshot.count({ where: this.buildWhereClause(query) }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
```

### 2. Индексы в БД (Prisma)

```prisma
model Snapshot {
  // ... поля

  @@index([projectId])
  @@index([status])
  @@index([createdAt])
  @@unique([projectId, version])
}
```

### 3. Кэширование данных проекта (TTL-based)

```typescript
@Injectable()
export class ProjectsCacheService {
  private cache = new Map<string, { data: any; expiresAt: number }>();

  async getProject(projectId: string, fetcher: () => Promise<any>) {
    const cached = this.cache.get(projectId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const data = await fetcher();
    this.cache.set(projectId, {
      data,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return data;
  }

  invalidate(projectId: string) {
    this.cache.delete(projectId);
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
    private readonly artifactStorageClient: ArtifactStorageClient,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredSnapshots() {
    this.logger.log('Starting expired snapshot cleanup');

    const expired = await this.repository.findExpired();
    let cleaned = 0;

    for (const snapshot of expired) {
      try {
        await this.artifactStorageClient.deleteArtifact(snapshot.artifactKey);
        await this.repository.updateStatus(snapshot.id, 'ARCHIVED');
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

### 1. Unit тесты для pipeline сборки

```typescript
describe('ReleaseAssemblyService', () => {
  let service: ReleaseAssemblyService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ReleaseAssemblyService,
        { provide: ConfigCollectorService, useValue: mockConfigCollector },
        { provide: ConfigValidatorService, useValue: mockConfigValidator },
        { provide: TemplateRendererService, useValue: mockTemplateRenderer },
        { provide: SnapshotBuilderService, useValue: mockSnapshotBuilder },
        { provide: ReleaseAssembliesRepository, useValue: mockAssembliesRepo },
        { provide: ProjectsClient, useValue: mockProjectsClient },
        { provide: EventsClient, useValue: mockEventsClient },
      ],
    }).compile();

    service = module.get(ReleaseAssemblyService);
  });

  it('should assemble release successfully', async () => {
    const notification: ArtifactNotificationDto = {
      projectId: 'project-1',
      artifactKey: 'artifacts/project-1/abc123',
      version: '1.0.0',
    };

    jest.spyOn(mockConfigCollector, 'collectAll').mockResolvedValue(mockCollectedConfig);
    jest.spyOn(mockConfigValidator, 'validate').mockResolvedValue({ valid: true });
    jest.spyOn(mockSnapshotBuilder, 'build').mockResolvedValue(mockSnapshot);

    const result = await service.assembleRelease(notification);

    expect(mockConfigCollector.collectAll).toHaveBeenCalledWith('project-1', notification.artifactKey);
    expect(mockConfigValidator.validate).toHaveBeenCalled();
    expect(mockSnapshotBuilder.build).toHaveBeenCalled();
    expect(mockProjectsClient.createRelease).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotId: mockSnapshot.id }),
    );
  });

  it('should fail assembly on validation error', async () => {
    jest.spyOn(mockConfigCollector, 'collectAll').mockResolvedValue(mockCollectedConfig);
    jest.spyOn(mockConfigValidator, 'validate').mockResolvedValue({
      valid: false,
      errors: ['Missing required variable: DATABASE_URL'],
    });

    await expect(
      service.assembleRelease(notification),
    ).rejects.toThrow('Config validation failed');
  });
});
```

### 2. Integration тесты с testcontainers

```typescript
describe('SnapshotsRepository (integration)', () => {
  let repository: SnapshotsRepository;

  beforeAll(async () => {
    // PostgreSQL testcontainer + Prisma migrate
  });

  it('should create and find snapshot', async () => {
    const created = await repository.create({
      projectId: 'project-1',
      version: '1.0.0',
      status: 'BUILDING',
      artifactKey: 'snapshots/project-1/1.0.0/test.json',
    });

    const found = await repository.findById(created.id);
    expect(found).toBeDefined();
    expect(found!.version).toBe('1.0.0');
  });

  it('should enforce unique project+version constraint', async () => {
    await repository.create({
      projectId: 'project-1',
      version: '2.0.0',
      status: 'BUILDING',
      artifactKey: 'key-1',
    });

    await expect(
      repository.create({
        projectId: 'project-1',
        version: '2.0.0',
        status: 'BUILDING',
        artifactKey: 'key-2',
      }),
    ).rejects.toThrow();
  });
}
```

## Работа с миграциями (Prisma)

### Создание миграции
```bash
# Применить изменения schema.prisma и создать миграцию
bunx prisma migrate dev --name migration-name

# Сгенерировать Prisma Client без создания миграции
bunx prisma generate
```

### Применение миграций (production)
```bash
bunx prisma migrate deploy
```

### Сброс БД (только dev)
```bash
bunx prisma migrate reset
```

## Логирование

### Структурированное логирование

```typescript
import { Logger } from '@nestjs/common';

@Injectable()
export class ReleaseAssemblyService {
  private readonly logger = new Logger(ReleaseAssemblyService.name);

  async assembleRelease(notification: ArtifactNotificationDto) {
    const startTime = Date.now();

    this.logger.log({
      message: 'Starting release assembly',
      projectId: notification.projectId,
      version: notification.version,
    });

    try {
      // ... pipeline steps ...

      this.logger.log({
        message: 'Release assembly completed',
        snapshotId: snapshot.id,
        durationMs: Date.now() - startTime,
      });
    } catch (error) {
      this.logger.error({
        message: 'Release assembly failed',
        projectId: notification.projectId,
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

1. Каждый шаг pipeline — отдельный сервис (Single Responsibility)
2. Параллельный сбор данных из сервисов (Promise.all)
3. Retry с exponential backoff для gRPC вызовов
4. Idempotency: повторное уведомление от Agents не создаёт дубликат
5. Пагинация для списков
6. Структурированное логирование с correlationId
7. Индексы в БД (Prisma @@index)
8. Автоочистка просроченных снапшотов

### Не делать

1. Не смешивать бизнес-логику в контроллерах
2. Не делать последовательные gRPC вызовы, когда можно параллельно
3. Не обращаться к Variables за значениями секретов (только за определениями)
4. Не делать запросы без пагинации
5. Не игнорировать ошибки внешних сервисов
6. Не хардкодить URL-ы сервисов (использовать ENV)
7. Не расширять зону ответственности Snapper (деплой, git, секреты — чужие домены)

## Чеклист для новой фичи

- [ ] Добавить Prisma model в `schema.prisma`
- [ ] Создать миграцию (`bunx prisma migrate dev`)
- [ ] Создать repository
- [ ] Создать DTOs с валидацией
- [ ] Создать service с бизнес-логикой
- [ ] Создать gRPC controller
- [ ] Обновить proto файлы
- [ ] Добавить интеграцию (если новый сервис)
- [ ] Добавить обработку ошибок
- [ ] Добавить логирование
- [ ] Написать unit тесты
- [ ] Написать integration тесты
- [ ] Обновить ENV переменные
- [ ] Обновить документацию
