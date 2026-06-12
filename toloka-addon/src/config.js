import { z } from 'zod';

const secret = z.string().min(32);
const positiveInteger = (fallback) => z.coerce.number().int().positive().default(fallback);

const commonSchema = z.object({
  TOLOKA_USERNAME: z.string().min(1),
  TOLOKA_PASSWORD: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TOLOKA_BASE_URL: z.string().url().default('https://toloka.to'),
  HTTP_TIMEOUT_MS: positiveInteger(15000),
  MAX_TORRENT_BYTES: positiveInteger(10 * 1024 * 1024),
});

const schema = commonSchema.extend({
  TORBOX_API_TOKEN: z.string().min(1),
  ADDON_SECRET: secret.regex(/^[A-Za-z0-9_-]+$/, 'must be URL-safe'),
  SIGNING_SECRET: secret,
  PORT: z.coerce.number().int().min(1).max(65535).default(7000),
  PUBLIC_BASE_URL: z.string().url().optional(),
  CINEMETA_BASE_URL: z.string().url().default('https://v3-cinemeta.strem.io'),
  TORBOX_BASE_URL: z.string().url().default('https://api.torbox.app/v1/api'),
  TOLOKA_CACHE_TTL_SECONDS: positiveInteger(21600),
  TOLOKA_NEGATIVE_CACHE_TTL_SECONDS: positiveInteger(900),
  TORRENT_CACHE_TTL_SECONDS: positiveInteger(1800),
  TORRENT_CACHE_MAX_BYTES: positiveInteger(64 * 1024 * 1024),
  MAX_SEARCH_CANDIDATES: positiveInteger(10),
  TOLOKA_REQUEST_CONCURRENCY: positiveInteger(2),
  MOVIE_TOPIC_FETCH_LIMIT: positiveInteger(3),
  SERIES_TOPIC_FETCH_LIMIT: positiveInteger(3),
  MOVIE_TORRENT_DOWNLOAD_LIMIT: positiveInteger(2),
  SERIES_TORRENT_DOWNLOAD_LIMIT: positiveInteger(2),
  MOVIE_RELEASE_LIMIT: positiveInteger(1),
  SERIES_RELEASE_LIMIT: positiveInteger(4),
  SERIES_CANDIDATE_DELAY_MS: z.coerce.number().int().min(0).default(750),
  RESOLVER_TTL_SECONDS: positiveInteger(86400),
  MIN_VIDEO_BYTES: positiveInteger(100 * 1024 * 1024),
});

const seedingProbeSchema = commonSchema.extend({
  TORBOX_API_TOKEN: z.string().min(1),
  TORBOX_BASE_URL: z.string().url().default('https://api.torbox.app/v1/api'),
});

export function loadConfig(environment = process.env) {
  const data = parse(schema, environment);

  return Object.freeze({
    ...commonConfig(data),
    torboxApiToken: data.TORBOX_API_TOKEN,
    addonSecret: data.ADDON_SECRET,
    signingSecret: data.SIGNING_SECRET,
    port: data.PORT,
    publicBaseUrl: trimSlash(data.PUBLIC_BASE_URL),
    cinemetaBaseUrl: trimSlash(data.CINEMETA_BASE_URL),
    torboxBaseUrl: trimSlash(data.TORBOX_BASE_URL),
    tolokaCacheTtlMs: data.TOLOKA_CACHE_TTL_SECONDS * 1000,
    tolokaNegativeCacheTtlMs: data.TOLOKA_NEGATIVE_CACHE_TTL_SECONDS * 1000,
    torrentCacheTtlMs: data.TORRENT_CACHE_TTL_SECONDS * 1000,
    torrentCacheMaxBytes: data.TORRENT_CACHE_MAX_BYTES,
    maxSearchCandidates: data.MAX_SEARCH_CANDIDATES,
    tolokaRequestConcurrency: data.TOLOKA_REQUEST_CONCURRENCY,
    movieTopicFetchLimit: data.MOVIE_TOPIC_FETCH_LIMIT,
    seriesTopicFetchLimit: data.SERIES_TOPIC_FETCH_LIMIT,
    movieTorrentDownloadLimit: data.MOVIE_TORRENT_DOWNLOAD_LIMIT,
    seriesTorrentDownloadLimit: data.SERIES_TORRENT_DOWNLOAD_LIMIT,
    movieReleaseLimit: data.MOVIE_RELEASE_LIMIT,
    seriesReleaseLimit: data.SERIES_RELEASE_LIMIT,
    seriesCandidateDelayMs: data.SERIES_CANDIDATE_DELAY_MS,
    resolverTtlSeconds: data.RESOLVER_TTL_SECONDS,
    minVideoBytes: data.MIN_VIDEO_BYTES,
  });
}

export function loadTolokaProbeConfig(environment = process.env) {
  return Object.freeze(commonConfig(parse(commonSchema, environment)));
}

export function loadSeedingProbeConfig(environment = process.env) {
  const data = parse(seedingProbeSchema, environment);
  return Object.freeze({
    ...commonConfig(data),
    torboxApiToken: data.TORBOX_API_TOKEN,
    torboxBaseUrl: trimSlash(data.TORBOX_BASE_URL),
  });
}

function commonConfig(data) {
  return {
    tolokaUsername: data.TOLOKA_USERNAME,
    tolokaPassword: data.TOLOKA_PASSWORD,
    logLevel: data.LOG_LEVEL,
    tolokaBaseUrl: trimSlash(data.TOLOKA_BASE_URL),
    httpTimeoutMs: data.HTTP_TIMEOUT_MS,
    maxTorrentBytes: data.MAX_TORRENT_BYTES,
  };
}

function parse(targetSchema, environment) {
  const result = targetSchema.safeParse(environment);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid configuration: ${names.join(', ')}`);
  }
  return result.data;
}

function trimSlash(value) {
  return value?.replace(/\/+$/, '');
}
