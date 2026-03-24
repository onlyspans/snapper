import { createHash } from 'crypto';
import { toStableJson } from './json.util';

export function createChecksum(payload: unknown): string {
  const normalized = typeof payload === 'string' ? payload : toStableJson(payload);
  return createHash('sha256').update(normalized).digest('hex');
}
