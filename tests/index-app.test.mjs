import test from 'node:test';
import assert from 'node:assert/strict';

const originalDocument = globalThis.document;
globalThis.document = { readyState: 'loading', addEventListener() {} };
const indexModule = await import('../index.js');
globalThis.document = originalDocument;

test('keeps the legacy pet profile application entry on the shared app', async () => {
  assert.equal(typeof indexModule.createApp, 'function');

  const calls = [];
  const host = {
    getNativeConnectionProfiles: () => [],
    run: async command => calls.push(['run', command]),
    rotateSecret: async (key, id) => calls.push(['rotate', key, id]),
  };
  const app = indexModule.createApp(host, { profiles: [] }, () => {}, () => {});

  await app.applyProfile({
    apiUrl: 'https://example.test/v1',
    model: 'legacy-model',
    secretId: 'secret-1',
    preset: 'must-not-run',
  });

  assert.deepEqual(calls, [
    ['run', '/api-url api=custom connect=false quiet=true "https://example.test/v1"'],
    ['rotate', 'api_key_custom', 'secret-1'],
    ['run', '/api quiet=true custom'],
    ['run', '/model quiet=true "legacy-model"'],
    ['run', '/api-url api=custom connect=true quiet=true "https://example.test/v1"'],
  ]);
});
