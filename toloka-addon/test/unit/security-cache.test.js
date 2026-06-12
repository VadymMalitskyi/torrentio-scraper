import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryCache } from '../../src/cache/memory-cache.js';
import { signPayload, verifyPayload } from '../../src/security/payload.js';
import { redactValue } from '../../src/security/redaction.js';

const secret = 's'.repeat(32);
const selection = {
  v: 1,
  topicId: 1,
  attachmentId: 2,
  infoHash: 'a'.repeat(40),
  path: 'Movie.mkv',
  size: 123,
  imdbId: 'tt1234567',
  issuedAt: 1000,
};

test('signs, verifies, expires, and rejects tampered resolver payloads', () => {
  const signed = signPayload(selection, secret);
  assert.deepEqual(verifyPayload(signed.payload, signed.signature, secret, {
    nowSeconds: 1001,
    ttlSeconds: 10,
  }), selection);
  assert.throws(() => verifyPayload(`${signed.payload}a`, signed.signature, secret, {
    nowSeconds: 1001,
  }));
  assert.throws(() => verifyPayload(signed.payload, signed.signature, secret, {
    nowSeconds: 2000,
    ttlSeconds: 10,
  }), /Expired/);
});

test('redacts nested tokens, cookies, passkeys, and bearer values', () => {
  const value = redactValue({
    token: 'secret',
    nested: {
      cookie: 'session=secret',
      text: 'Bearer abc123',
      url: 'https://x.test/?passkey=abc&ok=1',
    },
  });
  assert.equal(value.token, '[REDACTED]');
  assert.equal(value.nested.cookie, '[REDACTED]');
  assert.equal(value.nested.text, 'Bearer [REDACTED]');
  assert.equal(value.nested.url, 'https://x.test/?passkey=[REDACTED]&ok=1');
});

test('memory cache expires and evicts by weight', () => {
  const cache = new MemoryCache({ maxWeight: 3, weigh: (value) => value.length });
  cache.set('a', 'aa', 10000);
  cache.set('b', 'bb', 10000);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('b'), 'bb');
  cache.set('expired', 'x', -1);
  assert.equal(cache.get('expired'), undefined);
});
