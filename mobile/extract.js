// In-app replacement for the parts of yt-dlp Muriel uses: YouTube/YouTube Music search,
// SoundCloud search, and resolving a track page to a direct audio URL.
// All network calls go through globalThis.__murielFetch (native HTTP in the app, dev proxy in a browser).
const { Innertube, Platform, Constants } = require('youtubei.js/web');

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// youtubei.js needs a JS evaluator for signature deciphering (only used when a client returns ciphered URLs)
Platform.shim.eval = async (data, env) => {
  const props = [];
  if (env.n) props.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
  if (env.sig) props.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
  return new Function(`${data.output}\nreturn { ${props.join(', ')} }`)();
};

let ytPromise = null;
function yt() {
  if (!ytPromise) {
    ytPromise = Innertube.create({ generate_session_locally: true, fetch: (...a) => globalThis.__murielFetch(...a) })
      .catch((e) => { ytPromise = null; throw e; });
  }
  return ytPromise;
}

const ytId = (u) => {
  const m = String(u).match(/(?:v=|youtu\.be\/|\/shorts\/|^)([\w-]{11})(?:[&?#]|$)/);
  return m ? m[1] : null;
};
const thumbs = (arr) => (arr || []).map((t) => ({ url: t.url, width: t.width, height: t.height })).sort((a, b) => (a.width || 0) - (b.width || 0));
const text = (t) => (t == null ? '' : typeof t === 'string' ? t : t.text || t.toString());

async function youtubeSearch(query, limit) {
  const r = await (await yt()).search(query, { type: 'video' });
  return (r.videos || []).filter((v) => v.id).slice(0, limit).map((v) => ({
    id: v.id,
    title: text(v.title),
    uploader: text(v.author && v.author.name),
    channel: text(v.author && v.author.name),
    duration: (v.duration && v.duration.seconds) || 0,
    thumbnails: thumbs(v.thumbnails),
    webpage_url: `https://www.youtube.com/watch?v=${v.id}`,
  }));
}

async function ytMusicSearch(query, limit) {
  const r = await (await yt()).music.search(query, { type: 'song' });
  const items = (r.contents || []).flatMap((c) => c.contents || []).filter((x) => x.id);
  return items.slice(0, limit).map((s) => ({
    id: s.id,
    title: text(s.title || s.name),
    artists: (s.artists || []).map((a) => a.name).filter(Boolean),
    duration: (s.duration && s.duration.seconds) || 0,
    thumbnails: thumbs(s.thumbnails || (s.thumbnail && s.thumbnail.contents)),
    webpage_url: `https://www.youtube.com/watch?v=${s.id}`,
  }));
}

// iPhones play AAC natively, so prefer the m4a stream (itag 140) from the iOS client.
async function youtubeAudio(id) {
  const y = await yt();
  let lastErr = null;
  for (const client of ['IOS', 'MWEB', 'TV']) {
    try {
      const info = await y.getBasicInfo(id, { client });
      const formats = (info.streaming_data && info.streaming_data.adaptive_formats || []).filter((f) => f.has_audio && !f.has_video);
      const pick = formats.filter((f) => /mp4/.test(f.mime_type)).sort((a, b) => b.bitrate - a.bitrate)[0] || formats.sort((a, b) => b.bitrate - a.bitrate)[0];
      if (!pick) throw new Error('no audio format');
      const url = pick.url || await pick.decipher(y.session.player);
      // googlevideo ties the URL to the client that asked for it; download with the same User-Agent
      const ua = (Constants.CLIENTS[client] && Constants.CLIENTS[client].USER_AGENT) || 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
      return { url, headers: { 'User-Agent': ua }, ext: /mp4/.test(pick.mime_type) ? 'm4a' : 'webm', artist: text(info.basic_info.author).replace(/\s*-\s*Topic$/i, ''), title: info.basic_info.title, duration: info.basic_info.duration };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('could not extract audio stream');
}

// ---- SoundCloud (public api-v2 with the web client's client_id) ----
let scClientId = null;
async function scId(force) {
  if (scClientId && !force) return scClientId;
  const html = await (await globalThis.__murielFetch('https://soundcloud.com/', { headers: { 'User-Agent': DESKTOP_UA } })).text();
  const scripts = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]).reverse();
  for (const s of scripts) {
    const m = (await (await globalThis.__murielFetch(s)).text()).match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{20,})"/);
    if (m) return (scClientId = m[1]);
  }
  throw new Error('SoundCloud client id not found');
}

async function scApi(path) {
  for (const force of [false, true]) {
    const id = await scId(force);
    const r = await globalThis.__murielFetch(`https://api-v2.soundcloud.com${path}${path.includes('?') ? '&' : '?'}client_id=${id}`, { headers: { 'User-Agent': DESKTOP_UA } });
    if (r.status === 401 || r.status === 403) continue; // client_id rotated
    if (!r.ok) throw new Error(`SoundCloud ${r.status}`);
    return r.json();
  }
  throw new Error('SoundCloud refused the request');
}

const scEntry = (t) => ({
  id: String(t.id),
  title: t.title,
  uploader: t.user && t.user.username,
  duration: Math.round((t.full_duration || t.duration || 0) / 1000),
  thumbnails: t.artwork_url ? [{ url: t.artwork_url.replace('-large.', '-t500x500.') }] : [],
  webpage_url: t.permalink_url,
});

async function soundcloudSearch(query, limit) {
  const r = await scApi(`/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}`);
  return (r.collection || []).filter((t) => t.kind === 'track').map(scEntry);
}

async function soundcloudAudio(pageUrl) {
  const t = await scApi(`/resolve?url=${encodeURIComponent(pageUrl)}`);
  const list = (t.media && t.media.transcodings) || [];
  const tc = list.find((x) => x.format.protocol === 'progressive') || list[0];
  if (!tc) throw new Error('no SoundCloud stream');
  const auth = t.track_authorization ? `?track_authorization=${t.track_authorization}` : '';
  const { url } = await scApi(tc.url.replace('https://api-v2.soundcloud.com', '') + auth);
  return { url, ext: tc.format.protocol === 'progressive' ? 'mp3' : 'm3u8', artist: t.user && t.user.username, title: t.title, duration: Math.round(t.duration / 1000) };
}

// Resolve anything yt-dlp would accept as a target: a URL, ytsearch1:, scsearch1:.
async function resolveAudio(target) {
  const s = String(target);
  let m = s.match(/^(yt|sc)search\d*:(.*)$/);
  if (m) {
    const hit = (m[1] === 'sc' ? await soundcloudSearch(m[2], 1) : await youtubeSearch(m[2], 1))[0];
    if (!hit) throw new Error('no search results');
    return resolveAudio(hit.webpage_url);
  }
  if (/soundcloud\.com/.test(s)) return soundcloudAudio(s);
  const id = ytId(s);
  if (id) return youtubeAudio(id);
  throw new Error(`unsupported target ${s}`);
}

module.exports = { youtubeSearch, ytMusicSearch, soundcloudSearch, resolveAudio };
