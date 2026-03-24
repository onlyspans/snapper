import { ArgumentsHost, Catch, HttpException, Injectable, Logger } from '@nestjs/common';
import { CorrelationContextService } from '@common/logging';
import { RpcException } from '@nestjs/microservices';
import { BaseRpcExceptionFilter } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { Observable, throwError } from 'rxjs';

function mapHttpStatusToGrpcCode(httpStatus: number): number {
  switch (httpStatus) {
    case 400:
      return status.INVALID_ARGUMENT;
    case 401:
      return status.UNAUTHENTICATED;
    case 403:
      return status.PERMISSION_DENIED;
    case 404:
      return status.NOT_FOUND;
    case 409:
      return status.ALREADY_EXISTS;
    case 412:
      return status.FAILED_PRECONDITION;
    case 429:
      return status.RESOURCE_EXHAUSTED;
    default:
      if (httpStatus >= 500) {
        return status.INTERNAL;
      }
      return status.INVALID_ARGUMENT;
  }
}

function httpExceptionMessage(exception: HttpException): string {
  const res = exception.getResponse();
  if (typeof res === 'string') {
    return res;
  }
  if (isObject(res) && 'message' in res) {
    const raw = (res as { message?: unknown }).message;
    if (Array.isArray(raw)) {
      return raw.map(String).join(', ');
    }
    if (typeof raw === 'string') {
      return raw;
    }
  }
  return exception.message;
}

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

    if (exception instanceof HttpException) {
      const grpcCode = mapHttpStatusToGrpcCode(exception.getStatus());
      const message = httpExceptionMessage(exception);
      const res = exception.getResponse();
      const level = exception.getStatus() >= 500 ? 'error' : 'warn';
      this.logger[level]({
        message: 'Nest HTTP exception mapped to gRPC',
        correlationId,
        httpStatus: exception.getStatus(),
        grpcCode,
        error: message,
        response: res,
      });
      return super.catch(
        new RpcException({
          code: grpcCode,
          message,
          correlationId,
          ...(isObject(res) ? { details: res } : {}),
        }),
        host,
      );
    }

    const message = exception instanceof Error ? exception.message : String(exception);
    this.logger.error({ message: 'Unhandled gRPC exception', correlationId, error: message }, undefined);
    return super.catch(
      new RpcException({ code: status.INTERNAL, message: 'Internal server error', correlationId }),
      host,
    );
  }
}
