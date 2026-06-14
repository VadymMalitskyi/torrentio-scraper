import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadConfig,
  loadSeedingProbeConfig,
  loadTolokaProbeConfig,
} from '../../src/config.js';

const tolokaEnvironment = {
  TOLOKA_USERNAME: 'user',
  TOLOKA_PASSWORD: 'password',
};

test('login probe only requires Toloka credentials', () => {
  const config = loadTolokaProbeConfig(tolokaEnvironment);
  assert.equal(config.tolokaUsername, 'user');
  assert.equal(config.tolokaBaseUrl, 'https://toloka.to');
});

test('cache probe requires Toloka and TorBox credentials only', () => {
  const config = loadSeedingProbeConfig({
    ...tolokaEnvironment,
    TORBOX_API_TOKEN: 'token',
  });
  assert.equal(config.torboxApiToken, 'token');
  assert.equal(config.torboxBaseUrl, 'https://api.torbox.app/v1/api');
});

test('production config still requires route and signing secrets', () => {
  assert.throws(
    () => loadConfig({
      ...tolokaEnvironment,
      TORBOX_API_TOKEN: 'token',
    }),
    /ADDON_SECRET.*SIGNING_SECRET/,
  );
});

test('production config applies conservative Toloka request budgets by default', () => {
  const config = loadConfig({
    ...tolokaEnvironment,
    TORBOX_API_TOKEN: 'token',
    ADDON_SECRET: 'a'.repeat(32),
    SIGNING_SECRET: 'b'.repeat(32),
  });
  assert.equal(config.movieTopicFetchLimit, 3);
  assert.equal(config.seriesTopicFetchLimit, 5);
  assert.equal(config.maxSearchResultsPerQuery, 25);
  assert.equal(config.movieTorrentDownloadLimit, 5);
  assert.equal(config.seriesTorrentDownloadLimit, 5);
  assert.equal(config.movieReleaseLimit, 1);
  assert.equal(config.seriesReleaseLimit, 4);
  assert.equal(config.movieCandidateDelayMs, 6000);
  assert.equal(config.seriesCandidateDelayMs, 750);
});
