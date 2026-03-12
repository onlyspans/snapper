export interface ApplicationConfig {
  nodeEnv: string;
  port: number;
  grpcPort: number;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
}

export interface DatabaseConfig {
  type: 'postgres';
  url: string;
  synchronize: boolean;
  autoMigrate: boolean;
}

export interface AppConfig {
  app: ApplicationConfig;
  database: DatabaseConfig;
}
