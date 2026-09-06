type LogLevel = "info" | "warn" | "error";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "unknown error";
  return message.replace(/(api[_-]?key|token|secret|password|authorization)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(0, 300);
}

export function serverLog(level: LogLevel, event: string, details: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...details });
  if (level === "error") console.error(payload); else if (level === "warn") console.warn(payload); else console.info(payload);
}

export function logFailure(event: string, error: unknown, details: Record<string, unknown> = {}) {
  serverLog("error", event, { ...details, error: safeError(error) });
}
