# Архитектура Snapper Microservice

## Принципы архитектуры

1. **Модульность** — каждый домен (snapshots/snapper-core, storage, integrations, health) изолирован в своем модуле
2. **Слоистость** — четкое разделение: controllers → services → repositories → entities
3. **Пайплайн Snapper** — Snapper валидирует конфигурацию и собирает иммутабельный снапшот (оркестрация деплоя — в Processes)
4. **SOLID** — следование принципам SOLID для расширяемости
5. **DDD** — Domain-Driven Design для бизнес-логики
6. **Интеграции через gRPC** — платформа общается напрямую по gRPC; аудит пишется в централизованный `Events` (без Kafka)
7. **Storage Abstraction** — абстракция над Artifact Storage (FS default / S3 opt-in) для тестируемости

## Что сделать до реализации Snapper (NestJS)
1. Зафиксировать gRPC контракты: какие методы экспонирует Snapper, какие методы нужны от `Projects`, `Variables` и `Artifact Storage`.
2. Определить модель снапшота “без секретов”: какие поля включает snapshot, где заканчивается ответственность Snapper и начинается ответственность Processes.
3. Прописать интерфейс `Artifact Storage`: формат ключей/контента, ожидаемые idempotency-ключи, SLA/таймауты и политика удаления/retention.
4. Спроектировать БД для снапшотов (таблицы + статусы) так, чтобы повторная доставка уведомлений от Agents была безопасной.
5. Уточнить поток взаимодействий: `Agents -> Snapper -> Projects/Events` (создание snapshot) и `Processes -> Artifact Storage` (получение snapshot + secrets пакет).

## Обзор модулей

```
┌─────────────────────────────────────────────────────┐
│                     AppModule                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────┐ │
│  │  Snapshots  │  │ Orchestration │  │  Delivery  │ │
│  │   Module    │  │    Module     │  │   Module   │ │
│  │             │  │               │  │            │ │
│  │ CRUD        │  │ Сбор данных   │  │ Выдача     │ │
│  │ Artifact     │  │ Валидация     │  │ снапшотов  │ │
│  │ Метаданные  │  │ Шаблоны       │  │ worker-ам  │ │
│  │             │  │ (без секретов) │  │            │ │
│  └──────┬──────┘  └──────┬────────┘  └─────┬──────┘ │
│         │                │                 │        │
│  ┌──────▼──────┐  ┌──────▼────────┐  ┌────▼──────┐ │
│  │   Storage   │  │ Integrations  │  │  Company  │ │
│  │   Module    │  │    Module     │  │  Config   │ │
│  │             │  │               │  │  Module   │ │
│  │ Artifact Storage абстракц.│  │ gRPC клиенты │  │           │ │
│  └─────────────┘  └───────────────┘  └───────────┘ │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │  Common  │  │  Health  │  │ Metrics  │         │
│  │  Module  │  │  Module  │  │  Module  │         │
│  └──────────┘  └──────────┘  └──────────┘         │
│                                                     │
│  ┌──────────┐  ┌──────────┐                        │
│  │  Config  │  │ Database │                        │
│  │  Module  │  │  Module  │                        │
│  └──────────┘  └──────────┘                        │
└─────────────────────────────────────────────────────┘
```

## Описание модулей

### 1. Snapshots Module — ядро снапшотов

**Ответственность:** CRUD операции со снапшотами, создание иммутабельных релизных снапшотов; хранение — в Artifact Storage.

**Компоненты:**
- `SnapshotsController` (REST) — API для фронтенда
- `SnapshotsGrpcController` (gRPC) — API для микросервисов
- `SnapshotsService` — бизнес-логика CRUD
- `SnapshotBuilderService` — формирование снапшота из собранных данных
- `SnapshotsRepository` — работа с БД
- `SnapshotEntity` — TypeORM сущность

**Зависимости:** ArtifactStorageModule, DatabaseModule, IntegrationsModule

### 2. Release Validation Module — валидация и сбор снапшота

**Ответственность:** Сбор (из готовых артефактов) и валидация релизной конфигурации. Результат — иммутабельный снапшот релиза. Разрешение секретов и деплой-оркестрация выполняются **Processes/Worker**.

