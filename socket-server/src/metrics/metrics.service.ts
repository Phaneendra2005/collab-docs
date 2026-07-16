export class MetricsService {
  static activeConnections = 0
  static authFailures = 0
  static messagesPerSec = 0
  static totalMessages = 0
  static lastReset = Date.now()

  static trackConnection() {
    this.activeConnections++
  }

  static trackDisconnection() {
    this.activeConnections--
  }

  static trackAuthFailure() {
    this.authFailures++
  }

  static trackMessage() {
    this.totalMessages++
    const now = Date.now()
    if (now - this.lastReset >= 1000) {
      this.messagesPerSec = this.totalMessages
      this.totalMessages = 0
      this.lastReset = now
    }
  }

  static getMetrics() {
    return {
      activeConnections: this.activeConnections,
      authFailures: this.authFailures,
      messagesPerSec: this.messagesPerSec,
    }
  }
}
