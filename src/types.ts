export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type Logger = (level: LogLevel, message: string, context?: Record<string, unknown>) => void

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const noopLogger: Logger = () => {}
