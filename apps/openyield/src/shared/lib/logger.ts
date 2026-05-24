export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: unknown
}

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 1000
  private listeners: Set<(logs: LogEntry[]) => void> = new Set()

  private formatTimestamp(): string {
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${now.getMilliseconds().toString().padStart(3, '0')}`
  }

  private addLog(level: LogLevel, message: string, data?: unknown) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      data,
    }

    this.logs.push(entry)
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    // Notify listeners immediately with a new array reference to trigger Vue reactivity
    const logsCopy = [...this.logs]
    this.listeners.forEach(listener => {
      try {
        listener(logsCopy)
      } catch (e) {
        console.error('[logger] Error in listener:', e)
      }
    })

    // Also log to console for development
    const consoleMethod = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
    const logMessage = `[${entry.timestamp}] [${level}] ${message}`
    if (data) {
      consoleMethod(logMessage, data)
    } else {
      consoleMethod(logMessage)
    }
  }

  debug(message: string, data?: unknown) {
    this.addLog('DEBUG', message, data)
  }

  info(message: string, data?: unknown) {
    this.addLog('INFO', message, data)
  }

  warn(message: string, data?: unknown) {
    this.addLog('WARN', message, data)
  }

  error(message: string, data?: unknown) {
    this.addLog('ERROR', message, data)
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clearLogs() {
    this.logs = []
    this.listeners.forEach(listener => listener([...this.logs]))
  }

  subscribe(listener: (logs: LogEntry[]) => void) {
    this.listeners.add(listener)
    // Immediately send current logs
    listener([...this.logs])
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }
}

// Export singleton instance
export const logger = new Logger()
