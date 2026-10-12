// Runs Muriel's own server.js inside the iOS app and makes app.js think it is talking to the
// desktop backend on 127.0.0.1. Loaded before app.js.
const { Capacitor } = require('@capacitor/core');
const store = require('./shims/store');
const http = require('./shims/http');
const fs = require('./shims/fs');
const electronAPI = require('./electron-api');

const PORT = 38472;
const BASE = `http://127.0.0.1:${PORT}/`;
const MIME = { '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.opus': 'audio/ogg', '.webm': 'audio/webm', '.flac': 'audio/flac', '.wav': 'audio/wav', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const mimeOf = (p) => MIME[(p.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase()];

// ---- outbound HTTP without CORS ----
// In the app, CapacitorHttp has already replaced window.fetch with native networking.
// In a desktop browser (dev harness) requests go through the dev server's /__proxy.
const pageFetch = window.fetch.bind(window);
async function toPlain(input, init = {}) {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const body = ['GET', 'HEAD'].includes(input.method) ? undefined : await input.clone().text();
    return [input.url, { method: input.method, headers: Object.fromEntries(input.headers.entries()), body, signal: init.signal || input.signal }];
  }
  const headers = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : { ...(init.headers || {}) };
  return [String(input), { ...init, headers }];
}
globalThis.__murielFetch = async (input, init) => {
  const [url, opts] = await toPlain(input, init);
  if (Capacitor.isNativePlatform()) return pageFetch(url, opts);
  const { headers, ...rest } = opts;
  return pageFetch(`/__proxy?url=${encodeURIComponent(url)}`, { ...rest, headers: { 'x-fwd-headers': JSON.stringify(headers || {}) } });
};

// ---- the in-app "server" ----
let ready;
async function start() {
  await fs.init();
  require('../server.js').startServer(PORT);
}

function call(url, init = {}) {
  return ready.then(() => http.dispatch({
    url: url.slice(BASE.length - 1),
    method: init.method || 'GET',
    headers: init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : (init.headers || {}),
    body: typeof init.body === 'string' ? init.body : '',
  }));
}

const fileUrls = new Map();
async function fileUrlFor(vpath) {
  if (!fileUrls.has(vpath)) {
    await fs._flush(); // a just-written file must reach disk before the WebView reads it
    fileUrls.set(vpath, store.fileUrl(vpath, mimeOf(vpath)));
  }
  return fileUrls.get(vpath);
}

// Turns an app.js URL like http://127.0.0.1:38472/api/local-track?id=x into something the WebView can load.
async function resolveLocalUrl(u) {
  const r = await call(u);
  if (r.file) return fileUrlFor(r.file);
  throw new Error(`no file behind ${u} (${r.status})`);
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input && input.url;
  if (!url || !url.startsWith(BASE)) return pageFetch(input, init);
  const r = await call(url, init);
  if (r.file) return pageFetch(await fileUrlFor(r.file));
  return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers });
};

// <audio src> and <img src> pointing at the local server get swapped for real file URLs.
function patchSrc(proto) {
  const desc = Object.getOwnPropertyDescriptor(proto, 'src');
  Object.defineProperty(proto, 'src', {
    configurable: true,
    get() { return this.__murielSrc !== undefined ? this.__murielSrc : desc.get.call(this); },
    set(v) {
      v = String(v);
      if (!v.startsWith(BASE)) { this.__murielSrc = undefined; this.__murielPending = null; desc.set.call(this, v); return; }
      this.__murielSrc = v;
      this.__murielPending = resolveLocalUrl(v)
        .then((real) => { if (this.__murielSrc === v) desc.set.call(this, real); })
        .catch((e) => { console.warn('[muriel]', e.message); if (this.__murielSrc === v) this.dispatchEvent(new Event('error')); });
    },
  });
}
patchSrc(HTMLMediaElement.prototype);
patchSrc(HTMLImageElement.prototype);

const realPlay = HTMLMediaElement.prototype.play;
HTMLMediaElement.prototype.play = function () {
  return this.__murielPending ? this.__murielPending.then(() => realPlay.call(this)) : realPlay.call(this);
};

// <img src="..."> written as HTML strings never hit the setter above.
new MutationObserver((muts) => {
  for (const m of muts) {
    const nodes = m.type === 'attributes' ? [m.target] : [...m.addedNodes].flatMap((n) => (n.querySelectorAll ? [n, ...n.querySelectorAll('img')] : []));
    for (const n of nodes) {
      if (n.tagName === 'IMG' && n.__murielSrc === undefined) {
        const raw = n.getAttribute('src') || '';
        if (raw.startsWith(BASE)) n.src = raw;
      }
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

ready = start();
window.electronAPI = electronAPI({ ready, port: PORT, fs, fileUrlFor });
document.documentElement.classList.add('is-mobile');
