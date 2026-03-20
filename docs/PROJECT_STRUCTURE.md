# Структура проекта — Snapper Microservice

## Полное дерево директорий

```
snapper-microservice/
│
├── .agents/                         # Документация для AI агентов
│   ├── guide.md                     # Требования и спецификация
│   ├── guides/
│   │   ├── ARCHITECTURE.md          # Архитектура
│   │   ├── PROJECT_STRUCTURE.md     # Этот файл
│   │   ├── STRUCTURE_GUIDE.md       # Примеры кода
│   │   ├── SCALING_GUIDE.md         # Масштабирование
│   │   └── QUICK_REFERENCE.md       # Быстрая справка
│   └── skills/
│       └── nestjs-best-practices/
│
├── package.json
├── bun.lock
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
├── eslint.config.mjs
├── .prettierrc
├── .gitignore
├── .env.example                     # Пример переменных окружения
├── Dockerfile
├── docker-compose.yml               # Dev-окружение (PostgreSQL, MinIO)
├── README.md
│
├── src/
│   │
│   ├── main.ts                      # Точка входа (REST + gRPC серверы)
│   ├── app.module.ts                # Корневой модуль
│   │
│   ├── common/                      # Общие компоненты
│   │   ├── common.module.ts
│   │   │
│   │   ├── decorators/
│   │   │   ├── index.ts
│   │   │   ├── company-id.decorator.ts    # @CompanyId() — извлечение из запроса
│   │   │   ├── public.decorator.ts        # @Public() — без авторизации
│   │   │   └── roles.decorator.ts         # @Roles() — требуемые роли
│   │   │
│   │   ├── filters/
│   │   │   ├── index.ts
│   │   │   ├── http-exception.filter.ts   # Обработка HTTP ошибок
│   │   │   ├── grpc-exception.filter.ts   # Обработка gRPC ошибок
│   │   │   └── all-exceptions.filter.ts   # Глобальный обработчик
│   │   │
│   │   ├── interceptors/
│   │   │   ├── index.ts
│   │   │   ├── logging.interceptor.ts     # Логирование запросов
│   │   │   ├── transform.interceptor.ts   # Трансформация ответов
│   │   │   └── timeout.interceptor.ts     # Таймауты
│   │   │
│   │   ├── guards/
│   │   │   ├── index.ts
│   │   │   ├── auth.guard.ts             # Аутентификация (JWT)
│   │   │   └── roles.guard.ts            # Авторизация (RBAC)
│   │   │
│   │   ├── pipes/
│   │   │   ├── index.ts
│   │   │   ├── validation.pipe.ts        # Кастомная валидация
│   │   │   └── parse-uuid.pipe.ts        # Парсинг UUID
│   │   │
│   │   ├── interfaces/
│   │   │   ├── index.ts
│   │   │   ├── pagination.interface.ts   # Интерфейс пагинации
│   │   │   └── response.interface.ts     # Стандартный формат ответа
│   │   │
│   │   ├── utils/
│   │   │   ├── index.ts
│   │   │   ├── uuid.util.ts             # Генерация UUID
│   │   │   ├── json.util.ts             # Работа с JSON
│   │   │   ├── crypto.util.ts           # Шифрование/хеширование
│   │   │   └── retry.util.ts            # Retry с exponential backoff
│   │   │
│   │   └── constants/
│   │       ├── index.ts
│   │       ├── error-codes.const.ts     # Коды ошибок
│   │       ├── snapshot-status.const.ts # Статусы снапшотов
│   │       └── orchestration.const.ts   # Константы оркестрации
│   │
│   ├── config/                          # Конфигурация приложения
│   │   ├── config.module.ts
│   │   ├── config.service.ts
│   │   ├── config.interface.ts
│   │   └── configs/
│   │       ├── index.ts
│   │       ├── app.config.ts            # Порты, NODE_ENV
│   │       ├── database.config.ts       # PostgreSQL
│   │       ├── artifact-storage.config.ts # Artifact Storage backend настройки
│   │       └── grpc.config.ts           # gRPC URL-ы сервисов
│   │
│   ├── database/                        # Настройка БД
│   │   ├── database.module.ts
│   │   ├── database.providers.ts
│   │   └── migrations/
│   │       ├── 0001-CreateSnapshotsTable.ts
│   │       ├── 0002-CreateCompanyConfigsTable.ts
│   │       └── 0003-CreateOrchestrationsTable.ts
│   │
│   ├── snapshots/                       # Модуль снапшотов (CRUD + Artifact Storage)
│   │   ├── snapshots.module.ts
│   │   │
│   │   ├── controllers/
│   │   │   ├── index.ts
│   │   │   └── snapshots.controller.ts  # REST API
│   │   │
│   │   ├── grpc/
│   │   │   ├── index.ts
│   │   │   └── snapshots.grpc.controller.ts  # gRPC API
│   │   │
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   ├── snapshots.service.ts         # CRUD бизнес-логика
│   │   │   └── snapshot-builder.service.ts  # Формирование снапшота
│   │   │
│   │   ├── repositories/
│   │   │   ├── index.ts
│   │   │   └── snapshots.repository.ts
│   │   │
│   │   ├── entities/
│   │   │   ├── index.ts
│   │   │   └── snapshot.entity.ts
│   │   │
│   │   ├── dto/
│   │   │   ├── index.ts
│   │   │   ├── create-snapshot.dto.ts
│   │   │   ├── update-snapshot.dto.ts
│   │   │   ├── snapshot-query.dto.ts
│   │   │   └── snapshot-response.dto.ts
│   │   │
│   │   ├── interfaces/
│   │   │   ├── index.ts
│   │   │   ├── snapshot.interface.ts
│   │   │   └── snapshot-config.interface.ts
│   │   │
│   │   └── __tests__/
│   │       ├── snapshots.service.spec.ts
│   │       ├── snapshot-builder.service.spec.ts
│   │       ├── snapshots.controller.spec.ts
│   │       └── snapshots.repository.spec.ts
│   │
│   ├── orchestration/                   # Оркестрация создания релиза
│   │   ├── orchestration.module.ts
│   │   │
│   │   ├── controllers/
│   │   │   ├── index.ts
│   │   │   └── orchestration.controller.ts  # REST API
│   │   │
│   │   ├── grpc/
│   │   │   ├── index.ts
│   │   │   └── orchestration.grpc.controller.ts  # gRPC API
│   │   │
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   ├── release-orchestrator.service.ts  # Главный оркестратор
│   │   │   ├── config-collector.service.ts      # Сбор данных из сервисов
│   │   │   ├── config-validator.service.ts      # Валидация конфигурации
│   │   │   ├── template-renderer.service.ts     # Обработка/нормализация шаблонов (без секретов)
│   │   │   └── variables-validation.service.ts  # Валидация переменных (без расшифровки секретов)
│   │   │
│   │   ├── repositories/
│   │   │   ├── index.ts
│   │   │   └── orchestrations.repository.ts
│   │   │
│   │   ├── entities/
│   │   │   ├── index.ts
│   │   │   └── orchestration.entity.ts
│   │   │
│   │   ├── dto/
│   │   │   ├── index.ts
│   │   │   ├── create-release.dto.ts
│   │   │   ├── orchestration-status.dto.ts
│   │   │   └── validate-config.dto.ts
│   │   │
│   │   ├── interfaces/
│   │   │   ├── index.ts
│   │   │   ├── orchestration.interface.ts
│   │   │   ├── collected-config.interface.ts
│   │   │   └── orchestration-step.interface.ts
│   │   │
│   │   └── __tests__/
│   │       ├── release-orchestrator.service.spec.ts
│   │       ├── config-collector.service.spec.ts
│   │       ├── config-validator.service.spec.ts
│   │       ├── template-renderer.service.spec.ts
│   │       └── variables-validation.service.spec.ts
│   │
│   ├── delivery/                        # Координация доставки
│   │   ├── delivery.module.ts
│   │   │
│   │   ├── controllers/
│   │   │   ├── index.ts
│   │   │   └── delivery.controller.ts   # REST API
│   │   │
│   │   ├── grpc/
│   │   │   ├── index.ts
│   │   │   └── delivery.grpc.controller.ts  # gRPC API (для processes, worker)
│   │   │
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   └── delivery.service.ts
│   │   │
│   │   ├── dto/
│   │   │   ├── index.ts
│   │   │   ├── request-delivery.dto.ts
│   │   │   └── delivery-status.dto.ts
│   │   │
│   │   └── __tests__/
│   │       └── delivery.service.spec.ts
│   │
│   ├── company-config/                  # Конфигурация компаний
│   │   ├── company-config.module.ts
│   │   │
│   │   ├── controllers/
│   │   │   ├── index.ts
│   │   │   └── company-config.controller.ts
│   │   │
│   │   ├── services/
│   │   │   ├── index.ts
│   │   │   └── company-config.service.ts
│   │   │
│   │   ├── repositories/
│   │   │   ├── index.ts
│   │   │   └── company-config.repository.ts
│   │   │
│   │   ├── entities/
│   │   │   ├── index.ts
│   │   │   └── company-config.entity.ts
│   │   │
│   │   ├── dto/
│   │   │   ├── index.ts
│   │   │   ├── create-company-config.dto.ts
│   │   │   └── update-company-config.dto.ts
│   │   │
│   │   └── __tests__/
│   │       └── company-config.service.spec.ts
│   │
│   ├── storage/                         # (опционально) доменные интерфейсы для работы с Snapshot/Artifacts
│   │   ├── storage.module.ts
│   │   ├── interfaces/
│   │   │   ├── index.ts
│   │   │   └── storage.interface.ts     # контракт домена (например, IArtifactStorageClient)
│   │
│   ├── integrations/                    # gRPC клиенты внешних сервисов
│   │   ├── integrations.module.ts
│   │   │
│   │   ├── artifact-storage/
│   │   │   ├── index.ts
│   │   │   ├── artifact-storage.client.ts       # gRPC клиент к Artifact Storage
│   │   │   ├── artifact-storage.interface.ts    # типы/интерфейсы
│   │   │   └── artifact-storage.client.spec.ts
│   │   │
│   │   ├── projects/
│   │   │   ├── index.ts
│   │   │   ├── projects.client.ts       # gRPC клиент
│   │   │   ├── projects.interface.ts    # Типы
│   │   │   └── projects.client.spec.ts
│   │   │
│   │   ├── processes/
│   │   │   ├── index.ts
│   │   │   ├── processes.client.ts
│   │   │   ├── processes.interface.ts
│   │   │   └── processes.client.spec.ts
│   │   │
│   │   ├── variables/
│   │   │   ├── index.ts
│   │   │   ├── variables.client.ts
│   │   │   ├── variables.interface.ts
│   │   │   └── variables.client.spec.ts
│   │   │
│   │   ├── assets/
│   │   │   ├── index.ts
│   │   │   ├── assets.client.ts
│   │   │   ├── assets.interface.ts
│   │   │   └── assets.client.spec.ts
│   │   │
│   │   ├── targets-plane/
│   │   │   ├── index.ts
│   │   │   ├── targets-plane.client.ts
│   │   │   ├── targets-plane.interface.ts
│   │   │   └── targets-plane.client.spec.ts
│   │   │
│   │   ├── github-agents/
│   │   │   ├── index.ts
│   │   │   ├── github-agents.client.ts
│   │   │   ├── github-agents.interface.ts
│   │   │   └── github-agents.client.spec.ts
│   │   │
│   │   └── events/
│   │       ├── index.ts
│   │       ├── events.client.ts
│   │       ├── events.interface.ts
│   │       └── events.client.spec.ts
│   │
│   ├── health/                          # Health checks
│   │   ├── health.module.ts
│   │   ├── health.controller.ts         # /healthz, /readyz
│   │   └── health.service.ts            # Проверка БД, Artifact Storage, gRPC
│   │
│   ├── metrics/                         # Prometheus метрики
│   │   ├── metrics.module.ts
│   │   ├── metrics.service.ts           # Сбор метрик
│   │   └── metrics.controller.ts        # /metrics
│   │
│   └── proto/                           # Protocol Buffers
│       ├── snapper.proto                # Снапшоты
│       ├── delivery.proto               # Доставка
│       ├── orchestration.proto          # Оркестрация
│       └── generated/                   # Сгенерированные типы
│           └── .gitkeep
│
└── test/                                # E2E тесты
    ├── e2e/
    │   ├── snapshots.e2e-spec.ts
    │   ├── orchestration.e2e-spec.ts
    │   ├── delivery.e2e-spec.ts
    │   └── company-config.e2e-spec.ts
    ├── fixtures/
    │   ├── snapshots.fixture.ts
    │   ├── company-configs.fixture.ts
    │   └── collected-config.fixture.ts
    └── jest-e2e.json
```

