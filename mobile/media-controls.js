// Android "now playing" controls: the notification, lock screen, quick-settings media player and headset
// buttons. Android's WebView doesn't turn navigator.mediaSession into system controls the way iOS does,
// so the song and play state go to a native media session (android/.../MediaControlsPlugin.java) and its
// buttons come back here.
const { Capacitor, registerPlugin } = require('@capacitor/core');

module.exports = function mediaControls() {
  if (Capacitor.getPlatform() !== 'android') return;
  const plugin = registerPlugin('MurielMedia');
  const core = () => window.MurielCore;
  let pending = 0;

  function send() {
    pending = 0;
    const c = core();
    const t = c && c.state.currentTrack;
    const a = c && c.audio;
    if (!t || !a) return;
    let art = '';
    try { art = (c.thumb && c.thumb(t)) || t.thumbnail || ''; } catch (e) { art = t.thumbnail || ''; }
    const duration = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(t.duration) || 0;
    plugin.update({
      title: t.title || '',
      artist: t.artist || '',
      album: t.album || '',
      artwork: /^https:\/\//.test(art) ? art : '',
      duration,
      position: Math.min(a.currentTime || 0, duration || Infinity),
      playing: !!c.state.isPlaying,
      rate: a.playbackRate || 1,
    }).catch(() => {});
  }
  // several events arrive together on a song change; send once
  const update = () => { if (!pending) pending = setTimeout(send, 80); };

  function hook() {
    const c = core();
    if (!c || !c.audio) return;
    window.addEventListener('muriel:track', update);
    ['playing', 'pause', 'seeked', 'ratechange', 'durationchange', 'ended'].forEach((ev) => c.audio.addEventListener(ev, update));
    plugin.addListener('action', ({ action, position } = {}) => {
      const st = core().state;
      if (action === 'play') { if (!st.isPlaying) core().togglePlay(); }
      else if (action === 'pause') { if (st.isPlaying) core().togglePlay(); }
      else if (action === 'next') core().next();
      else if (action === 'prev') core().prev();
      else if (action === 'seek' && Number.isFinite(position)) { core().seek(position); update(); }
    });
  }
  if (window.MurielCore) hook(); else window.addEventListener('muriel:ready', hook, { once: true });
};
