import { Metadata } from '@grpc/grpc-js';

export function createCorrelationMetadata(correlationId: string): Metadata {
  const metadata = new Metadata();
  metadata.set('x-correlation-id', correlationId);
  return metadata;
}
