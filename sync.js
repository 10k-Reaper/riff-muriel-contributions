// Muriel sync (early access for GitHub sponsors): link your devices with a code or a QR code, and playlists,
// favorites, history, Encore stats, the look of the app and what you're listening to stay the same on all of
// them. There is no Muriel server and no account: every device keeps its own data, and linked devices talk to
// each other directly (WebRTC, encrypted) whenever they're open at the same time. A public PeerJS server only
// introduces them to each other; it never sees the data. Merging (who wins when both changed) is in sync-core.js.
(() => {
  const Core = window.MurielSyncCore;
  if (!Core || !window.localStorage) return;

  // GitHub OAuth app (device flow) used to check sponsorship. Public by design; there is no secret.
  const GITHUB_CLIENT_ID = '';
  const SPONSORED = 'cloverscripts';
  const SPONSOR_URL = `https://github.com/sponsors/${SPONSORED}`;
  const LINK_PAGE = 'https://cloverscripts.github.io/riff-muriel/link.html';
  const DAY = 864e5;
  const SPONSOR_VALID = 35 * DAY; // a sponsor check counts this long on every linked device
  const SPONSOR_RECHECK = 7 * DAY;
  const LINK_TTL = 5 * 60e3;
  const KEEP_TOMBSTONES = 120 * DAY;
  const CONTINUE_WITHIN = 12 * 3600e3;

  const K = {
    device: 'muriel_sync_device', group: 'muriel_sync_group', members: 'muriel_sync_members', meta: 'muriel_sync_meta',
    listens: 'muriel_sync_listens', np: 'muriel_sync_np', gh: 'muriel_sync_gh', sponsor: 'muriel_sync_sponsor',
    cats: 'muriel_sync_cats', seen: 'muriel_sync_seen', dismissed: 'muriel_sync_np_dismissed',
  };

  // ---------- storage ----------
  let applying = false; // writes made by sync itself (not the user) don't count as local changes
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  const read = (k, fb = null) => { try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } };
  const write = (k, v) => { applying = true; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} finally { applying = false; } };
  const writeRaw = (k, v) => { applying = true; try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} finally { applying = false; } };
  const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

  const platform = (() => { try { return window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web'; } catch (e) { return 'web'; } })();
  function defaultName() {
    const ua = navigator.userAgent || '';
    if (platform === 'ios') return /iPad/.test(ua) ? 'iPad' : 'iPhone';
    if (platform === 'android') return 'Android phone';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux PC';
    return 'Computer';
  }
  const kind = platform === 'ios' || platform === 'android' ? 'phone' : 'computer';
  let device = read(K.device);
  if (!device || !device.id) { device = { id: hex(16), name: defaultName() }; write(K.device, device); }

  let group = read(K.group); // { id, secret }
  let members = read(K.members, {}); // { deviceId: { name, kind, t, del? } }
  let sponsor = read(K.sponsor); // { login, ok, at }
  let meta = read(K.meta) || {}; // { lists: { playlists, favorites, history }, settings, listensT }
  let listens = read(K.listens, {}); // other devices' Encore data { deviceId: { t, name, db } }
  let np = read(K.np, {}); // what each device last played { deviceId: { t, name, track, pos, playing } }
  let seen = read(K.seen, {});
  const catsOn = () => ({ library: true, history: true, look: true, continue: true, ...read(K.cats, {}) });

  const unlocked = () => !!(sponsor && sponsor.ok && Date.now() - sponsor.at < SPONSOR_VALID);
  const active = () => !!(group && unlocked());
  const liveMembers = () => Object.entries(members).filter(([id, m]) => id !== device.id && m && !m.del);

  // ---------- what syncs ----------
  const trackKey = (t) => {
    if (!t) return '';
    const p = t.platform || 'youtube';
    if (t.id) return `${p}:${t.id}`;
    if (t.url) return `${p}:${t.url}`;
    return `${p}:${(t.title || '').trim().toLowerCase()}|${(t.artist || '').trim().toLowerCase()}`;
  };
  const LISTS = {
    playlists: { key: 'devsize_playlists', cat: 'library', id: (p) => (p && p.id ? String(p.id) : '') },
    favorites: { key: 'devsize_favorites', cat: 'library', id: trackKey },
    history: { key: 'devsize_history', cat: 'history', id: (t) => (trackKey(t) ? `${trackKey(t)}@${t.playedAt || 0}` : ''), sort: (a, b) => (b.playedAt || 0) - (a.playedAt || 0), cap: 100 },
  };
  // the look of the app; sizes, volume, folders and anything else that belongs to one device stay local
  const SETTINGS = ['muriel_theme_mode', 'muriel_theme_accent', 'muriel_theme_intensity', 'muriel_theme_brightness', 'muriel_palette_style',
    'muriel_mesh_brightness', 'muriel_mesh_cfg', 'muriel_font', 'muriel_corner_radius', 'muriel_glass_blur', 'muriel_ui_alpha', 'muriel_text_alpha',
    'muriel_cover_bg_brightness', 'devsize_vfx', 'muriel_lyrics_word_style', 'muriel_lyrics_ease', 'muriel_lyrics_speed',
    'muriel_lyrics_gradient_tightness', 'muriel_gradient_tight', 'muriel_wavy_progress', 'muriel_progress_knob', 'muriel_progress_bg',
    'muriel_highlight_buttons', 'muriel_track_art', 'muriel_tr_enabled', 'muriel_tr_lang', 'muriel_tr_auto', 'muriel_crossfade'];
  const LISTENS_KEY = 'muriel_listens_v1';
  const WATCH = new Map([...Object.entries(LISTS).map(([n, l]) => [l.key, n]), ...SETTINGS.map((k) => [k, 'settings']), [LISTENS_KEY, 'listens']]);

  const listItems = (name) => { const v = read(LISTS[name].key, []); return Array.isArray(v) ? v : []; };
  const settingValues = () => Object.fromEntries(SETTINGS.map((k) => [k, localStorage.getItem(k)]));
  const lists = () => meta.lists || (meta.lists = {});

  function stamp(name) {
    const now = Date.now();
    if (name === 'settings') meta.settings = Core.stampMap(meta.settings || null, settingValues(), now);
    else lists()[name] = Core.pruneMeta(Core.stampList(lists()[name] || null, listItems(name), LISTS[name].id, now), now, KEEP_TOMBSTONES);
  }
  const saveMeta = () => write(K.meta, meta);

  function ownListens() {
    const E = window.MurielEncore;
    const db = E && E.own ? E.own() : read(LISTENS_KEY);
    return db ? { t: meta.listensT || 1, name: device.name, db } : null;
  }

  // the part of this device's state the other side gets; `only` limits it to what just changed
  function snapshot(only) {
    const want = (x) => !only || only.includes(x);
    const cats = catsOn();
    const s = { members, sponsor };
    for (const [name, l] of Object.entries(LISTS)) {
      if (!cats[l.cat] || !want(name)) continue;
      stamp(name);
      (s.lists || (s.lists = {}))[name] = { items: listItems(name), meta: lists()[name] };
    }
    if (cats.look && want('settings')) { stamp('settings'); s.settings = { values: settingValues(), meta: meta.settings }; }
    if (cats.history && want('listens')) { const mine = ownListens(); s.listens = { ...listens, ...(mine ? { [device.id]: mine } : {}) }; }
    if (cats.continue && want('np')) s.np = np;
    saveMeta();
    return s;
  }

  // ---------- applying what another device sent ----------
  function applyRemote(r) {
    if (!r || typeof r !== 'object') return false;
    let any = false;
    const changedKeys = [];
    if (r.members) {
      const m = Core.mergeById(members, r.members, null);
      if (m.changed) { members = m.value; write(K.members, members); any = true; }
      if (members[device.id] && members[device.id].del) { leaveLocally('This device was unlinked'); return true; }
    }
    if (takesOver(r.sponsor)) { sponsor = r.sponsor; write(K.sponsor, sponsor); any = true; }
    const cats = catsOn();
    for (const [name, l] of Object.entries(LISTS)) {
      const theirs = r.lists && r.lists[name];
      if (!theirs || !cats[l.cat]) continue;
      stamp(name);
      const res = Core.mergeList({ items: listItems(name), meta: lists()[name] }, theirs, l.id, { sort: l.sort, cap: l.cap });
      lists()[name] = res.meta;
      if (res.changed) { write(l.key, res.items); changedKeys.push(l.key); }
    }
    if (r.settings && cats.look) {
      stamp('settings');
      const res = Core.mergeMap({ values: settingValues(), meta: meta.settings }, r.settings);
      meta.settings = res.meta;
      res.changedKeys.forEach((k) => { writeRaw(k, res.values[k]); changedKeys.push(k); });
    }
    if (r.listens && cats.history) {
      const res = Core.mergeById(listens, r.listens, device.id);
      if (res.changed) {
        listens = res.value;
        write(K.listens, listens);
        any = true;
        try { window.MurielEncore && window.MurielEncore.refresh && window.MurielEncore.refresh(); } catch (e) {}
      }
    }
    if (r.np && cats.continue) {
      const res = Core.mergeById(np, r.np, device.id);
      if (res.changed) { np = res.value; write(K.np, np); any = true; updateContinue(); }
    }
    saveMeta();
    if (changedKeys.length) {
      any = true;
      try { window.MurielCore && window.MurielCore.reloadFromStorage(changedKeys); } catch (e) { console.warn('[sync] reload', e); }
    }
    if (any) render();
    return any || changedKeys.length > 0;
  }

  // ---------- noticing local changes ----------
  const dirty = new Set();
  let flushTimer = null, listensTimer = null;
  function noteLocal(key) {
    if (!group) return;
    const what = WATCH.get(key);
    if (what === 'listens') {
      meta.listensT = Date.now();
      // Encore saves every few seconds while music plays; the others get it every two minutes
      if (!listensTimer) listensTimer = setTimeout(() => { listensTimer = null; saveMeta(); broadcast(snapshot(['listens'])); }, 120e3);
      return;
    }
    dirty.add(what);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { const only = [...dirty]; dirty.clear(); broadcast(snapshot(only)); }, 400);
  }
  Storage.prototype.setItem = function (key, value) {
    const r = rawSet.call(this, key, value);
    if (!applying && this === window.localStorage && WATCH.has(key)) noteLocal(key);
    return r;
  };
  Storage.prototype.removeItem = function (key) {
    const r = rawRemove.call(this, key);
    if (!applying && this === window.localStorage && WATCH.has(key)) noteLocal(key);
    return r;
  };

  // ---------- connections ----------
  // Peer ids on the public PeerJS server. Only the device with the smaller id dials, so two devices never
  // open two connections to each other.
  const peerId = (id) => `muriel-${id}`;
  const serverOpts = () => ({ debug: 0, ...(read('muriel_sync_server') || {}) });
  let peer = null, peerRetry = null, dialTimer = null;
  const conns = new Map(); // deviceId -> { conn, ok }

  function startPeer() {
    if (peer || !active() || typeof window.Peer !== 'function') return;
    try { peer = new window.Peer(peerId(device.id), serverOpts()); } catch (e) { peer = null; return; }
    peer.on('open', () => { dialAll(); });
    peer.on('connection', (conn) => accept(conn, false));
    peer.on('disconnected', () => { setTimeout(() => { if (peer && !peer.destroyed && peer.disconnected) try { peer.reconnect(); } catch (e) {} }, 3000); });
    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'peer-unavailable') return; // that device just isn't open right now
      if (type === 'unavailable-id' || type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        stopPeer();
        clearTimeout(peerRetry);
        peerRetry = setTimeout(startPeer, type === 'unavailable-id' ? 15000 : 30000);
      }
    });
    clearInterval(dialTimer);
    dialTimer = setInterval(dialAll, 12000);
  }
  function stopPeer() {
    clearInterval(dialTimer);
    dialTimer = null;
    for (const { conn } of conns.values()) try { conn.close(); } catch (e) {}
    conns.clear();
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    render();
  }
  function dialAll() {
    if (!peer || peer.disconnected || document.hidden) return;
    for (const [id] of liveMembers()) {
      if (!(device.id < id)) continue;
      const st = conns.get(id);
      if (st && (st.ok || Date.now() - st.created < 15000)) continue;
      if (st) { try { st.conn.close(); } catch (e) {} conns.delete(id); } // that device wasn't there; try again
      try { accept(peer.connect(peerId(id), { reliable: true }), true, id); } catch (e) {}
    }
  }

  // Both sides prove they hold the group secret before anything else is exchanged.
  function accept(conn, outgoing, expectId) {
    if (!conn || !group) return;
    const nonce = hex(16);
    const st = { conn, ok: false, id: expectId || null, created: Date.now() };
    if (expectId) conns.set(expectId, st);
    const fail = () => { try { conn.close(); } catch (e) {} };
    conn.on('open', () => conn.send({ t: 'hi', id: device.id, nonce, v: 1 }));
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hi') {
        const m = members[msg.id];
        if (m && m.del && msg.nonce && conn.peer === peerId(msg.id)) {
          // it was unlinked while it was away: tell it (proven with the group secret) instead of letting it knock forever
          conn.send({ t: 'bye', mac: Core.sha256(`${group.secret}|${msg.nonce}|bye`) });
          setTimeout(fail, 500);
          return;
        }
        if (!msg.id || msg.id === device.id || !m || conn.peer !== peerId(msg.id) || (expectId && msg.id !== expectId)) return fail();
        if (!outgoing) {
          const old = conns.get(msg.id);
          if (old && old.conn !== conn) try { old.conn.close(); } catch (e) {}
          st.id = msg.id;
          conns.set(msg.id, st);
        }
        conn.send({ t: 'proof', mac: Core.sha256(`${group.secret}|${msg.nonce}|${device.id}`) });
        return;
      }
      if (msg.t === 'proof') {
        if (!st.id || msg.mac !== Core.sha256(`${group.secret}|${nonce}|${st.id}`)) return fail();
        st.ok = true;
        seen[st.id] = Date.now();
        write(K.seen, seen);
        conn.send({ t: 'state', s: snapshot() });
        render();
        return;
      }
      if (msg.t === 'bye' && (st.ok || msg.mac === Core.sha256(`${group.secret}|${nonce}|bye`))) {
        fail();
        leaveLocally('This device was unlinked');
        return;
      }
      if (!st.ok) return;
      seen[st.id] = Date.now();
      if (msg.t === 'state') {
        // pass what was new on to the other linked devices too (three or more devices)
        if (applyRemote(msg.s)) broadcast(snapshot(), st.id);
      } else if (msg.t === 'np') {
        if (applyRemote({ np: msg.np })) broadcast({ np }, st.id);
      } else if (msg.t === 'handoff') {
        const C = window.MurielCore;
        if (C && C.state.isPlaying) { C.togglePlay(); if (C.toast) C.toast('Now playing on another device', 'info'); }
      }
    });
    const gone = () => { if (st.id && conns.get(st.id) === st) conns.delete(st.id); write(K.seen, seen); render(); };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  function broadcast(state, exceptId) {
    if (!state) return;
    for (const [id, st] of conns) if (st.ok && id !== exceptId) try { st.conn.send({ t: 'state', s: state }); } catch (e) {}
  }
  function sendTo(id, msg) { const st = conns.get(id); if (st && st.ok) try { st.conn.send(msg); } catch (e) {} }

  // ---------- linking ----------
  const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const newCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/[O]/g, '0').slice(0, 8);
  const showCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
  let linking = null; // { code, peer, until, timer }

  function ensureGroup() {
    if (group) return;
    group = { id: hex(8), secret: hex(32) };
    members = { [device.id]: { name: device.name, kind, t: Date.now() } };
    write(K.group, group);
    write(K.members, members);
  }

  function startLinking() {
    if (!unlocked() || typeof window.Peer !== 'function') return;
    stopLinking();
    ensureGroup();
    startPeer();
    const code = newCode();
    const lp = new window.Peer(`muriel-link-${code.toLowerCase()}`, serverOpts());
    linking = { code, peer: lp, until: Date.now() + LINK_TTL, timer: setTimeout(stopLinking, LINK_TTL), error: '' };
    lp.on('error', (err) => {
      if (!linking || linking.peer !== lp) return;
      if (err && err.type === 'unavailable-id') { startLinking(); return; }
      linking.error = "Couldn't reach the link service. Check your internet connection.";
      render();
    });
    lp.on('connection', (conn) => {
      conn.on('data', (msg) => {
        if (!msg || msg.t !== 'join' || !msg.id || msg.id === device.id) return;
        members = { ...members, [msg.id]: { name: String(msg.name || 'Device').slice(0, 40), kind: msg.kind === 'phone' ? 'phone' : 'computer', t: Date.now() } };
        write(K.members, members);
        conn.send({ t: 'welcome', group, members, sponsor, from: { id: device.id, name: device.name } });
        toast(`Linked with ${members[msg.id].name}`);
        setTimeout(() => { stopLinking(); broadcast({ members }); }, 1500);
        [2000, 5000, 9000].forEach((ms) => setTimeout(dialAll, ms)); // the new device needs a moment to come online
      });
    });
    render();
  }
  function stopLinking() {
    if (!linking) return;
    clearTimeout(linking.timer);
    try { linking.peer.destroy(); } catch (e) {}
    linking = null;
    render();
  }

  let joining = null;
  function joinWithCode(raw) {
    const code = cleanCode(raw);
    if (code.length !== 8) { joining = { error: 'The code has 8 letters and numbers, like K7M2-9QXP.' }; render(); return; }
    if (typeof window.Peer !== 'function') return;
    joining = { code, busy: true };
    render();
    const tp = new window.Peer(`muriel-j-${hex(12)}`, serverOpts());
    const done = (error) => { clearTimeout(timer); try { tp.destroy(); } catch (e) {} joining = error ? { code, error } : null; render(); };
    const timer = setTimeout(() => done("No device answered. Check the code, and that Muriel shows it on the other device."), 20000);
    tp.on('error', (err) => done(err && err.type === 'peer-unavailable' ? 'No device is showing that code right now.' : "Couldn't reach the link service. Check your internet connection."));
    tp.on('open', () => {
      const conn = tp.connect(`muriel-link-${code.toLowerCase()}`, { reliable: true });
      conn.on('open', () => conn.send({ t: 'join', id: device.id, name: device.name, kind, v: 1 }));
      conn.on('data', (msg) => {
        if (!msg || msg.t !== 'welcome' || !msg.group || !msg.group.secret) return;
        if (group && group.id !== msg.group.id) leaveLocally();
        group = msg.group;
        members = Core.mergeById(msg.members || {}, { [device.id]: { name: device.name, kind, t: Date.now() } }, null).value;
        if (takesOver(msg.sponsor)) { sponsor = msg.sponsor; write(K.sponsor, sponsor); }
        write(K.group, group);
        write(K.members, members);
        toast(`Linked with ${(msg.from && msg.from.name) || 'your device'}`);
        done('');
        stopPeer();
        startPeer();
      });
    });
  }

  function unlink(id) {
    if (!members[id]) return;
    sendTo(id, { t: 'bye' });
    members = { ...members, [id]: { ...members[id], del: 1, t: Date.now() } };
    write(K.members, members);
    broadcast({ members });
    const st = conns.get(id);
    if (st) setTimeout(() => { try { st.conn.close(); } catch (e) {} }, 500);
    render();
  }
  function leave() {
    if (!group) return;
    members = { ...members, [device.id]: { ...(members[device.id] || { name: device.name, kind }), del: 1, t: Date.now() } };
    broadcast({ members });
    setTimeout(() => leaveLocally('This device left sync'), 600);
  }
  // keeps the music, playlists and everything else on this device; only the link is gone
  function leaveLocally(msg) {
    stopLinking();
    stopPeer();
    group = null; members = {}; meta = {}; listens = {}; np = {};
    [K.group, K.members, K.meta, K.listens, K.np, K.seen].forEach((k) => { try { rawRemove.call(localStorage, k); } catch (e) {} });
    try { window.MurielEncore && window.MurielEncore.refresh && window.MurielEncore.refresh(); } catch (e) {}
    updateContinue();
    if (msg) toast(msg);
    render();
  }

  // ---------- sponsor check (GitHub sign-in with a code) ----------
  const clientId = () => read('muriel_sync_gh_client') || GITHUB_CLIENT_ID;
  let signin = null; // { user_code, verification_uri, busy, error, notSponsor }
  const form = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

  async function checkSponsor(token) {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query { viewer { login } user(login: "${SPONSORED}") { viewerIsSponsoring } }` }),
    });
    if (res.status === 401) return { revoked: true };
    const data = await res.json();
    const login = data && data.data && data.data.viewer && data.data.viewer.login;
    if (!login) throw new Error('GitHub did not answer');
    const ok = login.toLowerCase() === SPONSORED || !!(data.data.user && data.data.user.viewerIsSponsoring);
    return { login, ok };
  }
  // A valid unlock beats "not a sponsor", whoever signed in last; between two unlocks the newer one counts.
  // "Not a sponsor" only replaces an unlock when it's the same person (their sponsorship ended).
  const valid = (x) => !!(x && x.ok && Date.now() - x.at < SPONSOR_VALID);
  function takesOver(s) {
    if (!s || !s.at || !sponsor) return !!(s && s.at);
    if (valid(s)) return !valid(sponsor) || s.at > sponsor.at;
    if (valid(sponsor)) return s.login === sponsor.login && s.at > sponsor.at;
    return s.at > sponsor.at;
  }
  function setSponsor(r) {
    const next = { login: r.login, ok: r.ok, at: Date.now() };
    if (!takesOver(next)) return;
    sponsor = next;
    write(K.sponsor, sponsor);
    broadcast({ sponsor });
    if (unlocked()) { if (group) startPeer(); } else stopPeer();
    render();
  }

  async function startSignIn() {
    if (!clientId()) return;
    signin = { busy: true };
    render();
    try {
      const res = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ client_id: clientId(), scope: 'read:user' }),
      });
      const d = await res.json();
      if (!d.device_code) throw new Error(d.error_description || 'GitHub did not answer');
      signin = { user_code: d.user_code, verification_uri: d.verification_uri || 'https://github.com/login/device', until: Date.now() + (d.expires_in || 900) * 1000 };
      render();
      let wait = Math.max(5, d.interval || 5) * 1000;
      while (signin && signin.user_code === d.user_code && Date.now() < signin.until) {
        await new Promise((r) => setTimeout(r, wait));
        if (!signin || signin.user_code !== d.user_code) return;
        const t = await (await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form({ client_id: clientId(), device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        })).json();
        if (t.error === 'authorization_pending') continue;
        if (t.error === 'slow_down') { wait += 5000; continue; }
        if (!t.access_token) throw new Error(t.error === 'access_denied' ? 'Sign-in was cancelled.' : 'The code ran out. Try again.');
        const r = await checkSponsor(t.access_token);
        write(K.gh, { token: t.access_token, login: r.login });
        setSponsor(r);
        signin = r.ok ? null : { notSponsor: r.login };
        render();
        return;
      }
      if (signin && signin.user_code === d.user_code) { signin = { error: 'The code ran out. Try again.' }; render(); }
    } catch (e) {
      signin = { error: (e && e.message) || "Couldn't reach GitHub." };
      render();
    }
  }
  async function recheck(force) {
    const gh = read(K.gh);
    if (!gh || !gh.token) return;
    if (!force && sponsor && Date.now() - sponsor.at < SPONSOR_RECHECK) return;
    try {
      const r = await checkSponsor(gh.token);
      if (r.revoked) { rawRemove.call(localStorage, K.gh); render(); return; }
      setSponsor(r);
    } catch (e) {}
  }
  function signOut() {
    try { rawRemove.call(localStorage, K.gh); } catch (e) {}
    signin = null;
    render();
  }

  // ---------- continue listening ----------
  const trackInfo = (t) => (t ? { id: t.id, title: t.title, artist: t.artist, album: t.album, thumbnail: t.thumbnail, platform: t.platform, url: t.url, duration: t.duration } : null);
  let npTimer = null, lastNpSent = 0;
  function publishNp(force) {
    const C = window.MurielCore;
    if (!group || !catsOn().continue || !C || !C.state.currentTrack) return;
    const now = Date.now();
    if (!force && now - lastNpSent < 15000) return;
    lastNpSent = now;
    np = { ...np, [device.id]: { t: now, name: device.name, track: trackInfo(C.state.currentTrack), pos: Math.floor(C.audio.currentTime || 0), playing: !!C.state.isPlaying } };
    write(K.np, np);
    for (const [id, st] of conns) if (st.ok) try { st.conn.send({ t: 'np', np: { [device.id]: np[device.id] } }); } catch (e) {}
    updateContinue();
  }

  let banner = null;
  function candidate() {
    const C = window.MurielCore;
    if (!group || !catsOn().continue || !C || C.state.isPlaying) return null;
    const mine = np[device.id];
    const dismissed = read(K.dismissed, {});
    let best = null;
    for (const [id, e] of Object.entries(np)) {
      if (id === device.id || !e || !e.track || !members[id] || members[id].del) continue;
      if (Date.now() - e.t > CONTINUE_WITHIN || (mine && mine.t >= e.t) || dismissed[id] === e.t) continue;
      if (!best || e.t > best.e.t) best = { id, e };
    }
    return best;
  }
  function updateContinue() {
    const c = candidate();
    if (!c) { if (banner) { const b = banner; banner = null; b.classList.remove('show'); setTimeout(() => b.remove(), 400); } return; }
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'update-banner sync-continue';
      banner.setAttribute('role', 'status');
      banner.innerHTML = `
        <svg class="update-banner-star" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <div class="update-banner-text"><b></b><span></span></div>
        <button type="button" class="update-banner-later">Not now</button>
        <button type="button" class="update-banner-go">Play here</button>`;
      document.body.appendChild(banner);
      requestAnimationFrame(() => requestAnimationFrame(() => banner && banner.classList.add('show')));
    }
    const { id, e } = c;
    const live = e.playing && Date.now() - e.t < 60e3;
    banner.querySelector('b').textContent = live ? `Playing on ${e.name}` : `Continue from ${e.name}`;
    banner.querySelector('span').textContent = `${e.track.title || 'Unknown'}${e.track.artist ? ` · ${e.track.artist}` : ''} · ${fmt(e.pos || 0)}`;
    banner.querySelector('.update-banner-later').onclick = () => { write(K.dismissed, { ...read(K.dismissed, {}), [id]: e.t }); updateContinue(); };
    banner.querySelector('.update-banner-go').onclick = () => {
      const C = window.MurielCore;
      const at = (e.pos || 0) + (live ? (Date.now() - e.t) / 1000 : 0);
      write(K.dismissed, { ...read(K.dismissed, {}), [id]: e.t });
      if (live) sendTo(id, { t: 'handoff' });
      C.playTrack(e.track);
      const seekOnce = () => { C.audio.removeEventListener('loadedmetadata', seekOnce); if (at > 3 && (!C.audio.duration || at < C.audio.duration - 5)) C.seek(at); };
      C.audio.addEventListener('loadedmetadata', seekOnce);
      updateContinue();
    };
  }

  // ---------- Settings → Sync ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m) => { try { window.MurielCore && window.MurielCore.toast(m, 'info'); } catch (e) {} };
  // phones hand outside links to the browser; the desktop app opens https links in the default browser
  const openUrl = (u) => { if (platform === 'ios' || platform === 'android') location.href = u; else window.open(u, '_blank'); };
  const qrSvg = (text) => {
    if (typeof window.qrcode !== 'function') return '';
    const q = window.qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  };
  const ago = (t) => {
    if (!t) return 'Not synced yet';
    const m = Math.round((Date.now() - t) / 60e3);
    if (m < 1) return 'Synced just now';
    if (m < 60) return `Synced ${m} min ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `Synced ${h} h ago` : `Synced ${Math.round(h / 24)} days ago`;
  };
  const ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M5 17h6"/><rect x="15" y="8" width="7" height="13" rx="1.5"/><path d="M18 18h1"/></svg>';
  const deviceIcon = (k) => (k === 'phone'
    ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>'
    : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>');

  let section = null;
  function mount() {
    const nav = document.getElementById('settings-nav');
    const about = document.getElementById('settings-section-about');
    if (!nav || !about || section) return;
    const btn = document.createElement('button');
    btn.className = 'settings-nav-btn';
    btn.dataset.cat = 'sync';
    btn.innerHTML = `${ICON}<span>Sync</span>`;
    nav.insertBefore(btn, nav.querySelector('[data-cat="about"]'));
    section = document.createElement('div');
    section.className = 'settings-section sync-section';
    section.dataset.cat = 'sync';
    about.parentElement.insertBefore(section, about);
    section.addEventListener('click', onClick);
    section.addEventListener('submit', (e) => { e.preventDefault(); const i = section.querySelector('#sync-code-input'); if (i) joinWithCode(i.value); });
    render();
  }

  function render() {
    if (!section) return;
    const cats = catsOn();
    const gh = read(K.gh);
    const parts = [`<span class="settings-section-title">Sync <span class="sync-badge">Early access</span></span>`];
    parts.push(`<div class="m3-group"><div class="setting-item"><div class="sync-intro">
      <b>Your music on all your devices</b>
      <span>Link your phone and computer: playlists, favorites, history, Encore stats, the look of the app and what you're listening to stay the same everywhere. Your data stays on your devices; linked devices talk to each other directly while they're open.</span>
    </div></div></div>`);

    if (!unlocked()) {
      let body;
      if (!clientId()) body = '<span class="sync-note">Sync opens for sponsors very soon.</span>';
      else if (signin && signin.user_code) {
        body = `<div class="sync-pair">
          <div class="sync-qr">${qrSvg(signin.verification_uri)}</div>
          <div class="sync-pair-text"><span>Open <b>${esc(signin.verification_uri.replace(/^https:\/\//, ''))}</b> and enter</span>
          <div class="sync-code">${esc(signin.user_code)}</div>
          <div class="sync-row"><button class="btn-pill-primary" data-act="open-gh">Open GitHub</button><button class="btn-outline-pill" data-act="cancel-signin">Cancel</button></div>
          <span class="sync-note">Waiting for GitHub…</span></div></div>`;
      } else if (signin && signin.busy) body = '<span class="sync-note">Asking GitHub…</span>';
      else {
        const msg = signin && signin.notSponsor ? `<span class="sync-note">@${esc(signin.notSponsor)} isn't sponsoring yet. Once you are, check again.</span>`
          : signin && signin.error ? `<span class="sync-note sync-error">${esc(signin.error)}</span>`
            : sponsor && !sponsor.ok && sponsor.login ? `<span class="sync-note">@${esc(sponsor.login)} isn't a sponsor right now, so sync is paused. Your data stays on each device.</span>`
              : group ? '<span class="sync-note">Sync is paused: a sponsor has to sign in with GitHub again on one of your devices.</span>' : '';
        body = `<span class="sync-note">Sync is for everyone sponsoring Muriel on GitHub, at any amount.</span>${msg}
          <div class="sync-row"><button class="btn-pill-primary" data-act="sponsor">Become a sponsor</button>
          <button class="btn-outline-pill" data-act="${gh && gh.token ? 'recheck' : 'signin'}">${gh && gh.token ? 'Check again' : "I'm a sponsor"}</button></div>`;
      }
      parts.push(`<div class="m3-group"><div class="setting-item sync-block">${body}</div></div>`);
      if (!group) parts.push(joinBlock(true));
    } else {
      // devices
      const rows = [];
      rows.push(`<div class="setting-item sync-device"><span class="sync-dev-icon">${deviceIcon(kind)}</span><div class="sync-dev-text"><b>${esc(device.name)}</b><span>This device</span></div></div>`);
      for (const [id, m] of liveMembers()) {
        const on = conns.get(id) && conns.get(id).ok;
        rows.push(`<div class="setting-item sync-device"><span class="sync-dev-icon">${deviceIcon(m.kind)}</span><div class="sync-dev-text"><b>${esc(m.name)}</b><span class="${on ? 'sync-online' : ''}">${on ? 'Connected' : ago(seen[id])}</span></div><button class="btn-outline-pill" data-act="unlink" data-id="${esc(id)}">Unlink</button></div>`);
      }
      parts.push(`<div class="m3-group">${rows.join('')}</div>`);
      if (linking) {
        const left = Math.max(0, Math.round((linking.until - Date.now()) / 1000));
        parts.push(`<div class="m3-group"><div class="setting-item sync-block"><div class="sync-pair">
          <div class="sync-qr">${qrSvg(`${LINK_PAGE}#${linking.code}`)}</div>
          <div class="sync-pair-text"><span>On your other device open <b>Settings → Sync → Enter a code</b>, or scan this with your phone's camera.</span>
          <div class="sync-code">${showCode(linking.code)}</div>
          ${linking.error ? `<span class="sync-note sync-error">${esc(linking.error)}</span>` : `<span class="sync-note" data-countdown>Works for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>`}
          <div class="sync-row"><button class="btn-outline-pill" data-act="stop-link">Done</button></div></div></div></div></div>`);
      } else {
        parts.push(`<div class="m3-group"><div class="setting-item sync-block"><div class="sync-row"><button class="btn-pill-primary" data-act="link">Link a device</button></div></div></div>`);
      }
      parts.push(joinBlock(false));
      // what syncs
      const sw = (c, name, hint) => `<div class="setting-item"><div class="setting-item-top" style="align-items:center;"><div style="display:flex;flex-direction:column;gap:2px;"><span class="setting-name">${name}</span><span class="sync-note">${hint}</span></div><button class="effect-switch-btn${cats[c] ? ' active' : ''}" type="button" data-act="cat" data-cat-key="${c}" aria-label="${name}"><span class="thumb"></span></button></div></div>`;
      parts.push(`<div class="m3-group">
        ${sw('library', 'Library', 'Playlists and favorites')}
        ${sw('history', 'History and stats', 'Recently played and Encore')}
        ${sw('look', 'Look', 'Theme, colors, font and lyrics style')}
        ${sw('continue', 'Continue listening', 'Pick up where another device left off')}
      </div>`);
      parts.push(`<div class="m3-group"><div class="setting-item sync-block">
        <span class="sync-note">${sponsor && sponsor.login ? `Unlocked by @${esc(sponsor.login)}. Thank you for sponsoring!` : ''}</span>
        <div class="sync-row">${group ? '<button class="btn-outline-pill" data-act="leave">Stop syncing this device</button>' : ''}${gh && gh.token ? '<button class="btn-outline-pill" data-act="signout">Sign out of GitHub</button>' : ''}</div>
      </div></div>`);
    }
    const focused = document.activeElement && document.activeElement.id === 'sync-code-input' ? document.activeElement.value : null;
    section.innerHTML = parts.join('');
    if (focused !== null) { const i = section.querySelector('#sync-code-input'); if (i) { i.value = focused; i.focus(); } }
  }
  function joinBlock(locked) {
    const note = joining && joining.error ? `<span class="sync-note sync-error">${esc(joining.error)}</span>`
      : joining && joining.busy ? '<span class="sync-note">Linking…</span>'
        : locked ? '<span class="sync-note">Linking to a sponsor\'s device? Enter the code it shows.</span>' : '';
    return `<div class="m3-group"><div class="setting-item sync-block"><form class="sync-join">
      <input id="sync-code-input" class="m3-input" placeholder="Enter a code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9">
      <button class="btn-outline-pill" type="submit"${joining && joining.busy ? ' disabled' : ''}>Link</button></form>${note}</div></div>`;
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'sponsor') openUrl(SPONSOR_URL);
    else if (act === 'signin') startSignIn();
    else if (act === 'recheck') { signin = { busy: true }; render(); recheck(true).then(() => { signin = sponsor && sponsor.ok ? null : { notSponsor: sponsor && sponsor.login }; render(); }); }
    else if (act === 'open-gh' && signin) openUrl(signin.verification_uri);
    else if (act === 'cancel-signin') { signin = null; render(); }
    else if (act === 'link') startLinking();
    else if (act === 'stop-link') stopLinking();
    else if (act === 'unlink') { const m = members[b.dataset.id]; if (m && confirm(`Unlink ${m.name}? Its music stays on it, it just stops syncing.`)) unlink(b.dataset.id); }
    else if (act === 'leave') { if (confirm('Stop syncing this device? Everything stays on it.')) leave(); }
    else if (act === 'signout') signOut();
    else if (act === 'cat') {
      const c = b.dataset.catKey;
      const next = { ...read(K.cats, {}), [c]: !catsOn()[c] };
      write(K.cats, next);
      render();
      if (next[c]) for (const [id] of conns) sendTo(id, { t: 'state', s: snapshot() });
    }
  }

  // ---------- links from the QR code (muriel://link?code=…) ----------
  function handleLink(url) {
    const m = /^muriel:\/\/link\/?\?(?:.*&)?code=([0-9A-Za-z-]+)/.exec(String(url || ''));
    if (!m) return;
    if (window.showSettingsCategory) { const nav = document.getElementById('nav-settings'); if (nav) nav.click(); window.showSettingsCategory('sync'); }
    joinWithCode(m[1]);
  }
  window.addEventListener('muriel:deeplink', (e) => handleLink(e.detail));

  // ---------- start ----------
  function wake() {
    if (document.hidden) return;
    recheck(false);
    if (active()) { startPeer(); if (peer && peer.disconnected) try { peer.reconnect(); } catch (e) {} dialAll(); }
    updateContinue();
    render();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); else if (group) publishNp(true); });
  window.addEventListener('online', wake);
  setInterval(() => { if (linking && section) { const c = section.querySelector('[data-countdown]'); const left = Math.max(0, Math.round((linking.until - Date.now()) / 1000)); if (c) c.textContent = `Works for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; } }, 1000);

  function hook() {
    const C = window.MurielCore;
    if (C && C.audio) {
      window.addEventListener('muriel:track', () => publishNp(true));
      C.audio.addEventListener('playing', () => { publishNp(true); updateContinue(); });
      C.audio.addEventListener('pause', () => publishNp(true));
      C.audio.addEventListener('timeupdate', () => publishNp(false));
    }
    mount();
    if (active()) startPeer();
    setTimeout(() => recheck(false), 5000);
    updateContinue();
  }
  if (window.MurielCore) hook(); else window.addEventListener('muriel:ready', hook, { once: true });

  window.MurielSync = {
    // other devices' Encore data, for encore.js
    listenDbs: () => (catsOn().history ? Object.entries(listens).filter(([id]) => id !== device.id && members[id] && !members[id].del).map(([, e]) => e.db).filter(Boolean) : []),
    status: () => ({ device, group: !!group, unlocked: unlocked(), members, connected: [...conns].filter(([, s]) => s.ok).map(([id]) => id) }),
    link: startLinking,
    join: joinWithCode,
    handleLink,
  };
})();
