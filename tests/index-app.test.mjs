import test from 'node:test';
import assert from 'node:assert/strict';

const originalDocument = globalThis.document;
globalThis.document = { readyState: 'loading', addEventListener() {} };
const indexModule = await import('../index.js');
globalThis.document = originalDocument;

test('exposes only the tagged-reference profile application entry', async () => {
  assert.equal(typeof indexModule.createApp, 'function');

  const calls = [];
  const host = {
    getNativeConnectionProfiles: () => [{
      id: 'native-1',
      name: '酒馆配置',
      mode: 'cc',
      api: 'custom',
      'api-url': 'https://example.test/v1',
      model: 'native-model',
      'secret-id': 'secret-1',
      preset: 'must-not-run',
    }],
    run: async command => calls.push(['run', command]),
    rotateSecret: async (key, id) => calls.push(['rotate', key, id]),
  };
  const app = indexModule.createApp(host, { profiles: [] }, () => {}, () => {});

  assert.equal(app.applyProfile, undefined);
  assert.equal(typeof app.applyProfileRef, 'function');
  await app.applyProfileRef({ source: 'native', id: 'native-1' });

  assert.deepEqual(calls, [
    ['run', '/api-url api=custom connect=false quiet=true "https://example.test/v1"'],
    ['rotate', 'api_key_custom', 'secret-1'],
    ['run', '/api quiet=true custom'],
    ['run', '/model quiet=true "native-model"'],
    ['run', '/api-url api=custom connect=true quiet=true "https://example.test/v1"'],
  ]);
});
