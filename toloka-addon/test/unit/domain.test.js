import assert from 'node:assert/strict';
import test from 'node:test';
import { toTorrentFile } from 'parse-torrent';
import { parseStremioId } from '../../src/domain/stremio-id.js';
import { buildSearchQueries } from '../../src/domain/release.js';
import { parseTorrentBytes } from '../../src/domain/torrent.js';
import { matchesEpisode, selectVideoFiles } from '../../src/domain/video-match.js';

test('parses movie and series Stremio IDs', () => {
  assert.deepEqual(parseStremioId('movie', 'tt0111161'), {
    type: 'movie',
    imdbId: 'tt0111161',
  });
  assert.deepEqual(parseStremioId('series', 'tt1234567:2:9'), {
    type: 'series',
    imdbId: 'tt1234567',
    season: 2,
    episode: 9,
  });
  assert.throws(() => parseStremioId('series', 'tt1234567'));
});

test('builds deduplicated title and year searches', () => {
  assert.deepEqual(buildSearchQueries({
    name: 'Example',
    originalTitle: 'Example',
    aliases: ['Приклад'],
    releaseInfo: '2024',
  }), ['Example 2024', 'Приклад 2024', 'Example', 'Приклад']);
});

test('builds normalized fallback queries for title variants', () => {
  assert.deepEqual(buildSearchQueries({
    name: 'Hotel Transylvania 4: Transformania',
    releaseInfo: '2022',
  }), [
    'Hotel Transylvania 4: Transformania 2022',
    'Hotel Transylvania 4 Transformania 2022',
    'Hotel Transylvania Transformania 2022',
    'Transformania 2022',
    'Hotel Transylvania 4: Transformania',
    'Hotel Transylvania 4 Transformania',
  ]);
});

test('matches common episode formats without numeric prefix collisions', () => {
  assert.equal(matchesEpisode('Show.S01E02.mkv', 1, 2), true);
  assert.equal(matchesEpisode('Show.1x02.mkv', 1, 2), true);
  assert.equal(matchesEpisode('Show.S01E01-E03.mkv', 1, 2), true);
  assert.equal(matchesEpisode('Show.S01E20.mkv', 1, 2), false);
});

test('selects movie and series video files', () => {
  const files = [
    { path: 'Show.S01E01.mkv', size: 1000 },
    { path: 'Show.S01E02.mkv', size: 1200 },
    { path: 'sample.mkv', size: 500 },
  ];
  assert.deepEqual(selectVideoFiles(files, {
    type: 'series',
    season: 1,
    episode: 2,
  }, { minVideoBytes: 100 }).map((file) => file.path), ['Show.S01E02.mkv']);
  assert.equal(selectVideoFiles(files, { type: 'movie' }, { minVideoBytes: 100 })[0].size, 1200);
});

test('parses torrent bytes and only exposes tracker hostnames', async () => {
  const bytes = toTorrentFile({
    info: {
      name: Buffer.from('Example'),
      'piece length': 16384,
      pieces: Buffer.alloc(20),
      files: [{
        length: 1234,
        path: [Buffer.from('Example.mkv')],
      }],
      private: 1,
    },
    announce: ['https://tracker.example/announce?passkey=secret'],
  });
  const torrent = await parseTorrentBytes(bytes);
  assert.equal(torrent.private, true);
  assert.equal(torrent.files[0].path, 'Example/Example.mkv');
  assert.deepEqual(torrent.trackers, ['tracker.example']);
  assert.match(torrent.infoHash, /^[a-f0-9]{40}$/);
});

test('rejects HTML as torrent data', async () => {
  await assert.rejects(
    parseTorrentBytes(Buffer.from('<html>login</html>')),
    /HTML/,
  );
});
