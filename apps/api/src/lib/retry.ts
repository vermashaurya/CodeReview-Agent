export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  sleep?: (delayMs: number) => Promise<void>;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  let lastError: unknown;

  while (attempt < options.attempts) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error;
      attempt += 1;

      if (attempt >= options.attempts) {
        break;
      }

      const delayMs = options.baseDelayMs * 2 ** (attempt - 1);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
