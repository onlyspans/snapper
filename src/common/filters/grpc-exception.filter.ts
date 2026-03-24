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
    case 503:
      return status.UNAVAILABLE;
    default:
      if (httpStatus >= 500) {
        return status.INTERNAL;
      }
      return status.INVALID_ARGUMENT;
  }
}

function normalizeExceptionMessage(res: unknown, fallback: string): string {
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
  return fallback;
}

function sanitizeHttpExceptionForGrpc(exception: HttpException): {
  publicMessage: string;
  sanitizedForLog: Record<string, unknown>;
  sanitizedDetails: Record<string, unknown>;
} {
  const httpStatus = exception.getStatus();
  if (httpStatus >= 500) {
    const minimal = {
      statusCode: httpStatus,
      message: 'Internal server error',
    };
    return {
      publicMessage: 'Internal server error',
      sanitizedForLog: minimal,
      sanitizedDetails: minimal,
    };
  }

  const res = exception.getResponse();
  const messageStr = normalizeExceptionMessage(res, exception.message);

  if (typeof res === 'string') {
    const o = { statusCode: httpStatus, message: messageStr };
    return { publicMessage: messageStr, sanitizedForLog: o, sanitizedDetails: o };
  }

  if (isObject(res)) {
    const body = res as Record<string, unknown>;
    const err = body.error;
    const sanitized: Record<string, unknown> = {
      statusCode: typeof body.statusCode === 'number' ? body.statusCode : httpStatus,
      message: messageStr,
    };
    if (typeof err === 'string') {
      sanitized.error = err;
    }
    return { publicMessage: messageStr, sanitizedForLog: sanitized, sanitizedDetails: sanitized };
  }

  const o = { statusCode: httpStatus, message: messageStr };
  return { publicMessage: messageStr, sanitizedForLog: o, sanitizedDetails: o };
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
      const httpStatus = exception.getStatus();
      const grpcCode = mapHttpStatusToGrpcCode(httpStatus);
      const { publicMessage, sanitizedForLog, sanitizedDetails } = sanitizeHttpExceptionForGrpc(exception);
      const level = httpStatus >= 500 ? 'error' : 'warn';
      this.logger[level]({
        message: 'Nest HTTP exception mapped to gRPC',
        correlationId,
        httpStatus,
        grpcCode,
        error: publicMessage,
        response: sanitizedForLog,
      });
      return super.catch(
        new RpcException({
          code: grpcCode,
          message: publicMessage,
          correlationId,
          details: sanitizedDetails,
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
