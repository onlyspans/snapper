import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig, databaseConfig } from './configs';

@Injectable()
export class ConfigService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly appConfiguration: ConfigType<typeof appConfig>,
    @Inject(databaseConfig.KEY)
    private readonly databaseConfiguration: ConfigType<typeof databaseConfig>,
  ) {}

  get app() {
    return this.appConfiguration;
  }

  get database() {
    return this.databaseConfiguration;
  }
}
