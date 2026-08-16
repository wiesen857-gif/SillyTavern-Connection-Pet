import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCustomProfile, validateCommandValue } from '../src/host-adapter.js';

test('applies only Custom Chat Completion fields and rotates the native secret', async () => {
  const calls = [];
  const host = {
    async run(command) { calls.push(['run', command]); },
    async rotateSecret(key, id) { calls.push(['rotate', key, id]); },
  };
  await applyCustomProfile(host, { apiUrl: 'http://127.0.0.1:1234/v1', model: 'local-model', secretId: 'secret-1' });

  assert.deepEqual(calls, [
    ['run', '/api-url api=custom connect=false quiet=true "http://127.0.0.1:1234/v1"'],
    ['rotate', 'api_key_custom', 'secret-1'],
    ['run', '/api quiet=true custom'],
    ['run', '/model quiet=true "local-model"'],
    ['run', '/api-url api=custom connect=true quiet=true "http://127.0.0.1:1234/v1"'],
  ]);
});

test('rejects STscript control syntax in profile values', () => {
  for (const value of ['x|/echo bad', '{{getvar::secret}}', 'line\nbreak', 'quote"break']) {
    assert.throws(() => validateCommandValue(value));
  }
});
