export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable: boolean }).retryable;
  }
  // Network / connection errors
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  return false;
}

function delay(ms: number): Promise<void> {
  // Add ±25% jitter
  const jitter = ms * 0.25 * (Math.random() * 2 - 1);
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 500;
  const maxDelayMs = opts?.maxDelayMs ?? 10_000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryable(err)) {
        const wait = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[withRetry] attempt ${attempt + 1}/${maxRetries + 1} failed: ${msg} — retrying in ${Math.round(wait)}ms`);
        await delay(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastError; // unreachable, satisfies TS
}
