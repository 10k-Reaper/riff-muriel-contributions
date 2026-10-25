const TRACK_SORT_MODES = ['manual', 'added-desc', 'added-asc', 'title-asc', 'title-desc', 'artist-asc', 'album-asc', 'duration-asc'];

function compareText(a, b, key) {
  const av = a && typeof a[key] === 'string' ? a[key].trim() : '';
  const bv = b && typeof b[key] === 'string' ? b[key].trim() : '';
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true });
}

// Z to A, still with the songs that have no title at the end
function compareTextDesc(a, b, key) {
  const av = a && typeof a[key] === 'string' ? a[key].trim() : '';
  const bv = b && typeof b[key] === 'string' ? b[key].trim() : '';
  if (!av || !bv) return compareText(a, b, key);
  return bv.localeCompare(av, undefined, { sensitivity: 'base', numeric: true });
}

const addedTime = (t) => (t && typeof t.addedAt === 'number' ? t.addedAt : 0);

function compareNumber(a, b, key) {
  const av = a && Number.isFinite(a[key]) && a[key] > 0 ? a[key] : Infinity;
  const bv = b && Number.isFinite(b[key]) && b[key] > 0 ? b[key] : Infinity;
  if (av === bv) return 0;
  return av < bv ? -1 : 1;
}

function sortTracks(tracks, mode) {
  const list = Array.isArray(tracks) ? tracks.slice() : [];
  if (mode === 'title-asc') return list.sort((a, b) => compareText(a, b, 'title'));
  if (mode === 'title-desc') return list.sort((a, b) => compareTextDesc(a, b, 'title'));
  // albums A to Z; inside an album its track order when known, otherwise the order the songs were added.
  // Songs without an album come last.
  if (mode === 'album-asc') {
    return list.sort((a, b) => compareText(a, b, 'album') || compareNumber(a, b, 'disc') || compareNumber(a, b, 'no') || addedTime(a) - addedTime(b));
  }
  if (mode === 'artist-asc') return list.sort((a, b) => compareText(a, b, 'artist'));
  if (mode === 'duration-asc') return list.sort((a, b) => compareNumber(a, b, 'duration'));
  if (mode !== 'added-desc' && mode !== 'added-asc') return list;
  const dir = mode === 'added-desc' ? -1 : 1;
  return list.sort((a, b) => {
    const at = addedTime(a);
    const bt = addedTime(b);
    if (at === bt) return 0;
    return at < bt ? -dir : dir;
  });
}

function backfillAddedAt(tracks, newestFirst) {
  if (!Array.isArray(tracks)) return tracks;
  const now = Date.now();
  let changed = false;
  const list = tracks.map((t, i) => {
    if (!t || typeof t.addedAt === 'number') return t;
    changed = true;
    return { ...t, addedAt: now - (newestFirst ? i : tracks.length - i) * 1000 };
  });
  return changed ? list : tracks;
}

if (typeof module !== 'undefined') module.exports = { TRACK_SORT_MODES, sortTracks, backfillAddedAt };
