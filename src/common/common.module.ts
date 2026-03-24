import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter, GrpcExceptionFilter } from './filters';
import { LoggingInterceptor, TimeoutInterceptor } from './interceptors';
import { ParseUuidPipe, ValidationPipe } from './pipes';

@Global()
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_FILTER,
      useClass: GrpcExceptionFilter,
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
    ParseUuidPipe,
  ],
  exports: [ParseUuidPipe, ValidationPipe],
})
export class CommonModule {}
