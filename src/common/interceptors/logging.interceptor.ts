import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const type = context.getType<'http' | 'rpc'>();

    const contextInfo =
      type === 'http'
        ? (() => {
            const request = context.switchToHttp().getRequest<{ method?: string; url?: string }>();
            return `${request.method ?? 'UNKNOWN'} ${request.url ?? 'unknown-route'}`;
          })()
        : context.getHandler().name;

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`${type.toUpperCase()} ${contextInfo} ${Date.now() - startedAt}ms`);
      }),
      catchError((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`${type.toUpperCase()} ${contextInfo} failed in ${Date.now() - startedAt}ms: ${message}`);
        throw error;
      }),
    );
  }
}
