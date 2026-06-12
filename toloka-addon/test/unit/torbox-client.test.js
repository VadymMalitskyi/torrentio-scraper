import assert from 'node:assert/strict';
import test from 'node:test';
import { TorBoxClient } from '../../src/clients/torbox.js';

test('checks cached availability with file metadata', async () => {
  const fetchImpl = async (url, options = {}) => {
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).hashes[0], 'a'.repeat(40));
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('list_files'), 'true');
    return jsonResponse({
      success: true,
      data: [{
        hash: 'a'.repeat(40),
        files: [{ id: 1, name: 'Movie.mkv', size: 1000 }],
      }],
    });
  };
  const client = new TorBoxClient({
    baseUrl: 'https://torbox.example/v1/api',
    token: 'secret-token',
    fetchImpl,
  });
  const entry = await client.getCachedEntry('a'.repeat(40));
  assert.equal(entry.hash, 'a'.repeat(40));
  assert.equal(entry.files[0].name, 'Movie.mkv');
});

test('materializes only cached torrents', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/mylist') && calls.length === 1) {
      return jsonResponse({ success: true, data: [] });
    }
    if (String(url).includes('/createtorrent')) {
      assert.equal(options.body.get('seed'), '3');
      assert.equal(options.body.get('allow_zip'), 'false');
      assert.equal(options.body.get('add_only_if_cached'), 'true');
      const uploaded = Buffer.from(await options.body.get('file').arrayBuffer());
      assert.deepEqual(uploaded, Buffer.from('torrent-bytes'));
      return jsonResponse({ success: true, data: { torrent_id: 12 } });
    }
    if (String(url).includes('/mylist')) {
      return jsonResponse({
        success: true,
        data: {
          id: 12,
          hash: 'a'.repeat(40),
          download_state: 'downloading',
          files: [],
        },
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const client = new TorBoxClient({
    baseUrl: 'https://torbox.example/v1/api',
    token: 'secret-token',
    fetchImpl,
  });
  const result = await client.ensureCachedTorrent({
    infoHash: 'a'.repeat(40),
    bytes: Buffer.from('torrent-bytes'),
  });
  assert.equal(result.id, 12);
  assert.equal(calls[1].options.headers.authorization, 'Bearer secret-token');
});

test('returns undefined when a torrent is not cached', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/mylist')) {
      return jsonResponse({ success: true, data: [] });
    }
    return jsonError('DOWNLOAD_SERVER_ERROR', 400);
  };
  const client = new TorBoxClient({
    baseUrl: 'https://torbox.example/v1/api',
    token: 'secret-token',
    fetchImpl,
  });
  const result = await client.ensureCachedTorrent({
    infoHash: 'a'.repeat(40),
    bytes: Buffer.from('torrent-bytes'),
  });
  assert.equal(result, undefined);
});

test('resolves a token-free CDN URL server-side', async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('token'), 'secret-token');
    return jsonResponse({
      success: true,
      data: 'https://cdn.example/video.mkv',
    });
  };
  const client = new TorBoxClient({
    baseUrl: 'https://torbox.example/v1/api',
    token: 'secret-token',
    fetchImpl,
  });
  assert.equal(
    await client.requestDownloadUrl(1, 2),
    'https://cdn.example/video.mkv',
  );
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(code, status) {
  return new Response(JSON.stringify({
    success: false,
    error: code,
    detail: code,
    data: null,
  }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
