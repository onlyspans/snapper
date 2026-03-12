import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

interface ExceptionResponse {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  [key: string]: unknown;
}

function normalizeMessage(raw: string | ExceptionResponse | undefined): string | string[] {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const m = raw.message;
    return m ?? 'An error occurred';
  }
  return 'An error occurred';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  private logErrorDetails(
    request: Request,
    status: number,
    exception: unknown,
    rawMessage: string | ExceptionResponse | undefined,
    isHttpException: boolean,
  ): void {
    const body =
      request.body && typeof request.body === 'object' && Object.keys(request.body as object).length > 0
        ? (request.body as Record<string, unknown>)
        : undefined;
    const query =
      request.query && typeof request.query === 'object' && Object.keys(request.query).length > 0
        ? (request.query as Record<string, unknown>)
        : undefined;
    const meta: Record<string, unknown> = {
      method: request.method,
      url: request.url,
      status,
      ...(body && { body }),
      ...(query && { query }),
    };

    if (!isHttpException) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `Unhandled exception ${request.method} ${request.url} ${status}`,
        JSON.stringify({
          ...meta,
          errorName: err.name,
          message: err.message,
          stack: err.stack,
        }),
      );
      if (err.stack) this.logger.error(err.stack);
      return;
    }

    const logPayload: Record<string, unknown> = {
      ...meta,
      responseBody: rawMessage,
    };
    const errWithStack = exception instanceof Error ? exception : null;
    if (errWithStack?.stack) {
      logPayload.stack = errWithStack.stack;
    }
    const level = status >= 500 ? 'error' : 'warn';
    this.logger[level](`${request.method} ${request.url} ${status}`, JSON.stringify(logPayload));
    if (errWithStack?.stack) {
      this.logger[level](errWithStack.stack);
    }
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawMessage = isHttpException ? exception.getResponse() : undefined;

    this.logErrorDetails(
      request,
      status,
      exception,
      rawMessage as string | ExceptionResponse | undefined,
      isHttpException,
    );

    const rawForMessage: string | ExceptionResponse | undefined = isHttpException
      ? (rawMessage as string | ExceptionResponse)
      : undefined;
    const message = normalizeMessage(rawForMessage ?? 'Internal server error');
    const errorPayload =
      typeof rawMessage === 'object' && rawMessage !== null && !Array.isArray(rawMessage)
        ? (rawMessage as ExceptionResponse)
        : null;
    const errorLabel = errorPayload && typeof errorPayload.error === 'string' ? errorPayload.error : undefined;

    const clientMessage = status >= 500 ? 'Internal server error' : message;

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: clientMessage,
      ...(errorLabel && status < 500 && { error: errorLabel }),
    };

    response.status(status).json(errorResponse);
  }
}
