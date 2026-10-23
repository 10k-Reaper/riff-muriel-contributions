'use strict';

// The library and metadata indexes survive a damaged file, and the import routes only fetch what they should.
// HOME and the data dir point at a temp folder; nothing here goes to the network.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muriel-files-'));
for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) process.env[key] = tmp;
process.env.MURIEL_DATA_DIR = path.join(tmp, 'data');
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });
// a library with one track, and a metadata index cut off halfway through a write
fs.writeFileSync(path.join(dataDir, 'library.json'), JSON.stringify({
  local_000000000001: { id: 'local_000000000001', file: 'local_000000000001.mp3', title: 't', artist: 'a', addedAt: 1 },
}));
fs.writeFileSync(path.join(dataDir, 'metadata.json'), '{"abc": {"title": "half a fi');

// any outside request is a failure of the test
const outbound = [];
https.get = (target) => { outbound.push(String(target)); throw new Error('no network in tests'); };
https.request = (target) => { outbound.push(String(target)); throw new Error('no network in tests'); };

const { startServer, stopServer, getServerToken } = require('../server');
const { LIBRARY_PATH, METADATA_PATH } = require('../platform');
let port;

before(async () => { port = await startServer(0); });
after(async () => {
  await stopServer();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function call(method, route, { body, token = true } = {}) {
  return new Promise((resolve) => {
    const headers = token ? { 'x-muriel-token': getServerToken() } : {};
    const req = http.request({ host: '127.0.0.1', port, method, path: route, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', (error) => resolve({ error }));
    req.end(body);
  });
}

test('an unreadable metadata index is kept aside instead of being overwritten', async () => {
  assert.equal(path.dirname(METADATA_PATH), dataDir);
  const kept = fs.readdirSync(dataDir).filter((f) => f.startsWith('metadata.json.broken-'));
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(dataDir, kept[0]), 'utf-8'), '{"abc": {"title": "half a fi');
  // moved, not copied: the next start must not set aside yet another copy
  assert.equal(fs.existsSync(METADATA_PATH), false);
});

test('saving the library writes a complete file and leaves no temp files behind', async () => {
  const r = await call('POST', '/api/library-update', { body: JSON.stringify({ id: 'local_000000000001', duration: 321 }) });
  assert.equal(r.status, 200);
  const saved = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
  assert.equal(saved.local_000000000001.duration, 321);
  assert.deepEqual(fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp')), []);
});

test('import routes need the app token', async () => {
  for (const route of ['/api/apple-import?url=https%3A%2F%2Fmusic.apple.com%2Fus%2Fplaylist%2Fx%2Fpl.abc', '/api/playlist-import?url=https%3A%2F%2Fyoutube.com%2Fplaylist%3Flist%3Dx']) {
    const r = await call('GET', route, { token: false });
    assert.equal(r.status, 403, route);
  }
  assert.deepEqual(outbound, []);
});

test('apple import only fetches Apple Music pages', async () => {
  for (const link of [
    'http://127.0.0.1:9/x/music.apple.com/pl.abc', // used to match: the pattern looked anywhere in the string
    'https://example.com/?next=music.apple.com/us/playlist/pl.abc',
    'file:///etc/passwd#music.apple.com/pl.abc',
    'not a link',
  ]) {
    const r = await call('GET', `/api/apple-import?url=${encodeURIComponent(link)}`);
    assert.equal(r.status, 400, link);
    assert.equal(JSON.parse(r.body).success, false);
  }
  assert.deepEqual(outbound, []);
});
