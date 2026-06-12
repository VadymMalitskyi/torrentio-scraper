import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCache } from '../../src/cache/memory-cache.js';
import { createPlaybackService } from '../../src/services/playback.js';
import { testConfig } from '../helpers.js';

test('refetches and hash-verifies a torrent after a cold start', async () => {
  const selection = {
    topicId: 10,
    attachmentId: 20,
    imdbId: 'tt1234567',
    infoHash: 'a'.repeat(40),
    path: 'Movie.mkv',
    size: 1000,
  };
  const toloka = {
    async getTopic() {
      return {
        imdbIds: ['tt1234567'],
        attachments: [],
      };
    },
    attachmentForId(id) {
      return { id, url: `https://toloka.test/dl.php?id=${id}` };
    },
    async downloadTorrent() {
      return {
        infoHash: selection.infoHash,
        bytes: Buffer.from('torrent'),
      };
    },
  };
  const torbox = {
    async ensureCachedTorrent() {
      return {
        id: 30,
        download_finished: true,
        files: [{ id: 40, name: 'Movie.mkv', size: 1000 }],
      };
    },
    async requestDownloadUrl() {
      return 'https://cdn.example/movie';
    },
  };
  const service = createPlaybackService({
    config: testConfig(),
    toloka,
    torbox,
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
  });
  assert.deepEqual(await service.resolve(selection), {
    status: 'ready',
    url: 'https://cdn.example/movie',
  });
});

test('rejects a changed torrent after a cold start', async () => {
  const service = createPlaybackService({
    config: testConfig(),
    toloka: {
      async getTopic() {
        return { imdbIds: ['tt1234567'], attachments: [] };
      },
      attachmentForId(id) {
        return { id, url: 'https://toloka.test/torrent' };
      },
      async downloadTorrent() {
        return { infoHash: 'b'.repeat(40), bytes: Buffer.from('torrent') };
      },
    },
    torbox: {},
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
  });
  await assert.rejects(service.resolve({
    topicId: 10,
    attachmentId: 20,
    imdbId: 'tt1234567',
    infoHash: 'a'.repeat(40),
    path: 'Movie.mkv',
    size: 1000,
  }), (error) => error.code === 'TORRENT_HASH_CHANGED');
});

test('rejects uncached TorBox items during resolve', async () => {
  const service = createPlaybackService({
    config: testConfig(),
    toloka: {
      async getTopic() {
        return { imdbIds: ['tt1234567'], attachments: [] };
      },
      attachmentForId(id) {
        return { id, url: 'https://toloka.test/torrent' };
      },
      async downloadTorrent() {
        return { infoHash: 'a'.repeat(40), bytes: Buffer.from('torrent') };
      },
    },
    torbox: {
      async ensureCachedTorrent() {
        return undefined;
      },
    },
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
  });
  await assert.rejects(service.resolve({
    topicId: 10,
    attachmentId: 20,
    imdbId: 'tt1234567',
    infoHash: 'a'.repeat(40),
    path: 'Movie.mkv',
    size: 1000,
  }), (error) => error.code === 'TORBOX_UNCACHED');
});
