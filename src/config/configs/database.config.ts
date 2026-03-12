import { registerAs } from '@nestjs/config';
import { DatabaseConfig } from '../config.interface';
import { getEnvOrThrow, getEnvOrDefault } from '../config.utils';

export default registerAs('database', (): DatabaseConfig => {
  const logLevelRaw = getEnvOrDefault('DATABASE_LOG_LEVEL', 'warn').toLowerCase();
  const logLevel: DatabaseConfig['logLevel'] =
    logLevelRaw === 'info' || logLevelRaw === 'warn' || logLevelRaw === 'error' ? logLevelRaw : 'warn';

  return {
    url: getEnvOrThrow('DATABASE_URL'),
    logQueries: getEnvOrDefault('DATABASE_LOG_QUERIES', 'false') === 'true',
    logLevel,
  };
});
