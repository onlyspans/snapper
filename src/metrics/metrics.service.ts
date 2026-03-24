import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  getMetrics(): string {
    return [
      '# HELP snapper_uptime_info Static uptime availability marker',
      '# TYPE snapper_uptime_info gauge',
      'snapper_uptime_info 1',
    ].join('\n');
  }
}
