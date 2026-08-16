# Native Connection Profiles Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read SillyTavern 1.16.0 native Chat Completion → Custom connection profiles and apply only their URL, model, and Secret ID without applying their prompt preset or other stored fields.

**Architecture:** Add a pure profile-catalog module that normalizes native and extension-owned profiles into one tagged view model, while resolving native profiles again immediately before application. Keep host access in `host-adapter.js`; both settings and pet UIs consume the same catalog helpers and the same restricted `applyCustomProfile` path.

**Tech Stack:** Browser-native ES modules, SillyTavern 1.16.0 extension APIs and slash commands, Tavern Helper 4.9.2, HTML/CSS, Node.js built-in test runner.

## Global Constraints

- Support only SillyTavern `1.16.0` and Tavern Helper `4.9.2`.
- Support only `Chat Completion -> Custom (OpenAI-compatible)` profiles where `mode === 'cc'` and `api === 'custom'`.
- Never call SillyTavern's native `/profile` command or native `applyConnectionProfile` routine.
- Applying an API profile may use only name, `api-url`, model, and `secret-id`; it must ignore `preset` and every other native profile field.
- API configuration and prompt-preset entry operations remain independent in both directions.
- Plaintext API keys remain only in SillyTavern Secrets and must never enter extension settings.
- Native profiles are read-only and are refreshed from `extension_settings.connectionManager.profiles` rather than copied into extension storage.

---

## File Structure

- Create `src/profile-catalog.js`: pure normalization, tagged reference encoding/decoding, grouping, and late profile resolution.
- Create `tests/profile-catalog.test.mjs`: catalog filtering, isolation, ID collision, and stale-reference tests.
- Modify `src/settings.js`: schema version 2 and persisted `{ source, id }` active profile reference with version-1 migration.
- Modify `tests/settings.test.mjs`: migration and malformed-reference coverage.
- Modify `src/host-adapter.js`: expose raw native connection profiles and detect missing Secret IDs before application.
- Modify `tests/host-adapter.test.mjs`: native source access, missing Secret, and no-preset-command coverage.
- Modify `index.js`: resolve selected profiles through the catalog immediately before restricted application.
- Modify `settings.html`: add source indicator and clarify copy action.
- Modify `src/settings-panel.js`: grouped profile selector, native read-only state, native-to-local copy, and refreshed selection.
- Modify `src/pet-widget.js`: grouped selector, source summary, stale-native handling, and tagged selection persistence.
- Modify `style.css`: source badge, disabled field treatment, two-column narrow-screen actions, and full-width apply buttons.
- Modify `tests/fixtures/mock-host.html`: include compatible and incompatible native profiles for browser smoke coverage.
- Modify `README.md`, `manifest.json`, and `package.json`: document behavior and bump release version to `0.2.0`.

### Task 1: Pure Profile Catalog

**Files:**
- Create: `src/profile-catalog.js`
- Create: `tests/profile-catalog.test.mjs`

**Interfaces:**
- Consumes: extension-owned profiles shaped as `{ id, name, apiUrl, model, secretId, note }` and native rows from `extension_settings.connectionManager.profiles`.
- Produces: `PROFILE_SOURCE`, `encodeProfileRef(ref)`, `decodeProfileRef(value)`, `listProfileCatalog(localProfiles, nativeRows)`, and `resolveProfileRef(ref, localProfiles, nativeRows)`.
- Catalog item shape: `{ source: 'native'|'local', id, name, apiUrl, model, secretId, note, readOnly }`.

- [ ] **Step 1: Write failing catalog tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_SOURCE,
  decodeProfileRef,
  encodeProfileRef,
  listProfileCatalog,
  resolveProfileRef,
} from '../src/profile-catalog.js';

const nativeRows = [
  { id: 'same', name: '酒馆 Custom', mode: 'cc', api: 'custom', 'api-url': 'https://example.test/v1', model: 'native-model', 'secret-id': 'secret-1', preset: '不得应用', proxy: '也不得应用' },
  { id: 'openrouter', name: '独立 OpenRouter', mode: 'cc', api: 'openrouter', 'api-url': 'https://openrouter.ai/api/v1', model: 'x' },
  { id: 'text', name: 'Text Completion', mode: 'tc', api: 'custom', 'api-url': 'https://example.test/v1', model: 'x' },
  { id: 'empty-model', name: '缺模型', mode: 'cc', api: 'custom', 'api-url': 'https://example.test/v1', model: '' },
];
const localRows = [{ id: 'same', name: '桌宠配置', apiUrl: 'http://127.0.0.1:1234/v1', model: 'local-model', secretId: '', note: 'local' }];

