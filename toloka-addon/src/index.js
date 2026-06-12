import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createLogger } from './observability/logger.js';

const config = loadConfig();
const logger = createLogger({ level: config.logLevel });
const app = createApp(config, { logger });

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info('Toloka addon started', {
    port: config.port,
    cloudRunService: process.env.K_SERVICE,
  });
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info('Shutdown requested', { signal });
    server.close(() => process.exit(0));
  });
}
