import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

const DEFAULT_TIMEOUT_MS = 30_000;

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const contextType = context.getType<'http' | 'rpc'>();

    return next.handle().pipe(
      timeout(DEFAULT_TIMEOUT_MS),
      catchError((error: unknown) => {
        if (!(error instanceof TimeoutError)) {
          return throwError(() => error);
        }

        if (contextType === 'rpc') {
          return throwError(() => new RpcException({ code: 4, message: 'Request timeout' }));
        }

        return throwError(() => new RequestTimeoutException('Request timeout'));
      }),
    );
  }
}
