export interface VideoGenerationProvider {
  createJob(input: { prompt: string; media: string[]; duration_seconds: number }): Promise<{ id: string; cost: number }>;
  getJob(id: string): Promise<"queued" | "processing" | "done" | "failed">;
  getResult(id: string): Promise<Buffer>;
}
export class ProviderError extends Error {
  constructor(public kind: "rejected" | "uncertain" | "unavailable", message: string) { super(message); }
}
export class NexabotProvider implements VideoGenerationProvider {
  private base = (process.env.NEXABOT_BASE_URL || "https://nexabot.id").replace(/\/$/, "");
  private headers() {
    const key = process.env.NEXABOT_API_KEY;
    if (!key) throw new ProviderError("rejected", "NEXABOT_API_KEY missing");
    return { "x-api-key": key };
  }
  async createJob(input: { prompt: string; media: string[]; duration_seconds: number }) {
    if (input.media.length < 1 || input.media.length > 3 || input.duration_seconds !== 10) throw new ProviderError("rejected", "Unsupported input");
    // Nexabot docs expose no model, duration, audio, webhook or idempotency parameter.
    // i2v accepts independent ingredients; sfv pins the uploaded photo as the first frame.
    let response: Response;
    try {
      response = await fetch(`${this.base}/api/v1/api`, { method: "POST", headers: { ...this.headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "i2v", prompt: input.prompt, ratio: 2, media: input.media }), signal: AbortSignal.timeout(90_000) });
    } catch { throw new ProviderError("uncertain", "Submission outcome unknown; do not automatically resubmit"); }
    if (!response.ok) throw new ProviderError(response.status >= 500 ? "uncertain" : "rejected", `Provider HTTP ${response.status}`);
    const data = await response.json().catch(() => null) as { ok?: unknown; job_id?: unknown; credit_cost?: unknown } | null;
    if (!data?.ok || typeof data.job_id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.job_id)) throw new ProviderError("uncertain", "No valid job id in provider response");
    return { id: data.job_id, cost: typeof data.credit_cost === "number" ? data.credit_cost : Number(process.env.NEXABOT_CREDIT_COST_PER_GENERATION || .5) };
  }
  async getJob(id: string) {
    const response = await fetch(`${this.base}/api/v1/jobs/${encodeURIComponent(id)}`, { headers: this.headers(), signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch(() => { throw new ProviderError("unavailable", "Status connection interrupted"); });
    if (!response.ok) throw new ProviderError("unavailable", `Status HTTP ${response.status}`);
    const data = await response.json().catch(() => { throw new ProviderError("unavailable", "Invalid status response"); }) as { ok?: unknown; job?: { status?: unknown } } | null;
    const status = data?.job?.status;
    if (!data?.ok || typeof status !== "string" || !["queued", "processing", "done", "failed"].includes(status)) throw new ProviderError("unavailable", "Invalid status");
    return status as "queued" | "processing" | "done" | "failed";
  }
  async getResult(id: string) {
    const response = await fetch(`${this.base}/api/v1/jobs/${encodeURIComponent(id)}/download`, { headers: this.headers(), signal: AbortSignal.timeout(120_000) }).catch(() => { throw new ProviderError("unavailable", "Download connection interrupted"); });
    if (!response.ok || !response.body) throw new ProviderError("unavailable", "Video download not ready");
    const chunks: Buffer[] = []; let length = 0;
    try { for await (const part of response.body as unknown as AsyncIterable<Uint8Array>) {
      length += part.length;
      if (length > 100 * 1024 * 1024) throw new ProviderError("unavailable", "Video too large");
      chunks.push(Buffer.from(part));
    } } catch { throw new ProviderError("unavailable", "Video stream interrupted or too large"); }
    const bytes = Buffer.concat(chunks);
    if (bytes.subarray(4, 8).toString() !== "ftyp") throw new ProviderError("unavailable", "Output is not MP4");
    return bytes;
  }
}