**Компоненты:**
- `OrchestrationController` (REST) — API для запуска оркестрации
- `OrchestrationGrpcController` (gRPC) — API для межсервисного вызова
- `ReleaseOrchestratorService` — главный сервис оркестрации (pipeline шагов)
- `ConfigCollectorService` — параллельный сбор данных из сервисов
- `ConfigValidatorService` — валидация собранной конфигурации
- `TemplateRendererService` — обработка/нормализация шаблонов (без разрешения секретов)
- `VariablesClient` — валидация определения переменных для шаблонов (без расшифровки секретов)
- `OrchestrationsRepository` — отслеживание статуса оркестрации
- `OrchestrationEntity` — TypeORM сущность

**Зависимости:** SnapshotsModule, IntegrationsModule

### 3. Delivery Module — координация доставки

**Ответственность:** Предоставление снапшотов для worker при доставке релизов.

**Компоненты:**
- `DeliveryController` (REST) — API для фронтенда (статус доставки)
- `DeliveryGrpcController` (gRPC) — API для processes и worker
- `DeliveryService` — логика выдачи снапшотов

**Зависимости:** SnapshotsModule, StorageModule

### 4. Company Config Module — конфигурация компаний

**Ответственность:** Управление параметрами компаний (включая настройки бэкенда Artifact Storage, уведомления, лимиты).

**Компоненты:**
- `CompanyConfigController` (REST) — API для управления настройками
- `CompanyConfigService` — бизнес-логика
- `CompanyConfigRepository` — работа с БД
- `CompanyConfigEntity` — TypeORM сущность

**Зависимости:** DatabaseModule

### 5. Artifact Storage Module — абстракция Artifact Storage

**Ответственность:** Единый интерфейс для работы с Artifact Storage (FS default / S3 opt-in).

**Компоненты:**
- `ArtifactStorageService` — реализация через выбранный backend (локальная FS / S3-compatible)
- `IStorageService` — интерфейс (для тестирования и подмены реализации)

**Зависимости:** ConfigModule

### 6. Integrations Module — gRPC клиенты

**Ответственность:** Обертки над gRPC клиентами для всех внешних сервисов.

**Компоненты (по сервису):**
- `ProjectsClient` — gRPC клиент для projects
- `ProcessesClient` — gRPC клиент для processes
- `VariablesClient` — gRPC клиент для variables
- `AssetsClient` — gRPC клиент для assets
- `TargetsPlaneClient` — gRPC клиент для targets-plane
- `GithubAgentsClient` — gRPC клиент для github-agents
- `EventsClient` — gRPC клиент для events

**Паттерны:**
- Retry с exponential backoff
- Circuit breaker
- Timeout настройки
- Логирование вызовов

### 7. Common Module — общие компоненты

**Компоненты:**
- Декораторы: `@CompanyId()`, `@Public()`, `@Roles()`
- Фильтры: `HttpExceptionFilter`, `GrpcExceptionFilter`, `AllExceptionsFilter`
- Интерцепторы: `LoggingInterceptor`, `TransformInterceptor`, `TimeoutInterceptor`
- Guards: `AuthGuard`, `RolesGuard`
- Pipes: `ValidationPipe`, `ParseUuidPipe`
- Интерфейсы: `PaginationInterface`, `ResponseInterface`
- Утилиты: `uuid`, `json`, `crypto`
- Константы: error codes, statuses

### 8. Health Module — проверка здоровья

**Эндпоинты:**
- `GET /healthz` — liveness (приложение живо)
- `GET /readyz` — readiness (БД, Artifact Storage, gRPC подключения готовы)

### 9. Metrics Module — метрики

**Эндпоинт:** `GET /metrics` — Prometheus метрики

## Слои архитектуры

