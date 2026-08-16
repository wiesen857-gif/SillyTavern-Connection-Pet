import { applyCustomProfile, createBrowserHost } from './src/host-adapter.js';
import { listProfileCatalog, resolveProfileRef } from './src/profile-catalog.js';
import { normalizeSettings, SETTINGS_KEY } from './src/settings.js';
import { requireTavernHelper } from './src/preset-operations.js';
import { mountSettingsPanel } from './src/settings-panel.js';
import { mountPetWidget } from './src/pet-widget.js';

export function createApp(host, settings, save, refreshPet) {
  const getNativeProfiles = () => host.getNativeConnectionProfiles();
  return {
    host,
    settings,
    save,
    getProfileCatalog: () => listProfileCatalog(settings.profiles, getNativeProfiles()),
    resolveProfile: ref => resolveProfileRef(ref, settings.profiles, getNativeProfiles()),
    async applyProfileRef(ref) {
      const profile = this.resolveProfile(ref);
      if (!profile) throw new Error('所选 API 配置已不存在，请重新选择');
      await applyCustomProfile(host, profile);
      return profile;
    },
    refreshPet,
  };
}

async function initialize() {
  try {
    const host = await createBrowserHost();
    requireTavernHelper(host.helper);
    const settings = normalizeSettings(host.context.extensionSettings[SETTINGS_KEY]);
    host.context.extensionSettings[SETTINGS_KEY] = settings;
    let petWidget;
    const save = () => host.context.saveSettingsDebounced();
    const app = createApp(host, settings, save, () => petWidget?.refresh());
    petWidget = mountPetWidget(app);
    await mountSettingsPanel(app);
    save();
  } catch (error) {
    console.error('[连接桌宠] 初始化失败', error);
    globalThis.toastr?.error?.(error.message, '连接桌宠初始化失败');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
