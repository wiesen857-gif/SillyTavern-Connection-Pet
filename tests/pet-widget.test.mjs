import test from 'node:test';
import assert from 'node:assert/strict';
import * as petWidget from '../src/pet-widget.js';

const makeElement = tagName => ({
  tagName,
  children: [],
  append(...children) { this.children.push(...children); },
  replaceChildren(...children) { this.children = children; },
});

test('renders tagged native and local profile groups in source order', () => {
  assert.equal(typeof petWidget.renderProfileOptions, 'function');
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: makeElement };
  try {
    const select = makeElement('select');
    petWidget.renderProfileOptions(select, {
      native: [{ source: 'native', id: 'same', name: '酒馆配置' }],
      local: [{ source: 'local', id: 'same', name: '桌宠配置' }],
    });

    assert.equal(select.children[0].value, '');
    assert.deepEqual(select.children.slice(1).map(group => group.label), ['酒馆现有配置', '桌宠独立配置']);
    assert.equal(select.children[1].children[0].value, 'native:same');
    assert.equal(select.children[2].children[0].value, 'local:same');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('resolves a tagged selection and renders its source, model, and URL', () => {
  assert.equal(typeof petWidget.renderProfileSummary, 'function');
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: makeElement };
  try {
    const summary = makeElement('div');
    const calls = [];
    const app = {
      resolveProfile(ref) {
        calls.push(ref);
        return { source: 'native', model: 'native-model', apiUrl: 'https://example.test/v1' };
      },
    };

    petWidget.renderProfileSummary(summary, app, 'native:native-demo');

    assert.deepEqual(calls, [{ source: 'native', id: 'native-demo' }]);
    assert.equal(summary.children[0].className, 'cp-source-badge');
    assert.equal(summary.children[0].textContent, '来源：酒馆现有配置');
    assert.equal(summary.children[1].textContent, '模型：native-model\nURL：https://example.test/v1');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('builds a one-click preset request from checked allowlisted entries only', () => {
  assert.equal(typeof petWidget.buildEnabledEntryRequest, 'function');
  const allowed = [
    { promptId: 'adult', lastKnownName: '一键开启瑟瑟' },
    { promptId: 'style', lastKnownName: '文风增强' },
  ];

  const request = petWidget.buildEnabledEntryRequest(allowed, ['adult', 'not-allowed']);

  assert.deepEqual([...request.states], [['adult', true]]);
  assert.deepEqual([...request.allowedIds], ['adult', 'style']);
});

test('profile summary explicitly marks missing API fields', () => {
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: makeElement };
  try {
    const summary = makeElement('div');
    const app = { resolveProfile: () => ({ source: 'native', model: '', apiUrl: '' }) };

    petWidget.renderProfileSummary(summary, app, 'native:incomplete');

    assert.match(summary.children[1].textContent, /模型：\（未填写\）/);
    assert.match(summary.children[1].textContent, /URL：\（未填写\）/);
    assert.equal(summary.children[2].className, 'cp-inline-warning');
    assert.match(summary.children[2].textContent, /补全 API 地址和模型/);
  } finally {
    globalThis.document = originalDocument;
  }
});
