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
