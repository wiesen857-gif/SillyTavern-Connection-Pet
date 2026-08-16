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

test('builds non-empty native and local selector groups', () => {
  const groups = settingsPanel.makeProfileGroups({
    native: [{ source: 'native', id: 'n1', name: '酒馆配置' }],
    local: [{ source: 'local', id: 'l1', name: '桌宠配置' }],
  });

  assert.deepEqual(groups.map(group => group.label), ['酒馆现有配置', '桌宠独立配置']);
  assert.match(groups[0].options[0].value, /^native:/);
  assert.match(groups[1].options[0].value, /^local:/);
});

test('native and local profiles are editable but only local profiles can be deleted', () => {
  assert.deepEqual(settingsPanel.getProfileEditState({ source: 'native' }), {
    readOnly: false,
    canSave: true,
    canDelete: false,
    canCopy: true,
  });
  assert.deepEqual(settingsPanel.getProfileEditState({ source: 'local' }), {
    readOnly: false,
    canSave: true,
    canDelete: true,
    canCopy: true,
  });
});
