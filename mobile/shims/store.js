// Persistent storage behind the fs shim. Virtual paths under /data map to Capacitor Filesystem paths under
// Muriel/ (IndexedDB in a browser): in Documents on iOS, visible in the Files app; in the app's private storage
// on Android, except the songs people download, which go to Music/Muriel (see "Android: downloads" below).
const path = require('path');
const { Filesystem, Directory, Encoding } = require('@capacitor/filesystem');
const { Capacitor } = require('@capacitor/core');

const ROOT = 'Muriel';
const ANDROID = Capacitor.getPlatform() === 'android';
// iOS: Documents (shown in the Files app). Android: app-private storage; public Documents needs permissions.
const DIR = ANDROID ? Directory.Data : Directory.Documents;

const toReal = (vpath) => ROOT + vpath.replace(/^\/data/, '');
const toVirtual = (rpath) => '/data' + rpath.slice(ROOT.length);
const priv = (vpath) => ({ path: toReal(vpath), directory: DIR });

// ---- Android: downloads ----
// Songs saved with Download (/data/Downloads) go to Music/Muriel on the phone's shared storage (Documents/Muriel
// if Music can't be used), where file managers and music apps find them. The song cache and the rest stay private.
// Android 11+ lets an app save files there without asking. Android 10 and older need the storage permission
// (AndroidManifest.xml); it's asked for when the first song is saved, and without it downloads stay private.
const DOWNLOADS = '/data/Downloads';
const PUBLIC = Directory.ExternalStorage;
const PUBLIC_ROOTS = ['Music/Muriel', 'Documents/Muriel'];
let pub = null; // the public folder in use, e.g. 'Music/Muriel'
let mayAsk = false; // Android 10 and older: storage permission not given, but may be
let asked = false;
// where each download really is: found at launch, or saved this session (a download from before: private)
const placed = new Map(); // vpath -> { path, directory }
const leftovers = []; // private copies of songs that are in the public folder already
const inUse = new Set(); // downloads whose file URL the app holds (bridge.js keeps it): those move next launch

const isDownload = (vpath) => ANDROID && vpath.startsWith(DOWNLOADS + '/');
// Android files .webm as video, and Music/ only takes audio: a WebM song (Opus) is saved as .mka there, which
// it is too (WebM is a kind of Matroska), so music apps list it. Inside the app it keeps its .webm name.
const pubLoc = (vpath) => ({ path: pub + vpath.slice(DOWNLOADS.length).replace(/\.webm$/i, '.mka'), directory: PUBLIC });
const fromPub = (rpath) => DOWNLOADS + rpath.slice(pub.length).replace(/\.mka$/i, '.webm');

// where a file is (everything outside Downloads: in the app's own storage)
function where(vpath) {
  if (!ANDROID) return priv(vpath);
  if (vpath === DOWNLOADS) return pub ? { path: pub, directory: PUBLIC } : priv(vpath);
  if (!isDownload(vpath)) return priv(vpath);
  return placed.get(vpath) || (pub ? pubLoc(vpath) : priv(vpath));
}

// where a file being saved goes. On Android 10 and older the first download asks for the permission, without
// waiting for the answer: with Muriel in the background the question waits for its return, and the music (which
// waits for files to be saved) would too. Songs saved meanwhile stay private and move once it's given.
function saveTo(vpath) {
  if (isDownload(vpath) && !pub && mayAsk && !asked) {
    asked = true;
    Filesystem.requestPermissions()
      .then((r) => (r.publicStorage === 'granted' ? openPublic() : null))
      .catch(() => {})
      .then(() => { mayAsk = false; });
  }
  return where(vpath);
}

function saved(vpath, loc) {
  if (!isDownload(vpath)) return;
  placed.set(vpath, loc);
  scan(loc);
}

