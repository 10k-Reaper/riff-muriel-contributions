// iOS layout behaviour on top of app.js: mini player <-> now-playing sheet, swipe to dismiss,
// and the progress line on the mini player.

// Background playback: iOS suspends Web Audio when the app is backgrounded or the screen locks,
// but keeps a plain <audio> element playing (and on the lock screen). So on iPhone the engine never
// routes the element through an AudioContext. Speed/pitch still work (they're element properties);
// EQ, reverb, distortion and the visualizer need the graph and are off. app.js builds the engine on
// DOMContentLoaded, which hasn't fired yet when this script runs.
(() => {
  const Engine = window.MurielAudioEngine;
  if (!Engine) return;
  Engine.prototype.init = function (audioElement) { this.__element = audioElement || this.__element; };
  // iOS ignores element.volume (hardware buttons own it); mute still works
  Engine.prototype._applyMasterVolume = function () {
    if (this.__element) this.__element.muted = !!this.isMuted || this.volume === 0;
  };
})();

(() => {
  const panel = document.getElementById('right-panel');
  const playbar = document.getElementById('playbar');
  const lyricsBtn = document.getElementById('btn-toggle-lyrics-panel');
  const audio = document.querySelector('audio');
  if (!panel || !playbar || !lyricsBtn) return;

  // app.js owns the drawer state; mirror it onto <body> so the player bar can restyle itself
  const sync = () => document.body.classList.toggle('np-open', !panel.classList.contains('hidden'));
  new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ['class'] });
  sync();

  const openSheet = () => { if (panel.classList.contains('hidden')) lyricsBtn.click(); };
  const closeSheet = () => { if (!panel.classList.contains('hidden')) document.getElementById('btn-close-right-panel').click(); };

  // tapping the mini player (but not its buttons) opens the sheet
  playbar.addEventListener('click', (e) => {
    if (document.body.classList.contains('np-open')) return;
    if (e.target.closest('button, input, .scrubber-track-container')) return;
    openSheet();
  });

  // swipe down on the sheet's top area to close it
  let startY = null;
  panel.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const lyrics = document.getElementById('lyrics-container');
    startY = (lyrics && lyrics.contains(e.target) && lyrics.scrollTop > 0) ? null : t.clientY;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    panel.style.transform = '';
    startY = null;
    if (dy > 110) closeSheet();
  });

  // mini player progress line
  if (audio) {
    const tick = () => {
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      playbar.style.setProperty('--mini-progress', String(Math.max(0, Math.min(1, p))));
    };
    audio.addEventListener('timeupdate', tick);
    audio.addEventListener('emptied', tick);
  }

  // settings that only make sense on desktop
  ['btn-hw-accel', 'btn-tray-on-close', 'btn-media-keys'].forEach((id) => {
    const row = document.getElementById(id) && document.getElementById(id).closest('.setting-item');
    if (row) row.style.display = 'none';
  });
})();
