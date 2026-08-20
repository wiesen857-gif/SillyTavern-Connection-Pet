import test from 'node:test';
import assert from 'node:assert/strict';
import { switchPresetAndSetEntries, waitForTavernHelper } from '../src/preset-operations.js';

function fakeHelper() {
  const calls = [];
  const stored = {
    Demo: { prompts: [{ id: 'a', name: 'A', enabled: false }, { id: 'b', name: 'B', enabled: true }], settings: {}, prompts_unused: [], extensions: {} },
  };
  let inUse = structuredClone(stored.Demo);
  return {
    calls,
    getPreset(name) { calls.push(['get', name]); return structuredClone(name === 'in_use' ? inUse : stored[name]); },
    loadPreset(name) {
      calls.push(['load', name]);
      if (!stored[name]) return false;
      inUse = structuredClone(stored[name]);
      return true;
    },
    async replacePreset(name, preset, options) {
      calls.push(['replace', name, structuredClone(preset), options]);
      if (name === 'in_use') inUse = structuredClone(preset);
      else stored[name] = structuredClone(preset);
    },
  };
}

test('switches first, persists requested states to the named preset, then renders the active preset', async () => {
  const helper = fakeHelper();
  await switchPresetAndSetEntries(helper, 'Demo', new Map([['a', true], ['b', false]]), new Set(['a', 'b']));

  assert.deepEqual(helper.calls.map(call => call.slice(0, 2)), [
    ['get', 'Demo'], ['load', 'Demo'], ['get', 'in_use'], ['replace', 'Demo'], ['replace', 'in_use'],
  ]);
  const saved = helper.getPreset('Demo');
  assert.equal(saved.prompts.find(x => x.id === 'a').enabled, true);
  assert.equal(saved.prompts.find(x => x.id === 'b').enabled, false);
  const activeReplace = helper.calls.find(call => call[0] === 'replace' && call[1] === 'in_use');
  assert.deepEqual(activeReplace?.[3], { render: 'immediate' });
  helper.loadPreset('Demo');
  assert.equal(helper.getPreset('in_use').prompts.find(x => x.id === 'b').enabled, false);
});

test('rejects non-allowlisted and stale IDs before switching preset', async () => {
  for (const [states, allowlist] of [
    [new Map([['b', false]]), new Set(['a'])],
    [new Map([['missing', true]]), new Set(['missing'])],
  ]) {
    const helper = fakeHelper();
    await assert.rejects(() => switchPresetAndSetEntries(helper, 'Demo', states, allowlist));
    assert.equal(helper.calls.some(call => call[0] === 'load'), false);
  }
});

test('waits for Tavern Helper 4.9.2 to finish exposing its preset API', async () => {
  const helper = {
    getPresetNames() {}, getLoadedPresetName() {}, getPreset() {}, loadPreset() {}, replacePreset() {},
  };
  let probes = 0;

  const result = await waitForTavernHelper(
    () => ++probes >= 3 ? helper : undefined,
    { timeoutMs: 50, pollIntervalMs: 1 },
  );

  assert.equal(result, helper);
  assert.equal(probes, 3);
});

test('reports the missing Tavern Helper preset API after the readiness timeout', async () => {
  await assert.rejects(
    () => waitForTavernHelper(() => ({ getPresetNames() {} }), { timeoutMs: 1, pollIntervalMs: 1 }),
    /酒馆助手接口不可用.*getLoadedPresetName.*getPreset.*loadPreset.*replacePreset/,
  );
});
