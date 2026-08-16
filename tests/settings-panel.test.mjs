import test from 'node:test';
import assert from 'node:assert/strict';
import * as settingsPanel from '../src/settings-panel.js';

test('uses the SillyTavern 1.16 extension settings container id', () => {
  const expected = {};
  const calls = [];
  const documentLike = {
    getElementById(id) { calls.push(id); return id === 'extensions_settings' ? expected : null; },
  };

  assert.equal(typeof settingsPanel.findExtensionSettingsContainer, 'function');
  assert.equal(settingsPanel.findExtensionSettingsContainer(documentLike), expected);
  assert.deepEqual(calls, ['extensions_settings']);
});
