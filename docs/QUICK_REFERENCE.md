# Быстрая справка — Snapper Microservice

## Что такое Snapper

**Snapper** — валидатор и сборщик релизов: принимает подготовленные артефакты (через Agents), валидирует конфигурацию через `Projects`/`Variables`, формирует иммутабельный снапшот релиза и регистрирует его в `Projects`.
Секреты (plain/secrets) и delivery-оркестрация — зона ответственности **Processes/Worker**, а не Snapper.

## Структура папок (кратко)

```
src/
├── common/              # Общие компоненты (decorators, filters, guards, pipes, utils)
├── config/              # Конфигурация приложения (ports, DB, Artifact Storage, gRPC URLs)
├── database/            # Настройка БД, миграции
├── snapshots/           # Реестр снапшотов + сохранение иммутабельных данных в Artifact Storage
│   ├── controllers/     # REST API
│   ├── grpc/            # gRPC API
│   ├── services/        # Бизнес-логика + snapshot builder
│   ├── repositories/    # Работа с БД
│   ├── entities/        # TypeORM сущности
│   └── dto/             # Валидация данных
├── storage/             # Клиент/обёртка к отдельному сервису Artifact Storage (FS default / S3 opt-in)
├── integrations/        # gRPC клиенты внешних сервисов
│   ├── projects/
│   ├── processes/
│   ├── variables/
│   ├── assets/
│   ├── targets-plane/
│   ├── github-agents/
│   └── events/
├── health/              # /healthz, /readyz
├── metrics/             # Prometheus /metrics
└── proto/               # Protocol Buffers определения
```

## Слои архитектуры

```
Controller (REST/gRPC)
    ↓
Service (Бизнес-логика Snapper: валидация + сбор снапшота)
    ↓
Repository (БД) / Storage (Artifact Storage) / Integration (gRPC клиенты)
```

## Основные потоки

### Создание релиза
```
Agents уведомляет Snapper → Получение/нормализация артефактов → Валидация (Projects/Variables) → Снапшот (Artifact Storage) → Release (projects) → Event
```

### Доставка релиза
```
Processes (secrets + snapshot) → Worker → Target (доставка через Targets Controller и Agent)
```

## Правила именования

| Тип | Суффикс файла | Суффикс класса | Пример |
|-----|--------------|----------------|--------|
| Entity | `.entity.ts` | `*Entity` | `snapshot.entity.ts` / `SnapshotEntity` |
| DTO | `.dto.ts` | `*Dto` | `create-snapshot.dto.ts` / `CreateSnapshotDto` |
| Service | `.service.ts` | `*Service` | `snapshots.service.ts` / `SnapshotsService` |
| Controller | `.controller.ts` | `*Controller` | `snapshots.controller.ts` / `SnapshotsController` |
| Repository | `.repository.ts` | `*Repository` | `snapshots.repository.ts` / `SnapshotsRepository` |
| Module | `.module.ts` | `*Module` | `snapshots.module.ts` / `SnapshotsModule` |
| Client | `.client.ts` | `*Client` | `projects.client.ts` / `ProjectsClient` |
| Interface | `.interface.ts` | `I*` | `storage.interface.ts` / `IStorageService` |
| Test | `.spec.ts` | — | `snapshots.service.spec.ts` |

## Основные сущности

| Сущность | Таблица | Назначение |
|----------|---------|------------|
| Snapshot | `snapshots` | Иммутабельный снапшот релиза; данные хранятся в Artifact Storage |

## Статусы

### Snapshot
- `building` — снапшот создается
- `ready` — готов к использованию
- `failed` — ошибка создания
- `archived` — архивирован / удален

## Основные команды

```bash
# Разработка
bun run start:dev          # Запуск с hot-reload

# Сборка
bun run build              # Сборка проекта

# Тестирование
bun run test               # Unit тесты
bun run test:watch         # Тесты в watch режиме
bun run test:cov           # Покрытие кода
bun run test:e2e           # E2E тесты

# Линтинг
bun run lint               # Проверка кода
bun run format             # Форматирование кода
```

## Переменные окружения (ключевые)

```env
# App
SERVER_PORT=8080
GRPC_PORT=50051

# DB
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=snapper

# Artifact Storage
ARTIFACT_STORAGE_GRPC_URL=artifact-storage:50051

# gRPC Services
PROJECTS_GRPC_URL=projects:50051
PROCESSES_GRPC_URL=processes:50051
VARIABLES_GRPC_URL=variables:50051
ASSETS_GRPC_URL=assets:50051
TARGETS_PLANE_GRPC_URL=targets-plane:50051
GITHUB_AGENTS_GRPC_URL=github-agents:50051
EVENTS_GRPC_URL=events:50051
```

## Быстрый старт новой фичи