## Поток данных (Data Flow)

```
┌─────────────────────────────────────────────────────────────┐
│                    REST/gRPC Request                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Controller Layer                           │
│  • Валидация входных данных (DTOs)                          │
│  • Извлечение companyId, параметров                         │
│  • Вызов сервиса                                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                              │
│  • Бизнес-логика и оркестрация                              │
│  • Валидация бизнес-правил                                  │
│  • Координация шагов pipeline                               │
│  • Вызов репозиториев, storage, integrations                │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
┌──────────────────┐ ┌──────────┐ ┌──────────────┐
│   Repository     │ │  Storage │ │ Integration  │
│   (PostgreSQL)   │ │  (Artifact Storage)    │ │ (gRPC)       │
└──────────────────┘ └──────────┘ └──────────────┘
```

## Зависимости между модулями

```
┌─────────────────┐
│    AppModule     │
└──────┬──────────┘
       │
       ├───► CommonModule
       │
       ├───► ConfigModule
       │
       ├───► DatabaseModule
       │
       ├───► StorageModule
       │     └──► ArtifactStorageService
       │
       ├───► CompanyConfigModule
       │     ├──► CompanyConfigRepository
       │     ├──► CompanyConfigService
       │     └──► CompanyConfigController (REST)
       │
       ├───► SnapshotsModule
       │     ├──► SnapshotsRepository
       │     ├──► SnapshotsService
       │     ├──► SnapshotBuilderService
       │     ├──► SnapshotsController (REST)
       │     └──► SnapshotsGrpcController (gRPC)
       │
       ├───► OrchestrationModule
       │     ├──► OrchestrationsRepository
       │     ├──► ReleaseOrchestratorService
       │     ├──► ConfigCollectorService
       │     ├──► ConfigValidatorService
       │     ├──► TemplateRendererService
       │     ├──► VariablesValidationService
       │     ├──► OrchestrationController (REST)
       │     └──► OrchestrationGrpcController (gRPC)
       │
       ├───► DeliveryModule
       │     ├──► DeliveryService
       │     ├──► DeliveryController (REST)
       │     └──► DeliveryGrpcController (gRPC)
       │
       ├───► IntegrationsModule
       │     ├──► ProjectsClient
       │     ├──► ProcessesClient
       │     ├──► VariablesClient
       │     ├──► AssetsClient
       │     ├──► TargetsPlaneClient
       │     ├──► GithubAgentsClient
       │     └──► EventsClient
       │
       ├───► HealthModule
       │
       └───► MetricsModule
```

## Быстрая навигация

- **Новый модуль?** → См. `STRUCTURE_GUIDE.md` → "Быстрый старт новой фичи"
- **Новое поле в entity?** → См. `SCALING_GUIDE.md` → "Добавление нового поля"
- **Новый эндпоинт?** → См. `SCALING_GUIDE.md` → "Добавление нового эндпоинта"
- **Новая интеграция?** → См. `SCALING_GUIDE.md` → "Добавление интеграции с новым сервисом"
- **Шаблоны кода?** → См. `QUICK_REFERENCE.md` → "Шаблоны кода"
- **Архитектура?** → См. `ARCHITECTURE.md`
- **Требования?** → См. `guide.md`
