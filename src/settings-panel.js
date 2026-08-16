import { makeId } from './settings.js';
import { decodeProfileRef, encodeProfileRef, PROFILE_SOURCE } from './profile-catalog.js';
import { listPresetPrompts, requireTavernHelper } from './preset-operations.js';

const byId = id => document.getElementById(id);
const option = (value, label) => Object.assign(document.createElement('option'), { value, textContent: label });

export function makeProfileGroups(catalog) {
  return [
    { source: PROFILE_SOURCE.NATIVE, label: '酒馆现有配置' },
    { source: PROFILE_SOURCE.LOCAL, label: '桌宠独立配置' },
  ].flatMap(group => {
    const options = (Array.isArray(catalog?.[group.source]) ? catalog[group.source] : [])
      .map(profile => ({ value: encodeProfileRef(profile), label: profile.name }))
      .filter(item => item.value);
    return options.length ? [{ label: group.label, options }] : [];
  });
}

export function getProfileEditState(profile) {
  return {
    readOnly: false,
    canSave: true,
    canDelete: profile?.source === PROFILE_SOURCE.LOCAL,
    canCopy: Boolean(profile),
  };
}

const findProfile = (catalog, ref) => ref
  ? catalog?.[ref.source]?.find(profile => profile.id === ref.id) ?? null
  : null;

// SillyTavern 1.16.0, public/index.html: #extensions_settings.
export const findExtensionSettingsContainer = documentLike => documentLike.getElementById('extensions_settings');

