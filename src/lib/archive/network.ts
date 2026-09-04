export async function fetchWithRetry(url: string | URL, options: { timeoutMs?: number; retries?: number; headers?: Record<string, string> } = {}) {
  const retries = Math.min(3, Math.max(0, options.retries ?? 2));
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json", "user-agent": "FactFrame/2 archive discovery", ...options.headers } });
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === retries) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      lastError = new Error(`HTTP ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally { clearTimeout(timer); }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error("Archive provider request failed");
}
