import pino from "pino";

const validLogLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

type LogLevel = (typeof validLogLevels)[number];

export function resolveLogLevel(
  configuredLevel: string | undefined,
  nodeEnvironment: string | undefined
): LogLevel {
  if (isLogLevel(configuredLevel)) {
    return configuredLevel;
  }

  return nodeEnvironment === "production" ? "info" : "debug";
}

export const logger = pino({
  level: resolveLogLevel(process.env.LOG_LEVEL, process.env.NODE_ENV),
  serializers: {
    err: pino.stdSerializers.err
  }
});

function isLogLevel(value: string | undefined): value is LogLevel {
  return typeof value === "string" && (validLogLevels as readonly string[]).includes(value);
}