### 1. Создать структуру модуля
```bash
mkdir -p src/new-feature/{controllers,grpc,services,repositories,entities,dto,interfaces,__tests__}
```

### 2. Создать основные файлы
- `new-feature.module.ts`
- `entities/new-feature.entity.ts`
- `repositories/new-feature.repository.ts`
- `services/new-feature.service.ts`
- `controllers/new-feature.controller.ts`
- `dto/create-new-feature.dto.ts`

### 3. Зарегистрировать в app.module.ts
```typescript
import { NewFeatureModule } from './new-feature/new-feature.module';

@Module({
  imports: [NewFeatureModule],
})
```

## Шаблоны кода

### Entity
```typescript
@Entity('table_name')
@Index(['field_name'])
export class EntityName {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Repository
```typescript
@Injectable()
export class EntityRepository {
  constructor(
    @InjectRepository(EntityName)
    private repository: Repository<EntityName>,
  ) {}

  async findById(id: string): Promise<EntityName | null> {
    return this.repository.findOne({ where: { id } });
  }
}
```

### Service
```typescript
@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);

  constructor(private repository: EntityRepository) {}

  async findById(id: string) {
    const entity = await this.repository.findById(id);
    if (!entity) throw new NotFoundException(`Entity ${id} not found`);
    return entity;
  }
}
```

### Controller
```typescript
@Controller('api/entities')
export class EntityController {
  constructor(private service: EntityService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
```

### DTO
```typescript
export class CreateEntityDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsUUID()
  projectId: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
```

### gRPC Client
```typescript
@Injectable()
export class ServiceClient implements OnModuleInit {
  private service: any;

  constructor(@Inject('PACKAGE') private client: ClientGrpc) {}

  onModuleInit() {
    this.service = this.client.getService('ServiceName');
  }

  async getData(id: string) {
    return firstValueFrom(
      this.service.GetData({ id }).pipe(timeout(5000), retry(3)),
    );
  }
}
```

## Обработка ошибок

```typescript
// 404
if (!entity) throw new NotFoundException(`Entity ${id} not found`);

// 409
if (exists) throw new ConflictException(`Entity already exists`);

// 400
if (!valid) throw new BadRequestException('Invalid data');

// 422
throw new UnprocessableEntityException('Config validation failed');

// 503
throw new ServiceUnavailableException('External service unavailable');
```

## Логирование

```typescript
private readonly logger = new Logger(ServiceName.name);

this.logger.log('Operation started');
this.logger.error('Operation failed', error.stack);
this.logger.warn('Warning message');
this.logger.debug('Debug info');
```

## Пагинация

```typescript
async findAll(query: QueryDto) {
  const { page = 1, pageSize = 20 } = query;
  const skip = (page - 1) * pageSize;

  const [items, total] = await this.repository.findAndCount({
    skip,
    take: pageSize,
    order: { createdAt: 'DESC' },
  });

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
```

## Взаимодействие сервисов

| Направление | Сервис | Протокол | Что делает |
|-------------|--------|----------|------------|
| Исходящий | projects | gRPC | Структура проекта, создание Release |
| Исходящий | processes | gRPC | Процессы для снапшота |
| Исходящий | variables | gRPC | Переменные (plain + secrets) |
| Исходящий | assets | gRPC | Ассеты релиза |
| Исходящий | targets-plane | gRPC | Конфигурация платформ |
| Исходящий | github-agents | gRPC | Создание GitHub релиза |
| Исходящий | events | gRPC/Kafka | События о создании релиза |
| Входящий | processes | gRPC | Запрос снапшота для доставки |
| Входящий | worker | gRPC (stream) | Скачивание снапшота |
| Входящий | frontend | REST | Управление, просмотр статуса |

## Чеклист для новой фичи

- [ ] Entity с индексами
- [ ] Миграция БД
- [ ] Repository
- [ ] DTOs с валидацией
- [ ] Service с бизнес-логикой
- [ ] REST Controller
- [ ] gRPC Controller (если нужно)
- [ ] Proto файлы (если gRPC)
- [ ] Интеграция (если новый сервис)
- [ ] Обработка ошибок
- [ ] Логирование
- [ ] Unit тесты
- [ ] Integration тесты

## Полезные ссылки

- [guide.md](../guide.md) — Полные требования и спецификация
- [ARCHITECTURE.md](ARCHITECTURE.md) — Детальная архитектура
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — Дерево проекта
- [STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md) — Примеры кода
- [SCALING_GUIDE.md](SCALING_GUIDE.md) — Масштабирование и паттерны
- [Issue #10 — Snapper](https://github.com/onlyspans/issues/issues/10)
- [Issue #14 — Архитектура системы](https://github.com/onlyspans/issues/issues/14)
