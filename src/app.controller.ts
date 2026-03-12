import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '@database/database.service';

@Controller()
export class AppController {
  constructor(private readonly db: DatabaseService) {}

  @Get('healthz')
  healthz(): { status: string } {
    return { status: 'OK' };
  }

  @Get('readyz')
  async readyz(): Promise<{ status: string; database: string }> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return {
        status: 'OK',
        database: 'connected',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'NOT_READY',
          database: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
