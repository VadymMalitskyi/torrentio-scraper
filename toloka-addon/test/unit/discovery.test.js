import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCache } from '../../src/cache/memory-cache.js';
import { createDiscoveryService } from '../../src/services/discovery.js';
import { testConfig, silentLogger } from '../helpers.js';

test('returns only TorBox-cached Toloka releases', async () => {
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return { name: 'Movie', releaseInfo: '2024' };
      },
    },
    toloka: {
      async search() {
        return [{ topicId: 1, url: 'https://toloka.test/t1', title: 'Movie 2024', attachmentId: 2 }];
      },
      async getTopic() {
        return { imdbIds: ['tt1234567'], attachments: [{ id: 2, url: 'https://toloka.test/dl.php?id=2' }] };
      },
      async downloadTorrent() {
        return {
          infoHash: 'a'.repeat(40),
          name: 'Movie',
          bytes: Buffer.from('torrent'),
          files: [{ path: 'Movie.mkv', size: 1000 }],
        };
      },
    },
    torbox: {
      async getCachedEntry() {
        return { hash: 'a'.repeat(40), files: [{ name: 'Movie.mkv', size: 1000 }] };
      },
    },
    searchCache: new MemoryCache({ maxWeight: 1000 }),
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'movie',
    imdbId: 'tt1234567',
  });
  assert.equal(releases.length, 1);
  assert.equal(releases[0].infoHash, 'a'.repeat(40));
});

test('drops uncached Toloka releases', async () => {
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return { name: 'Movie', releaseInfo: '2024' };
      },
    },
    toloka: {
      async search() {
        return [{ topicId: 1, url: 'https://toloka.test/t1', title: 'Movie 2024', attachmentId: 2 }];
      },
      async getTopic() {
        return { imdbIds: ['tt1234567'], attachments: [{ id: 2, url: 'https://toloka.test/dl.php?id=2' }] };
      },
      async downloadTorrent() {
        return {
          infoHash: 'a'.repeat(40),
          name: 'Movie',
          bytes: Buffer.from('torrent'),
          files: [{ path: 'Movie.mkv', size: 1000 }],
        };
      },
    },
    torbox: {
      async getCachedEntry() {
        return undefined;
      },
    },
    searchCache: new MemoryCache({ maxWeight: 1000 }),
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'movie',
    imdbId: 'tt1234567',
  });
  assert.equal(releases.length, 0);
});

test('stops searching after the first query that returns candidates', async () => {
  const queries = [];
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return { name: 'Hotel Transylvania 4: Transformania', releaseInfo: '2022' };
      },
    },
    toloka: {
      async search(query) {
        queries.push(query);
        if (query === 'Hotel Transylvania Transformania 2022') {
          return [{ topicId: 1, url: 'https://toloka.test/t1', title: 'Movie 2022', attachmentId: 2 }];
        }
        return [];
      },
      async getTopic() {
        return { imdbIds: ['tt1234567'], attachments: [{ id: 2, url: 'https://toloka.test/dl.php?id=2' }] };
      },
      async downloadTorrent() {
        return {
          infoHash: 'a'.repeat(40),
          name: 'Movie',
          bytes: Buffer.from('torrent'),
          files: [{ path: 'Movie.mkv', size: 1000 }],
        };
      },
    },
    torbox: {
      async getCachedEntry() {
        return { hash: 'a'.repeat(40), files: [{ name: 'Movie.mkv', size: 1000 }] };
      },
    },
    searchCache: new MemoryCache({ maxWeight: 1000 }),
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'movie',
    imdbId: 'tt1234567',
  });
  assert.equal(releases.length, 1);
  assert.deepEqual(queries, [
    'Hotel Transylvania 4: Transformania 2022',
    'Hotel Transylvania 4 Transformania 2022',
    'Hotel Transylvania Transformania 2022',
  ]);
});

test('continues sequential candidate processing after a transient Toloka failure', async () => {
  const seenTopics = [];
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return { name: 'Movie', releaseInfo: '2024' };
      },
    },
    toloka: {
      async search() {
        return [
          { topicId: 1, url: 'https://toloka.test/t1', title: 'Bad candidate', attachmentId: 2 },
          { topicId: 2, url: 'https://toloka.test/t2', title: 'Good candidate', attachmentId: 3 },
        ];
      },
      async getTopic(url) {
        seenTopics.push(url);
        if (url.endsWith('/t1')) {
          const error = new Error('rate limited');
          error.name = 'TolokaRequestError';
          error.status = 429;
          throw error;
        }
        return { imdbIds: ['tt1234567'], attachments: [{ id: 3, url: 'https://toloka.test/dl.php?id=3' }] };
      },
      async downloadTorrent() {
        return {
          infoHash: 'a'.repeat(40),
          name: 'Movie',
          bytes: Buffer.from('torrent'),
          files: [{ path: 'Movie.mkv', size: 1000 }],
        };
      },
    },
    torbox: {
      async getCachedEntry() {
        return { hash: 'a'.repeat(40), files: [{ name: 'Movie.mkv', size: 1000 }] };
      },
    },
    searchCache: new MemoryCache({ maxWeight: 1000 }),
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'movie',
    imdbId: 'tt1234567',
  });
  assert.equal(releases.length, 1);
  assert.deepEqual(seenTopics, [
    'https://toloka.test/t1',
    'https://toloka.test/t2',
  ]);
});
