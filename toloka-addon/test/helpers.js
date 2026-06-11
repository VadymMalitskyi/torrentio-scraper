export function testConfig(overrides = {}) {
  return {
    tolokaUsername: 'toloka-user',
    tolokaPassword: 'toloka-password',
    torboxApiToken: 'torbox-token',
    addonSecret: 'a'.repeat(32),
    signingSecret: 'b'.repeat(32),
    port: 7000,
    publicBaseUrl: 'https://addon.example',
    logLevel: 'error',
    tolokaBaseUrl: 'https://toloka.example',
    cinemetaBaseUrl: 'https://cinemeta.example',
    torboxBaseUrl: 'https://torbox.example/v1/api',
    tolokaCacheTtlMs: 21600000,
    tolokaNegativeCacheTtlMs: 900000,
    torrentCacheTtlMs: 1800000,
    torrentCacheMaxBytes: 67108864,
    maxSearchCandidates: 10,
    tolokaRequestConcurrency: 2,
    httpTimeoutMs: 15000,
    resolverTtlSeconds: 86400,
    maxTorrentBytes: 10485760,
    minVideoBytes: 100,
    ...overrides,
  };
}

export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
