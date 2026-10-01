const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class FakeImageElement {
  static failLoads = true;
  static sourceAssignments = 0;

  constructor() {
    this.dataset = {};
    this.currentSrc = '';
    this.naturalWidth = 0;
    this._src = '';
    this.listeners = new Map();
  }

  get src() {
    return this._src;
  }

  set src(value) {
    this._src = String(value);
    this.currentSrc = this._src;
    FakeImageElement.sourceAssignments += 1;
    queueMicrotask(() => {
      if (FakeImageElement.failLoads) {
        this.naturalWidth = 0;
        this.emit('error');
      } else {
        this.naturalWidth = 32;
        this.emit('load');
      }
    });
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter(entry => entry.listener !== listener));
  }

  emit(type) {
    const listeners = [...(this.listeners.get(type) || [])];
    for (const entry of listeners) {
      entry.listener.call(this);
      if (entry.once) this.removeEventListener(type, entry.listener);
    }
  }

  decode() {
    return Promise.resolve();
  }

  removeAttribute(name) {
    if (name === 'src') {
      this._src = '';
      this.currentSrc = '';
    }
  }
}

function installAssetManager() {
  let source = fs.readFileSync(path.join(ROOT, 'assetLoadScheduler.js'), 'utf8');
  source = source
    .replace('const MANAGER_RETRY_DELAYS_MS = [180, 600];', 'const MANAGER_RETRY_DELAYS_MS = [1, 1];')
    .replace('const MANAGER_ERROR_RETRY_BASE_MS = 1800;', 'const MANAGER_ERROR_RETRY_BASE_MS = 15;')
    .replace('const MANAGER_ERROR_RETRY_MAX_MS = 15000;', 'const MANAGER_ERROR_RETRY_MAX_MS = 60;')
    .replace(/\n    ensureOverlay\(\);[\s\S]*\n\}\)\(\);\s*$/, '\n})();');

  const document = {
    baseURI: 'https://example.test/game/',
    querySelector() { return null; },
    getElementById() { return null; },
    createElement(tag) {
      if (tag === 'img') return new FakeImageElement();
      return {};
    },
  };
  const window = {
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = {
    window,
    document,
    HTMLImageElement: FakeImageElement,
    Image: FakeImageElement,
    URL,
    Map,
    Set,
    WeakMap,
    Symbol,
    Promise,
    Error,
    TypeError,
    Math,
    String,
    decodeURIComponent,
    encodeURIComponent,
    performance,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    console,
  };
  vm.runInNewContext(source, context, { filename: 'assetLoadScheduler.js' });
  return window.assetManager;
}

test('a transient image failure can recover later without refreshing the page', async () => {
  FakeImageElement.failLoads = true;
  FakeImageElement.sourceAssignments = 0;
  const assetManager = installAssetManager();
  const asset = 'images/characters/human_female/body_front.png';

  await assert.rejects(assetManager.load(asset, { immediate: true }), /Failed to load image/);
  assert.equal(assetManager.status(asset), 'error');
  const managedImage = assetManager.get(asset);
  const attemptsAfterFailure = FakeImageElement.sourceAssignments;
  assert.equal(attemptsAfterFailure, 3, 'initial request should use the normal retry budget');

  assetManager.request(asset, { immediate: true });
  await sleep(5);
  assert.equal(
    FakeImageElement.sourceAssignments,
    attemptsAfterFailure,
    'an immediate repeat request should respect the error cooldown rather than hammering a missing asset',
  );

  await sleep(20);
  FakeImageElement.failLoads = false;
  const retriedImage = assetManager.request(asset, { immediate: true });
  assert.strictEqual(retriedImage, managedImage, 'recovery must preserve the Image object already held by renderers');
  await assetManager.whenReady(asset, { immediate: true });

  assert.equal(assetManager.status(asset), 'ready');
  assert.equal(managedImage.naturalWidth, 32);
  assert.ok(FakeImageElement.sourceAssignments > attemptsAfterFailure, 'the failed record should receive a fresh load attempt');
});
