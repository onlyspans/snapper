import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch()
export class GrpcExceptionFilter extends BaseRpcExceptionFilter {
  private readonly logger = new Logger(GrpcExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): Observable<unknown> {
    if (host.getType() !== 'rpc') {
      return throwError(() => exception);
    }

    if (exception instanceof RpcException) {
      const error = exception.getError();
      this.logger.warn(`gRPC exception: ${JSON.stringify(error)}`);
      return super.catch(exception, host);
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`Unhandled gRPC exception: ${message}`);
    return super.catch(new RpcException({ code: 13, message: 'Internal server error' }), host);
  }
}
