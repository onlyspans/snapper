import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigService } from './config.service';
import { appConfig, databaseConfig, grpcConfig } from './configs';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      load: [appConfig, databaseConfig, grpcConfig],
      envFilePath: '.env',
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
