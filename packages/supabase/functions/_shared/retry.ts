// Retry utility with exponential backoff for Edge Functions

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  shouldRetry: (error: Error, attempt: number) => {
    // Don't retry on validation errors or 4xx client errors
    if (error.message.includes('400') ||
        error.message.includes('401') ||
        error.message.includes('403') ||
        error.message.includes('404')) {
      return false;
    }
    // Retry on network errors, timeouts, and 5xx server errors
    return true;
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number, initialDelayMs: number, maxDelayMs: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = initialDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Execute an operation with retry logic and exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.warn(
        `[Retry] ${operationName} failed (attempt ${attempt + 1}/${opts.maxRetries}):`,
        lastError.message
      );

      // Check if we should retry
      if (!opts.shouldRetry(lastError, attempt)) {
        console.log(`[Retry] ${operationName} - not retrying due to error type`);
        throw lastError;
      }

      // Don't sleep after last attempt
      if (attempt < opts.maxRetries - 1) {
        const delay = getBackoffDelay(attempt, opts.initialDelayMs, opts.maxDelayMs);
        console.log(`[Retry] ${operationName} - retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }
  }

  console.error(`[Retry] ${operationName} failed after ${opts.maxRetries} attempts`);
  throw lastError;
}

/**
 * Fetch with retry for external API calls
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  operationName: string,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);

      // Throw on server errors so they can be retried
      if (response.status >= 500) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return response;
    },
    operationName,
    {
      ...retryOptions,
      shouldRetry: (error, attempt) => {
        // Retry on network errors and 5xx responses
        if (error.message.includes('HTTP 5')) {
          return true;
        }
        // Retry on network/fetch errors
        if (error.message.includes('fetch') ||
            error.message.includes('network') ||
            error.message.includes('timeout') ||
            error.message.includes('ECONNREFUSED')) {
          return true;
        }
        return false;
      },
    }
  );
}
