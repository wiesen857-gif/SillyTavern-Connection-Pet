import { listPresetPrompts, switchPresetAndSetEntries } from './preset-operations.js';
import { decodeProfileRef, encodeProfileRef, PROFILE_SOURCE } from './profile-catalog.js';

const makeOption = (value, label) => Object.assign(document.createElement('option'), { value, textContent: label });

export function renderProfileOptions(select, catalog) {
  select.replaceChildren(makeOption('', '选择配置…'));
  for (const [key, label] of [['native', '酒馆现有配置'], ['local', '桌宠独立配置']]) {
    if (!catalog[key].length) continue;
    const group = Object.assign(document.createElement('optgroup'), { label });
    for (const profile of catalog[key]) group.append(makeOption(encodeProfileRef(profile), profile.name));
    select.append(group);
  }
}

export function renderProfileSummary(summary, app, selectedValue) {
  const profile = app.resolveProfile(decodeProfileRef(selectedValue));
  if (!profile) {
    summary.textContent = '尚未选择配置';
    return;
  }
  const source = document.createElement('div');
  source.className = 'cp-source-badge';
  source.textContent = profile.source === PROFILE_SOURCE.NATIVE ? '来源：酒馆现有配置' : '来源：桌宠独立配置';
  const details = document.createElement('div');
  details.textContent = `模型：${profile.model}\nURL：${profile.apiUrl}`;
  summary.replaceChildren(source, details);
}

