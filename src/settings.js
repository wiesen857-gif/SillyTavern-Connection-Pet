export const SETTINGS_KEY = 'connectionPet';

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  enabled: true,
  pet: Object.freeze({ x: null, y: null, size: 58 }),
  activeProfileId: null,
  profiles: Object.freeze([]),
  presetAllowlist: Object.freeze({}),
});

const text = value => typeof value === 'string' ? value.trim() : '';
const position = value => Number.isFinite(value) && value >= 0 ? value : null;

export function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const profiles = Array.isArray(source.profiles)
    ? source.profiles.filter(item => item && typeof item === 'object').map(item => ({
      id: text(item.id) || makeId(),
      name: text(item.name) || '未命名配置',
      apiUrl: text(item.apiUrl),
      model: text(item.model),
      secretId: text(item.secretId),
      note: text(item.note),
    }))
    : [];
  const presetAllowlist = {};

  if (source.presetAllowlist && typeof source.presetAllowlist === 'object') {
    for (const [presetName, entries] of Object.entries(source.presetAllowlist)) {
      if (!text(presetName) || !Array.isArray(entries)) continue;
      const seen = new Set();
      presetAllowlist[presetName] = entries.flatMap(entry => {
        const promptId = text(entry?.promptId);
        if (!promptId || seen.has(promptId)) return [];
        seen.add(promptId);
        return [{ promptId, lastKnownName: text(entry?.lastKnownName) || promptId }];
      });
    }
  }

  return {
    version: 1,
    enabled: source.enabled !== false,
    pet: {
      x: position(source.pet?.x),
      y: position(source.pet?.y),
      size: Math.min(72, Math.max(40, Number.isFinite(source.pet?.size) ? source.pet.size : 58)),
    },
    activeProfileId: profiles.some(item => item.id === source.activeProfileId) ? source.activeProfileId : null,
    profiles,
    presetAllowlist,
  };
}

export function serializeSettings(settings) {
  return JSON.stringify(normalizeSettings(settings));
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
