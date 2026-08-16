import { makeId } from './settings.js';
import { listPresetPrompts, requireTavernHelper } from './preset-operations.js';

const byId = id => document.getElementById(id);
const option = (value, label) => Object.assign(document.createElement('option'), { value, textContent: label });

export async function mountSettingsPanel(app) {
  const host = document.querySelector('.extensions_settings');
  if (!host) throw new Error('找不到 SillyTavern 扩展设置容器');
  const html = await fetch(new URL('../settings.html', import.meta.url)).then(response => {
    if (!response.ok) throw new Error(`设置模板加载失败：${response.status}`);
    return response.text();
  });
  host.insertAdjacentHTML('beforeend', html);

  const fields = {
    enabled: byId('cp-enabled'), profiles: byId('cp-profile-select'), name: byId('cp-profile-name'),
    url: byId('cp-profile-url'), model: byId('cp-profile-model'), secret: byId('cp-profile-secret'),
    key: byId('cp-profile-key'), note: byId('cp-profile-note'), preset: byId('cp-preset-select'),
    prompts: byId('cp-prompt-list'), status: byId('cp-settings-status'),
  };
  let editingId = app.settings.activeProfileId;

  const status = (message, error = false) => {
    fields.status.textContent = message;
    fields.status.classList.toggle('is-error', error);
  };
  const renderSecrets = selectedId => {
    fields.secret.replaceChildren(option('', '无需密钥 / 暂不选择'));
    for (const secret of app.host.getSecrets()) fields.secret.append(option(secret.id, `${secret.label || '未命名密钥'}${secret.active ? '（当前）' : ''}`));
    fields.secret.value = selectedId || '';
  };
  const renderProfiles = () => {
    fields.profiles.replaceChildren(option('', '选择配置…'));
    for (const profile of app.settings.profiles) fields.profiles.append(option(profile.id, profile.name));
    fields.profiles.value = editingId || '';
    const profile = app.settings.profiles.find(item => item.id === editingId);
    fields.name.value = profile?.name ?? '';
    fields.url.value = profile?.apiUrl ?? '';
    fields.model.value = profile?.model ?? '';
    fields.note.value = profile?.note ?? '';
    fields.key.value = '';
    renderSecrets(profile?.secretId);
  };
  const renderPrompts = () => {
    fields.prompts.replaceChildren();
    const presetName = fields.preset.value;
    if (!presetName) return;
    try {
      const allowed = new Map((app.settings.presetAllowlist[presetName] ?? []).map(item => [item.promptId, item]));
      const prompts = listPresetPrompts(app.host.helper, presetName);
      for (const prompt of prompts) {
        const label = document.createElement('label');
        label.className = 'cp-prompt-row';
        const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: allowed.has(prompt.id) });
        const name = document.createElement('span');
        name.textContent = prompt.name;
        const state = document.createElement('small');
        state.textContent = prompt.enabled ? '当前开启' : '当前关闭';
        input.addEventListener('change', () => {
          const current = new Map((app.settings.presetAllowlist[presetName] ?? []).map(item => [item.promptId, item]));
          if (input.checked) current.set(prompt.id, { promptId: prompt.id, lastKnownName: prompt.name });
          else current.delete(prompt.id);
          app.settings.presetAllowlist[presetName] = [...current.values()];
          app.save();
          app.refreshPet();
        });
        label.append(input, name, state);
        fields.prompts.append(label);
      }
      for (const stale of allowed.values()) {
        if (prompts.some(prompt => prompt.id === stale.promptId)) continue;
        const row = document.createElement('label');
        row.className = 'cp-prompt-row is-stale';
        const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: true });
        const name = document.createElement('span');
        name.textContent = `${stale.lastKnownName}（条目已失效）`;
        input.addEventListener('change', () => {
          app.settings.presetAllowlist[presetName] = (app.settings.presetAllowlist[presetName] ?? []).filter(item => item.promptId !== stale.promptId);
          app.save(); app.refreshPet(); renderPrompts();
        });
        row.append(input, name);
        fields.prompts.append(row);
      }
    } catch (error) { status(error.message, true); }
  };
  const refreshPresets = () => {
    try {
      requireTavernHelper(app.host.helper);
      const previous = fields.preset.value;
      fields.preset.replaceChildren(option('', '选择预设…'));
      for (const name of app.host.helper.getPresetNames()) fields.preset.append(option(name, name));
      fields.preset.value = previous || app.host.helper.getLoadedPresetName() || '';
      renderPrompts();
    } catch (error) { status(error.message, true); }
  };

  fields.enabled.checked = app.settings.enabled;
  fields.enabled.addEventListener('change', () => { app.settings.enabled = fields.enabled.checked; app.save(); app.refreshPet(); });
  fields.profiles.addEventListener('change', () => { editingId = fields.profiles.value || null; renderProfiles(); });
  fields.preset.addEventListener('change', renderPrompts);
  byId('cp-refresh-presets').addEventListener('click', refreshPresets);
  byId('cp-new-profile').addEventListener('click', () => { editingId = null; renderProfiles(); fields.name.focus(); });
  byId('cp-save-profile').addEventListener('click', async () => {
    try {
      const name = fields.name.value.trim();
      const apiUrl = fields.url.value.trim();
      const model = fields.model.value.trim();
      if (!name || !apiUrl || !model) throw new Error('配置名称、API 地址和模型 ID 必填');
      let secretId = fields.secret.value;
      if (fields.key.value) secretId = await app.host.createSecret(fields.key.value, name);
      const profile = { id: editingId || makeId(), name, apiUrl, model, secretId, note: fields.note.value.trim() };
      const index = app.settings.profiles.findIndex(item => item.id === profile.id);
      if (index >= 0) app.settings.profiles[index] = profile; else app.settings.profiles.push(profile);
      editingId = profile.id;
      app.settings.activeProfileId = profile.id;
      fields.key.value = '';
      app.save(); renderProfiles(); app.refreshPet(); status('配置已保存；API Key 仅写入酒馆原生 Secrets。');
    } catch (error) { status(error.message, true); }
  });
  byId('cp-copy-profile').addEventListener('click', () => {
    const source = app.settings.profiles.find(item => item.id === editingId);
    if (!source) return status('请先选择要复制的配置', true);
    const copy = { ...source, id: makeId(), name: `${source.name} 副本` };
    app.settings.profiles.push(copy); editingId = copy.id; app.save(); renderProfiles(); app.refreshPet();
  });
  byId('cp-delete-profile').addEventListener('click', () => {
    if (!editingId) return status('请先选择配置', true);
    app.settings.profiles = app.settings.profiles.filter(item => item.id !== editingId);
    if (app.settings.activeProfileId === editingId) app.settings.activeProfileId = null;
    editingId = null; app.save(); renderProfiles(); app.refreshPet(); status('配置已删除，原生 Secret 未删除。');
  });
  byId('cp-apply-profile').addEventListener('click', async () => {
    const profile = app.settings.profiles.find(item => item.id === editingId);
    if (!profile) return status('请先选择配置', true);
    try { await app.applyProfile(profile); app.settings.activeProfileId = profile.id; app.save(); app.refreshPet(); status(`已应用：${profile.name}`); }
    catch (error) { status(error.message, true); }
  });
  byId('cp-reset-position').addEventListener('click', () => { app.settings.pet.x = null; app.settings.pet.y = null; app.save(); app.refreshPet(); status('桌宠位置已重置'); });

  renderProfiles();
  refreshPresets();
  return { renderProfiles, refreshPresets };
}
