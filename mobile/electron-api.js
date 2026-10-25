// window.electronAPI for the iOS build. Desktop-only features (window controls, tray, mini player,
// data folders, hardware acceleration) become no-ops; file pickers use the iOS document picker.
const crypto = require('./shims/crypto');
const { Share } = require('@capacitor/share');

function pickFiles(accept, multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = !!multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [, 'bin'])[1].toLowerCase();
const noop = () => {};

module.exports = function electronAPI({ ready, port, fs, fileUrlFor }) {
  const visibilityListeners = [];
  document.addEventListener('visibilitychange', () => visibilityListeners.forEach((cb) => cb(!document.hidden)));

  return {
    isWindows: false,
    isMobile: true,
    minimizeWindow: noop, maximizeWindow: noop, closeWindow: noop,
    getServerPort: () => ready.then(() => port),
    getGpuCompositing: async () => 'enabled',
    onWindowVisibility: (cb) => visibilityListeners.push(cb),
    setZoomFactor: noop,
    getZoomFactor: () => 1,

    // Background image/GIF/video: copied into app storage so it survives the picker's temp file.
    async pickMedia() {
      const [file] = await pickFiles('image/*,video/mp4,video/webm,.gif', false);
      if (!file) return null;
      await ready;
      const vpath = `/data/backgrounds/bg_${Date.now()}.${extOf(file.name)}`;
      await fs._writeBlob(vpath, file);
      if (!fs.existsSync(vpath)) return null;
      // the absolute file URL changes when iOS moves the app container (every reinstall); mobile-ui.js
      // rebuilds saved ones on launch from the file name
      return fileUrlFor(vpath);
    },
    // deletes picked files that no saved setting points to any more (called by mobile-ui.js after the repair)
    async pruneMedia(keep) {
      await ready;
      let names = [];
      try { names = fs.readdirSync('/data/backgrounds'); } catch (e) { return; }
      for (const n of names) {
        if (keep.has(n)) continue;
        const pickedAt = Number((n.match(/^bg_(\d+)/) || [])[1]);
        if (!pickedAt || Date.now() - pickedAt < 3600e3) continue; // not ours, or picked just now and not saved yet
        try { fs.unlinkSync(`/data/backgrounds/${n}`); } catch (e) {}
      }
    },

    // Same contract as main.js: copy into the library folder as local_<sha1>.<ext>.
    async importAudioFiles() {
      const files = await pickFiles('audio/*,.mp3,.m4a,.flac,.wav,.aac,.ogg,.opus', true);
      await ready;
      // lossless files take a while to copy; say so, or the app looks stuck
      const total = files.reduce((n, f) => n + f.size, 0);
      if (total > 20e6 && window.MurielCore) window.MurielCore.toast(`Adding ${files.length} song${files.length === 1 ? '' : 's'}…`, 'info');
      const out = [];
      for (const f of files) {
        const ext = extOf(f.name);
        const id = 'local_' + crypto._sha1(f.name + f.size).slice(0, 12);
        const file = `${id}.${ext}`;
        const target = `/data/library/${file}`;
        // one at a time, each in pieces (fs._writeBlob); a copy cut short (app closed mid-import) is redone
        if (!fs.existsSync(target) || fs.statSync(target).size !== f.size) await fs._writeBlob(target, f);
        if (!fs.existsSync(target)) continue; // couldn't be saved (storage full): the app has said so
        out.push({ id, file, ext, name: f.name.replace(/\.[^.]+$/, '') });
      }
      await fs._flush();
      return out;
    },

    async getCacheSize() {
      await ready;
      let audio = 0;
      try { for (const n of fs.readdirSync('/data/tracks')) audio += fs.statSync(`/data/tracks/${n}`).size; } catch (e) {}
      return { audio, web: 0, total: audio };
    },
    // like desktop: delete the cached songs and thumbnails (via the in-app server), then wait for the disk.
    // It used to only report success, so the cache never shrank.
    clearCache: async () => {
      await ready;
      try { await fetch('http://127.0.0.1:38472/api/clear-offline-library', { method: 'POST' }); } catch (e) {}
      await fs._flush();
      return true;
    },
    getDataDir: async () => ({ dir: 'On this iPhone (Files → Muriel)', defaultDir: '/data', isCustom: false }),
    pickDataDir: async () => null,
    setDataDir: async () => ({ success: false, error: 'The music folder is fixed on iPhone' }),
    getDownloadDir: async () => ({ dir: 'Files → Muriel → Downloads', isCustom: false }),
    pickDownloadDir: async () => null,
    setDownloadDir: async () => ({ success: false }),
    resetDownloadDir: async () => ({ success: true }),
    restartApp: () => location.reload(),
    getAppVersion: async () => { const b = window.MURIEL_BUILD || {}; return b.version ? `${b.version}${b.run ? ` (build ${b.run})` : ''}` : '1.1.2'; },
    getHwAccel: async () => true,
    setHwAccel: noop,
    trimMemory: noop,
    setTrayOnClose: noop,
    toggleMiniWindow: async () => false,
    setMediaKeys: noop,
    mediaKeysActive: noop,
    onMediaCommand: noop, // lock-screen controls come from navigator.mediaSession in app.js
    welcomeFinish: noop,
    onWelcomeResult: noop,
    getLauncherInfo: async () => ({ platform: 'ios', canInstall: false, installed: true }),
    fileUrl: async (vpath) => { await ready; return fs.existsSync(vpath) ? fileUrlFor(vpath) : null; },
    // native share sheet (WhatsApp, Mail, …); falls back to the clipboard
    async shareText(title, text) {
      try { await Share.share({ title, text, dialogTitle: title }); return 'shared'; } catch (e) {
        if (e && /cancel/i.test(String(e.message || e))) return 'cancelled';
        try { await navigator.clipboard.writeText(text); return 'copied'; } catch (x) { return 'failed'; }
      }
    },
  };
};
