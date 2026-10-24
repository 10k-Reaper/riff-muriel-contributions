'use strict';

// A song YouTube refuses falls back to SoundCloud. Its top result for big-label songs is often a 30-second
// preview, which used to play as the whole song and stop at 0:29.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const childProcess = require('node:child_process');
const { EventEmitter } = require('node:events');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'muriel-scfallback-'));
for (const key of ['HOME', 'USERPROFILE', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) process.env[key] = tmp;
process.env.MURIEL_DATA_DIR = path.join(tmp, 'data');
const fakeYtDlp = path.join(tmp, 'yt-dlp');
fs.writeFileSync(fakeYtDlp, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
process.env.MURIEL_YTDLP = fakeYtDlp;

// a cached 30-second preview from before (a sixth of a 199 s song) and a real song of the same length
const tracks = path.join(tmp, 'data', 'tracks');
fs.mkdirSync(tracks, { recursive: true });
fs.writeFileSync(path.join(tracks, 'preview00001.mp3'), Buffer.alloc(480000));
fs.writeFileSync(path.join(tracks, 'fullsong0001.mp3'), Buffer.alloc(3200000));
fs.writeFileSync(path.join(tmp, 'data', 'metadata.json'), JSON.stringify({
  preview00001: { title: "God's Plan", artist: 'Drake', duration: '199', platform: 'soundcloud', fileSize: 480000 },
  fullsong0001: { title: 'Other', artist: 'Someone', duration: '199', platform: 'soundcloud', fileSize: 3200000 },
}));

// fake yt-dlp: YouTube refuses everything; SoundCloud search finds a preview, a remix and the real song
const ytCalls = [];
childProcess.spawn = (bin, args) => {
  ytCalls.push(args);
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  p.kill = () => {};
  setImmediate(() => {
    const search = args.find((a) => /^scsearch\d+:/.test(a));
    const target = args[args.length - 1];
    if (search) {
      p.stdout.emit('data', JSON.stringify({ entries: [
        { id: '1', title: "God's Plan", uploader: 'Drake', duration: 30, webpage_url: 'https://soundcloud.com/drake/gods-plan' },
        { id: '2', title: "God's Plan (Remix)", uploader: 'dj', duration: 201, webpage_url: 'https://soundcloud.com/dj/gods-plan-remix' },
        { id: '3', title: "Drake - God's Plan (10 hour loop)", uploader: 'x', duration: 600, webpage_url: 'https://soundcloud.com/x/loop' },
        { id: '4', title: "God's Plan - Drake", uploader: 'fan', duration: 199, webpage_url: 'https://soundcloud.com/fan/gods-plan-drake' },
      ] }));
      return p.emit('close', 0);
    }
    if (args.includes('-g') && /soundcloud\.com/.test(target)) {
      p.stdout.emit('data', `https://cf-media.sndcdn.com/${target.split('/').pop()}.128.mp3\n`);
      return p.emit('close', 0);
    }
    p.stderr.emit('data', 'ERROR: Video unavailable');
    p.emit('close', 1);
  });
  return p;
};
// no internet: YouTube page searches fail at once
https.get = () => { const r = new EventEmitter(); r.destroy = () => {}; setImmediate(() => r.emit('error', new Error('offline'))); return r; };

const { startServer, stopServer, getServerToken } = require('../server');
let port;
before(async () => { port = await startServer(0); });
after(async () => { await stopServer(); fs.rmSync(tmp, { recursive: true, force: true }); });

const get = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p, headers: { 'x-muriel-token': getServerToken() } }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

test('previews cached as whole songs are dropped at start, real songs stay', () => {
  assert.equal(fs.existsSync(path.join(tracks, 'preview00001.mp3')), false);
  assert.equal(fs.existsSync(path.join(tracks, 'fullsong0001.mp3')), true);
  const meta = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'metadata.json'), 'utf8'));
  assert.deepEqual(Object.keys(meta), ['fullsong0001']);
});

test('the SoundCloud fallback skips previews, remixes and other lengths', async () => {
  const r = await get(`/api/stream-info?url=${encodeURIComponent('https://www.youtube.com/watch?v=xpVfcZ0ZcFM')}&id=xpVfcZ0ZcFM&platform=youtube&title=${encodeURIComponent("God's Plan")}&artist=Drake&duration=199`);
  const data = JSON.parse(r.body);
  assert.equal(data.success, true);
  assert.equal(data.streamUrl, 'https://cf-media.sndcdn.com/gods-plan-drake.128.mp3');
  // never the preview
  assert.ok(!ytCalls.some((a) => a.includes('https://soundcloud.com/drake/gods-plan')));
});

test('no full-length upload: the song fails instead of playing 30 seconds', async () => {
  const r = await get(`/api/stream-info?url=${encodeURIComponent('https://www.youtube.com/watch?v=aaaaaaaaaaa')}&id=aaaaaaaaaaa&platform=youtube&title=${encodeURIComponent("God's Plan")}&artist=Drake&duration=420`);
  assert.equal(r.status, 500);
  assert.equal(JSON.parse(r.body).success, false);
});
