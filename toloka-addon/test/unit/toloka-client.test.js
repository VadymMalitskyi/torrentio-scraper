import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { TolokaClient } from '../../src/clients/toloka.js';
import { silentLogger } from '../helpers.js';

test('submits the current Toloka login form and performs a search', async () => {
  const searchHtml = await fs.readFile(
    new URL('../fixtures/toloka-search.html', import.meta.url),
    'utf8',
  );
  const calls = [];
  const http = {
    async cookieCount() {
      return 1;
    },
    async request(url, options = {}) {
      calls.push({ url: String(url), options });
      if (calls.length === 1) {
        return htmlResponse('<form name="login"><input name="password"></form>');
      }
      if (calls.length === 2) {
        assert.equal(options.method, 'POST');
        assert.equal(options.body.get('username'), 'user');
        assert.equal(options.body.get('password'), 'password');
        assert.equal(options.body.get('autologin'), 'on');
        return htmlResponse('<meta http-equiv="refresh" content="1;url=index.php">');
      }
      if (calls.length === 3) {
        return htmlResponse('<a href="/login.php?logout=true">logout</a>');
      }
      return htmlResponse(searchHtml);
    },
  };
  const client = new TolokaClient({
    baseUrl: 'https://toloka.to',
    username: 'user',
    password: 'password',
    timeoutMs: 1000,
    maxTorrentBytes: 100000,
    logger: silentLogger,
    http,
  });
  const candidates = await client.search('Movie 2024');
  assert.equal(candidates[0].topicId, 123);
  assert.match(calls[3].url, /tracker\.php\?nm=Movie\+2024/);
});

test('rejects Toloka failed-login pages even when cookies exist', async () => {
  let call = 0;
  const client = new TolokaClient({
    baseUrl: 'https://toloka.to',
    username: 'invalid',
    password: 'invalid',
    timeoutMs: 1000,
    maxTorrentBytes: 100000,
    logger: silentLogger,
    http: {
      async request() {
        call += 1;
        if (call === 1) {
          return htmlResponse('<form name="login"><input name="password"></form>');
        }
        return htmlResponse('Такий псевдонім не існує, або не збігається пароль.');
      },
    },
  });
  await assert.rejects(client.login(), /authentication failed/i);
});

test('constructs a validated attachment locator for cold starts', () => {
  const client = new TolokaClient({
    baseUrl: 'https://toloka.to',
    username: 'user',
    password: 'password',
    timeoutMs: 1000,
    maxTorrentBytes: 100000,
    logger: silentLogger,
  });
  assert.deepEqual(client.attachmentForId(456), {
    id: 456,
    url: 'https://toloka.to/dl.php?id=456',
  });
  assert.throws(() => client.attachmentForId(-1));
});

test('retries transient Toloka request failures before succeeding', async () => {
  const calls = [];
  const searchHtml = await fs.readFile(
    new URL('../fixtures/toloka-search.html', import.meta.url),
    'utf8',
  );
  const http = {
    async request(url, options = {}) {
      calls.push({ url: String(url), options });
      if (calls.length === 1) {
        return htmlResponse('<form name="login"><input name="password"></form>');
      }
      if (calls.length === 2) {
        return htmlResponse('<meta http-equiv="refresh" content="1;url=index.php">');
      }
      if (calls.length === 3) {
        return htmlResponse('<a href="/login.php?logout=true">logout</a>');
      }
      if (calls.length === 4 || calls.length === 5) {
        return new Response('slow down', { status: 429 });
      }
      return htmlResponse(searchHtml);
    },
  };
  const client = new TolokaClient({
    baseUrl: 'https://toloka.to',
    username: 'user',
    password: 'password',
    timeoutMs: 1000,
    maxTorrentBytes: 100000,
    logger: silentLogger,
    http,
  });
  const candidates = await client.search('Movie 2024');
  assert.equal(candidates[0].topicId, 123);
  assert.equal(calls.length, 6);
});

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
  });
}