```
┌─────────────────────────────────────────────────────────────┐
│                    REST/gRPC Request                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Controller Layer                           │
│  • Валидация входных данных (DTOs, pipes)                   │
│  • Извлечение companyId, параметров                         │
│  • Маршрутизация к нужному сервису                          │
│  • REST: @Controller() / gRPC: @GrpcMethod()                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                              │
│  • Бизнес-логика и оркестрация                              │
│  • Валидация бизнес-правил                                  │
│  • Координация между модулями                               │
│  • Транзакционность операций                                │
│  • Pipeline шагов (Orchestrator Pattern)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
┌──────────────────┐ ┌──────────┐ ┌──────────────┐
│   Repository     │ │ Storage  │ │ Integration  │
│   Layer          │ │ Layer    │ │ Layer        │
│                  │ │          │ │              │
│ TypeORM          │ │ Artifact  │ │ gRPC клиенты │
│ PostgreSQL       │ │ MinIO    │ │ к сервисам   │
└──────────────────┘ └──────────┘ └──────────────┘
```

## Поток данных: Создание релиза

```
                          ┌────────────────┐
                          │ POST /api/     │
                          │ orchestration/ │
                          │ releases       │
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │ Orchestration  │
                          │ Controller     │
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │    Release     │
                          │  Orchestrator  │
                          │   Service      │
                          └───────┬────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
    ┌───────▼────────┐   ┌───────▼────────┐   ┌───────▼────────┐
    │ Config         │   │ Config         │   │ Template       │
    │ Collector      │   │ Validator      │   │ Renderer       │
    │ Service        │   │ Service        │   │ Service        │
    └───────┬────────┘   └────────────────┘   └────────────────┘
            │
  ┌─────────┼─────────┬─────────┬─────────┬─────────┐
  │         │         │         │         │         │
  ▼         ▼         ▼         ▼         ▼         │
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│proj. │ │proc. │ │vars. │ │asset │ │targ. │       │
│client│ │client│ │client│ │client│ │client│       │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘       │
                                                    │
                                            ┌───────▼────────┐
                                            │ (no secrets)   │
                                            └───────┬────────┘
                                                    │
                                            ┌───────▼────────┐
                                            │ Snapshot       │
                                            │ Builder        │
                                            │ Service        │
                                            └───────┬────────┘
                                                    │
                                       ┌────────────┼────────────┐
                                       │            │            │
                               ┌───────▼───┐ ┌─────▼─────┐ ┌───▼──────┐
                               │ Snapshots │ │ Artifact   │ │ Projects │
                               │   Repo    │ │  Service  │ │  Client  │
                               └───────────┘ └───────────┘ └──────────┘
                                                                │
                                                    ┌───────────┤
                                                    │           │
                                            ┌───────▼───┐ ┌────▼──────┐
                                            │ GitHub    │ │  Events   │
                                            │ Agents    │ │  Client   │
                                            │ Client    │ │           │
                                            └───────────┘ └───────────┘
```

## Паттерны и практики

### Orchestrator Pattern (Pipeline)

Оркестрация реализуется как pipeline шагов. Каждый шаг — отдельный сервис с единой ответственностью.

```typescript
// Псевдокод pipeline оркестрации
async orchestrateRelease(request: CreateReleaseRequest): Promise<OrchestrationResult> {
  const orchestration = await this.createOrchestration(request);

  try {
    // Шаг 1: Сбор данных (параллельно)
    await this.updateStep(orchestration, 'collect_data', 'in_progress');
    const collectedData = await this.configCollector.collectAll(request.projectId);
    await this.updateStep(orchestration, 'collect_data', 'completed');

    // Шаг 2: Валидация
    await this.updateStep(orchestration, 'validate_config', 'in_progress');
    await this.configValidator.validate(collectedData);
    await this.updateStep(orchestration, 'validate_config', 'completed');

    // Шаг 3: Шаблоны
    await this.updateStep(orchestration, 'process_templates', 'in_progress');
    const rendered = await this.templateRenderer.render(collectedData);
    await this.updateStep(orchestration, 'process_templates', 'completed');

    // Шаг 4: Секреты
    await this.updateStep(orchestration, 'resolve_secrets', 'in_progress');
    const withSecrets = await this.secretsResolver.resolve(rendered);
    await this.updateStep(orchestration, 'resolve_secrets', 'completed');

    // Шаг 5: Создание снапшота
    await this.updateStep(orchestration, 'create_snapshot', 'in_progress');
    const snapshot = await this.snapshotBuilder.build(withSecrets);
    await this.updateStep(orchestration, 'create_snapshot', 'completed');

    // Шаг 6: Создание Release в projects
    await this.updateStep(orchestration, 'create_release', 'in_progress');
    await this.projectsClient.createRelease(snapshot.id, request);
    await this.updateStep(orchestration, 'create_release', 'completed');

    // Шаг 7: GitHub релиз
    if (request.createGithubRelease) {
      await this.updateStep(orchestration, 'create_github_release', 'in_progress');
      await this.githubAgentsClient.createRelease(snapshot);
      await this.updateStep(orchestration, 'create_github_release', 'completed');
    }

    // Шаг 8: События
    await this.updateStep(orchestration, 'send_events', 'in_progress');
    await this.eventsClient.sendReleaseCreated(snapshot, request.createdBy);
    await this.updateStep(orchestration, 'send_events', 'completed');

    return this.completeOrchestration(orchestration, 'completed');
  } catch (error) {
    return this.failOrchestration(orchestration, error);
  }
}
```

