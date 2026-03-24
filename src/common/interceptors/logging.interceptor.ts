import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { createUuid } from '@common/utils';
import { CorrelationContextService } from '@common/logging';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly correlationContext: CorrelationContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const type = context.getType<'http' | 'rpc'>();
    const correlationId = this.extractCorrelationId(context, type);

    const contextInfo =
      type === 'http'
        ? (() => {
            const request = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
            return `${request.method ?? 'UNKNOWN'} ${request.url ?? 'unknown-route'}`;
          })()
        : context.getHandler().name;

    this.correlationContext.enterWith(correlationId);
    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          message: 'Request completed',
          transport: type,
          target: contextInfo,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          {
            message: 'Request failed',
            transport: type,
            target: contextInfo,
            durationMs: Date.now() - startedAt,
            error: message,
          },
          undefined,
        );
        throw error;
      }),
    );
  }

  private extractCorrelationId(context: ExecutionContext, type: 'http' | 'rpc'): string {
    if (type === 'http') {
      const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
      const headerValue = request.headers?.['x-correlation-id'] ?? request.headers?.['correlation-id'];
      if (Array.isArray(headerValue)) {
        return headerValue[0] ?? createUuid();
      }
      return headerValue?.trim() || createUuid();
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
