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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
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

test('continues movie search past the first non-empty query to gather stronger candidates', async () => {
  const queries = [];
  const service = createDiscoveryService({
    config: testConfig({ maxSearchCandidates: 2 }),
    cinemeta: {
      async getMeta() {
        return {
          name: 'In the Mood for Love',
          originalTitle: 'Fa yeung nin wah',
          releaseInfo: '2000',
        };
      },
    },
    wikidata: {
      async getTitlesByImdbId() {
        return [];
      },
    },
    toloka: {
      async search(query) {
        queries.push(query);
        if (query === 'In the Mood for Love 2000') {
          return [{ topicId: 1, url: 'https://toloka.test/t1', title: 'Wrong Movie 2000', attachmentId: 2 }];
        }
        if (query === 'Fa yeung nin wah 2000') {
          return [{ topicId: 2, url: 'https://toloka.test/t2', title: 'Fa yeung nin wah 2000', attachmentId: 3 }];
        }
        return [];
      },
      async getTopic(url) {
        if (url.endsWith('/t1')) {
          return { imdbIds: ['tt7654321'], attachments: [{ id: 2, url: 'https://toloka.test/dl.php?id=2' }] };
        }
        return { imdbIds: ['tt1234567'], attachments: [{ id: 3, url: 'https://toloka.test/dl.php?id=3' }] };
      },
      async downloadTorrent(attachment) {
        return {
          infoHash: 'a'.repeat(40),
          name: attachment.id === 3 ? 'Fa yeung nin wah' : 'Wrong Movie',
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
  assert.equal(releases[0].topicId, 2);
  assert.deepEqual(queries, [
    'In the Mood for Love 2000',
    'Fa yeung nin wah 2000',
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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
      },
    },
    toloka: {
      async search(query) {
        queries.push(query);
        if (query === 'The Boys сезон 5') {
          return [{ topicId: 1, url: 'https://toloka.test/t1', title: 'The Boys сезон 5', attachmentId: 2 }];
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
    'The Boys сезон 5',
    'The Boys 2019',
    'The Boys',
  ]);
});

test('keeps deeper results from each query before final ranking', async () => {
  const service = createDiscoveryService({
    config: testConfig({
      maxSearchCandidates: 1,
      maxSearchResultsPerQuery: 15,
      movieTopicFetchLimit: 1,
    }),
    cinemeta: {
      async getMeta() {
        return {
          name: 'In the Mood for Love',
          originalTitle: 'Fa yeung nin wah',
          releaseInfo: '2000',
        };
      },
    },
    wikidata: {
      async getTitlesByImdbId() {
        return [];
      },
    },
    toloka: {
      async search(query) {
        if (query !== 'Fa yeung nin wah 2000') {
          return [];
        }
        return Array.from({ length: 12 }, (_, index) => ({
          topicId: index + 1,
          url: `https://toloka.test/t${index + 1}`,
          title: index === 11 ? 'Fa yeung nin wah 2000' : `Noise title ${index + 1}`,
          attachmentId: index + 101,
        }));
      },
      async getTopic(url) {
        return {
          imdbIds: [url.endsWith('/t12') ? 'tt1234567' : 'tt7654321'],
          attachments: [{ id: 112, url: 'https://toloka.test/dl.php?id=112' }],
        };
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
  assert.equal(releases[0].topicId, 12);
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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
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

test('continues when a Toloka search query fails', async () => {
  const searchCache = new MemoryCache({ maxWeight: 1000 });
  const queries = [];
  const service = createDiscoveryService({
    config: testConfig({ maxSearchCandidates: 1 }),
    cinemeta: {
      async getMeta() {
        return {
          name: 'In the Mood for Love',
          originalTitle: 'Fa yeung nin wah',
          releaseInfo: '2000',
        };
      },
    },
    wikidata: {
      async getTitlesByImdbId() {
        return [];
      },
    },
    toloka: {
      async search(query) {
        queries.push(query);
        if (query === 'In the Mood for Love 2000') {
          const error = new Error('rate limited');
          error.name = 'TolokaRequestError';
          error.status = 429;
          throw error;
        }
        if (query === 'Fa yeung nin wah 2000') {
          return [{ topicId: 2, url: 'https://toloka.test/t2', title: 'Fa yeung nin wah 2000', attachmentId: 3 }];
        }
        return [];
      },
      async getTopic() {
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
    searchCache,
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
    'In the Mood for Love 2000',
    'Fa yeung nin wah 2000',
  ]);
  assert.equal(searchCache.get('movie:tt1234567')?.length, 1);
});

test('does not negative-cache an empty degraded discovery result', async () => {
  const searchCache = new MemoryCache({ maxWeight: 1000 });
  const service = createDiscoveryService({
    config: testConfig(),
    cinemeta: {
      async getMeta() {
        return {
          name: 'In the Mood for Love',
          originalTitle: 'Fa yeung nin wah',
          releaseInfo: '2000',
        };
      },
    },
    wikidata: {
      async getTitlesByImdbId() {
        return [];
      },
    },
    toloka: {
      async search() {
        const error = new Error('rate limited');
        error.name = 'TolokaRequestError';
        error.status = 429;
        throw error;
      },
    },
    torbox: {
      async getCachedEntry() {
        return undefined;
      },
    },
    searchCache,
    metadataCache: new MemoryCache({ maxWeight: 1000 }),
    torrentCache: new MemoryCache({ maxWeight: 1000, weigh: () => 1 }),
    logger: silentLogger,
  });

  const releases = await service.find({
    type: 'movie',
    imdbId: 'tt1234567',
  });

  assert.equal(releases.length, 0);
  assert.equal(releases.degraded, true);
  assert.equal(searchCache.get('movie:tt1234567'), undefined);
});

test('enriches sparse movie metadata with alternate titles before Toloka search', async () => {
  const queries = [];
  const titleLookups = [];
  const service = createDiscoveryService({
    config: testConfig({ maxSearchCandidates: 2 }),
    cinemeta: {
      async getMeta() {
        return {
          name: 'In the Mood for Love',
          releaseInfo: '2000',
        };
      },
    },
    wikidata: {
      async getTitlesByImdbId(imdbId) {
        titleLookups.push(imdbId);
        return ['Любовний настрій', 'In the Mood for Love'];
      },
    },
    toloka: {
      async search(query) {
        queries.push(query);
        if (query === 'Любовний настрій 2000') {
          return [{ topicId: 2, url: 'https://toloka.test/t2', title: 'Любовний настрій / Fa yeung nin wah (2000)', attachmentId: 3 }];
        }
        return [];
      },
      async getTopic() {
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
  assert.deepEqual(titleLookups, ['tt1234567']);
  assert.deepEqual(queries, [
    'In the Mood for Love 2000',
    'Любовний настрій 2000',
    'In the Mood for Love',
    'Любовний настрій',
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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
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
    wikidata: {
      async getTitlesByImdbId() {
        return [];
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
