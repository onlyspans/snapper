import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter, GrpcExceptionFilter } from './filters';
import { LoggingInterceptor, TimeoutInterceptor } from './interceptors';
import { AppLogger, CorrelationContextService } from './logging';
import { ParseUuidPipe, ValidationPipe } from './pipes';

@Global()
@Module({
  providers: [
    GrpcExceptionFilter,
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    ValidationPipe,
    ParseUuidPipe,
    CorrelationContextService,
    AppLogger,
  ],
  exports: [ParseUuidPipe, ValidationPipe, CorrelationContextService, AppLogger],
})
export class CommonModule {}
