/**
 * Simple Logger Utility
 * Provides consistent logging across all services
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

class Logger {
  constructor(serviceName) {
    this.serviceName = serviceName;
  }

  _formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${this.serviceName}] ${level}: ${message}${dataStr}`;
  }

  info(message, data) {
    console.log(colors.cyan + this._formatMessage('INFO', message, data) + colors.reset);
  }

  success(message, data) {
    console.log(colors.green + this._formatMessage('SUCCESS', message, data) + colors.reset);
  }

  warn(message, data) {
    console.warn(colors.yellow + this._formatMessage('WARN', message, data) + colors.reset);
  }

  error(message, error) {
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error;
    console.error(colors.red + this._formatMessage('ERROR', message, errorData) + colors.reset);
  }

  debug(message, data) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(colors.magenta + this._formatMessage('DEBUG', message, data) + colors.reset);
    }
  }
}

module.exports = Logger;
