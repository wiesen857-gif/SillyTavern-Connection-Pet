import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCustomProfile, readNativeConnectionProfiles, validateCommandValue } from '../src/host-adapter.js';

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

test('does not execute preset or other native profile fields', async () => {
  const commands = [];
  const host = { run: async command => commands.push(command), rotateSecret: async () => {}, hasSecret: () => true };
  await applyCustomProfile(host, {
    apiUrl: 'https://example.test/v1', model: 'demo', secretId: 's1',
    preset: 'must-not-run', proxy: 'must-not-run',
  });
  assert.equal(commands.some(command => command.includes('/preset') || command.includes('/profile')), false);
  assert.equal(commands.some(command => command.includes('must-not-run')), false);
});

test('rejects a referenced Secret that no longer exists before running commands', async () => {
  const calls = [];
  const host = { run: async command => calls.push(command), rotateSecret: async () => {}, hasSecret: () => false };
  await assert.rejects(() => applyCustomProfile(host, { apiUrl: 'https://example.test/v1', model: 'demo', secretId: 'missing' }), /配置引用的酒馆 Secret/);
  assert.deepEqual(calls, []);
});

test('reads native connection rows defensively', () => {
  const original = [{ id: 'n1' }];
  const rows = readNativeConnectionProfiles({ extensionSettings: { connectionManager: { profiles: original } } });
  assert.deepEqual(rows, original);
  assert.notEqual(rows, original);
  assert.deepEqual(readNativeConnectionProfiles({ extensionSettings: {} }), []);
});
