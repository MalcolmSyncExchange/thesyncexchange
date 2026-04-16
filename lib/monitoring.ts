type MonitoringPayload = {
  event: string;
  level: "info" | "error";
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
};

export function reportOperationalEvent(event: string, message: string, context?: Record<string, unknown>) {
  emitMonitoringPayload({
    event,
    level: "info",
    message,
    context
  });
}

export function reportOperationalError(event: string, error: unknown, context?: Record<string, unknown>) {
  emitMonitoringPayload({
    event,
    level: "error",
    message: error instanceof Error ? error.message : String(error),
    context,
    error
  });
}

function emitMonitoringPayload(payload: MonitoringPayload) {
  const body = {
    timestamp: new Date().toISOString(),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    monitoringConfigured: Boolean(process.env.SENTRY_DSN),
    ...payload,
    error:
      payload.error instanceof Error
        ? {
            name: payload.error.name,
            message: payload.error.message,
            stack: payload.error.stack
          }
        : payload.error
  };

  const line = JSON.stringify(body);
  if (payload.level === "error") {
    console.error(`[ops:${payload.event}] ${line}`);
    return;
  }

  console.info(`[ops:${payload.event}] ${line}`);
}
