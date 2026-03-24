import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { CorrelationContextService } from '@common/logging';
import { lastValueFrom, Observable, TimeoutError, of, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { retryWithExponentialBackoff } from '@common/utils';
import { VARIABLES_CLIENT } from '../integrations.constants';
import { createCorrelationMetadata } from '../correlation-metadata.util';
import { GetResolvedVariablesInput, GetResolvedVariablesResult, VariablesGrpcService } from './variables.interface';

const REQUEST_TIMEOUT_MS = 5000;
const CONNECTIVITY_TIMEOUT_MS = 3000;

@Injectable()
export class VariablesClient implements OnModuleInit {
  private variablesService!: VariablesGrpcService;
  private connectivityVerified = false;

  constructor(
    @Inject(VARIABLES_CLIENT) private readonly client: ClientGrpc,
    private readonly correlationContext: CorrelationContextService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.variablesService = this.client.getService<VariablesGrpcService>('VariablesService');
    this.connectivityVerified = await this.verifyVariablesServiceReachable();
  }

  isInitialized(): boolean {
    return this.connectivityVerified;
  }

  async getResolvedVariables(request: GetResolvedVariablesInput): Promise<GetResolvedVariablesResult> {
    return this.executeWithResilience<GetResolvedVariablesResult>(() =>
      this.variablesService.GetResolvedVariables(
        request,
        createCorrelationMetadata(this.correlationContext.getCorrelationId()),
      ),
    );
  }

  private async verifyVariablesServiceReachable(): Promise<boolean> {
    const metadata = createCorrelationMetadata(this.correlationContext.getCorrelationId());
    const buildProbe = (): Observable<GetResolvedVariablesResult> =>
      this.variablesService
        .GetResolvedVariables(
          { project_id: '__snapper_connectivity__', environment_id: '__snapper_connectivity__' },
          metadata,
        )
        .pipe(
          timeout(CONNECTIVITY_TIMEOUT_MS),
          catchError((err): Observable<GetResolvedVariablesResult> => {
            const code = (err as { code?: number })?.code;
            if (code === 3 || code === 5 || code === 9 || code === 16) {
              return of({ internal_error: { message: 'connectivity_probe' } });
            }
            return throwError(() => err);
          }),
        );

    try {
      await retryWithExponentialBackoff(async () => lastValueFrom(buildProbe()), {
        shouldRetry: (error) => this.shouldRetryTransportError(error),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async executeWithResilience<T>(operation: () => Observable<T>): Promise<T> {
    return retryWithExponentialBackoff(async () => lastValueFrom(operation().pipe(timeout(REQUEST_TIMEOUT_MS))), {
      shouldRetry: (error) => this.shouldRetryTransportError(error),
    });
  }

  private shouldRetryTransportError(error: unknown): boolean {
    if (error instanceof TimeoutError) {
      return true;
    }
    if (error instanceof Error && error.name === 'TimeoutError') {
      return true;
    }
    const code = (error as { code?: number })?.code;
    return code === 4 || code === 8 || code === 13 || code === 14;
  }
}
