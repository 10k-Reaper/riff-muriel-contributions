'use strict';

// mobile/shims/store.js: files reach the phone's storage in pieces. One big FLAC used to cross the native
// bridge as a single base64 string (several copies of it at once), which crashed the app.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const crypto = require('crypto');

function setup({ failAt = -1 } = {}) {
  const disk = new Map();
  const calls = [];
  const Filesystem = {
    async writeFile({ path: p, data }) { calls.push(['write', p, data.length]); disk.set(p, Buffer.from(data, 'base64')); },
    async appendFile({ path: p, data }) {
      calls.push(['append', p, data.length]);
      if (calls.length - 1 === failAt) throw new Error('No space left on device');
      disk.set(p, Buffer.concat([disk.get(p), Buffer.from(data, 'base64')]));
    },
    async deleteFile({ path: p }) { calls.push(['delete', p]); disk.delete(p); },
  };
  const fakes = {
    '@capacitor/filesystem': { Filesystem, Directory: { Data: 'DATA', Documents: 'DOCUMENTS' }, Encoding: { UTF8: 'utf8' } },
    '@capacitor/core': { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true } },
  };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) { return fakes[request] || origLoad.call(this, request, ...rest); };
  const file = path.join(__dirname, '../mobile/shims/store.js');
  delete require.cache[file];
  try { return { store: require(file), disk, calls }; } finally { Module._load = origLoad; }
}

const flacLike = (n) => crypto.randomBytes(n); // incompressible, like real audio
const MB = 1024 * 1024;

test('a 40 MB file goes over in small pieces and arrives byte for byte', async () => {
  const { store, disk, calls } = setup();
  const bytes = flacLike(40 * MB + 12345);
  await store.writeBlob('/data/library/local_abc.flac', new Blob([bytes]));
  const biggest = Math.max(...calls.map((c) => c[2]));
  assert.ok(biggest <= 1.05 * MB, `largest piece was ${biggest} base64 chars`);
  assert.strictEqual(calls[0][0], 'write');
  assert.ok(calls.slice(1).every((c) => c[0] === 'append'));
  assert.ok(disk.get('Muriel/library/local_abc.flac').equals(bytes));
});

test('byte arrays are written in pieces too, small ones in one go', async () => {
  const { store, disk, calls } = setup();
  const big = flacLike(3 * MB);
  await store.writeBytes('/data/tracks/x.m4a', big);
  assert.ok(disk.get('Muriel/tracks/x.m4a').equals(big));
  assert.ok(calls.length > 1);
  calls.length = 0;
  const small = flacLike(5000);
  await store.writeBytes('/data/thumbnails/t.jpg', small);
  assert.deepStrictEqual(calls.map((c) => c[0]), ['write']);
  assert.ok(disk.get('Muriel/thumbnails/t.jpg').equals(small));
  calls.length = 0;
  await store.writeBytes('/data/empty.bin', new Uint8Array(0));
  assert.deepStrictEqual(calls.map((c) => c[0]), ['write']);
  assert.strictEqual(disk.get('Muriel/empty.bin').length, 0);
});

test('a write that fails half-way leaves no half file behind', async () => {
  const { store, disk, calls } = setup({ failAt: 3 });
  await assert.rejects(store.writeBlob('/data/library/local_x.flac', new Blob([flacLike(5 * MB)])), /No space/);
  assert.strictEqual(disk.has('Muriel/library/local_x.flac'), false);
  assert.strictEqual(calls[calls.length - 1][0], 'delete');
});
