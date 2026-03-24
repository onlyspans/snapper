import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { retryWithExponentialBackoff } from '@common/utils';
import { EVENTS_CLIENT } from '../integrations.constants';
import { EventGrpcService, IngestEventRequest, IngestEventResponse } from './events.interface';

const REQUEST_TIMEOUT_MS = 5000;

@Injectable()
export class EventsClient implements OnModuleInit {
  private eventsService!: EventGrpcService;

  constructor(@Inject(EVENTS_CLIENT) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.eventsService = this.client.getService<EventGrpcService>('EventService');
  }

  isInitialized(): boolean {
    return Boolean(this.eventsService);
  }

  async ingestEvent(request: IngestEventRequest): Promise<IngestEventResponse> {
    return this.executeWithResilience<IngestEventResponse>(
      () => this.eventsService.IngestEvent(request) as Observable<IngestEventResponse>,
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
