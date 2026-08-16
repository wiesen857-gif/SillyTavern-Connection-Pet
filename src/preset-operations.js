// Version-pinned helper contract: Tavern Helper 4.9.2 (9706d0b),
// @types/function/preset.d.ts.
export function requireTavernHelper(helper, methods = ['getPresetNames', 'getLoadedPresetName', 'getPreset', 'loadPreset', 'replacePreset']) {
  const missing = methods.filter(name => typeof helper?.[name] !== 'function');
  if (missing.length) throw new Error(`酒馆助手接口不可用：${missing.join('、')}`);
  return helper;
}

export function listPresetPrompts(helper, presetName) {
  requireTavernHelper(helper, ['getPreset']);
  const preset = helper.getPreset(presetName);
  if (!Array.isArray(preset?.prompts)) throw new Error(`无法读取预设“${presetName}”的条目`);
  return preset.prompts.map(prompt => ({ id: String(prompt.id), name: String(prompt.name || prompt.id), enabled: Boolean(prompt.enabled) }));
}

export async function switchPresetAndSetEntries(helper, presetName, requestedStates, allowedIds) {
  requireTavernHelper(helper, ['getPreset', 'loadPreset', 'replacePreset']);
  if (!presetName || !(requestedStates instanceof Map) || !(allowedIds instanceof Set)) {
    throw new TypeError('预设、目标状态或待开启条目无效');
  }

  for (const id of requestedStates.keys()) {
    if (!allowedIds.has(id)) throw new Error(`条目 ${id} 不在待开启列表中`);
  }

  const target = helper.getPreset(presetName);
  const availableIds = new Set((target?.prompts ?? []).map(prompt => String(prompt.id)));
  for (const id of requestedStates.keys()) {
    if (!availableIds.has(id)) throw new Error(`条目 ${id} 已失效，请在扩展设置中重新选择`);
  }

  if (!helper.loadPreset(presetName)) throw new Error(`切换预设“${presetName}”失败`);
  const inUse = helper.getPreset('in_use');
  for (const prompt of inUse.prompts ?? []) {
    const id = String(prompt.id);
    if (requestedStates.has(id)) prompt.enabled = Boolean(requestedStates.get(id));
  }
  await helper.replacePreset('in_use', inUse, { render: 'immediate' });
  return inUse;
}
