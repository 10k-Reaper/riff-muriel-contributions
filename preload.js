const { contextBridge, ipcRenderer, webFrame } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  serverToken: (() => {
    const arg = process.argv.find((a) => a.startsWith('--muriel-token='));
    return arg ? arg.slice('--muriel-token='.length) : '';
  })(),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getGpuCompositing: () => ipcRenderer.invoke('get-gpu-compositing'),
  pickMedia: () => ipcRenderer.invoke('pick-media'),
  importAudioFiles: () => ipcRenderer.invoke('import-audio-files'),
  onWindowVisibility: (callback) => {
    ipcRenderer.on('window-visibility', (event, visible) => callback(visible));
  },
  setZoomFactor: (factor) => {
    try {
      webFrame.setZoomFactor(factor);
    } catch (e) {}
  },
  getZoomFactor: () => {
    try {
      return webFrame.getZoomFactor();
    } catch (e) {
      return 1.0;
    }
  },

  getCacheSize: () => ipcRenderer.invoke('get-cache-size'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  pickDataDir: () => ipcRenderer.invoke('pick-data-dir'),
  setDataDir: (dir, move) => ipcRenderer.invoke('set-data-dir', { dir, move }),
  getDownloadDir: () => ipcRenderer.invoke('get-download-dir'),
  pickDownloadDir: () => ipcRenderer.invoke('pick-download-dir'),
  setDownloadDir: (dir) => ipcRenderer.invoke('set-download-dir', { dir }),
  resetDownloadDir: () => ipcRenderer.invoke('set-download-dir', { reset: true }),
  restartApp: () => ipcRenderer.send('restart-app'),
  setTrayOnClose: (enabled) => ipcRenderer.send('set-tray-on-close', enabled),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getHwAccel: () => ipcRenderer.invoke('get-hw-accel'),
  setHwAccel: (v) => ipcRenderer.send('set-hw-accel', v),
  trimMemory: () => { try { webFrame.clearCache(); } catch (e) {} },
  onMediaCommand: (cb) => ipcRenderer.on('media-command', (e, cmd) => cb(cmd)),
  toggleMiniWindow: () => ipcRenderer.invoke('toggle-mini-window'),
  isWindows: process.platform === 'win32',
  setMediaKeys: (v) => ipcRenderer.send('set-media-keys', v),
  mediaKeysActive: () => ipcRenderer.send('media-keys-active'),
  welcomeFinish: (detail) => ipcRenderer.send('welcome-finish', detail),
  onWelcomeResult: (cb) => ipcRenderer.on('welcome-result', (e, d) => cb(d)),
  getLauncherInfo: () => ipcRenderer.invoke('launcher-info'),
  openExternal: (u) => ipcRenderer.send('open-external', u),
});