test('catalog keeps only valid cc/custom native rows and strips unrelated fields', () => {
  const catalog = listProfileCatalog(localRows, nativeRows);
  assert.equal(catalog.native.length, 1);
  assert.deepEqual(catalog.native[0], {
    source: PROFILE_SOURCE.NATIVE,
    id: 'same',
    name: '酒馆 Custom',
    apiUrl: 'https://example.test/v1',
    model: 'native-model',
    secretId: 'secret-1',
    note: '',
    readOnly: true,
  });
  assert.equal('preset' in catalog.native[0], false);
  assert.equal('proxy' in catalog.native[0], false);
});

test('tagged references distinguish equal IDs from different sources', () => {
  const localRef = { source: PROFILE_SOURCE.LOCAL, id: 'same' };
  const nativeRef = { source: PROFILE_SOURCE.NATIVE, id: 'same' };
  assert.notEqual(encodeProfileRef(localRef), encodeProfileRef(nativeRef));
  assert.deepEqual(decodeProfileRef(encodeProfileRef(nativeRef)), nativeRef);
  assert.equal(resolveProfileRef(localRef, localRows, nativeRows).model, 'local-model');
  assert.equal(resolveProfileRef(nativeRef, localRows, nativeRows).model, 'native-model');
});

test('a deleted native profile resolves to null', () => {
  assert.equal(resolveProfileRef({ source: 'native', id: 'gone' }, localRows, nativeRows), null);
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run: `node --test tests/profile-catalog.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/profile-catalog.js`.

- [ ] **Step 3: Implement the minimal pure catalog**

```js
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
  return { source: PROFILE_SOURCE.LOCAL, id: text(row.id), name: text(row.name) || '未命名配置', apiUrl: text(row.apiUrl), model: text(row.model), secretId: text(row.secretId), note: text(row.note), readOnly: false };
}

function normalizeNative(row) {
  if (!row || row.mode !== 'cc' || row.api !== 'custom') return null;
  const id = text(row.id), apiUrl = text(row['api-url']), model = text(row.model);
  if (!id || !apiUrl || !model) return null;
  return { source: PROFILE_SOURCE.NATIVE, id, name: text(row.name) || '未命名酒馆配置', apiUrl, model, secretId: text(row['secret-id']), note: '', readOnly: true };
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
```

- [ ] **Step 4: Run catalog tests**

Run: `node --test tests/profile-catalog.test.mjs`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the catalog**

```powershell
git add -- src/profile-catalog.js tests/profile-catalog.test.mjs
git commit -m "feat: add isolated connection profile catalog"
```

### Task 2: Persisted Selection Migration

**Files:**
- Modify: `src/settings.js`
- Modify: `tests/settings.test.mjs`

**Interfaces:**
- Consumes: version-1 `activeProfileId` or version-2 `activeProfileRef`.
- Produces: normalized `activeProfileRef: { source: 'local'|'native', id: string } | null`; existing profile data remains unchanged.

- [ ] **Step 1: Add failing migration tests**

```js
test('migrates a version-1 active profile ID to a local tagged reference', () => {
  const value = normalizeSettings({
    version: 1,
    activeProfileId: 'a',
    profiles: [{ id: 'a', name: '本地', apiUrl: 'http://localhost/v1', model: 'demo' }],
  });
  assert.equal(value.version, 2);
  assert.deepEqual(value.activeProfileRef, { source: 'local', id: 'a' });
  assert.equal('activeProfileId' in value, false);
});

test('retains a native active reference without copying native data', () => {
  const value = normalizeSettings({ version: 2, activeProfileRef: { source: 'native', id: 'native-1' } });
  assert.deepEqual(value.activeProfileRef, { source: 'native', id: 'native-1' });
  assert.deepEqual(value.profiles, []);
});

test('rejects malformed active references', () => {
  assert.equal(normalizeSettings({ activeProfileRef: { source: 'other', id: 'x' } }).activeProfileRef, null);
});
```

- [ ] **Step 2: Verify the migration tests fail**

Run: `node --test tests/settings.test.mjs`

Expected: FAIL because settings version is still `1` and `activeProfileRef` is absent.

- [ ] **Step 3: Implement schema version 2 normalization**

Update defaults to `version: 2` and `activeProfileRef: null`. Add a strict normalizer:

```js
function normalizeProfileRef(value) {
  const source = text(value?.source);
  const id = text(value?.id);
  return ['local', 'native'].includes(source) && id ? { source, id } : null;
}

const activeProfileRef = normalizeProfileRef(source.activeProfileRef)
  ?? (profiles.some(item => item.id === source.activeProfileId)
    ? { source: 'local', id: source.activeProfileId }
    : null);
```

Return `version: 2` and `activeProfileRef`; do not return `activeProfileId`.

- [ ] **Step 4: Run settings and catalog tests**

Run: `node --test tests/settings.test.mjs tests/profile-catalog.test.mjs`

Expected: all tests PASS, including plaintext-key exclusion.

- [ ] **Step 5: Commit migration**

```powershell
git add -- src/settings.js tests/settings.test.mjs
git commit -m "feat: persist tagged profile selections"
```

### Task 3: Host Access and Restricted Application

**Files:**
- Modify: `src/host-adapter.js`
- Modify: `tests/host-adapter.test.mjs`

**Interfaces:**
- Produces host methods `getNativeConnectionProfiles(): object[]`, `getSecrets(): SecretSummary[]`, and `hasSecret(id): boolean`.
- `applyCustomProfile(host, profile)` continues accepting only normalized catalog fields and explicitly rejects a missing referenced Secret.

- [ ] **Step 1: Add failing host tests**

```js
test('does not execute preset or other native profile fields', async () => {
  const commands = [];
  const host = { run: async command => commands.push(command), rotateSecret: async () => {}, hasSecret: () => true };
  await applyCustomProfile(host, {
    apiUrl: 'https://example.test/v1', model: 'demo', secretId: 's1',
    preset: 'must-not-run', proxy: 'must-not-run',
  });
  assert.equal(commands.some(command => command.includes('/preset') || command.includes('/profile')), false);
  assert.equal(commands.some(command => command.includes('must-not-run')), false);
});

test('rejects a referenced Secret that no longer exists before running commands', async () => {
  const calls = [];
  const host = { run: async command => calls.push(command), rotateSecret: async () => {}, hasSecret: () => false };
  await assert.rejects(() => applyCustomProfile(host, { apiUrl: 'https://example.test/v1', model: 'demo', secretId: 'missing' }), /密钥.*不存在|Secret/);
  assert.deepEqual(calls, []);
});
```

Add a pure exported accessor test so no browser import mocking is required:

```js
import { applyCustomProfile, readNativeConnectionProfiles, validateCommandValue } from '../src/host-adapter.js';

test('reads native connection rows defensively', () => {
  const original = [{ id: 'n1' }];
  const rows = readNativeConnectionProfiles({ extensionSettings: { connectionManager: { profiles: original } } });
  assert.deepEqual(rows, original);
  assert.notEqual(rows, original);
  assert.deepEqual(readNativeConnectionProfiles({ extensionSettings: {} }), []);
});
```

- [ ] **Step 2: Verify the new host tests fail**

Run: `node --test tests/host-adapter.test.mjs`

Expected: missing-Secret test FAIL because `hasSecret` is not called.

- [ ] **Step 3: Add host data access and Secret validation**

Before the first slash command in `applyCustomProfile`:

```js
if (profile.secretId && typeof host.hasSecret === 'function' && !host.hasSecret(profile.secretId)) {
  throw new Error('配置引用的酒馆 Secret 已不存在或不可用');
}
```

Add the exported accessor and use closures for Secret lookup in the browser host:

```js
export function readNativeConnectionProfiles(context) {
  const rows = context.extensionSettings?.connectionManager?.profiles;
  return Array.isArray(rows) ? [...rows] : [];
}

const getSecrets = () => {
  const rows = secrets.secret_state?.[secrets.SECRET_KEYS.CUSTOM];
  return Array.isArray(rows)
    ? rows.map(row => ({ id: row.id, label: row.label, active: Boolean(row.active) }))
    : [];
};

return {
  // existing fields stay unchanged
  getSecrets,
  hasSecret: id => getSecrets().some(row => row.id === id),
  getNativeConnectionProfiles: () => readNativeConnectionProfiles(context),
};
```

- [ ] **Step 4: Run host tests and static checks**

Run: `node --test tests/host-adapter.test.mjs`

Run: `npm.cmd run check`

Expected: host tests PASS; static check may still need the new catalog file added in Task 6.

- [ ] **Step 5: Commit host changes**

```powershell
git add -- src/host-adapter.js tests/host-adapter.test.mjs
git commit -m "feat: expose native custom connection profiles"
```

### Task 4: Shared Application Entry and Settings UI

**Files:**
- Modify: `index.js`
- Modify: `settings.html`
- Modify: `src/settings-panel.js`
- Modify: `tests/settings-panel.test.mjs`

**Interfaces:**
- `app.getProfileCatalog()` returns `{ native, local }` from current host data.
- `app.resolveProfile(ref)` resolves again from current host data.
- `app.applyProfileRef(ref)` rejects stale references, then calls `applyCustomProfile` with the normalized catalog item.

- [ ] **Step 1: Add failing tests for grouped options and native edit state**

Export small DOM-independent helpers from `settings-panel.js` and test them:

```js
test('builds non-empty native and local selector groups', () => {
  const groups = settingsPanel.makeProfileGroups({
    native: [{ source: 'native', id: 'n1', name: '酒馆配置' }],
    local: [{ source: 'local', id: 'l1', name: '桌宠配置' }],
  });
  assert.deepEqual(groups.map(group => group.label), ['酒馆现有配置', '桌宠独立配置']);
  assert.match(groups[0].options[0].value, /^native:/);
  assert.match(groups[1].options[0].value, /^local:/);
});

test('native selection is read-only while local selection is editable', () => {
  assert.deepEqual(settingsPanel.getProfileEditState({ source: 'native' }), { readOnly: true, canSave: false, canDelete: false, canCopy: true });
  assert.deepEqual(settingsPanel.getProfileEditState({ source: 'local' }), { readOnly: false, canSave: true, canDelete: true, canCopy: true });
});
```

- [ ] **Step 2: Run settings-panel tests and verify failure**

Run: `node --test tests/settings-panel.test.mjs`

Expected: FAIL because `makeProfileGroups` and `getProfileEditState` are absent.

- [ ] **Step 3: Add the shared application boundary in `index.js`**

```js
const getNativeProfiles = () => host.getNativeConnectionProfiles();
const app = {
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
  refreshPet: () => petWidget?.refresh(),
};
```

Do not expose a method that accepts a raw native profile object.

- [ ] **Step 4: Implement grouped settings selection and read-only mode**

Add `#cp-profile-source` to `settings.html`. In `settings-panel.js`:

- encode every option with `encodeProfileRef`;
- create `<optgroup label="酒馆现有配置">` and `<optgroup label="桌宠独立配置">` only when non-empty;
- store `editingRef`, not a bare local ID;
- on every render, call `app.getProfileCatalog()`;
- set name, URL, model, Secret, note, and new-key controls disabled/read-only for native rows;
- disable Save and Delete for native rows;
- copy any selected row into a new local record with `id: makeId()` and `${name} 副本`;
- call `app.applyProfileRef(editingRef)` for Apply and persist `activeProfileRef` only after success;
- if a native row disappeared, clear the selector and show `所选酒馆配置已不存在，请重新选择`.

The copy operation must copy only the normalized catalog fields; it must never have access to `preset` or other native fields.

- [ ] **Step 5: Run settings-panel tests**

Run: `node --test tests/settings-panel.test.mjs tests/profile-catalog.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit shared application and settings UI**

```powershell
git add -- index.js settings.html src/settings-panel.js tests/settings-panel.test.mjs
git commit -m "feat: browse native profiles in extension settings"
```

### Task 5: Pet Catalog and Responsive Actions

**Files:**
- Modify: `src/pet-widget.js`
- Modify: `style.css`
- Modify: `tests/fixtures/mock-host.html`

**Interfaces:**
- Consumes `app.getProfileCatalog()`, `app.resolveProfile(ref)`, and `app.applyProfileRef(ref)` from Task 4.
- Persists `app.settings.activeProfileRef` only after a successful application.

- [ ] **Step 1: Extend the visual fixture with native profiles**

Add to the mock `extensionSettings`:

```js
connectionManager: {
  profiles: [
    { id: 'native-demo', name: '酒馆 Custom 示例', mode: 'cc', api: 'custom', 'api-url': 'https://example.test/v1', model: 'native-demo-model', 'secret-id': '', preset: '不得切换的预设' },
    { id: 'ignored', name: '独立供应商示例', mode: 'cc', api: 'openrouter', 'api-url': 'https://openrouter.ai/api/v1', model: 'ignored' },
  ],
},
```

Update the fixture's extension settings to version 2 with `activeProfileRef: { source: 'local', id: 'demo' }`.

- [ ] **Step 2: Update pet profile rendering**

Use the same native-first/local-second grouping rules as the settings panel. Define this local renderer in `pet-widget.js`:

```js
function renderProfileOptions(select, catalog) {
  select.replaceChildren(makeOption('', '选择配置…'));
  for (const [key, label] of [['native', '酒馆现有配置'], ['local', '桌宠独立配置']]) {
    if (!catalog[key].length) continue;
    const group = Object.assign(document.createElement('optgroup'), { label });
    for (const profile of catalog[key]) {
      group.append(makeOption(encodeProfileRef(profile), profile.name));
    }
    select.append(group);
  }
}
```

On refresh:

```js
const selectedValue = encodeProfileRef(app.settings.activeProfileRef);
renderProfileOptions(profileSelect, app.getProfileCatalog());
profileSelect.value = selectedValue;
if (!profileSelect.value && selectedValue) showStatus('上次选择的 API 配置已不存在，请重新选择', true);
```

Resolve the selected value before summary rendering. Show `来源：酒馆现有配置` or `来源：桌宠独立配置` plus model and URL.

- [ ] **Step 3: Update one-click application**

```js
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
```

Do not call any function from `preset-operations.js` in this API handler.

- [ ] **Step 4: Fix narrow-screen action layout**

Add a class to the settings Apply button and use:

```css
.cp-source-badge { opacity: .72; font-size: .82em; }
.cp-grid :disabled { opacity: .72; cursor: not-allowed; }

@media (max-width: 600px) {
  .connection-pet-settings .cp-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .connection-pet-settings .cp-actions .menu_button { width: 100%; min-width: 0; white-space: normal; }
  .connection-pet-settings .cp-actions .cp-apply-wide { grid-column: 1 / -1; }
  .cp-pet-apply { width: 100%; }
}
```

Keep the existing fixed-bottom mobile popover behavior.

- [ ] **Step 5: Run browser smoke checks at desktop and narrow widths**

Run: `node tests/visual-server.mjs`

Open the fixture at desktop width and at approximately `390px` width. Confirm:

- selector shows only `酒馆 Custom 示例`, not `独立供应商示例`;
- both source groups appear;
- native selection is read-only in settings;
- pet summary shows source/model/URL;
- buttons remain horizontal and Apply spans the row;
- no uncaught console errors occur.

- [ ] **Step 6: Commit pet and responsive UI**

```powershell
git add -- src/pet-widget.js style.css tests/fixtures/mock-host.html
git commit -m "feat: switch native profiles from the connection pet"
```

### Task 6: Documentation, Release Metadata, and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `manifest.json`
- Modify: `package.json`

**Interfaces:**
- No new runtime interface; this task documents and validates the completed feature.

- [ ] **Step 1: Document native configuration behavior**

Add this README content under the usage section (wording may be adjusted only for surrounding grammar):

```markdown
### 使用酒馆现有连接配置

拓展会自动列出酒馆连接管理器中属于 Chat Completion → Custom 的配置。酒馆现有配置在拓展中只读，也可以复制为可编辑的桌宠独立配置。

选择配置本身不会改变酒馆状态。点击“立即应用”或“一键应用”后，拓展只应用 API 地址、模型和 Secret ID；原配置中的提示词预设、代理、提示词后处理、正则预设及其他字段都会被忽略。预设条目只会在独立的“预设条目”页中改变。
```

- the extension automatically lists SillyTavern native connection profiles matching `cc/custom`;
- native profiles are read-only but can be copied to independent pet profiles;
- Apply extracts only API URL, model, and Secret ID;
- a native profile's `preset`, proxy, prompt processing, regex preset, and other fields are ignored;
- simply opening or selecting a profile changes nothing;
- preset entries change only from the separate preset-entry tab.

- [ ] **Step 2: Bump extension version to 0.2.0**

Set both `manifest.json.version` and `package.json.version` to `0.2.0`.

- [ ] **Step 3: Include every source file in syntax checking**

Add `node --check src/profile-catalog.js` to the `check` script in `package.json`.

- [ ] **Step 4: Run complete automated verification**

Run: `npm.cmd test`

Expected: all test files PASS with zero failures.

Run: `npm.cmd run check`

Expected: exit code `0` with no syntax errors.

Run: `git diff --check`

Expected: exit code `0`; no whitespace errors.

- [ ] **Step 5: Verify the key isolation acceptance case**

Use a host spy with a native row containing `preset: 'must-not-change'`. Resolve it through `resolveProfileRef`, apply it through `applyCustomProfile`, and assert the recorded operations contain only `/api-url`, Secret rotation, `/api`, and `/model`; assert no operation contains `/preset`, `/profile`, or `must-not-change`.

Expected: PASS. This is the primary proof that native profile loading does not associate API switching with presets.

- [ ] **Step 6: Commit release metadata and documentation**

```powershell
git add -- README.md manifest.json package.json
git commit -m "docs: release native profile integration"
```

- [ ] **Step 7: Inspect final repository state**

Run: `git status --short`

Expected: no output.

Run: `git log -6 --oneline`

Expected: the task commits appear above design commit `ad6e383`.
