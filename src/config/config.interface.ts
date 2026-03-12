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
  url: string;
  logQueries: boolean;
  logLevel: 'info' | 'warn' | 'error';
}

export interface AppConfig {
  app: ApplicationConfig;
  database: DatabaseConfig;
}
