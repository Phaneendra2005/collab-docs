export class SocketLogger {
  static info(event: string, context?: Record<string, any>) {
    console.info(
      JSON.stringify({ level: 'INFO', event, context, timestamp: new Date().toISOString() }),
    )
  }

  static error(event: string, context?: Record<string, any>) {
    console.error(
      JSON.stringify({ level: 'ERROR', event, context, timestamp: new Date().toISOString() }),
    )
  }
}
