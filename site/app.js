// Picks the right download for the visitor's device and shows live build info from GitHub releases.
(() => {
  const REPO = 'cloverscripts/riff-muriel';
  const SOURCE_URL = `https://github.com/${REPO}/releases/download/ios-latest/sidestore.json`;
  const $ = (id) => document.getElementById(id);

  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const os = isIOS ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows' : null;

  $('dl-sidestore').href = `sidestore://source?url=${encodeURIComponent(SOURCE_URL)}`;

  const main = $('main-dl');
  const labels = { android: 'Download for Android', windows: 'Download for Windows', ios: 'Get it on iPhone' };
  if (os) {
    main.textContent = labels[os];
    main.href = os === 'ios' ? '#download' : $(`dl-${os}`).href;
    document.querySelector(`.dl .card[data-os="${os}"]`)?.classList.add('mine');
    // your platform first in the download grid
    const card = document.querySelector(`.dl .card[data-os="${os}"]`);
    if (card) card.parentElement.prepend(card);
  }

  const mb = (n) => `${(n / 1048576).toFixed(n > 20971520 ? 0 : 1)} MB`;
  const ago = (d) => {
    const h = Math.round((Date.now() - new Date(d)) / 3600000);
    return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  };

  // live sizes and dates from the rolling releases
  Promise.all(['android-latest', 'windows-latest', 'ios-latest'].map((tag) =>
    fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
    .then(([android, windows, ios]) => {
      const set = (rel, name, el) => { const a = rel && rel.assets.find((x) => x.name === name); if (a && $(el)) $(el).textContent = `· ${mb(a.size)}`; };
      set(android, 'Muriel.apk', 'size-android');
      set(windows, 'Muriel.exe', 'size-windows');
      set(ios, 'Muriel.ipa', 'size-ios');
      const newest = [android, windows, ios].filter(Boolean).map((r) => r.published_at).sort().pop();
      if (newest) $('build-info').textContent = `Latest build ${ago(newest)}`;
    });

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(b.dataset.copy).textContent); b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1500); } catch (e) {}
  }));
})();
