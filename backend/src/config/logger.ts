
import pino, { DestinationStream, LoggerOptions } from "pino";
import { env } from "./env";

export function createLogger(
  nodeEnv: string,
  level: string,
  destination?: DestinationStream,
) {
  const options: LoggerOptions = {
    level,
  };

  // Pretty logs only in development.
  if (nodeEnv === "development") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    };
  }

  // Production uses standard JSON output.
  if (nodeEnv === "production") {
    delete options.transport;
  }

  return destination
    ? pino(options, destination)
    : pino(options);
}

export const logger = createLogger(
  env.NODE_ENV,
  env.LOG_LEVEL || "info",
);
