import test from 'node:test';
import assert from 'node:assert/strict';
import { switchPresetAndSetEntries, waitForTavernHelper } from '../src/preset-operations.js';

function fakeHelper() {
  const calls = [];
  const stored = {
    Demo: { prompts: [{ id: 'a', name: 'A', enabled: false }, { id: 'b', name: 'B', enabled: true }], settings: {}, prompts_unused: [], extensions: {} },
  };
  return {
    calls,
    getPreset(name) { calls.push(['get', name]); return structuredClone(name === 'in_use' ? stored.Demo : stored[name]); },
    loadPreset(name) { calls.push(['load', name]); return Boolean(stored[name]); },
    async replacePreset(name, preset, options) { calls.push(['replace', name, preset, options]); },
  };
}

test('switches first, changes only requested allowlisted entries, then renders', async () => {
  const helper = fakeHelper();
  await switchPresetAndSetEntries(helper, 'Demo', new Map([['a', true], ['b', false]]), new Set(['a', 'b']));

  assert.deepEqual(helper.calls.map(call => call.slice(0, 2)), [
    ['get', 'Demo'], ['load', 'Demo'], ['get', 'in_use'], ['replace', 'in_use'],
  ]);
  const replaced = helper.calls.at(-1)[2];
  assert.equal(replaced.prompts.find(x => x.id === 'a').enabled, true);
  assert.equal(replaced.prompts.find(x => x.id === 'b').enabled, false);
  assert.deepEqual(helper.calls.at(-1)[3], { render: 'immediate' });
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