// Android 10 and older only index new files at their next full scan: tell the media index now, so the song shows
// up in music apps right away (Android 11+ does that by itself; MediaControlsPlugin.java)
function scan(loc) {
  const media = Capacitor.Plugins && Capacitor.Plugins.MurielMedia; // registered by media-controls.js
  if (loc.directory !== PUBLIC || !media) return;
  Filesystem.getUri(loc).then(({ uri }) => media.scanFile({ path: uri })).catch(() => {});
}

async function openPublic() {
  for (const root of PUBLIC_ROOTS) {
    try { await Filesystem.mkdir({ path: root, directory: PUBLIC, recursive: true }); } catch (e) {} // there already
    try { if ((await Filesystem.stat({ path: root, directory: PUBLIC })).type !== 'directory') continue; } catch (e) { continue; }
    pub = root;
    setTimeout(moveOldDownloads, 10000); // once the app has started
    return;
  }
}

// Songs downloaded before this went to the app's private storage, where nobody could find them: they move to the
// public folder, one at a time in the background
async function moveOldDownloads() {
  for (const old of leftovers.splice(0)) await Filesystem.deleteFile(old).catch(() => {});
  for (const [vpath, from] of [...placed]) {
    if (from.directory !== DIR || path.dirname(vpath) !== DOWNLOADS || inUse.has(vpath)) continue;
    const to = pubLoc(vpath);
    try {
      await Filesystem.copy({ from: from.path, directory: from.directory, to: to.path, toDirectory: to.directory });
    } catch (e) { continue; } // a type Android won't keep in Music/, say: it stays where it is
    saved(vpath, to);
    await Filesystem.deleteFile(from).catch(() => {});
  }
}

async function listDownloads(out) {
  for (const e of out) if (!e.isDir && isDownload(e.vpath)) placed.set(e.vpath, priv(e.vpath));
  let perm = null;
  try { perm = (await Filesystem.checkPermissions()).publicStorage; } catch (e) {}
  if (perm === 'granted') await openPublic();
  else mayAsk = perm === 'prompt' || perm === 'prompt-with-rationale';
  if (!pub) return;
  const found = [];
  await walk(pub, PUBLIC, fromPub, found);
  for (const e of found) {
    if (e.isDir) continue;
    const old = placed.get(e.vpath);
    if (old && old.directory === DIR) leftovers.push(old); // copied over before, but not deleted
    placed.set(e.vpath, { path: e.rpath, directory: PUBLIC });
  }
  out.push({ vpath: DOWNLOADS, isDir: true, size: 0, mtimeMs: Date.now() }, ...found);
}

function b64FromBytes(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}

// Files reach the native side as base64 text. A FLAC (30-150 MB) used to go over as one string, held several
// times over on both sides of the bridge, and that crashed the app. Now they go in pieces this big
// (a multiple of 3, so the base64 of the pieces joins up into the base64 of the whole file).
const PIECE = 3 * 256 * 1024;

async function writeInPieces(vpath, size, piece) {
  const loc = saveTo(vpath);
  let at = 0;
  try {
    do {
      const data = b64FromBytes(await piece(at, Math.min(size, at + PIECE)));
      if (at === 0) await Filesystem.writeFile({ ...loc, data, recursive: true });
      else await Filesystem.appendFile({ ...loc, data });
      at += PIECE;
    } while (at < size);
  } catch (e) {
    // no half-written file left behind (it would look like the whole song)
    try { await Filesystem.deleteFile(loc); } catch (x) {}
    throw e;
  }
  saved(vpath, loc);
}

async function walk(rpath, directory, toV, out) {
  let res;
  try { res = await Filesystem.readdir({ path: rpath, directory }); } catch (e) { return; }
  for (const f of res.files) {
    const child = `${rpath}/${f.name}`;
    const isDir = f.type === 'directory';
    out.push({ vpath: toV(child), rpath: child, isDir, size: f.size || 0, mtimeMs: Number(f.mtime) || Date.now() });
    if (isDir) await walk(child, directory, toV, out);
  }
}

