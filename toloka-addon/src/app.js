import crypto from 'node:crypto';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { MemoryCache } from './cache/memory-cache.js';
import { CinemetaClient } from './clients/cinemeta.js';
import { TolokaClient } from './clients/toloka.js';
import { TorBoxClient } from './clients/torbox.js';
import { createDiscoveryService } from './services/discovery.js';
import { createPlaybackService } from './services/playback.js';
import { createCacheClearHandler } from './routes/cache.js';
import { configureHandler } from './routes/configure.js';
import { manifestHandler } from './routes/manifest.js';
import { createStreamHandler } from './routes/stream.js';
import { createResolveHandler } from './routes/resolve.js';

export function createApp(config, { logger, dependencies = {} }) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  const metadataCache = new MemoryCache({ maxWeight: 1000 });
  const searchCache = new MemoryCache({ maxWeight: 1000 });
  const torrentCache = new MemoryCache({
    maxWeight: config.torrentCacheMaxBytes,
    weigh: (torrent) => torrent.bytes.length,
  });
  const caches = {
    metadata: metadataCache,
    search: searchCache,
    torrent: torrentCache,
  };

  const cinemeta = dependencies.cinemeta || new CinemetaClient({
    baseUrl: config.cinemetaBaseUrl,
    timeoutMs: config.httpTimeoutMs,
  });
  const toloka = dependencies.toloka || new TolokaClient({
    baseUrl: config.tolokaBaseUrl,
    username: config.tolokaUsername,
    password: config.tolokaPassword,
    timeoutMs: config.httpTimeoutMs,
    maxTorrentBytes: config.maxTorrentBytes,
    logger,
  });
  const torbox = dependencies.torbox || new TorBoxClient({
    baseUrl: config.torboxBaseUrl,
    token: config.torboxApiToken,
    timeoutMs: config.httpTimeoutMs,
  });
  const discovery = dependencies.discovery || createDiscoveryService({
    config,
    cinemeta,
    toloka,
    torbox,
    searchCache,
    metadataCache,
    torrentCache,
    logger,
  });
  const playback = dependencies.playback || createPlaybackService({
    config,
    toloka,
    torbox,
    torrentCache,
  });

  app.use((req, res, next) => {
    const started = performance.now();
    res.on('finish', () => logger.info('HTTP request', {
      method: req.method,
      route: req.route?.path || sanitizedPath(req.path),
      status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    }));
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/static', express.static(new URL('../static', import.meta.url).pathname, {
    fallthrough: false,
    immutable: true,
    maxAge: '1y',
  }));

  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const protectedRouter = express.Router({ mergeParams: true });
  protectedRouter.use((req, res, next) => {
    if (!safeEqual(req.params.secret, config.addonSecret)) {
      return res.status(404).end();
    }
    req.addonBaseUrl = `${baseUrlFor(req, config)}/${config.addonSecret}`;
    next();
  });
  protectedRouter.get('/configure', configureHandler);
  protectedRouter.get('/manifest.json', manifestHandler);
  protectedRouter.all('/cache/clear', createCacheClearHandler({
    caches,
    logger,
  }));
  protectedRouter.get('/stream/:type/:id.json', limiter, createStreamHandler({
    config,
    discovery,
    logger,
  }));
  protectedRouter.get('/resolve/:payload/:signature/:filename', limiter, createResolveHandler({
    config,
    playback,
    logger,
  }));
  app.use('/:secret', protectedRouter);

  app.use((_req, res) => res.status(404).end());
  app.use((error, _req, res, _next) => {
    logger.error('Unhandled request error', { errorName: error.name });
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal error' });
    }
  });
  return app;
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual || '');
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function baseUrlFor(req, config) {
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
}

function sanitizedPath(value) {
  return value
    .replace(/^\/[^/]+\/(configure|manifest\.json|stream|resolve)/, '/:secret/$1')
    .replace(/\/resolve\/[^/]+\/[^/]+/, '/resolve/:payload/:signature');
}
