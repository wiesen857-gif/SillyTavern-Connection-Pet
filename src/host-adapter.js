const CUSTOM_SECRET_KEY = 'api_key_custom';

// Version-pinned host contract: SillyTavern 1.16.0 (e3b866b),
// public/scripts/openai.js, public/scripts/slash-commands.js and public/scripts/secrets.js.

export function validateCommandValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error('配置值不能为空');
  if (/[|\r\n"]|{{|}}/.test(normalized)) throw new Error('配置值包含不受支持的控制字符');
  return normalized;
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
  const apiUrl = validateCommandValue(profile?.apiUrl);
  const model = validateCommandValue(profile?.model);
  const secretId = profile?.secretId ? validateCommandValue(profile.secretId) : '';
  let parsed;
  try { parsed = new URL(apiUrl); } catch { throw new Error('API 地址不是有效 URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API 地址仅支持 http 或 https');

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
    getNativeConnectionProfiles: () => readNativeConnectionProfiles(context),
  };
}
