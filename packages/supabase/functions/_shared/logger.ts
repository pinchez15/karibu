// Structured JSON logging for Edge Functions

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  visit_id?: string;
  function_name?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
  };
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

export function createLogger(functionName: string) {
  const baseContext: LogContext = { function_name: functionName };

  function log(level: LogLevel, message: string, context?: LogContext, error?: Error) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: { ...baseContext, ...context },
    };

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    const formattedLog = formatLog(entry);

    switch (level) {
      case 'debug':
        console.debug(formattedLog);
        break;
      case 'info':
        console.log(formattedLog);
        break;
      case 'warn':
        console.warn(formattedLog);
        break;
      case 'error':
        console.error(formattedLog);
        break;
    }
  }

  return {
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext, error?: Error) => log('warn', message, context, error),
    error: (message: string, context?: LogContext, error?: Error) => log('error', message, context, error),

    // Convenience method for logging operation start/end
    startOperation: (operationName: string, context?: LogContext) => {
      log('info', `Starting ${operationName}`, context);
      const startTime = Date.now();
      return {
        success: (additionalContext?: LogContext) => {
          const durationMs = Date.now() - startTime;
          log('info', `Completed ${operationName}`, { ...context, ...additionalContext, duration_ms: durationMs });
        },
        failure: (error: Error, additionalContext?: LogContext) => {
          const durationMs = Date.now() - startTime;
          log('error', `Failed ${operationName}`, { ...context, ...additionalContext, duration_ms: durationMs }, error);
        },
      };
    },
  };
}
