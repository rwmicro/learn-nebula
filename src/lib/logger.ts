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
    if (this.isDevelopment) {
      const timestamp = new Date().toISOString()
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
      return
    }

    // In production the site runs in users' browsers (static export). Surface
    // only errors/warnings to keep their devtools console clean and avoid
    // leaking internal context. Wire this up to a tracking service if needed.
    if (level === 'error') {
      console.error(message)
    } else if (level === 'warn') {
      console.warn(message)
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
