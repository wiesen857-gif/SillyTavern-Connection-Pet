export const PROFILE_SOURCE = Object.freeze({ LOCAL: 'local', NATIVE: 'native' });

const text = value => typeof value === 'string' ? value.trim() : '';

export function encodeProfileRef(ref) {
  if (!ref || !Object.values(PROFILE_SOURCE).includes(ref.source) || !text(ref.id)) return '';
  return `${ref.source}:${encodeURIComponent(text(ref.id))}`;
}

export function decodeProfileRef(value) {
  const match = /^(local|native):(.*)$/.exec(String(value ?? ''));
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[2]).trim();
    return id ? { source: match[1], id } : null;
  } catch {
    return null;
  }
}

function normalizeLocal(row) {
  if (!row || !text(row.id)) return null;
  return {
    source: PROFILE_SOURCE.LOCAL,
    id: text(row.id),
    name: text(row.name) || '未命名配置',
    apiUrl: text(row.apiUrl),
    model: text(row.model),
    secretId: text(row.secretId),
  };
}

function normalizeNative(row) {
  if (!row || row.mode !== 'cc' || row.api !== 'custom') return null;
  const id = text(row.id);
  const apiUrl = text(row['api-url']);
  const model = text(row.model);
  if (!id) return null;
  return {
    source: PROFILE_SOURCE.NATIVE,
    id,
    name: text(row.name) || '未命名酒馆配置',
    apiUrl,
    model,
    secretId: text(row['secret-id']),
  };
}

export function listProfileCatalog(localProfiles, nativeRows) {
  return {
    native: (Array.isArray(nativeRows) ? nativeRows : []).map(normalizeNative).filter(Boolean),
    local: (Array.isArray(localProfiles) ? localProfiles : []).map(normalizeLocal).filter(Boolean),
  };
}

export function resolveProfileRef(ref, localProfiles, nativeRows) {
  if (!ref) return null;
  const catalog = listProfileCatalog(localProfiles, nativeRows);
  return catalog[ref.source]?.find(item => item.id === ref.id) ?? null;
}