### Dependency Injection
- Все зависимости через конструкторы
- NestJS DI контейнер
- Интерфейсы для абстракций (IStorageService)

### Repository Pattern
- Абстракция доступа к данным
- TypeORM репозитории
- Отдельный репозиторий для каждой сущности

### Service Layer Pattern
- Бизнес-логика только в сервисах
- Контроллеры тонкие — только маршрутизация
- Один сервис — одна ответственность

### DTO Pattern
- Отдельные DTO для создания, обновления, запросов, ответов
- Валидация через class-validator
- Трансформация через class-transformer

### Storage Abstraction
- Интерфейс `IStorageService` для работы с хранилищами
- Реализация через Artifact Storage
- Возможность подмены для тестов (in-memory)

## Тестирование

### Unit тесты
- Тесты для каждого сервиса оркестрации
- Тесты для snapshot builder
- Тесты для Artifact Storage (мок выбранного backend)
- Тесты для company-config service
- Моки для gRPC клиентов

### Integration тесты
- Тесты REST API (supertest)
- Тесты gRPC методов
- Тесты с реальным PostgreSQL (testcontainers)
- Тесты с MinIO (testcontainers)

### E2E тесты
- Полный flow создания релиза
- Скачивание снапшота
- Валидация конфигурации (dry run)

## Безопасность

### Аутентификация
- JWT токены через auth service
- Guard для проверки токенов
- mTLS для gRPC между сервисами

### Авторизация
- RBAC (Role-Based Access Control)
- Изоляция по companyId
- Проверка прав на каждой операции

### Защита данных
- Snapper хранит только безсекретные данные снапшота/метаданные; секреты шифруются и выдаются **Variables** по запросу **Processes**
- Artifact Storage хранит иммутабельные снапшоты (FS default / S3 opt-in)
- Аудит: ключевые шаги фиксируются централизованно сервисом **Events**

## Мониторинг и логирование

### Структурированное логирование
```json
{
  "level": "info",
  "timestamp": "2026-02-12T10:00:00Z",
  "service": "snapper",
  "correlationId": "uuid",
  "companyId": "uuid",
  "message": "Snapshot created",
  "context": {
    "snapshotId": "uuid",
    "projectId": "uuid",
    "version": "1.0.0",
    "durationMs": 3420
  }
}
```

### Уровни логирования
- `error` — ошибки, требующие внимания
- `warn` — предупреждения (недоступность сервиса, retry)
- `info` — ключевые операции (создание снапшота, оркестрация)
- `debug` — детальная информация для отладки

### Health Checks
- **Liveness** (`/healthz`): приложение запущено
- **Readiness** (`/readyz`): БД подключена, Artifact Storage доступен, gRPC клиенты инициализированы

## Масштабирование

### Горизонтальное
- Stateless архитектура
- Каждый инстанс snapper независим
- БД и Artifact Storage как внешние зависимости
- Connection pooling

### Вертикальное
- Оптимизация запросов к БД (индексы)
- Параллельный сбор данных (Promise.all)
- Стриминг больших снапшотов (gRPC streams)
- Кэширование company_config

### Добавление новых фич
1. Создать новый модуль в `src/`
2. Определить entities, repositories, services, controllers
3. Зарегистрировать модуль в `app.module.ts`
4. Добавить миграции при необходимости
5. Обновить proto файлы (если gRPC)
6. Добавить интеграционный клиент (если новый сервис)
