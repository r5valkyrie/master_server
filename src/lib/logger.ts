/**
 * Centralized logging utility with color support
 * Provides consistent, concise log formatting across the application
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success';

interface LogOptions {
  prefix?: string;
  color?: keyof typeof colors;
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().split('T')[1].slice(0, 8);
}

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function log(level: LogLevel, message: string, options: LogOptions = {}): void {
  const timestamp = colorize(`[${formatTimestamp()}]`, 'gray');
  const prefix = options.prefix ? `[${options.prefix}]` : '';
  const color = options.color || 'reset';

  let levelLabel: string;
  switch (level) {
    case 'debug':
      levelLabel = colorize('DEBUG', 'cyan');
      break;
    case 'info':
      levelLabel = colorize('INFO', 'blue');
      break;
    case 'warn':
      levelLabel = colorize('WARN', 'yellow');
      break;
    case 'error':
      levelLabel = colorize('ERROR', 'red');
      break;
    case 'success':
      levelLabel = colorize('SUCCESS', 'green');
      break;
  }

  const formattedMessage = colorize(message, color);
  console.log(`${timestamp} ${levelLabel} ${prefix} ${formattedMessage}`.trim());
}

export const logger = {
  debug: (message: string, options?: LogOptions) => log('debug', message, options),
  info: (message: string, options?: LogOptions) => log('info', message, options),
  warn: (message: string, options?: LogOptions) => log('warn', message, options),
  error: (message: string, options?: LogOptions) => log('error', message, options),
  success: (message: string, options?: LogOptions) => log('success', message, options),
};
