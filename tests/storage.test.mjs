import assert from 'node:assert/strict';
import test from 'node:test';
import SkyStorage from '../src/storage.js';

function withMockStorage(impl, fn) {
  const prev = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: impl,
    configurable: true,
    writable: true,
  });
  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      value: prev,
      configurable: true,
      writable: true,
    });
  }
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('SkyStorage reads and writes ints and JSON safely', () => {
  const mem = createMemoryStorage();
  withMockStorage(mem, () => {
    SkyStorage.setInt('skystar:v1:test:score', 42);
    assert.equal(SkyStorage.getInt('skystar:v1:test:score', 0), 42);
    assert.equal(SkyStorage.getInt('skystar:v1:test:missing', 7), 7);

    SkyStorage.set('skystar:v1:test:badint', 'abc');
    assert.equal(SkyStorage.getInt('skystar:v1:test:badint', 9), 9);

    SkyStorage.setJSON('skystar:v1:test:obj', { ok: true, count: 3 });
    assert.deepEqual(SkyStorage.getJSON('skystar:v1:test:obj', null), { ok: true, count: 3 });

    SkyStorage.set('skystar:v1:test:badjson', '{broken');
    assert.deepEqual(SkyStorage.getJSON('skystar:v1:test:badjson', { fallback: 1 }), {
      fallback: 1,
    });
  });
});

test('SkyStorage.migrate moves old key once and skips if target exists', () => {
  const mem = createMemoryStorage();
  withMockStorage(mem, () => {
    SkyStorage.set('old_key', '123');
    assert.equal(SkyStorage.migrate('old_key', 'new_key'), true);
    assert.equal(SkyStorage.get('new_key'), '123');
    assert.equal(SkyStorage.get('old_key'), null);

    SkyStorage.set('old_key', '999');
    assert.equal(SkyStorage.migrate('old_key', 'new_key'), false);
    assert.equal(SkyStorage.get('new_key'), '123');
  });
});

test('SkyStorage degrades gracefully when localStorage throws', () => {
  const broken = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  withMockStorage(broken, () => {
    assert.doesNotThrow(() => {
      SkyStorage.setInt('k', 1);
      SkyStorage.setJSON('j', { a: 1 });
      SkyStorage.remove('k');
    });
    assert.equal(SkyStorage.get('k'), null);
    assert.equal(SkyStorage.getInt('k', 5), 5);
    assert.deepEqual(SkyStorage.getJSON('j', { def: true }), { def: true });
  });
});
