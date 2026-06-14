import assert from 'node:assert/strict';
import test from 'node:test';
import { WikidataClient } from '../../src/clients/wikidata.js';

test('extracts alternate titles from a matching Wikidata entity', async () => {
  const calls = [];
  const client = new WikidataClient({
    baseUrl: 'https://wikidata.test/w/api.php',
    timeoutMs: 1000,
  });

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const parsed = new URL(url);
    const action = parsed.searchParams.get('action');

    if (action === 'query') {
      return jsonResponse({
        query: {
          search: [{ title: 'Q1056853' }],
        },
      });
    }

    if (action === 'wbgetentities') {
      return jsonResponse({
        entities: {
          Q1056853: {
            claims: {
              P345: [{
                mainsnak: {
                  datavalue: {
                    value: 'tt0118694',
                  },
                },
              }],
            },
            labels: {
              en: { value: 'In the Mood for Love' },
              uk: { value: 'Любовний настрій' },
            },
            aliases: {
              en: [{ value: 'In the Mood for Love' }],
            },
          },
        },
      });
    }

    throw new Error(`Unexpected action: ${action}`);
  };

  const titles = await client.getTitlesByImdbId('tt0118694');
  assert.deepEqual(titles, [
    'In the Mood for Love',
    'Любовний настрій',
  ]);
  assert.equal(calls.length, 2);
});

test('ignores Wikidata search hits that do not confirm the IMDb id', async () => {
  const client = new WikidataClient({
    baseUrl: 'https://wikidata.test/w/api.php',
    timeoutMs: 1000,
  });

  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    const action = parsed.searchParams.get('action');

    if (action === 'query') {
      return jsonResponse({
        query: {
          search: [{ title: 'Q999' }],
        },
      });
    }

    if (action === 'wbgetentities') {
      return jsonResponse({
        entities: {
          Q999: {
            claims: {
              P345: [{
                mainsnak: {
                  datavalue: {
                    value: 'tt7654321',
                  },
                },
              }],
            },
            labels: {
              en: { value: 'Wrong Movie' },
            },
          },
        },
      });
    }

    throw new Error(`Unexpected action: ${action}`);
  };

  const titles = await client.getTitlesByImdbId('tt0118694');
  assert.deepEqual(titles, []);
});

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
