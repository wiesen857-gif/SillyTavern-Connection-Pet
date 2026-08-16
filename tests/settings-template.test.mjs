import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings offers model retrieval without an API apply action', async () => {
  const html = await readFile(new URL('../settings.html', import.meta.url), 'utf8');

  assert.match(html, /id="cp-fetch-models"/);
  assert.match(html, /id="cp-model-options"/);
  assert.doesNotMatch(html, /id="cp-apply-profile"/);
});
