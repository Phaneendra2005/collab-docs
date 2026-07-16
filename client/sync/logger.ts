export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
}

export interface OTelContext {
  traceId?: string
  spanId?: string
  serviceName?: string
  [key: string]: any
}

export class SyncLogger {
  static level = LogLevel.INFO

  static debug(event: string, context?: OTelContext) {
    this.log(LogLevel.DEBUG, event, context)
  }

  static info(event: string, context?: OTelContext) {
    this.log(LogLevel.INFO, event, context)
  }

  static warn(event: string, context?: OTelContext) {
    this.log(LogLevel.WARN, event, context)
  }

  static error(event: string, context?: OTelContext) {
    this.log(LogLevel.ERROR, event, context)
  }

  private static log(level: LogLevel, event: string, context: OTelContext = {}) {
    if (level < this.level) return
    const msg = `[SyncEngine] ${event}`

    // Future OpenTelemetry Collector Integration:
    // If context.traceId exists, this could dispatch to an OTel exporter
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(msg, context)
        break
      case LogLevel.INFO:
        console.info(msg, context)
        break
      case LogLevel.WARN:
        console.warn(msg, context)
        break
      case LogLevel.ERROR:
        console.error(msg, context)
        break
    }
  }
}
