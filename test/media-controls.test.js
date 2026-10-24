'use strict';

// mobile/media-controls.js: the Android "now playing" notification / lock-screen controls.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

function setup(platform = 'android', { unrestricted = true } = {}) {
  const calls = [];
  const asked = [];
  let actionListener = null;
  const plugin = {
    update: (data) => { calls.push(data); return Promise.resolve(); },
    addListener: (name, cb) => { if (name === 'action') actionListener = cb; return Promise.resolve({ remove() {} }); },
    backgroundStatus: () => Promise.resolve({ unrestricted }),
    allowBackground: () => { asked.push('allow'); return Promise.resolve(); },
  };
  const fakeCore = { Capacitor: { getPlatform: () => platform }, registerPlugin: () => plugin };
  const origLoad = Module._load;
  Module._load = function (request, ...rest) { return request === '@capacitor/core' ? fakeCore : origLoad.call(this, request, ...rest); };
  const file = path.join(__dirname, '../mobile/media-controls.js');
  delete require.cache[file];
  const audio = new EventTarget();
  Object.assign(audio, { paused: true, currentTime: 0, duration: NaN, playbackRate: 1 });
  const did = [];
  const state = { currentTrack: null, isPlaying: false };
  global.window = new EventTarget();
  const store = new Map();
  global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  global.document = { hidden: false };
  window.MurielCore = {
    state, audio, thumb: (t) => t.thumbnail,
    togglePlay: () => { did.push('toggle'); state.isPlaying = !state.isPlaying; },
    next: () => did.push('next'), prev: () => did.push('prev'), seek: (s) => did.push(`seek ${s}`),
  };
  try { require(file)(); } finally { Module._load = origLoad; }
  return { calls, asked, audio, state, did, action: (a) => actionListener(a) };
}

const tick = () => new Promise((r) => setTimeout(r, 120));

test('one update per song change with title, cover, length and play state', async () => {
  const { calls, audio, state } = setup();
  state.currentTrack = { title: 'Song', artist: 'Someone', duration: 200, thumbnail: 'https://i.ytimg.com/vi/a/mqdefault.jpg' };
  state.isPlaying = true;
  window.dispatchEvent(new Event('muriel:track'));
  Object.assign(audio, { currentTime: 3, duration: 201.5 });
  audio.dispatchEvent(new Event('durationchange'));
  audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0], { title: 'Song', artist: 'Someone', album: '', artwork: 'https://i.ytimg.com/vi/a/mqdefault.jpg', duration: 201.5, position: 3, playing: true, loading: false, rate: 1 });
});

test('the gap while the next song downloads is reported as loading, not as a pause', async () => {
  const { calls, audio, state } = setup();
  state.currentTrack = { title: 'One', duration: 100 };
  state.isPlaying = true;
  audio.dispatchEvent(new Event('playing'));
  await tick();
  // the song ends: app.js pauses, then starts loading the next one
  state.isPlaying = false;
  audio.dispatchEvent(new Event('pause'));
  state.currentTrack = { title: 'Two', duration: 100 };
  state.trackLoading = true;
  window.dispatchEvent(new Event('muriel:loading'));
  await tick();
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[1].title, 'Two');
  assert.strictEqual(calls[1].playing, false);
  assert.strictEqual(calls[1].loading, true);
  state.isPlaying = true;
  state.trackLoading = false;
  audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.deepStrictEqual([calls[2].playing, calls[2].loading], [true, false]);
});

test('a button press is answered with the real state, even when it changed nothing', async () => {
  const { calls, state, action } = setup();
  state.currentTrack = { title: 'T' };
  window.MurielCore.togglePlay = () => {}; // nothing to resume
  action({ action: 'play' });
  await tick();
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].playing, false);
  assert.strictEqual(calls[0].loading, false);
});

test('asks once to keep running in the background, when the first song starts', async () => {
  const restricted = setup('android', { unrestricted: false });
  restricted.audio.dispatchEvent(new Event('playing'));
  restricted.audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.deepStrictEqual(restricted.asked, ['allow']);
  const fine = setup('android', { unrestricted: true });
  fine.audio.dispatchEvent(new Event('playing'));
  await tick();
  assert.deepStrictEqual(fine.asked, []);
});

test('notification buttons drive the player', () => {
  const { state, did, action } = setup();
  state.isPlaying = true;
  action({ action: 'play' });
  action({ action: 'pause' });
  action({ action: 'pause' });
  action({ action: 'next' });
  action({ action: 'prev' });
  action({ action: 'seek', position: 42 });
  assert.deepStrictEqual(did, ['toggle', 'next', 'prev', 'seek 42']);
});

test('does nothing outside Android', async () => {
  const { calls, state } = setup('ios');
  state.currentTrack = { title: 'T' };
  window.dispatchEvent(new Event('muriel:track'));
  await tick();
  assert.strictEqual(calls.length, 0);
});

test.after(() => { delete global.window; delete global.localStorage; delete global.document; });
