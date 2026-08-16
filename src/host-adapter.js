const CUSTOM_SECRET_KEY = 'api_key_custom';

// Version-pinned host contract: SillyTavern 1.16.0 (e3b866b),
// public/scripts/slash-commands.js and public/scripts/secrets.js.

export function validateCommandValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error('配置值不能为空');
  if (/[|\r\n"]|{{|}}/.test(normalized)) throw new Error('配置值包含不受支持的控制字符');
  return normalized;
}

const quoted = value => `"${validateCommandValue(value)}"`;

export async function applyCustomProfile(host, profile) {
  const apiUrl = validateCommandValue(profile?.apiUrl);
  const model = validateCommandValue(profile?.model);
  let parsed;
  try { parsed = new URL(apiUrl); } catch { throw new Error('API 地址不是有效 URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API 地址仅支持 http 或 https');

  await host.run(`/api-url api=custom connect=false quiet=true ${quoted(apiUrl)}`);
  if (profile.secretId) await host.rotateSecret(CUSTOM_SECRET_KEY, validateCommandValue(profile.secretId));
  await host.run('/api quiet=true custom');
  await host.run(`/model quiet=true ${quoted(model)}`);
  await host.run(`/api-url api=custom connect=true quiet=true ${quoted(apiUrl)}`);
}

export async function createBrowserHost() {
  const context = globalThis.SillyTavern?.getContext?.();
  if (!context?.extensionSettings || typeof context.executeSlashCommandsWithOptions !== 'function') {
    throw new Error('需要 SillyTavern 1.16.0 或更高版本');
  }
  const secrets = await import('/scripts/secrets.js');
  return {
    context,
    helper: globalThis.TavernHelper,
    run: command => context.executeSlashCommandsWithOptions(command),
    rotateSecret: secrets.rotateSecret,
    async createSecret(value, label) {
      if (!String(value ?? '').trim()) return '';
      return await secrets.writeSecret(secrets.SECRET_KEYS.CUSTOM, String(value), String(label || '连接桌宠')) || '';
    },
    getSecrets() {
      const rows = secrets.secret_state?.[secrets.SECRET_KEYS.CUSTOM];
      return Array.isArray(rows) ? rows.map(row => ({ id: row.id, label: row.label, active: Boolean(row.active) })) : [];
    },
  };
}
