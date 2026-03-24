const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 200;

type RetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryWithExponentialBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      await sleep(delay);
      delay *= backoffMultiplier;
      attempt += 1;
    }
  }

  throw new Error('Retry failed unexpectedly');
}
