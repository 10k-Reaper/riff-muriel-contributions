// Muriel's site. Picks the right download for the visitor's device and shows live numbers from GitHub:
// the download counter, file sizes, the latest desktop version, how old the newest build is, and stars.
(() => {
  const REPO = 'cloverscripts/riff-muriel';
  const API = `https://api.github.com/repos/${REPO}`;
  const SOURCE_URL = `https://github.com/${REPO}/releases/download/ios-latest/sidestore.json`;
  const REFRESH_MS = 90 * 1000; // GitHub allows 60 unauthenticated requests an hour per visitor
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---- your device ----
  const ua = navigator.userAgent;
  const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const linuxDesktop = /Linux|X11/.test(ua) && !/Android|Mac/.test(ua);
  const os = /iPhone|iPad|iPod/.test(ua) || touchMac ? 'ios'
    : /Android/i.test(ua) ? 'android'
    : /Windows/i.test(ua) ? 'windows'
    : /Macintosh|Linux|X11/i.test(ua) ? 'desktop' : null;
  const OS_NAME = { android: 'Android', ios: 'iPhone', windows: 'Windows', desktop: linuxDesktop ? 'Linux' : 'Mac' };
  $('dl-sidestore').href = `sidestore://source?url=${encodeURIComponent(SOURCE_URL)}`;

  // where "Download" goes: the file itself where one tap installs, otherwise the right tab
  function mainHref() {
    if (os === 'android') return $('dl-android').href;
    if (os === 'windows') return $('dl-windows').href;
    if (os === 'desktop') return (linuxDesktop ? $('dl-linux') : $('dl-mac-arm')).href;
    return '#download';
  }
  function updateMainLinks() {
    const href = mainHref();
    ['main-dl', 'np-play', 'np-get'].forEach((id) => { $(id).href = href; });
  }
  if (os) {
    $('main-dl-label').textContent = `Download for ${OS_NAME[os]}`;
    $('main-dl').setAttribute('aria-label', `Download Muriel for ${OS_NAME[os]}`);
    $('np-title').textContent = `Muriel for ${OS_NAME[os]}`;
    $('np-get').textContent = os === 'ios' ? 'Get it' : 'Download';
  }
  updateMainLinks();

  // ---- platform tabs ----
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(name, focus) {
    tabs.forEach((t) => {
      const on = t.dataset.os === name;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t.dataset.os));
    t.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      selectTab(tabs[(i + step + tabs.length) % tabs.length].dataset.os, true);
    });
  });
  const mineTab = tabs.find((t) => t.dataset.os === os);
  if (mineTab) mineTab.classList.add('mine');
  selectTab(os || 'android');
  // the sidebar's library opens the matching tab
  document.querySelectorAll('[data-os-link]').forEach((b) => b.addEventListener('click', () => {
    selectTab(b.dataset.osLink);
    $('download').scrollIntoView({ behavior: 'smooth' });
  }));

  // ---- download counter ----
  // The phone and Windows builds are "rolling" releases that every build replaces, and GitHub resets a
  // file's count when it is replaced. Each build therefore writes the total so far into its release
  // notes (see .github/carry-downloads.sh); seed covers releases made before that existed.
  const ROLLING = {
    'android-latest': { file: 'Muriel.apk', platform: 'android', seed: 3530 },
    'ios-latest': { file: 'Muriel.ipa', platform: 'ios', seed: 1640 },
    'windows-latest': { file: 'Muriel.exe', platform: 'windows', seed: 6 },
  };
  const PLATFORMS = [
    ['android', 'Android', 'var(--android)'],
    ['ios', 'iPhone', 'var(--ios-c)'],
    ['windows', 'Windows', 'var(--windows)'],
    ['mac', 'Mac', 'var(--mac)'],
    ['linux', 'Linux', 'var(--linux)'],
  ];
  // installers only: .yml and .blockmap files are fetched by the desktop auto-updater, not by people
  const platformOf = (name) => (/\.apk$/i.test(name) ? 'android'
    : /\.ipa$/i.test(name) ? 'ios'
    : /\.exe$/i.test(name) ? 'windows'
    : /\.dmg$|mac.*\.zip$/i.test(name) ? 'mac'
    : /\.AppImage$|\.deb$|\.rpm$|\.pacman$|linux.*\.tar\.gz$/i.test(name) ? 'linux' : null);

  function countDownloads(releases) {
    const per = { android: 0, ios: 0, windows: 0, mac: 0, linux: 0 };
    for (const rel of releases) {
      const rolling = ROLLING[rel.tag_name];
      if (rolling) {
        const m = /muriel-downloads-before:\s*(\d+)/.exec(rel.body || '');
        const asset = rel.assets.find((a) => a.name === rolling.file);
        per[rolling.platform] += (m ? Number(m[1]) : rolling.seed) + (asset ? asset.download_count : 0);
        continue;
      }
      for (const a of rel.assets) {
        const p = platformOf(a.name);
        if (p) per[p] += a.download_count;
      }
    }
    return per;
  }

  const fmt = (n) => n.toLocaleString('en-US');

  // rolling digits: each digit is a 0-9 strip moved into place
  const odo = $('odo');
  function setOdometer(n) {
    const text = fmt(n);
    if (odo.dataset.text === text) return;
    const fresh = odo.dataset.len !== String(text.length);
    if (fresh) {
      odo.innerHTML = '';
      [...text].forEach((ch, i) => {
        const slot = document.createElement('span');
        if (/\d/.test(ch)) {
          slot.className = 'd';
          const strip = document.createElement('span');
          strip.className = 'strip';
          strip.style.transitionDelay = `${i * 60}ms`;
          for (let d = 0; d < 10; d++) { const g = document.createElement('i'); g.textContent = d; strip.appendChild(g); }
          slot.appendChild(strip);
        } else {
          slot.className = 'sep';
          slot.textContent = ch;
        }
        odo.appendChild(slot);
      });
      const plus = document.createElement('span');
      plus.className = 'plus';
      plus.textContent = '+';
      odo.appendChild(plus);
      odo.dataset.len = String(text.length);
    }
    const slots = odo.querySelectorAll('.d .strip, .sep');
    const apply = () => [...text].forEach((ch, i) => {
      if (/\d/.test(ch) && slots[i]) slots[i].style.transform = `translateY(${-Number(ch) * 10}%)`;
    });
    // a new row of digits starts at 0 and rolls up
    if (fresh) requestAnimationFrame(() => requestAnimationFrame(apply)); else apply();
    odo.dataset.text = text;
  }

  function render(per) {
    const total = Object.values(per).reduce((a, b) => a + b, 0);
    setOdometer(total);
    $('count-sr').textContent = `${fmt(total)} downloads`;
    const ranked = PLATFORMS.filter(([k]) => per[k] > 0).sort((a, b) => per[b[0]] - per[a[0]]);
    const top = ranked.length ? per[ranked[0][0]] : 1;
    $('ranks').innerHTML = ranked.map(([k, label, color]) => `<li style="--c:${color}"><b>${label}</b><span class="c">${fmt(per[k])}</span><span class="bar"><i style="width:${Math.max(2, (per[k] / top) * 100)}%"></i></span></li>`).join('');
    const cardCounts = { android: per.android, ios: per.ios, windows: per.windows, desktop: per.mac + per.linux };
    document.querySelectorAll('[data-count]').forEach((el) => {
      const n = cardCounts[el.dataset.count];
      if (!el.dataset.fallback) el.dataset.fallback = el.textContent;
      el.textContent = n ? `${fmt(n)} downloads` : el.dataset.fallback;
    });
  }

  // ---- sizes, versions, build age ----
  const mb = (n) => `${(n / 1048576).toFixed(n > 20971520 ? 0 : 1)} MB`;
  const ago = (d) => {
    const h = Math.round((Date.now() - new Date(d)) / 3600000);
    return h < 1 ? 'just now' : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
  };
  function details(releases) {
    const byTag = Object.fromEntries(releases.map((r) => [r.tag_name, r]));
    const size = (tag, file, id) => {
      const a = byTag[tag] && byTag[tag].assets.find((x) => x.name === file);
      if (a && $(id)) $(id).textContent = `· ${mb(a.size)}`;
    };
    size('android-latest', 'Muriel.apk', 'size-android');
    size('windows-latest', 'Muriel.exe', 'size-windows');
    size('ios-latest', 'Muriel.ipa', 'size-ios');
    const newest = Object.keys(ROLLING).map((t) => byTag[t] && byTag[t].published_at).filter(Boolean).sort().pop();
    if (newest) $('build-info').textContent = `Free · open source · newest build ${ago(newest)}`;

    // desktop installers come from the newest versioned release (v1.2.3), not the rolling ones
    const rel = releases.find((r) => !r.draft && !r.prerelease && /^v\d/.test(r.tag_name));
    if (!rel) return;
    const pick = (re) => rel.assets.find((a) => re.test(a.name));
    const set = (id, a) => { if (a && $(id)) $(id).href = a.browser_download_url; };
    set('dl-mac-arm', pick(/mac-arm64\.dmg$/i));
    set('dl-mac-x64', pick(/mac-x64\.dmg$/i));
    const appImage = pick(/\.AppImage$/i);
    set('dl-linux', appImage);
    if (appImage) {
      $('size-linux').textContent = `· ${mb(appImage.size)}`;
      $('linux-line').textContent = `mkdir -p ~/Applications && curl -L -o ~/Applications/Muriel.AppImage ${appImage.browser_download_url} && chmod +x ~/Applications/Muriel.AppImage && ~/Applications/Muriel.AppImage`;
    }
    $('rel-version').textContent = rel.tag_name;
    $('np-sub').textContent = `${rel.tag_name} · free, no ads`;
    updateMainLinks();
  }

  // ---- live updates ----
  const cached = store.get('muriel_site_counts');
  if (cached && cached.per) render(cached.per);
  let lastFetch = 0;
  let timer = 0;
  async function refresh() {
    lastFetch = Date.now();
    try {
      const res = await fetch(`${API}/releases?per_page=100`, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(String(res.status));
      const releases = await res.json();
      const per = countDownloads(releases);
      render(per);
      details(releases);
      store.set('muriel_site_counts', { per, at: Date.now() });
      $('live-text').textContent = 'Live from GitHub';
      document.querySelector('.pulse').classList.remove('off');
    } catch (e) {
      // usually GitHub's hourly limit for this visitor; keep showing the last numbers
      $('live-text').textContent = cached || odo.dataset.text ? 'Live updates paused for now' : 'Couldn’t reach GitHub';
      document.querySelector('.pulse').classList.add('off');
      if (!odo.dataset.text) odo.innerHTML = '<span class="odo-wait">—</span>';
      if (!$('ranks').children.length) $('ranks').innerHTML = '<li class="wait">Couldn’t load the numbers right now.</li>';
    }
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(refresh, REFRESH_MS);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); return; }
    if (Date.now() - lastFetch > REFRESH_MS) refresh();
    else { clearTimeout(timer); timer = setTimeout(refresh, REFRESH_MS - (Date.now() - lastFetch)); }
  });
  refresh();

  // stars, once per visit
  const showStars = (n) => document.querySelectorAll('.stars-n').forEach((el) => { el.textContent = fmt(n); });
  const cachedStars = store.get('muriel_site_stars');
  if (cachedStars) showStars(cachedStars);
  fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && Number.isFinite(j.stargazers_count)) { showStars(j.stargazers_count); store.set('muriel_site_stars', j.stargazers_count); } })
    .catch(() => {});

  // ---- the player bar: the page is the "song" ----
  const sections = [...document.querySelectorAll('#top, #features, #screens, #download, #faq')];
  const nameOf = (s) => s.dataset.secName || s.id;
  const navLinks = [...document.querySelectorAll('.side-nav a')];
  function currentIndex() {
    const line = window.innerHeight * 0.35;
    let idx = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= line) idx = i; });
    return idx;
  }
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    $('scroll-prog').style.width = `${p * 100}%`;
    $('prog-line').style.width = `${p * 100}%`;
    const i = currentIndex();
    $('sec-now').textContent = nameOf(sections[i]);
    $('sec-left').textContent = i < sections.length - 1 ? nameOf(sections[i + 1]) : 'The end';
    navLinks.forEach((a) => a.classList.toggle('on', a.dataset.sec === sections[i].id));
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
  const jump = (d) => {
    const i = Math.max(0, Math.min(sections.length - 1, currentIndex() + d));
    sections[i].scrollIntoView({ behavior: 'smooth' });
  };
  $('sec-prev').addEventListener('click', () => jump(-1));
  $('sec-next').addEventListener('click', () => jump(1));

  // screenshot shelf arrows
  const shelf = $('shelf');
  document.querySelectorAll('[data-scroll]').forEach((b) => b.addEventListener('click', () => {
    shelf.scrollBy({ left: Number(b.dataset.scroll) * shelf.clientWidth * 0.8, behavior: 'smooth' });
  }));

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($(b.dataset.copy).textContent);
      b.textContent = 'Copied';
      setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    } catch (e) {}
  }));
})();
