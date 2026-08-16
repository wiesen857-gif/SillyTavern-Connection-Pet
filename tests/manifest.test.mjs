import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest targets the supported host and declares Tavern Helper as an extension dependency', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '0.4.2');
  assert.equal(manifest.minimum_client_version, '1.16.0');
  assert.deepEqual(manifest.dependencies, ['third-party/JS-Slash-Runner']);
  assert.deepEqual(manifest.requires, []);
});
