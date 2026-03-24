import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { createUuid } from '@common/utils';

interface CorrelationStore {
  correlationId: string;
}

@Injectable()
export class CorrelationContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<CorrelationStore>();

  run<T>(correlationId: string, callback: () => T): T {
    return this.asyncLocalStorage.run({ correlationId }, callback);
  }

  getCorrelationId(): string {
    return this.asyncLocalStorage.getStore()?.correlationId ?? createUuid();
  }
}
