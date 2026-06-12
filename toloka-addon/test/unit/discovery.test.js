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

test('series discovery continues past the first non-empty query to gather better candidates', async () => {
  const queries = [];
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return { name: 'The Boys', releaseInfo: '2019–2026' };
      },
    },
    toloka: {
      async search(query) {
        queries.push(query);
        if (query === 'The Boys Season 5') {
          return [{ topicId: 1, url: 'https://toloka.test/t1', title: 'The Boys Season 5', attachmentId: 2 }];
        }
        if (query === 'The Boys') {
          return [{ topicId: 2, url: 'https://toloka.test/t2', title: 'The Boys S05E02', attachmentId: 3 }];
        }
        return [];
      },
      async getTopic(url) {
        return {
          imdbIds: ['tt1234567'],
          attachments: [{ id: url.endsWith('/t1') ? 2 : 3, url: 'https://toloka.test/dl.php?id=2' }],
        };
      },
      async downloadTorrent() {
        return {
          infoHash: 'a'.repeat(40),
          name: 'The Boys',
          bytes: Buffer.from('torrent'),
          files: [{ path: 'The.Boys.S05E02.mkv', size: 1000 }],
        };
      },
    },
    torbox: {
      async getCachedEntry() {
        return { hash: 'a'.repeat(40), files: [{ name: 'The.Boys.S05E02.mkv', size: 1000 }] };
      },
    },
    searchCache: new MemoryCache({ maxWeight: 1000 }),
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'series',
    imdbId: 'tt1234567',
    season: 5,
    episode: 2,
  });
  assert.equal(releases.length, 2);
  assert.deepEqual(queries, [
    'The Boys Season 5',
    'The Boys',
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

test('narrows series candidates before fetching Toloka topics', async () => {
  const seenTopics = [];
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return { name: 'The Boys', releaseInfo: '2019' };
      },
    },
    toloka: {
      async search() {
        return [
          { topicId: 1, url: 'https://toloka.test/t1', title: 'The Boys Seasons 1-3 1080p', attachmentId: 2, seeds: 80 },
          { topicId: 2, url: 'https://toloka.test/t2', title: 'The Boys S03E07 1080p', attachmentId: 3, seeds: 10 },
          { topicId: 3, url: 'https://toloka.test/t3', title: 'The Boys Season 3 1080p', attachmentId: 4, seeds: 20 },
          { topicId: 4, url: 'https://toloka.test/t4', title: 'The Boys Season 1 1080p', attachmentId: 5, seeds: 50 },
        ];
      },
      async getTopic(url) {
        seenTopics.push(url);
        return { imdbIds: ['tt1234567'], attachments: [{ id: 3, url: 'https://toloka.test/dl.php?id=3' }] };
      },
      async downloadTorrent() {
        return {
          infoHash: 'a'.repeat(40),
          name: 'The Boys',
          bytes: Buffer.from('torrent'),
          files: [{ path: 'The.Boys.S03E07.mkv', size: 1000 }],
        };
      },
    },
    torbox: {
      async getCachedEntry() {
        return { hash: 'a'.repeat(40), files: [{ name: 'The.Boys.S03E07.mkv', size: 1000 }] };
      },
    },
    searchCache: new MemoryCache({ maxWeight: 1000 }),
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'series',
    imdbId: 'tt1234567',
    season: 3,
    episode: 7,
  });
  assert.equal(releases.length, 1);
  assert.deepEqual(seenTopics, [
    'https://toloka.test/t2',
    'https://toloka.test/t3',
    'https://toloka.test/t1',
  ]);
});

test('stops movie discovery after reaching the release limit', async () => {
  const seenTopics = [];
  const service = createDiscoveryService({
    config: testConfig({ movieReleaseLimit: 1 }),
    cinemeta: {
      async getMeta() {
        return { name: 'Movie', releaseInfo: '2024' };
      },
    },
    toloka: {
      async search() {
        return [
          { topicId: 1, url: 'https://toloka.test/t1', title: 'Movie 2024', attachmentId: 2 },
          { topicId: 2, url: 'https://toloka.test/t2', title: 'Movie 2024 alt', attachmentId: 3 },
        ];
      },
      async getTopic(url) {
        seenTopics.push(url);
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
  assert.deepEqual(seenTopics, ['https://toloka.test/t1']);
});

test('stops series discovery after reaching the topic fetch limit', async () => {
  const seenTopics = [];
  const service = createDiscoveryService({
    config: testConfig({
      seriesTopicFetchLimit: 2,
      seriesCandidateDelayMs: 0,
    }),
    cinemeta: {
      async getMeta() {
        return { name: 'The Boys', releaseInfo: '2019' };
      },
    },
    toloka: {
      async search() {
        return [
          { topicId: 1, url: 'https://toloka.test/t1', title: 'The Boys S03E07', attachmentId: 2 },
          { topicId: 2, url: 'https://toloka.test/t2', title: 'The Boys Season 3', attachmentId: 3 },
          { topicId: 3, url: 'https://toloka.test/t3', title: 'The Boys Seasons 1-3', attachmentId: 4 },
        ];
      },
      async getTopic(url) {
        seenTopics.push(url);
        return { imdbIds: ['tt1234567'], attachments: [] };
      },
      async downloadTorrent() {
        throw new Error('should not download');
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
    type: 'series',
    imdbId: 'tt1234567',
    season: 3,
    episode: 7,
  });
  assert.equal(releases.length, 0);
  assert.deepEqual(seenTopics, [
    'https://toloka.test/t1',
    'https://toloka.test/t2',
  ]);
});
