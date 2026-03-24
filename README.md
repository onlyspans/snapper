# Snapper Microservice

Snapper — gRPC-first микросервис для сборки неизменяемых (immutable) снапшотов релизов.
Сервис получает уведомления от Agents о готовности артефактов, валидирует конфигурацию релиза, нормализует итоговый payload, сохраняет снапшот в Artifact Storage и регистрирует метаданные релиза в Projects.

## Зона ответственности

- Принимать запросы на сборку релиза по gRPC (`NotifyArtifactsReady`)
- Валидировать конфигурацию проекта/окружения/релиза через внешние сервисы
- Формировать и сохранять неизменяемые снапшоты
- Хранить и отдавать статус шагов pipeline сборки
- Предоставлять операционные REST endpoint'ы: `GET /healthz`, `GET /readyz`, `GET /metrics`

## Что сервис не делает

- Расшифровка/резолв секретов
- Оркестрация деплоя
- Управление git-репозиториями

## Архитектура

- **Входящий трафик:** gRPC от Gateway/Agents
- **Доменные модули:** `snapshots`, `release-assembly`
- **Хранилище:** PostgreSQL через Prisma
- **Исходящие интеграции:** gRPC-клиенты (`projects`, `variables`, `artifact-storage`, `events`)
- **Операционные endpoint'ы:** REST для health-check и метрик Prometheus

Подробная документация находится в `docs/`:

- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/STRUCTURE_GUIDE.md`
- `docs/SCALING_GUIDE.md`
- `docs/QUICK_REFERENCE.md`

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```bash
cp .env.example .env
```

Основные переменные:

- `NODE_ENV`, `PORT`, `GRPC_PORT`, `CORS_ORIGIN`
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `DATABASE_URL`
- `DATABASE_LOG_LEVEL`, `DATABASE_LOG_QUERIES`
- `PROJECTS_GRPC_URL`, `VARIABLES_GRPC_URL`, `ARTIFACT_STORAGE_GRPC_URL`, `EVENTS_GRPC_URL`

## Локальная разработка

Установка зависимостей:

```bash
bun install
```

Генерация Prisma Client:

```bash
bun run prisma:generate
```

Запуск в watch-режиме:

```bash
bun run start:dev
```

Сборка и запуск production-бандла:

```bash
bun run build
bun run start:prod
```

## Команды качества

```bash
bun run lint
bun run test
bun run test:e2e
```

## Метрики

Prometheus endpoint: `GET /metrics`

Пользовательские метрики:

- `snapper_snapshot_created_total`
- `snapper_assembly_total{status="completed|failed"}`
- `snapper_pipeline_step_duration_seconds{step="..."}`
