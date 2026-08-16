import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeSettings, serializeSettings } from '../src/settings.js';

test('normalizes malformed settings without retaining plaintext API keys', () => {
  const value = normalizeSettings({
    enabled: 'yes',
    pet: { x: -10, y: 25, size: 999 },
    profiles: [{ id: 'a', name: '本地', apiUrl: 'http://localhost:1234/v1', model: 'demo', secretId: 's1', apiKey: 'must-not-survive' }],
    presetAllowlist: { Demo: [{ promptId: 'p1', lastKnownName: '条目' }] },
  });

  assert.equal(value.enabled, true);
  assert.deepEqual(value.pet, { x: null, y: 25, size: 72 });
  assert.equal(value.profiles[0].secretId, 's1');
  assert.equal('apiKey' in value.profiles[0], false);
  assert.equal(serializeSettings(value).includes('must-not-survive'), false);
});

test('returns independent defaults', () => {
  const first = normalizeSettings(null);
  first.pet.size = 70;
  assert.equal(DEFAULT_SETTINGS.pet.size, 58);
});
