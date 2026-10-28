const test = require('node:test');
const assert = require('node:assert');
const T = require('../track-trim');

test('a trim that keeps the whole song is no trim', () => {
  assert.strictEqual(T.normalizeTrim(0, 200, 200), null);
  assert.strictEqual(T.normalizeTrim(0.1, 199.9, 200), null);
  assert.deepStrictEqual(T.normalizeTrim(12.345, 98.76, 200), { start: 12.3, end: 98.8 });
  assert.deepStrictEqual(T.normalizeTrim(0, 60, 200), { start: 0, end: 60 });
});

test('a trim has to keep more than a second, inside the song', () => {
  assert.strictEqual(T.normalizeTrim(50, 50.5, 200), null);
  assert.strictEqual(T.normalizeTrim(80, 40, 200), null);
  assert.deepStrictEqual(T.normalizeTrim(150, 500, 200), { start: 150, end: 200 });
});

test('playback: before the kept part seeks to it, after it the song is over', () => {
  const trim = { start: 30, end: 90 };
  assert.strictEqual(T.trimAction(trim, 0), 'start');
  assert.strictEqual(T.trimAction(trim, 29.9), null); // close enough: no seek stutter
  assert.strictEqual(T.trimAction(trim, 45), null);
  assert.strictEqual(T.trimAction(trim, 90), 'end');
  assert.strictEqual(T.trimAction(null, 10), null);
  assert.strictEqual(T.trimAction({ start: 10, end: 11 }, 0), null); // too short to be real
  assert.strictEqual(T.trimAction({ start: 0, end: 60 }, 0), null);
});

test('times show tenths', () => {
  assert.strictEqual(T.formatPreciseTime(0), '0:00.0');
  assert.strictEqual(T.formatPreciseTime(65.37), '1:05.3');
  assert.strictEqual(T.formatPreciseTime(59.99), '0:59.9');
  assert.strictEqual(T.formatPreciseTime(-4), '0:00.0');
  assert.strictEqual(T.formatPreciseTime(NaN), '0:00.0');
});

test('waveform bars from samples: loudest slice is full height, silence keeps a floor', () => {
  const samples = new Float32Array(1000);
  for (let i = 500; i < 750; i++) samples[i] = i % 2 ? 0.5 : -0.25;
  const bars = T.wavePeaks(samples, 4);
  assert.deepStrictEqual(Array.from(bars), [0.12, 0.12, 1, 0.12]);
  assert.strictEqual(T.wavePeaks(new Float32Array(0), 3).length, 3);
});

test('the stand-in waveform is the same for the same song', () => {
  const a = T.placeholderPeaks('youtube:abc', 84);
  assert.strictEqual(a.length, 84);
  assert.deepStrictEqual(Array.from(a), Array.from(T.placeholderPeaks('youtube:abc', 84)));
  assert.notDeepStrictEqual(Array.from(a), Array.from(T.placeholderPeaks('youtube:xyz', 84)));
  assert.ok(Array.from(a).every(v => v >= 0.12 && v <= 0.96));
});

// #22: with Crossfade on, songs were cut off X seconds before their end (playNext() ran early)
test('crossfade fades the song out over its last seconds instead of ending it early', () => {
  assert.strictEqual(T.endFadeSeconds(100, 200, 6, 1), 0);
  assert.strictEqual(T.endFadeSeconds(193.9, 200, 6, 1), 0);
  assert.strictEqual(T.endFadeSeconds(194, 200, 6, 1), 6);
  assert.strictEqual(T.endFadeSeconds(197, 200, 6, 2), 1.5);
  assert.strictEqual(T.endFadeSeconds(200, 200, 6, 1), 0);
  assert.strictEqual(T.endFadeSeconds(195, 200, 0, 1), 0); // off (the default)
  assert.strictEqual(T.endFadeSeconds(8, 10, 6, 1), 0); // too short to fade
});

test('the timeupdate handler never starts the next song itself', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const start = src.indexOf("el.nativeAudio.addEventListener('timeupdate'");
  const body = src.slice(start, src.indexOf('let isDraggingScrubber', start));
  assert.ok(start > 0 && body.includes('endFadeSeconds'));
  assert.ok(!/playNext\(/.test(body), 'only the ended handler (or a trim end) may advance');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), /id="slider-crossfade"[^>]*value="0"/);
});
