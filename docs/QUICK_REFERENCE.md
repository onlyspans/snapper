# Быстрая справка — Snapper Microservice

## Что такое Snapper

**Snapper** — валидатор и сборщик релизов: принимает уведомление от Agents о готовых артефактах, валидирует конфигурацию через `Projects`/`Variables`, формирует иммутабельный снапшот релиза, сохраняет его в `Artifact Storage` и регистрирует в `Projects`.

Snapper **не разрешает секреты**, **не управляет деплоем** и **не работает с git**. Секреты и delivery-оркестрация — зона ответственности **Processes/Worker**.

## Структура папок (кратко)

```
src/
├── common/              # Общие компоненты (filters, interceptors, pipes, utils)
├── config/              # Конфигурация приложения (GRPC_PORT, DB, gRPC URLs)
├── database/            # Prisma schema, migrations, database service
├── snapshots/           # Метаданные снапшотов + координация с Artifact Storage
│   ├── grpc/            # gRPC API
│   ├── services/        # Бизнес-логика + snapshot builder
│   ├── repositories/    # Работа с БД (Prisma)
│   └── dto/             # Валидация данных
├── release-assembly/    # Сборка и валидация релиза (pipeline)
│   ├── grpc/            # gRPC API (входная точка для Agents)
│   ├── services/        # Pipeline: collect → validate → normalize → build
│   ├── repositories/    # Статус сборки
│   └── dto/             # Валидация данных
├── integrations/        # gRPC клиенты внешних сервисов
│   ├── projects/        # Валидация + регистрация релиза
│   ├── variables/       # Валидация определения переменных
│   ├── artifact-storage/# Получение/сохранение артефактов и снапшотов
│   └── events/          # Аудит
├── health/              # /healthz, /readyz (REST)
├── metrics/             # Prometheus /metrics (REST)
└── proto/               # Protocol Buffers определения
```

## Слои архитектуры

```mermaid
graph TB
    GrpcReq["gRPC Request (Gateway / Agents)"]
    Controller["gRPC Controller<br/>Валидация, маршрутизация"]
    Service["Service<br/>Бизнес-логика, pipeline"]
    Repo["Repository (Prisma)"]
    Integration["Integration (gRPC клиенты)"]

    GrpcReq --> Controller --> Service
    Service --> Repo
    Service --> Integration
```

## Основные потоки

### Создание релиза (Snapper)

```mermaid
graph LR
    A["Agents уведомляет"] --> B["Получение артефактов<br/>(Artifact Storage)"]
    B --> C["Валидация<br/>(Projects + Variables)"]
    C --> D["Нормализация<br/>шаблонов"]
    D --> E["Создание снапшота<br/>(Artifact Storage)"]
    E --> F["Регистрация релиза<br/>(Projects)"]
    F --> G["Аудит<br/>(Events)"]
```

### Доставка релиза (вне Snapper)

```mermaid
graph LR
    P["Processes"] -->|"снапшот из AS"| W["Worker"]
    W --> TC["Targets Controller"]
    TC --> Agent["Target Agent /<br/>K8s Agent"]
```

## Правила именования

| Тип | Суффикс файла | Суффикс класса | Пример |
|-----|--------------|----------------|--------|
| Prisma model | `schema.prisma` | (Prisma types) | `Snapshot`, `ReleaseAssembly` |
| DTO | `.dto.ts` | `*Dto` | `create-snapshot.dto.ts` / `CreateSnapshotDto` |
| Service | `.service.ts` | `*Service` | `snapshots.service.ts` / `SnapshotsService` |
| gRPC Controller | `.grpc.controller.ts` | `*GrpcController` | `snapshots.grpc.controller.ts` / `SnapshotsGrpcController` |
| Repository | `.repository.ts` | `*Repository` | `snapshots.repository.ts` / `SnapshotsRepository` |
| Module | `.module.ts` | `*Module` | `snapshots.module.ts` / `SnapshotsModule` |
| Client | `.client.ts` | `*Client` | `projects.client.ts` / `ProjectsClient` |
| Interface | `.interface.ts` | `I*` | `storage.interface.ts` / `IArtifactStorageService` |
| Test | `.spec.ts` | — | `snapshots.service.spec.ts` |

## Основные сущности (Prisma)

