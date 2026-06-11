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
