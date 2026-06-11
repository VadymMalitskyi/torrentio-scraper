import { loadTolokaProbeConfig } from '../src/config.js';
import { TolokaClient } from '../src/clients/toloka.js';
import { createLogger } from '../src/observability/logger.js';

const config = loadTolokaProbeConfig();
const logger = createLogger({ level: config.logLevel });
const toloka = new TolokaClient({
  baseUrl: config.tolokaBaseUrl,
  username: config.tolokaUsername,
  password: config.tolokaPassword,
  timeoutMs: config.httpTimeoutMs,
  maxTorrentBytes: config.maxTorrentBytes,
  logger,
});

await toloka.login();
console.log(JSON.stringify({ success: true, message: 'Toloka login succeeded' }));
