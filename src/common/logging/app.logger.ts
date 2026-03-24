import { ConsoleLogger, Injectable } from '@nestjs/common';
import { CorrelationContextService } from './correlation-context.service';

@Injectable()
export class AppLogger extends ConsoleLogger {
  private readonly serviceName = 'snapper';

  constructor(private readonly correlationContext: CorrelationContextService) {
    super();
    this.setLogLevels(['error', 'warn', 'log', 'debug']);
  }

  log(message: unknown, context?: string): void {
    this.write('info', message, context);
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.write('error', message, context, stack);
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context);
  }

  private write(level: 'error' | 'warn' | 'info' | 'debug', message: unknown, context?: string, stack?: string): void {
    const payload = this.buildPayload(level, message, context, stack);
    const serialized = JSON.stringify(payload);
    if (level === 'error') {
      super.error(serialized, undefined, AppLogger.name);
      return;
    }
    if (level === 'warn') {
      super.warn(serialized, AppLogger.name);
      return;
    }
    if (level === 'debug') {
      super.debug(serialized, AppLogger.name);
      return;
    }
    super.log(serialized, AppLogger.name);
  }

  private buildPayload(level: 'error' | 'warn' | 'info' | 'debug', message: unknown, context?: string, stack?: string) {
    const contextData: Record<string, unknown> = {};

    if (context) {
      contextData.context = context;
    }

    if (stack) {
      contextData.stack = stack;
    }

    if (message && typeof message === 'object') {
      const objectMessage = message as Record<string, unknown>;
      for (const [key, value] of Object.entries(objectMessage)) {
        if (key !== 'message') {
          contextData[key] = value;
        }
      }
    }

    return {
      level,
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      correlationId: this.correlationContext.getCorrelationId(),
      message: this.resolveMessageText(message),
      context: contextData,
    };
  }

  private resolveMessageText(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message && typeof message === 'object' && 'message' in (message as Record<string, unknown>)) {
      const value = (message as { message?: unknown }).message;
      if (typeof value === 'string') {
        return value;
      }
    }
    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
