'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('batch downloader processes URLs sequentially through the existing download button', async () => {
  const listeners = new Map();
  const elements = new Map();
  const makeElement = () => ({
    value: '', textContent: '', disabled: false, checked: false, children: [],
    addEventListener(type, listener) { listeners.set(`${this.id}:${type}`, listener); },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    focus() {},
    click() { for (const listener of this.listeners || []) listener(); },
  });
  for (const id of ['media-batch-urls', 'start-media-batch', 'media-batch-queue', 'media-url', 'download-to-queue', 'media-rights-consent', 'media-rights', 'download-status']) {
    const element = makeElement(); element.id = id; element.listeners = [];
    element.addEventListener = (type, listener) => { if (id === 'download-to-queue') element.listeners.push(listener); else listeners.set(`${id}:${type}`, listener); };
    elements.set(`#${id}`, element);
  }
  const single = elements.get('#download-to-queue');
  const urlInput = elements.get('#media-url');
  const status = elements.get('#download-status');
  const starts = [];
  single.click = () => {
    starts.push(urlInput.value);
    single.disabled = true;
    status.textContent = 'Stahuji…';
    setTimeout(() => { status.textContent = 'Hotovo: výsledek je ve frontě'; single.disabled = false; }, 5);
  };
  const window = { YamaApp: Object.freeze({ showConverter() { window.converterShown = true; } }) };
  const document = { querySelector: selector => elements.get(selector), createElement: () => makeElement() };
  const source = fs.readFileSync(path.resolve(__dirname, '../pwa/batch-download.js'), 'utf8');
  vm.runInNewContext(source, { window, document, URL, setTimeout, clearTimeout, setInterval, clearInterval });
  elements.get('#media-batch-urls').value = 'https://youtu.be/one\nhttps://youtu.be/two';
  elements.get('#media-rights-consent').checked = true;
  await listeners.get('start-media-batch:click')();
  assert.deepEqual(starts, ['https://youtu.be/one', 'https://youtu.be/two']);
  assert.equal(elements.get('#media-batch-queue').children.length, 2);
  assert.match(elements.get('#media-batch-queue').children[0].children[0].textContent, /Hotovo/);
  assert.equal(window.converterShown, true);
});
