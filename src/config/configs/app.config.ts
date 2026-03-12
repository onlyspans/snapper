import { registerAs } from '@nestjs/config';
import type { ApplicationConfig } from '../config.interface';
import { getEnvOrThrow } from '../config.utils';

export type { ApplicationConfig };

export function getCorsConfig(): { origin: string | string[]; credentials: boolean } {
  const corsOrigin = getEnvOrThrow('CORS_ORIGIN').trim();
  const isWildcard = corsOrigin === '*';
  return {
    origin: isWildcard ? '*' : corsOrigin.split(',').map((o) => o.trim()),
    credentials: !isWildcard,
  };
}

export default registerAs('app', (): ApplicationConfig => {
  return {
    nodeEnv: getEnvOrThrow('NODE_ENV'),
    port: parseInt(getEnvOrThrow('PORT'), 10),
    grpcPort: parseInt(getEnvOrThrow('GRPC_PORT'), 10),
    cors: getCorsConfig(),
  };
});
