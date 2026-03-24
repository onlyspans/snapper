import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { CorrelationContextService } from '@common/logging';
import { lastValueFrom, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { retryWithExponentialBackoff } from '@common/utils';
import { VARIABLES_CLIENT } from '../integrations.constants';
import { createCorrelationMetadata } from '../correlation-metadata.util';
import { GetResolvedVariablesInput, GetResolvedVariablesResult, VariablesGrpcService } from './variables.interface';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class VariablesClient implements OnModuleInit {
  private variablesService!: VariablesGrpcService;

  constructor(
    @Inject(VARIABLES_CLIENT) private readonly client: ClientGrpc,
    private readonly correlationContext: CorrelationContextService,
  ) {}

  onModuleInit(): void {
    this.variablesService = this.client.getService<VariablesGrpcService>('VariablesService');
  }

  isInitialized(): boolean {
    return Boolean(this.variablesService);
  }

  async getResolvedVariables(request: GetResolvedVariablesInput): Promise<GetResolvedVariablesResult> {
    return this.executeWithResilience<GetResolvedVariablesResult>(
      () =>
        this.variablesService.GetResolvedVariables(
          request,
          createCorrelationMetadata(this.correlationContext.getCorrelationId()),
        ) as Observable<GetResolvedVariablesResult>,
    );
  }

  private async executeWithResilience<T>(operation: () => Observable<T>): Promise<T> {
    return retryWithExponentialBackoff(async () => lastValueFrom(operation().pipe(timeout(REQUEST_TIMEOUT_MS))), {
      shouldRetry: (error) => {
        const code = (error as { code?: number })?.code;
        return code === 4 || code === 8 || code === 13 || code === 14;
      },
    });
  }
}
