/* KOOM — lyrics sources (browser-only): KOOM service, LRCLIB, Lyrics.ovh. Setting: Auto / Best / one source. Sync nudge per song. */
(function () {
  const NAMES = { koom: 'YouTube Transcript', lrclib: 'LRCLIB', ovh: 'Lyrics.ovh' }, MODES = [['auto', 'Auto (recommended)'], ['best', 'Best match'], ['koom', 'KOOM'], ['lrclib', 'LRCLIB'], ['ovh', 'Lyrics.ovh (plain text)']];
  const CACHE = new Map(), isSynced = s => /\[\d+:\d+(?:\.\d+)?\]/.test(s || '');
  const stamp = ms => { const v = ms / 1000; return `[${String(Math.floor(v / 60)).padStart(2, '0')}:${(v % 60).toFixed(2).padStart(5, '0')}]`; };
  const clean = s => String(s || '').replace(/\s*[\(\[][^)\]]*(feat|ft\.|official|video|audio|lyric|remaster|from\s|version|live)[^)\]]*[\)\]]/ig, '').replace(/\s+-\s+(remaster|official|from|live).*$/i, '').replace(/\s+/g, ' ').trim();
  async function jget(url, ms = 8000) {
    const c = new AbortController(), tm = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('http ' + r.status); return await r.json(); } finally { clearTimeout(tm); }
  }
  const meta = t => ({ id: t.c.videoId, title: clean(t.c.title || title(t)), artist: (t.c.artists && t.c.artists[0] && t.c.artists[0].n) || String(t.c.artist || '').split(',')[0].trim(), album: t.c.album || '', dur: Math.round(+t.c.duration || 0) });

  async function fromKoom(m) {
    let L = await mApi('/song/' + enc(m.id) + '/lyrics', { timestamps: true });
    if (!L || !L.lyrics) L = await mApi('/song/' + enc(m.id) + '/lyrics');
    const x = L && L.lyrics; if (!x) return '';
    return (Array.isArray(x) ? x.map(l => (l.start_time != null ? stamp(l.start_time) : '') + (l.text || '')).join('\n') : String(x)).trim();
  }
  async function fromLrclib(m) {
    if (!m.title || !m.artist) return '';
    const q = new URLSearchParams({ track_name: m.title, artist_name: m.artist }); if (m.album) q.set('album_name', m.album); if (m.dur) q.set('duration', m.dur);
    try { const d = await jget('https://lrclib.net/api/get?' + q); const s = d && (d.syncedLyrics || d.plainLyrics); if (s) return s.trim(); } catch (e) { }
    const l = await jget('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: m.title, artist_name: m.artist }));
    if (!Array.isArray(l) || !l.length) return '';
    const ok = l.filter(x => x.syncedLyrics || x.plainLyrics).sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || (Math.abs((a.duration || 0) - m.dur) - Math.abs((b.duration || 0) - m.dur)));
    const p = ok[0]; if (!p) return ''; if (m.dur && p.duration && Math.abs(p.duration - m.dur) > 15) return '';   // wrong version: timings would drift
    return (p.syncedLyrics || p.plainLyrics || '').trim();
  }
  async function fromOvh(m) {
    if (!m.title || !m.artist) return '';
    const d = await jget('https://api.lyrics.ovh/v1/' + enc(m.artist) + '/' + enc(m.title), 9000); return d && d.lyrics ? String(d.lyrics).replace(/\r/g, '').trim() : '';
  }
  const FN = { koom: fromKoom, lrclib: fromLrclib, ovh: fromOvh };
  async function one(k, m) { const key = m.id + '|' + k; if (CACHE.has(key)) return CACHE.get(key); let s = '', err = 0; try { s = await FN[k](m); } catch (e) { err = 1; } if (s && !isSynced(s) && s.split('\n').filter(Boolean).length < 3) s = ''; if (!err) CACHE.set(key, s); return s; }
  const score = s => (isSynced(s) ? 1000 : 0) + Math.min(400, s.split('\n').filter(x => x.trim()).length);

  async function resolve(m, mode) {
    const ORDER = ['koom', 'lrclib', 'ovh'];
    if (mode === 'best') {
      const R = await Promise.all(ORDER.map(async k => [k, await one(k, m)])); const b = R.filter(r => r[1]).sort((a, b) => score(b[1]) - score(a[1]))[0]; return b ? { k: b[0], s: b[1] } : null;
    }
    if (ORDER.includes(mode)) { const s = await one(mode, m); return s ? { k: mode, s } : null; }          // a chosen source is honoured: no silent fallback
    let plain = null;
    for (const k of ORDER) { const s = await one(k, m); if (!s) continue; if (isSynced(s)) return { k, s }; if (!plain) plain = { k, s }; }
    return plain;
  }
  window.getLy = async function (t) {
    if (t.lyr !== undefined) return; t.lyr = '';
    let s = t.c.lyrics; if (Array.isArray(s)) s = s.join('\n'); s = s || (t.tags && (t.tags.SYNCEDLYRICS || t.tags.LYRICS || t.tags.UNSYNCEDLYRICS)) || '';
    if (s) { t.lyr = String(s); t.lySrc = 'File'; return; }
    if (!t.c.videoId) return; const mode = S.lySrc || 'auto';
    try { const r = await resolve(meta(t), mode); if (r) { t.lyr = r.s; t.lySrc = NAMES[r.k]; } } catch (e) { }
  };

  /* sync nudge: shifts every timestamp of the song (stored per video) */
  const OFFK = 'koom.lyoff', offs = () => J.get(OFFK, {}), off = () => { const t = Q[qi]; return t ? (+offs()[t.c.videoId] || 0) : 0; };
  const _lrc = window.lrc;
  window.lrc = s => { const o = off(), r = _lrc(s); return o ? r.map(x => ({ t: Math.max(0, x.t + o), tx: x.tx, w: x.w.map(a => [a[0] + o, a[1]]) })) : r; };
  function nudge(d) { const t = Q[qi]; if (!t) return; const o = offs(); o[t.c.videoId] = d === 0 ? 0 : Math.round(((+o[t.c.videoId] || 0) + d) * 10) / 10; if (!o[t.c.videoId]) delete o[t.c.videoId]; J.set(OFFK, o); drawLy(); toast(d === 0 ? 'Lyrics sync reset' : 'Lyrics ' + (o[t.c.videoId] > 0 ? 'delayed ' : 'advanced ') + Math.abs(o[t.c.videoId] || 0) + 's'); }

  async function reload() {
    const t = Q[qi]; if (!t) return; t.lyr = undefined; delete t.lyEn; delete t.lySrc; const b = $('#ly'); if (b) b.innerHTML = '<div class="msg"><div class="lysk"></div><div class="lysk" style="width:70%"></div><div class="lysk" style="width:85%"></div></div>';
    t.lyForce = 1; await getLy(t); t.lyForce = 0;
    if (Q[qi] !== t) return; drawLy(); info();
    const mode = S.lySrc || 'auto', nm = (MODES.find(m => m[0] === mode) || MODES[0])[1].replace(/ \(.*\)/, '');
    if (t.lyr) { toast('Lyrics from ' + (t.lySrc || nm)); if (typeof OFF !== 'undefined' && OFF.has(t.url) && window.kIdb) window.kIdb('readwrite', s => s.put({ lyr: t.lyr }, 'lyr:' + t.url)).catch(() => { }); }
    else { const b = $('#ly'); if (b) b.innerHTML = `<div class="msg">No lyrics found on <b>${esc(nm)}</b> for this song.<br><button class="pill" id="lytry" style="margin:14px auto 0">Try Auto</button></div>`; toast('No lyrics on ' + nm); }
  }
  function srcMenu(a) {
    openMenu([...MODES.map(([k, l]) => ({ l, i: 'check', on: (S.lySrc || 'auto') === k, fn: () => { S.lySrc = k; saveS(); reload(); toast('Lyrics source: ' + l.replace(/ \(.*\)/, '')); } }))], a, 'Lyrics source');
  }
  function syncMenu(a) {
    openMenu([{ l: 'Lyrics come earlier  (−0.5 s)', i: 'back', fn: () => nudge(-.5) }, { l: 'Lyrics come later  (+0.5 s)', i: 'fwd', fn: () => nudge(.5) }, { l: 'Fine: −0.1 s', i: 'back', fn: () => nudge(-.1) }, { l: 'Fine: +0.1 s', i: 'fwd', fn: () => nudge(.1) }, { sep: 1 }, { l: 'Reset sync', i: 'refresh', fn: () => nudge(0) }], a, 'Fix lyric timing');
  }
  function info() {
    const el = $('#lyinfo'); if (!el) return; const t = Q[qi], has = !!(t && t.lyr), syn = has && isSynced(t.lyr), o = off();
    el.innerHTML = `<button class="lychip" id="lysrc" aria-label="Change lyrics source">${has ? (syn ? 'Synced' : 'Plain text') + ' · ' + esc(t.lySrc || 'Lyrics') : 'Lyrics source · ' + esc((MODES.find(m => m[0] === (S.lySrc || 'auto')) || MODES[0])[1].replace(/ \(.*\)/, ''))}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>` + (syn ? `<button class="lychip" id="lysync" aria-label="Fix lyric timing">${o ? (o > 0 ? '+' : '') + o + ' s' : 'Sync'}</button>` : '');
  }
  const _dl = window.drawLy; window.drawLy = function () { _dl.apply(this, arguments); info(); };
  document.addEventListener('click', e => { if (e.target.closest('#lytry')) { S.lySrc = 'auto'; saveS(); reload(); return; } const a = e.target.closest('#lysrc'); if (a) return srcMenu(a); const b = e.target.closest('#lysync'); if (b) syncMenu(b); });
  const mount = () => { const r = $('#lymodes'); if (!r || $('#lyinfo')) return !!r; r.insertAdjacentHTML('afterend', '<div class="lyinfo" id="lyinfo"></div>'); info(); return true; };
  if (!mount()) setTimeout(mount, 300);

  /* settings: source picker in the Lyrics group */
  const _ss = window.showSet;
  window.showSet = function () {
    _ss.apply(this, arguments);
    const g = V.querySelector('#st-lyr .sc'); if (g) g.insertAdjacentHTML('afterbegin', sr('Lyrics source', 'Auto tries KOOM, then LRCLIB, then Lyrics.ovh. Best match compares all three and keeps the most complete synced one.', sel('lySrc', MODES, S.lySrc || 'auto')));
  };
  V.addEventListener('change', e => { const s = e.target.closest('[data-kq="lySrc"]'); if (s) { S.lySrc = s.value; saveS(); reload(); } });
})();
