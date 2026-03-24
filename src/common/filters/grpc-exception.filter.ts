import { ArgumentsHost, Catch, Injectable, Logger } from '@nestjs/common';
import { CorrelationContextService } from '@common/logging';
import { RpcException } from '@nestjs/microservices';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch()
@Injectable()
export class GrpcExceptionFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  constructor(private readonly correlationContext: CorrelationContextService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): Observable<unknown> {
    if (host.getType() !== 'rpc') {
      return throwError(() => exception);
    }
    const correlationId = this.correlationContext.getCorrelationId();

    if (exception instanceof RpcException) {
      const error = exception.getError();
      this.logger.warn({
        message: 'gRPC exception',
        correlationId,
        error,
      });
      return super.catch(exception, host);
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error({ message: 'Unhandled gRPC exception', correlationId, error: message }, undefined);
    return super.catch(new RpcException({ code: 13, message: 'Internal server error' }), host);
  }
}
