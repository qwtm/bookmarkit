// ARCH-02: Shared fetch wrapper with per-request timeout, exponential backoff with jitter,
// and Retry-After header handling. No external dependencies — pure JS for minimal bundle size.

const DEFAULT_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  timeoutMs: 30000,
  retryOn: [429, 500, 503],
};

/**
 * Wraps fetch with a per-request timeout and optional retry logic.
 *
 * @param {string} url
 * @param {RequestInit} options - Standard fetch options. Do NOT pass AbortSignal here;
 *   use `callerSignal` so timeout and caller cancellation compose correctly.
 * @param {Partial<typeof DEFAULT_CONFIG>} retryConfig
 * @param {AbortSignal} [callerSignal] - Optional external abort signal (ARCH-04 cancellation).
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, retryConfig = {}, callerSignal) {
  const { maxAttempts, baseDelayMs, timeoutMs, retryOn } = {
    ...DEFAULT_CONFIG,
    ...retryConfig,
  };

  let attempt = 0;
  let lastError;

  while (attempt < maxAttempts) {
    attempt++;

    // Bail immediately if the caller already aborted
    if (callerSignal?.aborted) {
      throw new DOMException('Request cancelled', 'AbortError');
    }

    // Compose a per-attempt timeout controller with the optional caller signal
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')),
      timeoutMs,
    );

    // Forward caller abort into the timeout controller so either cancels the fetch
    let callerHandler;
    if (callerSignal) {
      callerHandler = () => timeoutController.abort(callerSignal.reason);
      callerSignal.addEventListener('abort', callerHandler, { once: true });
    }

    let res;
    try {
      res = await fetch(url, { ...options, signal: timeoutController.signal });
    } catch (err) {
      lastError = err;
      // AbortError means timeout or caller cancel — do not retry
      if (err.name === 'AbortError') throw err;
      // Network error — retry if attempts remain
      if (attempt < maxAttempts) {
        await _delay(_jitteredBackoff(baseDelayMs, attempt));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (callerHandler) callerSignal.removeEventListener('abort', callerHandler);
    }

    // Non-retriable HTTP errors: auth failures and bad requests
    if ([400, 401, 403, 404].includes(res.status)) return res;

    // Retriable status codes
    if (retryOn.includes(res.status) && attempt < maxAttempts) {
      const retryAfterSec = parseFloat(res.headers?.get?.('Retry-After') || '0');
      const waitMs = retryAfterSec > 0
        ? retryAfterSec * 1000
        : _jitteredBackoff(baseDelayMs, attempt);
      lastError = new Error(`HTTP ${res.status}`);
      await _delay(waitMs);
      continue;
    }

    // Success or non-retriable status
    return res;
  }

  throw lastError || new Error('fetchWithRetry: all attempts exhausted');
}

function _jitteredBackoff(baseMs, attempt) {
  // Exponential backoff: baseMs * 2^(attempt-1), plus up to 20% random jitter
  const exp = baseMs * Math.pow(2, attempt - 1);
  return exp + Math.random() * exp * 0.2;
}

function _delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
