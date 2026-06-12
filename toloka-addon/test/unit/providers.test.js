import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { hasExactImdbMatch, parseSearchResults, parseTopicPage } from '../../src/clients/toloka.js';
import { matchTorBoxFile, torrentStatus } from '../../src/clients/torbox.js';

test('parses Toloka search candidates', async () => {
  const html = await fs.readFile(new URL('../fixtures/toloka-search.html', import.meta.url), 'utf8');
  assert.deepEqual(parseSearchResults(html), [{
    topicId: 123,
    url: 'https://toloka.to/viewtopic.php?t=123',
    title: 'Movie 2024 1080p',
    attachmentId: 456,
    attachmentUrl: 'https://toloka.to/dl.php?id=456',
    seeds: 8,
    leeches: 2,
    cells: ['Movie 2024 1080p', '8', '2', 'torrent'],
  }]);
});

test('parses current Toloka tracker rows with td.topictitle and t123 links', () => {
  const html = `
    <table>
      <tr class="prow1">
        <td class="topictitle genmed">
          <a class="genmed" href="t676823"><b>Movie / Example (2024) WEBRip</b></a>
        </td>
        <td class="genmed">
          <a class="genmed" href="download.php?id=690621">[DL]</a>
        </td>
        <td class="seedmed"><b>13</b></td>
        <td class="leechmed"><b>0</b></td>
      </tr>
    </table>
  `;
  assert.deepEqual(parseSearchResults(html), [{
    topicId: 676823,
    url: 'https://toloka.to/t676823',
    title: 'Movie / Example (2024) WEBRip',
    attachmentId: 690621,
    attachmentUrl: 'https://toloka.to/download.php?id=690621',
    seeds: 13,
    leeches: 0,
    cells: ['Movie / Example (2024) WEBRip', '[DL]', '13', '0'],
  }]);
});

test('requires an exact IMDb ID from the topic', async () => {
  const html = await fs.readFile(new URL('../fixtures/toloka-topic.html', import.meta.url), 'utf8');
  const topic = parseTopicPage(html, 'https://toloka.to/t42');
  assert.equal(topic.topicId, 42);
  assert.equal(hasExactImdbMatch(topic, 'tt1234567'), true);
  assert.equal(hasExactImdbMatch(topic, 'tt1234568'), false);
  assert.equal(topic.attachments[0].id, 456);
});

test('normalizes TorBox status', () => {
  assert.equal(torrentStatus({
    download_state: 'uploading',
    files: [{ id: 1 }],
  }), 'ready');
  assert.equal(torrentStatus({ download_state: 'metaDL', files: [] }), 'downloading');
  assert.equal(torrentStatus({ download_state: 'error', files: [] }), 'failed');
});

test('matches TorBox file by path and size without guessing', () => {
  const files = [
    { id: 1, name: '/root/Season 01/Show.S01E02.mkv', size: 1000 },
    { id: 2, name: '/other/Show.S01E02.mkv', size: 2000 },
  ];
  assert.equal(matchTorBoxFile(files, 'Season 01/Show.S01E02.mkv', 1000).id, 1);
  assert.equal(matchTorBoxFile(files, 'Show.S01E02.mkv', 3000), undefined);
});
