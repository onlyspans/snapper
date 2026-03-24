import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@config/config.service';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync } from 'fs';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ReflectionService } from '@grpc/reflection';
import { AppLogger } from '@common/logging';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
  app.enableCors(configService.app.cors);

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = new DocumentBuilder()
    .setTitle('Snapper Microservice API')
    .setDescription(`REST API Snapper Microservice. gRPC API PORT: ${configService.app.grpcPort}`)
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const grpcPort = configService.app.grpcPort;
  const distProtoPath = join(process.cwd(), 'dist/proto/snapper.proto');
  const srcProtoPath = join(process.cwd(), 'src/proto/snapper.proto');
  const protoPath = existsSync(distProtoPath) ? distProtoPath : srcProtoPath;
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'snapper.v1',
      protoPath,
      url: `0.0.0.0:${grpcPort}`,
      onLoadPackageDefinition: (pkg, server) => {
        new ReflectionService(pkg).addToServer(server);
      },
    },
  });

  await app.startAllMicroservices();

  const port = configService.app.port;
  await app.listen(port);

  logger.log({
    message: 'HTTP server started',
    url: `http://localhost:${port}/api`,
  });
  logger.log({
    message: 'Swagger docs started',
    url: `http://localhost:${port}/api-docs`,
  });
  logger.log({
    message: 'gRPC server started',
    url: `0.0.0.0:${grpcPort}`,
  });
}

void bootstrap();
