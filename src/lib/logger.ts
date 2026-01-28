/**
 * Simple structured logger
 * In production, this could be replaced with a service like Sentry, LogRocket, etc.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
  [key: string]: unknown
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development'

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString()
    const logData = {
      timestamp,
      level,
      message,
      ...context,
    }

    if (this.isDevelopment) {
      // In development, use console with colors
      switch (level) {
        case 'error':
          console.error(`[${timestamp}] ERROR:`, message, context || '')
          break
        case 'warn':
          console.warn(`[${timestamp}] WARN:`, message, context || '')
          break
        case 'debug':
          console.debug(`[${timestamp}] DEBUG:`, message, context || '')
          break
        default:
          console.log(`[${timestamp}] INFO:`, message, context || '')
      }
    } else {
      // In production, use structured JSON logging
      // This can be piped to log aggregation services
      console.log(JSON.stringify(logData))
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context)
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context)
  }
}

export const logger = new Logger()