| Модель | Таблица | Назначение |
|--------|---------|------------|
| Snapshot | `snapshots` | Иммутабельный снапшот релиза; данные в Artifact Storage |
| ReleaseAssembly | `release_assemblies` | Статус pipeline сборки релиза |

## Статусы

### Snapshot
- `BUILDING` — снапшот создаётся
- `READY` — готов к использованию
- `FAILED` — ошибка создания
- `ARCHIVED` — архивирован

### ReleaseAssembly
- `IN_PROGRESS` — сборка идёт
- `COMPLETED` — сборка завершена
- `FAILED` — ошибка сборки
- `CANCELLED` — отменена

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

# База данных
bunx prisma migrate dev    # Применить миграции (dev)
bunx prisma generate       # Сгенерировать Prisma Client
bunx prisma studio         # Визуальный редактор БД
```

## Переменные окружения (ключевые)

```env
# App
GRPC_PORT=50051
NODE_ENV=development

# DB
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=snapper
DATABASE_URL=postgresql://user:pass@localhost:5432/snapper

# gRPC Services
PROJECTS_GRPC_URL=projects:50051
VARIABLES_GRPC_URL=variables:50051
ARTIFACT_STORAGE_GRPC_URL=artifact-storage:50051
EVENTS_GRPC_URL=events:50051
```

## Быстрый старт новой фичи

### 1. Создать структуру модуля
```bash
mkdir -p src/new-feature/{grpc,services,repositories,dto,interfaces,__tests__}
```

### 2. Создать основные файлы
- `new-feature.module.ts`
- `repositories/new-feature.repository.ts`
- `services/new-feature.service.ts`
- `grpc/new-feature.grpc.controller.ts`
- `dto/create-new-feature.dto.ts`

### 3. Добавить Prisma model в `schema.prisma`

### 4. Зарегистрировать в app.module.ts
```typescript
import { NewFeatureModule } from './new-feature/new-feature.module';

@Module({
  imports: [NewFeatureModule],
})
```

## Шаблоны кода

### Repository (Prisma)
```typescript
@Injectable()
export class EntityRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string) {
    return this.db.entity.findUnique({ where: { id } });
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

### gRPC Controller
```typescript
@Controller()
export class EntityGrpcController {
  constructor(private service: EntityService) {}

  @GrpcMethod('SnapperService', 'GetEntity')
  async getEntity(data: { id: string }) {
    return this.service.findById(data.id);
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
throw new NotFoundException(`Snapshot ${id} not found`);             // 404
throw new ConflictException(`Snapshot already exists`);              // 409
throw new BadRequestException('Invalid data');                       // 400
throw new UnprocessableEntityException('Config validation failed');  // 422
throw new ServiceUnavailableException('Service unavailable');        // 503
```

## Взаимодействие сервисов

| Направление | Сервис | Протокол | Что делает |
|-------------|--------|----------|------------|
| Входящий | Agents | gRPC | Уведомление о готовых артефактах |
| Входящий | Gateway | gRPC | Запросы от UI (статус, список снапшотов) |
| Исходящий | Artifact Storage | gRPC | Получение/сохранение артефактов и снапшотов |
| Исходящий | Projects | gRPC | Валидация окружений/targets, регистрация релиза |
| Исходящий | Variables | gRPC | Валидация определения переменных (без расшифровки) |
| Исходящий | Events | gRPC | Аудит: "release created" |

## Чеклист для новой фичи

- [ ] Prisma model в `schema.prisma`
- [ ] Миграция (`bunx prisma migrate dev`)
- [ ] Repository
- [ ] DTOs с валидацией
- [ ] Service с бизнес-логикой
- [ ] gRPC Controller
- [ ] Proto файлы
- [ ] Интеграция (если новый сервис)
- [ ] Обработка ошибок
- [ ] Логирование
- [ ] Unit тесты
- [ ] Integration тесты

## Полезные ссылки

- [ARCHITECTURE.md](ARCHITECTURE.md) — Детальная архитектура
- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — Дерево проекта
- [STRUCTURE_GUIDE.md](STRUCTURE_GUIDE.md) — Примеры кода
- [SCALING_GUIDE.md](SCALING_GUIDE.md) — Масштабирование и паттерны
