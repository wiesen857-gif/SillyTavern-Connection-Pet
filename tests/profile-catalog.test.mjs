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
