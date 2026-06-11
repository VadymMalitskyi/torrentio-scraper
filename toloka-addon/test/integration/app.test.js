import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../../src/app.js';
import { testConfig, silentLogger } from '../helpers.js';

test('serves protected manifest and signed stream URLs', async (t) => {
  const config = testConfig();
  const app = createApp(config, {
    logger: silentLogger,
    dependencies: {
      discovery: {
        async find() {
          return [{
            topicId: 1,
            attachmentId: 2,
            infoHash: 'a'.repeat(40),
            path: 'Movie.mkv',
            size: 1234,
            releaseTitle: 'Movie 1080p',
            seeds: 5,
          }];
        },
      },
      playback: {
        async resolve() {
          return { status: 'ready', url: 'https://cdn.example/video' };
        },
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.equal((await fetch(`${base}/wrong/manifest.json`)).status, 404);
  const manifestResponse = await fetch(`${base}/${config.addonSecret}/manifest.json`);
  assert.equal(manifestResponse.status, 200);
  assert.equal(manifestResponse.headers.get('access-control-allow-origin'), '*');
  assert.equal((await manifestResponse.json()).id, 'com.vadymmalitskyi.toloka');

  const preflightResponse = await fetch(`${base}/${config.addonSecret}/manifest.json`, {
    method: 'OPTIONS',
  });
  assert.equal(preflightResponse.status, 204);
  assert.equal(preflightResponse.headers.get('access-control-allow-origin'), '*');

  const cacheClearResponse = await fetch(`${base}/${config.addonSecret}/cache/clear`, {
    method: 'POST',
  });
  assert.equal(cacheClearResponse.status, 200);
  assert.equal(cacheClearResponse.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await cacheClearResponse.json(), {
    ok: true,
    cleared: ['metadata', 'search', 'torrent'],
  });

  const streamResponse = await fetch(`${base}/${config.addonSecret}/stream/movie/tt0111161.json`);
  const streamBody = await streamResponse.json();
  assert.equal(streamBody.streams.length, 1);
  assert.match(streamBody.streams[0].url, /\/resolve\//);

  const resolveUrl = new URL(streamBody.streams[0].url);
  resolveUrl.host = new URL(base).host;
  resolveUrl.protocol = 'http:';
  const resolveResponse = await fetch(resolveUrl, { redirect: 'manual' });
  assert.equal(resolveResponse.status, 302);
  assert.equal(resolveResponse.headers.get('location'), 'https://cdn.example/video');
});