export function mountPetWidget(app) {
  const root = document.createElement('div');
  root.id = 'connection-pet-root';
  root.innerHTML = `
    <button class="cp-pet" type="button" aria-label="打开连接桌宠" title="连接桌宠">
      <img src="${new URL('../assets/pet-icon-switch.png', import.meta.url)}" alt="">
      <span class="cp-pet-dot"></span>
    </button>
    <div class="cp-popover" hidden>
      <div class="cp-popover-head"><strong>连接桌宠</strong><button class="cp-close" aria-label="关闭">×</button></div>
      <div class="cp-tabs" role="tablist">
        <button class="is-active" data-tab="api">API 配置</button><button data-tab="preset">预设条目</button>
      </div>
      <div class="cp-tab-panel" data-panel="api">
        <label>选择配置<select class="text_pole cp-pet-profiles"></select></label>
        <div class="cp-profile-summary"></div>
        <button class="menu_button cp-primary cp-pet-apply">一键应用</button>
      </div>
      <div class="cp-tab-panel" data-panel="preset" hidden>
        <label>先切换到预设<select class="text_pole cp-pet-presets"></select></label>
        <div class="cp-pet-prompts cp-prompt-list"></div>
      </div>
      <div class="cp-pet-status cp-status" role="status"></div>
    </div>`;
  document.body.append(root);
  const pet = root.querySelector('.cp-pet');
  const popover = root.querySelector('.cp-popover');
  const profileSelect = root.querySelector('.cp-pet-profiles');
  const presetSelect = root.querySelector('.cp-pet-presets');
  const promptList = root.querySelector('.cp-pet-prompts');
  const status = root.querySelector('.cp-pet-status');
  const summary = root.querySelector('.cp-profile-summary');
  let dragged = false;

  const showStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('is-error', error); };
  const clampPosition = () => {
    const size = app.settings.pet.size;
    if (window.innerWidth <= size + 16 || window.innerHeight <= size + 16) return;
    const x = app.settings.pet.x ?? Math.max(12, window.innerWidth - size - 24);
    const y = app.settings.pet.y ?? Math.max(80, Math.round(window.innerHeight * 0.38));
    app.settings.pet.x = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - size - 8));
    app.settings.pet.y = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - size - 8));
    root.style.setProperty('--cp-x', `${app.settings.pet.x}px`);
    root.style.setProperty('--cp-y', `${app.settings.pet.y}px`);
    root.style.setProperty('--cp-size', `${size}px`);
    root.classList.toggle('is-left', app.settings.pet.x < window.innerWidth / 2);
  };
  const renderSelectedProfileSummary = () => renderProfileSummary(summary, app, profileSelect.value);
  const renderPrompts = () => {
    promptList.replaceChildren();
    const presetName = presetSelect.value;
    if (!presetName) return;
    try {
      const allowed = app.settings.presetAllowlist[presetName] ?? [];
      const prompts = new Map(listPresetPrompts(app.host.helper, presetName).map(item => [item.id, item]));
      if (!allowed.length) {
        const empty = document.createElement('p'); empty.className = 'cp-empty'; empty.textContent = '此预设还没有待开启条目'; promptList.append(empty); return;
      }
      for (const item of allowed) {
        const prompt = prompts.get(item.promptId);
        const label = document.createElement('label'); label.className = `cp-prompt-row${prompt ? '' : ' is-stale'}`;
        const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: Boolean(prompt?.enabled), disabled: !prompt });
        const name = document.createElement('span'); name.textContent = prompt?.name ?? `${item.lastKnownName}（已失效）`;
        input.addEventListener('change', async () => {
          input.disabled = true;
          try {
            await switchPresetAndSetEntries(app.host.helper, presetName, new Map([[item.promptId, input.checked]]), new Set(allowed.map(row => row.promptId)));
            showStatus(`已切换到“${presetName}”并${input.checked ? '开启' : '关闭'}“${name.textContent}”`);
            renderPrompts();
          } catch (error) { input.checked = !input.checked; input.disabled = false; showStatus(error.message, true); }
        });
        label.append(input, name); promptList.append(label);
      }
    } catch (error) { showStatus(error.message, true); }
  };
  const refresh = () => {
    root.hidden = !app.settings.enabled;
    clampPosition();
    const selectedValue = encodeProfileRef(app.settings.activeProfileRef);
    renderProfileOptions(profileSelect, app.getProfileCatalog());
    profileSelect.value = selectedValue;
    if (!profileSelect.value && selectedValue) showStatus('上次选择的 API 配置已不存在，请重新选择', true);
    renderSelectedProfileSummary();
    const previousPreset = presetSelect.value;
    presetSelect.replaceChildren(makeOption('', '选择预设…'));
    try {
      for (const name of app.host.helper.getPresetNames()) presetSelect.append(makeOption(name, name));
      presetSelect.value = previousPreset || app.host.helper.getLoadedPresetName() || '';
    } catch (error) { showStatus(error.message, true); }
    renderPrompts();
  };

  pet.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY, left: app.settings.pet.x, top: app.settings.pet.y };
    dragged = false; pet.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      if (Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y) > 4) dragged = true;
      if (!dragged) return;
      app.settings.pet.x = start.left + moveEvent.clientX - start.x;
      app.settings.pet.y = start.top + moveEvent.clientY - start.y;
      clampPosition();
    };
    const up = () => { pet.removeEventListener('pointermove', move); pet.removeEventListener('pointerup', up); if (dragged) app.save(); };
    pet.addEventListener('pointermove', move); pet.addEventListener('pointerup', up);
  });
  pet.addEventListener('click', () => { if (!dragged) { popover.hidden = !popover.hidden; if (!popover.hidden) refresh(); } });
  root.querySelector('.cp-close').addEventListener('click', () => { popover.hidden = true; });
  root.querySelectorAll('.cp-tabs button').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('.cp-tabs button').forEach(item => item.classList.toggle('is-active', item === button));
    root.querySelectorAll('.cp-tab-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== button.dataset.tab; });
  }));
  profileSelect.addEventListener('change', renderSelectedProfileSummary);
  presetSelect.addEventListener('change', renderPrompts);
  root.querySelector('.cp-pet-apply').addEventListener('click', async () => {
    const ref = decodeProfileRef(profileSelect.value);
    if (!ref) return showStatus('请先选择 API 配置', true);
    try {
      const profile = await app.applyProfileRef(ref);
      app.settings.activeProfileRef = ref;
      app.save();
      refresh();
      showStatus(`已应用：${profile.name}`);
    } catch (error) {
      showStatus(error.message, true);
    }
  });
  window.addEventListener('resize', clampPosition);
  refresh();
  requestAnimationFrame(clampPosition);
  return { refresh };
}
