import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCustomProfile, fetchCustomModels, readNativeConnectionProfiles, updateNativeConnectionProfile, validateCommandValue } from '../src/host-adapter.js';
import { resolveProfileRef } from '../src/profile-catalog.js';

test('applies only Custom Chat Completion fields and rotates the native secret', async () => {
  const calls = [];
  const statuses = ['no_connection', 'Valid'];
  const host = {
    async run(command) { calls.push(['run', command]); },
    async rotateSecret(key, id) { calls.push(['rotate', key, id]); },
    getSecrets: () => [{ id: 'secret-1', active: true }],
    getConnectionStatus: () => statuses.shift() ?? 'Valid',
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
  const statuses = ['no_connection', 'Valid'];
  const host = {
    run: async command => commands.push(command),
    rotateSecret: async () => {},
    hasSecret: () => true,
    getSecrets: () => [{ id: 's1', active: true }],
    getConnectionStatus: () => statuses.shift() ?? 'Valid',
  };
  await applyCustomProfile(host, {
    apiUrl: 'https://example.test/v1', model: 'demo', secretId: 's1',
    preset: 'must-not-run', proxy: 'must-not-run',
  });
  assert.equal(commands.some(command => command.includes('/preset') || command.includes('/profile')), false);
  assert.equal(commands.some(command => command.includes('must-not-run')), false);
});

test('resolves and applies a native Custom profile without preset operations', async () => {
  const calls = [];
  const statuses = ['no_connection', 'Valid'];
  const profile = resolveProfileRef(
    { source: 'native', id: 'native-1' },
    [],
    [{
      id: 'native-1', mode: 'cc', api: 'custom', name: '酒馆配置',
      'api-url': 'https://example.test/v1', model: 'native-model', 'secret-id': 'secret-1',
      preset: 'must-not-change',
    }],
  );
  const host = {
    run: async command => calls.push(['run', command]),
    rotateSecret: async (key, id) => calls.push(['rotate', key, id]),
    getSecrets: () => [{ id: 'secret-1', active: true }],
    getConnectionStatus: () => statuses.shift() ?? 'Valid',
  };

  await applyCustomProfile(host, profile);

  assert.deepEqual(calls, [
    ['run', '/api-url api=custom connect=false quiet=true "https://example.test/v1"'],
    ['rotate', 'api_key_custom', 'secret-1'],
    ['run', '/api quiet=true custom'],
    ['run', '/model quiet=true "native-model"'],
    ['run', '/api-url api=custom connect=true quiet=true "https://example.test/v1"'],
  ]);
  const operations = calls.map(call => call.join(' ')).join('\n');
  assert.equal(operations.includes('/preset') || operations.includes('/profile'), false);
  assert.equal(operations.includes('must-not-change'), false);
});

test('rejects a referenced Secret that no longer exists before running commands', async () => {
  const calls = [];
  const host = { run: async command => calls.push(command), rotateSecret: async () => {}, hasSecret: () => false };
  await assert.rejects(() => applyCustomProfile(host, { apiUrl: 'https://example.test/v1', model: 'demo', secretId: 'missing' }), /配置引用的酒馆 Secret/);
  assert.deepEqual(calls, []);
});

test('rejects when Secret rotation resolves without activating the requested Secret', async () => {
  const commands = [];
  const host = {
    run: async command => commands.push(command),
    rotateSecret: async () => {},
    hasSecret: () => true,
    getSecrets: () => [{ id: 'secret-1', active: false }],
    getConnectionStatus: () => 'Valid',
  };

  await assert.rejects(
    () => applyCustomProfile(host, { apiUrl: 'https://example.test/v1', model: 'demo', secretId: 'secret-1' }),
    /配置引用的酒馆 Secret 未能激活/,
  );
  assert.deepEqual(commands, ['/api-url api=custom connect=false quiet=true "https://example.test/v1"']);
});

test('rejects when the final connect command resolves but status stays disconnected', async () => {
  const host = {
    run: async () => {},
    rotateSecret: async () => {},
    getConnectionStatus: () => 'no_connection',
  };

  await assert.rejects(
    () => applyCustomProfile(
      host,
      { apiUrl: 'https://example.test/v1', model: 'demo', secretId: '' },
      { connectionTimeoutMs: 5, connectionPollIntervalMs: 1 },
    ),
    /Custom API 连接未验证或超时/,
  );
});

test('does not treat empty or non-string statuses as connected', async () => {
  for (const status of ['', '   ', null, undefined, false]) {
    const host = {
      run: async () => {},
      rotateSecret: async () => {},
      getConnectionStatus: () => status,
    };
    await assert.rejects(
      () => applyCustomProfile(
        host,
        { apiUrl: 'https://example.test/v1', model: 'demo', secretId: '' },
        { connectionTimeoutMs: 0, connectionPollIntervalMs: 0 },
      ),
      /Custom API 连接未验证或超时/,
    );
  }
});

test('does not treat Status check bypassed or another non-empty status as verified', async () => {
  for (const unverifiedStatus of ['Status check bypassed', 'Unexpected status']) {
    const statuses = ['no_connection'];
    const host = {
      run: async () => {},
      rotateSecret: async () => {},
      getConnectionStatus: () => statuses.shift() ?? unverifiedStatus,
    };

    await assert.rejects(
      () => applyCustomProfile(
        host,
        { apiUrl: 'https://example.test/v1', model: 'demo', secretId: '' },
        { connectionTimeoutMs: 5, connectionPollIntervalMs: 1 },
      ),
      /Custom API 连接未验证或超时/,
    );
  }
});

test('succeeds only after this attempt transitions from bypassed to Valid', async () => {
  const calls = [];
  let secretActive = false;
  const statuses = ['no_connection', 'Status check bypassed', 'Valid'];
  const host = {
    run: async command => calls.push(['run', command]),
    async rotateSecret(key, id) {
      calls.push(['rotate', key, id]);
      secretActive = true;
    },
    hasSecret: () => true,
    getSecrets() {
      calls.push(['secrets', secretActive]);
      return [{ id: 'secret-1', active: secretActive }];
    },
    getConnectionStatus() {
      const status = statuses.shift() ?? 'Valid';
      calls.push(['status', status]);
      return status;
    },
  };

  await applyCustomProfile(
    host,
    { apiUrl: 'https://example.test/v1', model: 'demo', secretId: 'secret-1' },
    { connectionTimeoutMs: 20, connectionPollIntervalMs: 1 },
  );

  assert.deepEqual(calls, [
    ['run', '/api-url api=custom connect=false quiet=true "https://example.test/v1"'],
    ['rotate', 'api_key_custom', 'secret-1'],
    ['secrets', true],
    ['run', '/api quiet=true custom'],
    ['run', '/model quiet=true "demo"'],
    ['status', 'no_connection'],
    ['run', '/api-url api=custom connect=true quiet=true "https://example.test/v1"'],
    ['status', 'Status check bypassed'],
    ['status', 'Valid'],
  ]);
});

test('does not accept a stale Valid that predates this connection attempt', async () => {
  const host = {
    run: async () => {},
    rotateSecret: async () => {},
    getConnectionStatus: () => 'Valid',
  };

  await assert.rejects(
    () => applyCustomProfile(
      host,
      { apiUrl: 'https://example.test/v1', model: 'demo', secretId: '' },
      { connectionTimeoutMs: 5, connectionPollIntervalMs: 1 },
    ),
    /Custom API 连接未验证或超时/,
  );
});

test('reads native connection rows defensively', () => {
  const original = [{ id: 'n1' }];
  const rows = readNativeConnectionProfiles({ extensionSettings: { connectionManager: { profiles: original } } });
  assert.deepEqual(rows, original);
  assert.notEqual(rows, original);
  assert.deepEqual(readNativeConnectionProfiles({ extensionSettings: {} }), []);
});

test('fetches sorted unique Custom models with the selected Secret and restores the prior Secret', async () => {
  let activeId = 'old-secret';
  const calls = [];
  const host = {
    getSecrets: () => [
      { id: 'old-secret', active: activeId === 'old-secret' },
      { id: 'new-secret', active: activeId === 'new-secret' },
    ],
    async rotateSecret(key, id) { calls.push(['rotate', key, id]); activeId = id; },
    async requestCustomModels(apiUrl) {
      calls.push(['models', apiUrl, activeId]);
      return [{ id: 'z-model' }, { id: 'a-model' }, { id: 'z-model' }, { name: 'ignored' }];
    },
  };

  const models = await fetchCustomModels(host, { apiUrl: 'https://example.test/v1', secretId: 'new-secret' });

  assert.deepEqual(models, ['a-model', 'z-model']);
  assert.deepEqual(calls, [
    ['rotate', 'api_key_custom', 'new-secret'],
    ['models', 'https://example.test/v1', 'new-secret'],
    ['rotate', 'api_key_custom', 'old-secret'],
  ]);
  assert.equal(activeId, 'old-secret');
});

test('restores the prior Secret when model retrieval fails', async () => {
  let activeId = 'old-secret';
  const host = {
    getSecrets: () => [
      { id: 'old-secret', active: activeId === 'old-secret' },
      { id: 'new-secret', active: activeId === 'new-secret' },
    ],
    async rotateSecret(_key, id) { activeId = id; },
    async requestCustomModels() { throw new Error('模型接口不可用'); },
  };

  await assert.rejects(
    () => fetchCustomModels(host, { apiUrl: 'https://example.test/v1', secretId: 'new-secret' }),
    /模型接口不可用/,
  );
  assert.equal(activeId, 'old-secret');
});

test('rejects an empty Custom model list with a manual-entry hint', async () => {
  const host = {
    getSecrets: () => [],
    requestCustomModels: async () => [],
  };

  await assert.rejects(
    () => fetchCustomModels(host, { apiUrl: 'https://example.test/v1', secretId: '' }),
    /未获取到可用模型.*手动填写模型 ID/,
  );
});

test('updates only editable fields of a native Custom profile and emits the host event', async () => {
  const row = {
    id: 'native-1', name: '旧名称', mode: 'cc', api: 'custom',
    'api-url': 'https://old.example/v1', model: 'old-model', 'secret-id': 'old-secret',
    preset: '必须保留', proxy: '也必须保留', exclude: ['preset'],
  };
  const events = [];
  let saves = 0;
  const host = {
    getNativeConnectionProfiles: () => [row],
    getSecrets: () => [{ id: 'new-secret' }],
    saveSettings: () => { saves += 1; },
    emitConnectionProfileUpdated: async (oldProfile, newProfile) => events.push([oldProfile, structuredClone(newProfile)]),
  };

  const updated = await updateNativeConnectionProfile(host, 'native-1', {
    name: '新名称', apiUrl: 'https://new.example/v1', model: 'new-model', secretId: 'new-secret',
  });

  assert.equal(updated, row);
  assert.deepEqual(row, {
    id: 'native-1', name: '新名称', mode: 'cc', api: 'custom',
    'api-url': 'https://new.example/v1', model: 'new-model', 'secret-id': 'new-secret',
    preset: '必须保留', proxy: '也必须保留', exclude: ['preset'],
  });
  assert.equal(saves, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0][0].name, '旧名称');
  assert.equal(events[0][1].name, '新名称');
});

test('rejects invalid or duplicate native profile updates without mutating host settings', async () => {
  const rows = [
    { id: 'native-1', name: '原配置', mode: 'cc', api: 'custom', 'api-url': 'https://old.example/v1', model: 'old' },
    { id: 'native-2', name: '已存在', mode: 'cc', api: 'custom', 'api-url': 'https://other.example/v1', model: 'other' },
  ];
  const before = structuredClone(rows);
  const host = { getNativeConnectionProfiles: () => rows, getSecrets: () => [], saveSettings() { throw new Error('不应保存'); } };

  await assert.rejects(
    () => updateNativeConnectionProfile(host, 'native-1', { name: '已存在', apiUrl: 'https://new.example/v1', model: 'new', secretId: '' }),
    /同名/,
  );
  await assert.rejects(
    () => updateNativeConnectionProfile(host, 'native-1', { name: '新名称', apiUrl: 'javascript:bad', model: 'new', secretId: '' }),
    /http 或 https/,
  );
  assert.deepEqual(rows, before);
});
