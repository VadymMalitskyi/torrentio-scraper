import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('sanitized fixtures contain no credential material', async () => {
  const directory = new URL('../fixtures/', import.meta.url);
  const names = await fs.readdir(directory);
  const contents = await Promise.all(
    names.map((name) => fs.readFile(new URL(name, directory), 'utf8')),
  );
  const joined = contents.join('\n');
  assert.doesNotMatch(joined, /(?:passkey|set-cookie|authorization|bearer\s+|password=|token=)/i);
});
