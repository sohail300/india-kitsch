import "server-only";

/**
 * Structured JSON logger. Every line is one JSON object, easy to grep or
 * ship to a log processor. See docs/08-infrastructure-backups-ops.md §21:
 * request id + route + duration, never secrets or full payloads.
 *
 * Sentry (Phase 7) handles unexpected errors; this logger is for the
 * request-scoped, structured trail that Vercel's own log retention is too
 * short to rely on for anything business-critical.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

// Matched case-insensitively, with `_`/`-` stripped, against every key in a
// logged context — belt-and-braces against ever leaking a secret by accident.
const SENSITIVE_KEY_PATTERN =
  /password|secret|token|authorization|cookie|cardnumber|cvv|otp|clientsecret|apikey|accesskeyid|secretaccesskey/i;

function redact(context: LogContext): LogContext {
  const redacted: LogContext = {};

  for (const [key, value] of Object.entries(context)) {
    if (SENSITIVE_KEY_PATTERN.test(key.replace(/[_-]/g, ""))) {
      redacted[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      redacted[key] = redact(value as LogContext);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...redact(context),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Returns a logger that merges `bindings` (e.g. requestId, route) into every call. */
  child(bindings: LogContext): Logger;
}

function makeLogger(bindings: LogContext): Logger {
  return {
    debug: (message, context) => write("debug", message, { ...bindings, ...context }),
    info: (message, context) => write("info", message, { ...bindings, ...context }),
    warn: (message, context) => write("warn", message, { ...bindings, ...context }),
    error: (message, context) => write("error", message, { ...bindings, ...context }),
    child: (childBindings) => makeLogger({ ...bindings, ...childBindings }),
  };
}

export const logger: Logger = makeLogger({});