module.exports = {
  isNative: () => Capacitor.isNativePlatform(),

  async list() {
    try { await Filesystem.mkdir({ path: ROOT, directory: DIR, recursive: true }); } catch (e) {}
    const out = [];
    await walk(ROOT, DIR, toVirtual, out);
    if (ANDROID) await listDownloads(out);
    return out;
  },

  // the folder downloads go to, as people see it on their phone (null: inside the app, where only it sees them)
  downloadsFolder: () => pub || (mayAsk ? PUBLIC_ROOTS[0] : null),

  async readText(vpath) {
    const r = await Filesystem.readFile({ ...where(vpath), encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  },

  async writeText(vpath, text) {
    const loc = saveTo(vpath);
    await Filesystem.writeFile({ ...loc, data: text, encoding: Encoding.UTF8, recursive: true });
    saved(vpath, loc);
  },

  writeBytes: (vpath, bytes) => writeInPieces(vpath, bytes.length, async (from, to) => bytes.subarray(from, to)),

  // a picked File: only one piece of it is ever read into memory
  writeBlob: (vpath, blob) => writeInPieces(vpath, blob.size, async (from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer())),

  async remove(vpath, isDir) {
    const loc = where(vpath);
    if (isDir) await Filesystem.rmdir({ ...loc, recursive: true });
    else await Filesystem.deleteFile(loc);
    for (const k of [...placed.keys()]) if (k === vpath || k.startsWith(vpath + '/')) placed.delete(k);
    scan(loc);
  },

  async mkdir(vpath) {
    try { await Filesystem.mkdir({ ...where(vpath), recursive: true }); } catch (e) {}
  },

  async rename(from, to) {
    const a = where(from);
    const b = saveTo(to);
    await Filesystem.rename({ from: a.path, directory: a.directory, to: b.path, toDirectory: b.directory });
    placed.delete(from);
    scan(a);
    saved(to, b);
  },

  async copy(from, to) {
    const a = where(from);
    const copyTo = async (b) => {
      // a download's folder may not be there yet (which one it is can change while the app runs)
      if (isDownload(to)) await Filesystem.mkdir({ path: path.dirname(b.path), directory: b.directory, recursive: true }).catch(() => {});
      await Filesystem.copy({ from: a.path, directory: a.directory, to: b.path, toDirectory: b.directory });
      saved(to, b);
    };
    const b = saveTo(to);
    try {
      await copyTo(b);
    } catch (e) {
      if (b.directory !== PUBLIC) throw e;
      // the public folder refused it (Android 11+ won't let the app replace a song a former install of it saved
      // there, for one): kept in the app's storage, as before
      await copyTo(priv(to));
    }
  },

  // Streams a remote file straight to disk natively; returns the byte size.
  async download(url, vpath, headers = {}) {
    const loc = saveTo(vpath);
    if (!Capacitor.isNativePlatform()) {
      // browser harness: downloadFile would hit CORS, so go through the dev proxy
      const r = await globalThis.__murielFetch(url, { headers });
      if (!r.ok) throw new Error(`download failed: ${r.status}`);
      const bytes = new Uint8Array(await r.arrayBuffer());
      await Filesystem.writeFile({ ...loc, data: b64FromBytes(bytes), recursive: true });
      return bytes.length;
    }
    await Filesystem.downloadFile({ url, ...loc, recursive: true, headers });
    const st = await Filesystem.stat(loc);
    saved(vpath, loc);
    return st.size || 0;
  },

  // A URL the WebView can load directly (same origin, so Web Audio can process it).
  async fileUrl(vpath, mime) {
    const loc = where(vpath);
    if (isDownload(vpath)) inUse.add(vpath);
    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.getUri(loc);
      return Capacitor.convertFileSrc(uri);
    }
    const r = await Filesystem.readFile(loc);
    const blob = r.data instanceof Blob ? r.data : await (await fetch(`data:${mime || 'application/octet-stream'};base64,${r.data}`)).blob();
    return URL.createObjectURL(blob);
  },
};
