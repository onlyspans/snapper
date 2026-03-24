import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig, databaseConfig, grpcConfig } from './configs';

@Injectable()
export class ConfigService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly appConfiguration: ConfigType<typeof appConfig>,
    @Inject(databaseConfig.KEY)
    private readonly databaseConfiguration: ConfigType<typeof databaseConfig>,
    @Inject(grpcConfig.KEY)
    private readonly grpcConfiguration: ConfigType<typeof grpcConfig>,
  ) {}

  get app() {
    return this.appConfiguration;
  }

  get database() {
    return this.databaseConfiguration;
  }

  get grpc() {
    return this.grpcConfiguration;
  }
}
