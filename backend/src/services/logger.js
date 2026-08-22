import pino from 'pino';
import config from '../config/index.js';

const isDev = config.env === 'development';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  } : undefined,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'ecoscol-api', env: config.env },
});

export function createChildLogger(bindings) {
  return logger.child(bindings);
}

export default logger;