import { applyCustomProfile, createBrowserHost } from './src/host-adapter.js';
import { normalizeSettings, SETTINGS_KEY } from './src/settings.js';
import { requireTavernHelper } from './src/preset-operations.js';
import { mountSettingsPanel } from './src/settings-panel.js';
import { mountPetWidget } from './src/pet-widget.js';

async function initialize() {
  try {
    const host = await createBrowserHost();
    requireTavernHelper(host.helper);
    const settings = normalizeSettings(host.context.extensionSettings[SETTINGS_KEY]);
    host.context.extensionSettings[SETTINGS_KEY] = settings;
    let petWidget;
    const save = () => host.context.saveSettingsDebounced();
    const app = {
      host,
      settings,
      save,
      applyProfile: profile => applyCustomProfile(host, profile),
      refreshPet: () => petWidget?.refresh(),
    };
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
