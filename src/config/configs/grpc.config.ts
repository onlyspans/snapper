import { registerAs } from '@nestjs/config';
import type { GrpcServicesConfig } from '../config.interface';
import { getEnvOrThrow } from '../config.utils';

export default registerAs('grpc', (): GrpcServicesConfig => {
  return {
    projectsUrl: getEnvOrThrow('PROJECTS_GRPC_URL'),
    variablesUrl: getEnvOrThrow('VARIABLES_GRPC_URL'),
    artifactStorageUrl: getEnvOrThrow('ARTIFACT_STORAGE_GRPC_URL'),
    eventsUrl: getEnvOrThrow('EVENTS_GRPC_URL'),
  };
});
