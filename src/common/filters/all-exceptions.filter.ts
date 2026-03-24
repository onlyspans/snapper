import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CorrelationContextService } from '@common/logging';
import { Request, Response } from 'express';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly correlationContext: CorrelationContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttpException ? exception.message : 'Internal server error';
    const stack = exception instanceof Error ? exception.stack : undefined;
    const correlationId = this.correlationContext.getCorrelationId();

    const level = status >= 500 ? 'error' : 'warn';
    this.logger[level]({
      message: 'HTTP exception',
      method: request.method,
      path: request.url,
      status,
      errorMessage: message,
      correlationId,
      ...(stack ? { stack } : {}),
    });

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      correlationId,
      message: status >= 500 ? 'Internal server error' : message,
    });
  }
}
