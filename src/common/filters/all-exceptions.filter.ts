import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CorrelationContextService } from '@common/logging';
import { pathWithoutQuery } from '@common/utils';
import { Request, Response } from 'express';
import * as http from 'http';
import { Observable } from 'rxjs';
import { GrpcExceptionFilter } from './grpc-exception.filter';

function safeRequestPath(req: Request): string {
  const fromPath = typeof req.path === 'string' && req.path.length > 0 ? req.path : '';
  if (fromPath.length > 0) {
    return fromPath;
  }
  return pathWithoutQuery(req.url) || '';
}

function httpExceptionClientPayload(exception: HttpException): {
  clientMessage: string | string[];
  errorPhrase: string;
} {
  const statusCode = exception.getStatus();
  const defaultPhrase = http.STATUS_CODES[statusCode] ?? 'Error';
  const res = exception.getResponse();
  if (typeof res === 'string') {
    return { clientMessage: res, errorPhrase: defaultPhrase };
  }
  if (typeof res === 'object' && res !== null) {
    const body = res as Record<string, unknown>;
    const msg = body.message;
    const clientMessage = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.map(String) : exception.message;
    const err = body.error;
    const errorPhrase = typeof err === 'string' ? err : defaultPhrase;
    return { clientMessage, errorPhrase };
  }
  return { clientMessage: exception.message, errorPhrase: defaultPhrase };
}

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly correlationContext: CorrelationContextService,
    private readonly grpcExceptionFilter: GrpcExceptionFilter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void | Observable<unknown> {
    if (host.getType() === 'rpc') {
      return this.grpcExceptionFilter.catch(exception, host);
    }

    if (host.getType() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const pathLogged = safeRequestPath(request);

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const httpPayload = isHttpException ? httpExceptionClientPayload(exception) : null;
    const logMessage = isHttpException
      ? typeof httpPayload?.clientMessage === 'string'
        ? httpPayload.clientMessage
        : Array.isArray(httpPayload?.clientMessage)
          ? httpPayload.clientMessage.join(', ')
          : exception.message
      : 'Internal server error';
    const stack = exception instanceof Error ? exception.stack : undefined;
    const correlationId = this.correlationContext.getCorrelationId();

    const level = status >= 500 ? 'error' : 'warn';
    this.logger[level]({
      message: 'HTTP exception',
      method: request.method,
      path: pathLogged,
      status,
      errorMessage: logMessage,
      correlationId,
      ...(stack ? { stack } : {}),
    });

    const errorPhrase = httpPayload?.errorPhrase ?? http.STATUS_CODES[status] ?? 'Error';
    const message = status >= 500 ? 'Internal server error' : (httpPayload?.clientMessage ?? 'Internal server error');

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: pathLogged,
      method: request.method,
      correlationId,
      message,
      error: errorPhrase,
    });
  }
}