export async function mountSettingsPanel(app) {
  const host = findExtensionSettingsContainer(document);
  if (!host) throw new Error('找不到 SillyTavern 扩展设置容器');
  const html = await fetch(new URL('../settings.html', import.meta.url)).then(response => {
    if (!response.ok) throw new Error(`设置模板加载失败：${response.status}`);
    return response.text();
  });
  host.insertAdjacentHTML('beforeend', html);

  const fields = {
    enabled: byId('cp-enabled'), profiles: byId('cp-profile-select'), name: byId('cp-profile-name'),
    url: byId('cp-profile-url'), model: byId('cp-profile-model'), modelOptions: byId('cp-model-options'),
    fetchModels: byId('cp-fetch-models'), secret: byId('cp-profile-secret'),
    key: byId('cp-profile-key'), source: byId('cp-profile-source'),
    preset: byId('cp-preset-select'),
    prompts: byId('cp-prompt-list'), status: byId('cp-settings-status'),
    saveProfile: byId('cp-save-profile'), copyProfile: byId('cp-copy-profile'),
    deleteProfile: byId('cp-delete-profile'),
  };
  let editingRef = app.settings.activeProfileRef;

  const status = (message, error = false) => {
    fields.status.textContent = message;
    fields.status.classList.toggle('is-error', error);
  };
  const renderSecrets = selectedId => {
    fields.secret.replaceChildren(option('', '无需密钥 / 暂不选择'));
    const secretIds = new Set();
    for (const secret of app.host.getSecrets()) {
      secretIds.add(secret.id);
      fields.secret.append(option(secret.id, `${secret.label || '未命名密钥'}${secret.active ? '（当前）' : ''}`));
    }
    if (selectedId && !secretIds.has(selectedId)) fields.secret.append(option(selectedId, `${selectedId}（已不存在）`));
    fields.secret.value = selectedId || '';
  };
  const renderProfiles = () => {
    const selectedRef = editingRef;
    const catalog = app.getProfileCatalog();
    const profile = findProfile(catalog, selectedRef);
    const staleNative = selectedRef?.source === PROFILE_SOURCE.NATIVE && !profile;
    if (!profile) editingRef = null;

    fields.profiles.replaceChildren(option('', '选择配置…'));
    for (const group of makeProfileGroups(catalog)) {
      const element = Object.assign(document.createElement('optgroup'), { label: group.label });
      for (const item of group.options) element.append(option(item.value, item.label));
      fields.profiles.append(element);
    }
    fields.profiles.value = encodeProfileRef(editingRef);
    fields.name.value = profile?.name ?? '';
    fields.url.value = profile?.apiUrl ?? '';
    fields.model.value = profile?.model ?? '';
    fields.modelOptions.replaceChildren();
    fields.key.value = '';
    renderSecrets(profile?.secretId);

    const editState = getProfileEditState(profile);
    for (const field of [fields.name, fields.url, fields.model]) field.readOnly = editState.readOnly;
    fields.secret.disabled = editState.readOnly;
    fields.key.disabled = editState.readOnly;
    fields.fetchModels.disabled = editState.readOnly;
    fields.saveProfile.disabled = !editState.canSave;
    fields.deleteProfile.disabled = !editState.canDelete;
    fields.copyProfile.disabled = !editState.canCopy;
    fields.source.textContent = profile?.source === PROFILE_SOURCE.NATIVE
      ? '来源：酒馆现有配置（保存后同步更新酒馆）'
      : profile ? '来源：桌宠独立配置' : '新建桌宠独立配置';
    if (staleNative) status('所选酒馆配置已不存在，请重新选择', true);
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
  fields.profiles.addEventListener('change', () => { editingRef = decodeProfileRef(fields.profiles.value); status(''); renderProfiles(); });
  fields.preset.addEventListener('change', renderPrompts);
  byId('cp-refresh-presets').addEventListener('click', refreshPresets);
  byId('cp-new-profile').addEventListener('click', () => { editingRef = null; status(''); renderProfiles(); fields.name.focus(); });
  fields.saveProfile.addEventListener('click', async () => {
    let secretSaved = false;
    try {
      const name = fields.name.value.trim();
      const apiUrl = fields.url.value.trim();
      const model = fields.model.value.trim();
      if (!name || !apiUrl || !model) throw new Error('配置名称、API 地址和模型 ID 必填');
      let secretId = fields.secret.value;
      const hasNewKey = Boolean(fields.key.value);
      if (hasNewKey) {
        secretId = await app.host.createSecret(fields.key.value, name);
        if (!secretId) throw new Error('API Key 写入酒馆 Secrets 失败');
        secretSaved = true;
      }
      if (editingRef?.source === PROFILE_SOURCE.NATIVE) {
        await app.updateNativeProfile(editingRef.id, { name, apiUrl, model, secretId });
        fields.key.value = '';
        renderProfiles();
        app.refreshPet();
        status(`${secretSaved ? '密钥已保存到酒馆 Secrets；' : ''}酒馆连接配置已更新。`);
        return;
      }

      const profile = { id: editingRef?.id || makeId(), name, apiUrl, model, secretId };
      const index = app.settings.profiles.findIndex(item => item.id === profile.id);
      if (index >= 0) app.settings.profiles[index] = profile; else app.settings.profiles.push(profile);
      editingRef = { source: PROFILE_SOURCE.LOCAL, id: profile.id };
      fields.key.value = '';
      app.save(); renderProfiles(); app.refreshPet();
      status(`${secretSaved ? '密钥已保存到酒馆 Secrets；' : ''}配置已保存。`);
    } catch (error) { status(`${secretSaved ? '密钥已保存到酒馆 Secrets；' : ''}${error.message}`, true); }
  });
  fields.copyProfile.addEventListener('click', () => {
    const source = app.resolveProfile(editingRef);
    if (!source) {
      if (editingRef?.source === PROFILE_SOURCE.NATIVE) renderProfiles();
      else status('请先选择要复制的配置', true);
      return;
    }
    const copy = {
      id: makeId(),
      name: `${source.name} 副本`,
      apiUrl: source.apiUrl,
      model: source.model,
      secretId: source.secretId,
    };
    app.settings.profiles.push(copy);
    editingRef = { source: PROFILE_SOURCE.LOCAL, id: copy.id };
    app.save(); renderProfiles(); app.refreshPet();
  });
  fields.deleteProfile.addEventListener('click', () => {
    if (editingRef?.source !== PROFILE_SOURCE.LOCAL) return status('请先选择桌宠独立配置', true);
    app.settings.profiles = app.settings.profiles.filter(item => item.id !== editingRef.id);
    if (app.settings.activeProfileRef?.source === PROFILE_SOURCE.LOCAL && app.settings.activeProfileRef.id === editingRef.id) {
      app.settings.activeProfileRef = null;
    }
    editingRef = null; app.save(); renderProfiles(); app.refreshPet(); status('配置已删除，原生 Secret 未删除。');
  });
  fields.fetchModels.addEventListener('click', async () => {
    let secretSaved = false;
    const originalText = fields.fetchModels.textContent;
    try {
      const apiUrl = fields.url.value.trim();
      if (!apiUrl) throw new Error('请先填写 API 地址');
      fields.fetchModels.disabled = true;
      fields.fetchModels.textContent = '获取中…';

      let secretId = fields.secret.value;
      if (fields.key.value) {
        secretId = await app.host.createSecret(fields.key.value, fields.name.value.trim() || '连接桌宠');
        if (!secretId) throw new Error('API Key 写入酒馆 Secrets 失败');
        secretSaved = true;
        fields.key.value = '';
        renderSecrets(secretId);
      }

      const models = await app.fetchModels({ apiUrl, secretId });
      fields.modelOptions.replaceChildren(...models.map(model => option(model, model)));
      if (!fields.model.value.trim()) fields.model.value = models[0];
      status(`${secretSaved ? '密钥已保存到酒馆 Secrets；' : ''}已获取 ${models.length} 个模型。`);
    } catch (error) {
      status(`${secretSaved ? '密钥已保存到酒馆 Secrets；' : ''}${error.message}`, true);
    } finally {
      fields.fetchModels.textContent = originalText;
      fields.fetchModels.disabled = false;
    }
  });
  byId('cp-reset-position').addEventListener('click', () => { app.settings.pet.x = null; app.settings.pet.y = null; app.save(); app.refreshPet(); status('桌宠位置已重置'); });

  renderProfiles();
  refreshPresets();
  return { renderProfiles, refreshPresets };
}
