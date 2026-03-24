export function safeJsonParse<T>(payload: string, fallback: T): T {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return fallback;
  }
}

export function toStableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJson(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${toStableJson(item)}`).join(',')}}`;
}
