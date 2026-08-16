const CUSTOM_SECRET_KEY = 'api_key_custom';

// Version-pinned host contract: SillyTavern 1.16.0 (e3b866b),
// public/scripts/openai.js, public/scripts/slash-commands.js, public/scripts/secrets.js,
// public/scripts/events.js and public/scripts/extensions/connection-manager/index.js.

export function validateCommandValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error('配置值不能为空');
  if (/[|\r\n"]|{{|}}/.test(normalized)) throw new Error('配置值包含不受支持的控制字符');
  return normalized;
}

function validateApiUrl(value) {
  const apiUrl = validateCommandValue(value);
  let parsed;
  try { parsed = new URL(apiUrl); } catch { throw new Error('API 地址不是有效 URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API 地址仅支持 http 或 https');
  return apiUrl;
}

export function readNativeConnectionProfiles(context) {
  const rows = context.extensionSettings?.connectionManager?.profiles;
  return Array.isArray(rows) ? [...rows] : [];
}

const quoted = value => `"${validateCommandValue(value)}"`;

async function waitForConnection(host, statusBeforeAttempt, { connectionTimeoutMs = 5000, connectionPollIntervalMs = 100 } = {}) {
  const verifiedStatus = host.context?.translate?.('Valid') ?? 'Valid';
  const deadline = Date.now() + connectionTimeoutMs;
  let observedTransition = false;
  while (true) {
    const status = host.getConnectionStatus?.();
    observedTransition ||= status !== statusBeforeAttempt;
    if (observedTransition && status === verifiedStatus) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Custom API 连接未验证或超时');
    await new Promise(resolve => setTimeout(resolve, Math.min(connectionPollIntervalMs, remaining)));
  }
}

export async function applyCustomProfile(host, profile, waitOptions) {
  const apiUrl = validateApiUrl(profile?.apiUrl);
  const model = validateCommandValue(profile?.model);
  const secretId = profile?.secretId ? validateCommandValue(profile.secretId) : '';

  if (secretId && typeof host.hasSecret === 'function' && !host.hasSecret(secretId)) {
    throw new Error('配置引用的酒馆 Secret 已不存在或不可用');
  }

  await host.run(`/api-url api=custom connect=false quiet=true ${quoted(apiUrl)}`);
  if (secretId) {
    await host.rotateSecret(CUSTOM_SECRET_KEY, secretId);
    const activeSecret = host.getSecrets?.().find(row => row.id === secretId && row.active === true);
    if (!activeSecret) throw new Error('配置引用的酒馆 Secret 未能激活');
  }
  await host.run('/api quiet=true custom');
  await host.run(`/model quiet=true ${quoted(model)}`);
  const statusBeforeAttempt = host.getConnectionStatus?.();
  await host.run(`/api-url api=custom connect=true quiet=true ${quoted(apiUrl)}`);
  await waitForConnection(host, statusBeforeAttempt, waitOptions);
}

export async function fetchCustomModels(host, request) {
  const apiUrl = validateApiUrl(request?.apiUrl);
  const secretId = request?.secretId ? validateCommandValue(request.secretId) : '';
  const secretsBefore = host.getSecrets();
  const previousActive = secretsBefore.find(row => row.active === true);
  const needsRotation = Boolean(secretId && previousActive?.id !== secretId);

  if (secretId && !secretsBefore.some(row => row.id === secretId)) {
    throw new Error('配置引用的酒馆 Secret 已不存在或不可用');
  }

  try {
    if (needsRotation) {
      await host.rotateSecret(CUSTOM_SECRET_KEY, secretId);
      if (!host.getSecrets().some(row => row.id === secretId && row.active === true)) {
        throw new Error('配置引用的酒馆 Secret 未能激活');
      }
    }

    const rows = await host.requestCustomModels(apiUrl);
    const models = [...new Set((Array.isArray(rows) ? rows : [])
      .map(row => typeof row?.id === 'string' ? row.id.trim() : '')
      .filter(Boolean))].sort((left, right) => left.localeCompare(right));
    if (!models.length) throw new Error('未获取到可用模型，可手动填写模型 ID');
    return models;
  } finally {
    if (needsRotation && previousActive?.id) {
      await host.rotateSecret(CUSTOM_SECRET_KEY, previousActive.id);
      if (!host.getSecrets().some(row => row.id === previousActive.id && row.active === true)) {
        throw new Error('获取模型后未能恢复原有酒馆 Secret');
      }
    }
  }
}

export async function updateNativeConnectionProfile(host, profileId, changes) {
  const id = validateCommandValue(profileId);
  const name = validateCommandValue(changes?.name);
  const apiUrl = validateApiUrl(changes?.apiUrl);
  const model = validateCommandValue(changes?.model);
  const secretId = changes?.secretId ? validateCommandValue(changes.secretId) : '';
  const rows = host.getNativeConnectionProfiles();
  const profile = rows.find(row => row?.id === id);

  if (!profile || profile.mode !== 'cc' || profile.api !== 'custom') {
    throw new Error('所选酒馆 Custom 配置已不存在或不受支持');
  }
  if (rows.some(row => row?.id !== id && row?.name === name)) {
    throw new Error('酒馆中已存在同名连接配置');
  }
  if (secretId && !host.getSecrets().some(row => row.id === secretId)) {
    throw new Error('配置引用的酒馆 Secret 已不存在或不可用');
  }

  const oldProfile = structuredClone(profile);
  Object.assign(profile, { name, 'api-url': apiUrl, model, 'secret-id': secretId });
  host.saveSettings();
  await host.emitConnectionProfileUpdated(oldProfile, profile);
  return profile;
}

export async function createBrowserHost() {
  const context = globalThis.SillyTavern?.getContext?.();
  if (!context?.extensionSettings || typeof context.executeSlashCommandsWithOptions !== 'function') {
    throw new Error('需要 SillyTavern 1.16.0 或更高版本');
  }
  const secrets = await import('/scripts/secrets.js');
  const getSecrets = () => {
    const rows = secrets.secret_state?.[secrets.SECRET_KEYS.CUSTOM];
    return Array.isArray(rows)
      ? rows.map(row => ({ id: row.id, label: row.label, active: Boolean(row.active) }))
      : [];
  };
  return {
    context,
    helper: globalThis.TavernHelper,
    run: command => context.executeSlashCommandsWithOptions(command),
    rotateSecret: secrets.rotateSecret,
    async createSecret(value, label) {
      if (!String(value ?? '').trim()) return '';
      return await secrets.writeSecret(secrets.SECRET_KEYS.CUSTOM, String(value), String(label || '连接桌宠')) || '';
    },
    getSecrets,
    hasSecret: id => getSecrets().some(row => row.id === id),
    getConnectionStatus: () => globalThis.SillyTavern?.getContext?.()?.onlineStatus,
    saveSettings: () => context.saveSettingsDebounced(),
    emitConnectionProfileUpdated: (oldProfile, newProfile) => {
      const eventName = context.eventTypes?.CONNECTION_PROFILE_UPDATED;
      if (!eventName || typeof context.eventSource?.emit !== 'function') {
        throw new Error('当前 SillyTavern 不支持更新连接配置事件');
      }
      return context.eventSource.emit(eventName, oldProfile, newProfile);
    },
    async requestCustomModels(apiUrl) {
      // SillyTavern 1.16.0, src/endpoints/backends/chat-completions.js:
      // POST /api/backends/chat-completions/status proxies Custom /models requests.
      const response = await fetch('/api/backends/chat-completions/status', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
          chat_completion_source: 'custom',
          custom_url: apiUrl,
          custom_include_headers: '',
        }),
        cache: 'no-cache',
      });
      if (!response.ok) throw new Error(`获取模型失败：HTTP ${response.status}`);
      const body = await response.json();
      if (body?.error || !Array.isArray(body?.data)) throw new Error('接口未返回可用模型列表');
      return body.data;
    },
    getNativeConnectionProfiles: () => readNativeConnectionProfiles(context),
  };
}
