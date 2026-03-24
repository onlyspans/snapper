import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { createUuid, pathWithoutQuery } from '@common/utils';
import { CorrelationContextService } from '@common/logging';

function safeLogPathFromUrl(url: string | undefined): string {
  if (!url) {
    return 'ws';
  }
  try {
    const u = new URL(url, 'http://localhost');
    return u.pathname || pathWithoutQuery(url);
  } catch {
    return pathWithoutQuery(url);
  }
}

const CORRELATION_HEADER_NAMES = ['x-correlation-id', 'correlation-id', 'x-request-id'] as const;

function firstNonEmptyHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  names: readonly string[],
): string | undefined {
  if (!headers) {
    return undefined;
  }
  for (const name of names) {
    const raw = headers[name];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const trimmed = typeof item === 'string' ? item.trim() : '';
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
      continue;
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly correlationContext: CorrelationContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const rawType = context.getType<string>();
    const transport: 'http' | 'rpc' | 'ws' | 'unknown' =
      rawType === 'http' || rawType === 'ws' || rawType === 'rpc' ? rawType : 'unknown';
    const correlationId = this.extractCorrelationId(context, transport);

    const contextInfo =
      transport === 'http'
        ? (() => {
            const request = context.switchToHttp().getRequest<{
              method?: string;
              url?: string;
              path?: string;
            }>();
            const pathRaw =
              typeof request.path === 'string' && request.path.length > 0
                ? request.path
                : pathWithoutQuery(request.url);
            const path = pathRaw.length > 0 ? pathRaw : 'unknown-route';
            return `${request.method ?? 'UNKNOWN'} ${path}`;
          })()
        : transport === 'ws'
          ? (() => {
              try {
                const client = context.switchToWs().getClient<{
                  handshake?: { headers?: Record<string, string | string[] | undefined>; url?: string };
                }>();
                const pattern = context.getHandler()?.name ?? 'unknown-handler';
                const path = safeLogPathFromUrl(client.handshake?.url);
                return `${pattern} ${path}`;
              } catch {
                return context.getHandler()?.name ?? 'unknown-handler';
              }
            })()
          : (context.getHandler()?.name ?? 'unknown-handler');

    this.correlationContext.enterWith(correlationId);
    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          message: 'Request completed',
          transport,
          target: contextInfo,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const stackOrCause = error instanceof Error ? error.stack : error;
        this.logger.error(
          {
            message: 'Request failed',
            transport,
            target: contextInfo,
            durationMs: Date.now() - startedAt,
            error: message,
          },
          stackOrCause,
        );
        throw error;
      }),
    );
  }

  private extractCorrelationId(context: ExecutionContext, transport: 'http' | 'rpc' | 'ws' | 'unknown'): string {
    if (transport === 'http') {
      const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
      return firstNonEmptyHeaderValue(request.headers, CORRELATION_HEADER_NAMES) ?? createUuid();
    }

    if (transport === 'ws') {
      try {
        const client = context.switchToWs().getClient<{
          handshake?: { headers?: Record<string, string | string[] | undefined> };
          data?: { correlationId?: string };
        }>();
        const fromData = typeof client.data?.correlationId === 'string' ? client.data.correlationId.trim() : '';
        if (fromData.length > 0) {
          return fromData;
        }
        const fromHeaders = firstNonEmptyHeaderValue(client.handshake?.headers, CORRELATION_HEADER_NAMES);
        if (fromHeaders !== undefined) {
          return fromHeaders;
        }
      } catch {
        // fall through to uuid
      }
      return createUuid();
    }

    if (transport !== 'rpc') {
      return createUuid();
    }

    const metadata = context.switchToRpc().getContext<Metadata | undefined>();
    const metadataValue =
      metadata?.get?.('x-correlation-id')?.[0] ??
      metadata?.get?.('correlation-id')?.[0] ??
      metadata?.get?.('x-request-id')?.[0];

    if (typeof metadataValue === 'string' && metadataValue.trim().length > 0) {
      return metadataValue.trim();
    }

    if (Buffer.isBuffer(metadataValue)) {
      const parsed = metadataValue.toString('utf8').trim();
      if (parsed.length > 0) {
        return parsed;
      }
    }

    return createUuid();
  }
}
