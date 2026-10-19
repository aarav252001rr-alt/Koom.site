/* KOOM — API data layer + views. Loaded after the main UI/player script (index.html). */
const NAME = () => LS.get('koom.name') || '', LISTS = {}, real = v => v && !/^YOUR_/.test(v);
let _ln = 0, RT = 0, FIRST = null;
const hum = k => k.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

/* ---------- HTTP (cache + in-flight dedupe + timeout) ---------- */
const _c = new Map(), _f = new Map();
const emsg = v => { const d = v && (v.error || v.detail || v.message); if (!d) return ''; return String(Array.isArray(d) ? d.map(x => x.msg || JSON.stringify(x)).join('; ') : typeof d === 'object' ? JSON.stringify(d) : d).slice(0, 160); };
async function http(base, path, { method = 'GET', params, body, ttl = 300000 } = {}) {
  if (!real(base)) throw new Error('config');
  const u = new URL(base.replace(/\/$/, '') + path);
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') u.searchParams.set(k, v);
  const key = method + u.href + (body ? JSON.stringify(body) : ''), c = _c.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  if (_f.has(key)) return _f.get(key);
  const h = { Accept: 'application/json' };
  if (body) h['Content-Type'] = 'application/json';
  const key0 = base === API_CONFIG.STREAM_API_URL ? API_CONFIG.API_KEY : API_CONFIG.MUSIC_API_KEY; if (real(key0)) h['X-API-Key'] = key0;
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
  const p = fetch(u, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal })
    .then(async r => { const v = await r.json().catch(() => null); if (!r.ok) throw new Error(emsg(v) || 'http ' + r.status); if (v == null) throw new Error('badjson'); if (ttl) _c.set(key, { t: Date.now(), v }); return v; })
    .finally(() => { clearTimeout(to); _f.delete(key); });
  _f.set(key, p); return p;
}
const mRaw = (p, q, o) => http(API_CONFIG.MUSIC_API_URL, p, { params: q, ...o });          // full envelope (has_more, matched…)
const mApi = (p, q, o) => mRaw(p, q, o).then(r => r && r.status === 'ok' && 'data' in r ? r.data : r);   // unwrap {status,data}
const enc = encodeURIComponent, SC = new Map();
const SBASE = () => API_CONFIG.STREAM_API_URL.replace(/\/$/, '');
const fix = raw => { const p = new URL(raw, SBASE() + '/'); return /^\/(stream|download)\//.test(p.pathname) ? SBASE() + p.pathname + p.search : p.href; };   // always use our configured (https) host
/* quality: presets map onto the real formats the Downloader API reports for each song (GET /formats) */
const KQP = [['best', 'Auto — best available'], ['high', 'High'], ['std', 'Standard'], ['low', 'Data saver']], EX = new Map();
const curQ = () => S.sq || LS.get('koom.q') || 'best', ytu = id => 'https://www.youtube.com/watch?v=' + id;
async function fmts(id) {
  const r = await http(API_CONFIG.STREAM_API_URL, '/formats', { params: { url: ytu(id) }, ttl: 6e5 });
  const a = Array.isArray(r) ? r : r.formats || r.audio_formats || r.results || [];
  return a.filter(f => f && (f.format_id || f.id) && (f.vcodec == null || f.vcodec === 'none' || f.audio_only === true || (f.acodec && f.acodec !== 'none' && !f.height)))
    .map(f => ({ id: String(f.format_id || f.id), ext: f.ext || f.container || '', abr: Math.round(f.abr || f.tbr || f.bitrate || 0), note: f.quality_label || f.format_note || f.quality || '', size: f.filesize || f.filesize_approx || 0 })).sort((a, b) => b.abr - a.abr);
}
const LV = { best: 'best', high: 'high', std: 'standard', low: 'low' };
const composeFmt = lv => { const l = LV[lv] || 'best'; return S.sf ? l + '-' + S.sf : l; };   // e.g. "high-m4a" (backend resolves it; old backends fall back to best)
async function pickFmt(id) { return EX.get(id) || composeFmt(curQ()); }
const dropSC = id => { for (const k of [...SC.keys()]) if (k.startsWith(id + '|')) SC.delete(k); };
async function streamUrl(id) {                       // Downloader API: POST /stream {url, format_id} -> stream_url (valid ~expires_in s)
  if (!/^[\w-]{11}$/.test(id)) throw new Error('Invalid video id');
  const fmt = await pickFmt(id), key = id + '|' + fmt, c = SC.get(key); if (c && Date.now() < c.exp) return c.u;
  const go = f => http(API_CONFIG.STREAM_API_URL, '/stream', { method: 'POST', body: { url: ytu(id), format_id: f }, ttl: 0 });
  let r; try { r = await go(fmt); } catch (e) { if (fmt === 'best') throw e; r = await go('best'); }
  const raw = r.stream_url || (r.token && 'stream/' + r.token); if (!raw) throw new Error('The stream service returned no stream URL');
  QINFO.set(id, { fmt: String(r.format_id || ''), ext: r.ext || '', kb: Math.round(+r.abr || +r.tbr || +r.bitrate || 0) });
  const u = fix(raw); SC.set(key, { u, exp: Date.now() + Math.max(30, (r.expires_in || 300) - 45) * 1000 }); return u;
}
async function fmtMenu(t, anchor, head, cur, cb) {
  try {
    const L = await fmts(t.c.videoId); if (!L.length) return toast('No quality options for this song');
    openMenu(L.map(f => ({ l: `${(f.ext || 'audio').toUpperCase()} · ${f.abr ? f.abr + ' kbps' : f.note || f.id}${f.size ? ' · ' + (f.size / 1048576).toFixed(1) + ' MB' : ''}`, i: 'check', on: cur === f.id, fn: () => cb(f.id) })), anchor, head);
  } catch (e) { toast('Quality options unavailable: ' + e.message); }
}
function qualityMenu(t, anchor) {
  const cur = EX.get(t.c.videoId);
  openMenu([{ l: 'Auto (use my setting)', i: 'check', on: !cur, fn: () => setFmt(t, null) }, ...KQP.slice(1).map(([k, l]) => ({ l, i: 'check', on: !cur && curQ() === k, fn: () => { S.sq = k; saveS(); SC.clear(); setFmt(t, null); } })), { sep: 1 }, { l: 'Choose exact format…', i: 'list', fn: () => fmtMenu(t, anchor, 'Audio quality', cur, id => setFmt(t, id)) }], anchor, 'Audio quality');
}
function setFmt(t, id) { id ? EX.set(t.c.videoId, id) : EX.delete(t.c.videoId); const c = Q[qi]; if (c && c.url === t.url) play(qi, A.currentTime || 0); toast('Audio quality updated'); }

/* ---------- normalisation (the only place that knows API shapes) ---------- */
const nm = v => typeof v === 'string' ? v : (v && (v.name || v.title || v.text)) || '';
function thumbOf(x, w = 544) {
  const th = x.thumbnails || x.thumbnail || x.thumb || x.cover || x.image || x.artwork;
  let u = Array.isArray(th) ? th[th.length - 1] : th; u = u && u.url ? u.url : u;
  if (typeof u !== 'string' || !/^https?:/.test(u)) return '';
  return u.replace(/=w\d+-h\d+[^&]*$/, `=w${w}-h${w}`).replace(/=s\d+(-c)?$/, `=s${w}`);
}
const secs = v => { if (typeof v === 'number') return v > 36000 ? v / 1000 : v; const m = String(v || '').split(':').map(Number); return m.length > 1 && m.every(isFinite) ? m.reduce((a, n) => a * 60 + n) : +v || 0; };
function norm(x, d = {}) {
  if (!x || typeof x !== 'object') return null;
  let title = nm(x.title || x.name || x.text), bid = x.browseId || x.browse_id || '', pid = x.playlistId || x.playlist_id || '';
  const vid = x.videoId || x.video_id || (typeof x.id === 'string' && x.id.length === 11 && !/^(UC|MP|VL|PL)/.test(x.id) ? x.id : '');
  let k = String(x.resultType || x.type || x.category || '').toLowerCase(), id;
  if (/artist/.test(k) || (!vid && /^UC/.test(x.channelId || bid || x.artistId || x.id || ''))) { k = 'artist'; id = x.channelId || x.artistId || bid || x.id; }
  else if (/album|single|\bep\b/.test(k) || /^MPRE/.test(bid || x.id || '')) { k = 'album'; id = bid || x.id || x.albumId; }
  else if (/playlist/.test(k) || (!vid && (pid || /^(VL|PL|RDCLAK|OLAK)/.test(bid || x.id || '')))) { k = 'playlist'; id = pid || bid || x.id; }
  else if (vid) { k = /video/.test(k) ? 'video' : 'song'; id = vid; } else return null;
  if (!title && k === 'artist') title = nm(x.artist || x.author);
  if (!title || !id) return null;
  const A = Array.isArray(x.artists) ? x.artists : null;
  const artist = (A ? A.map(nm).filter(Boolean).join(', ') : nm(x.artist || x.author || x.channel || x.uploader)) || d.artist || '';
  const al = x.album, album = nm(al) || d.album || '';
  let thumb = thumbOf(x, 320) || d.thumb || '', big = thumbOf(x, 800) || thumb; if (!thumb && vid) thumb = big = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  const yr = x.year || x.releaseYear || '';
  const sub = k === 'album' ? [artist, yr].filter(Boolean).join(' · ') : k === 'artist' ? (x.subscribers || 'Artist') : k === 'playlist' ? (nm(x.author || x.owner || x.subtitle) || 'Playlist') : artist;
  return { kind: k, id, title, artist, artists: (A ? A.map(a => ({ n: nm(a), id: a.id || a.browseId || '' })).filter(a => a.n) : artist ? [{ n: artist, id: x.artistId || x.channelId || d.artistId || '' }] : []), artistId: (A && A[0] && (A[0].id || A[0].browseId)) || x.artistId || x.channelId || d.artistId || '', album, albumId: (al && (al.id || al.browseId)) || x.albumId || d.albumId || '', thumb, big, dur: secs(x.duration_seconds ?? x.durationSeconds ?? x.lengthSeconds ?? x.length ?? x.duration), sub, rank: x.rank || x.position || 0 };
}
function extractSections(d, def) {
  const out = [], list = a => a.map(i => norm(i)).filter(Boolean), K = ['contents', 'items', 'results', 'songs', 'tracks'];
  const walk = (v, t, depth = 0) => {
    if (depth > 4) return;
    if (Array.isArray(v)) {
      if (!v.length) return;
      if (v.every(x => x && typeof x === 'object' && K.some(k => Array.isArray(x[k])))) return v.forEach(s => walk(s[K.find(k => Array.isArray(s[k]))], s.title || s.name || t, depth + 1));
      const it = list(v); if (it.length) out.push({ title: t || def, items: it });
    } else if (v && typeof v === 'object') {
      const a = ['sections', 'shelves', ...K, 'data'].find(k => Array.isArray(v[k]));
      if (a) walk(v[a], v.title || t, depth + 1);
      else Object.entries(v).forEach(([k, x]) => { if (x && typeof x === 'object') walk(x, Array.isArray(x) ? hum(k) : t, depth + 1); });
    }
  };
  walk(d, def);
  const seen = new Set(); return out.filter(s => { const k = s.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
const flat = d => extractSections(d, '').flatMap(s => s.items);

/* ---------- tracks / lists ---------- */
function reg(x) {
  const url = 'yt:' + x.id, e = TM.get(url); if (e) return e.t;
  const t = { url, tags: {}, alt: '', c: { title: x.title, artist: x.artist, album: x.album, cover: x.thumb, big: x.big, artists: x.artists, duration: x.dur, videoId: x.id, artistId: x.artistId, albumId: x.albumId } };
  TM.set(url, { t, p: null }); return t;
}
function mkList(tracks, name) {
  const ks = Object.keys(LISTS).filter(k => k !== '~search'); if (ks.length > 80) delete LISTS[ks[0]];
  const id = '~k' + (++_ln); return LISTS[id] = { id, name, tracks };
}
const _byId = byId; window.byId = id => LISTS[id] || _byId(id);
window.qual = () => ({ label: '', hi: false, spec: '' });
window.enrich = async () => 0; const DQP = [['ask', 'Ask every time'], ['best', 'Best available'], ['high', 'High'], ['std', 'Standard'], ['low', 'Data saver']];
async function dl(t, how, anchor) {
  if (!t || !t.c.videoId) return;
  const lv = how || EX.get(t.c.videoId) && 'f:' + EX.get(t.c.videoId) || S.dq || 'ask';
  if (lv === 'ask') return openMenu([...DQP.slice(1).map(([k, l]) => ({ l, i: 'dl', fn: () => dl(t, k) })), { sep: 1 }, { l: 'Choose exact format…', i: 'list', fn: () => fmtMenu(t, anchor, 'Download quality', '', id => dl(t, 'f:' + id)) }], anchor, 'Download quality');
  toast('Preparing download… this can take a few seconds');
  try {
    const r = await http(API_CONFIG.STREAM_API_URL, '/download', { method: 'POST', body: { url: ytu(t.c.videoId), format_id: lv.startsWith('f:') ? lv.slice(2) : composeFmt(lv) }, ttl: 0 });
    const a = document.createElement('a'); a.href = fix(r.download_url || r.stream_url); a.download = r.filename || ''; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
    toast('Download started' + (r.source_quality ? ' · ' + r.source_quality : ''));
  } catch (e) { toast('Download failed: ' + (e.message === 'config' ? 'stream service is not configured.' : e.message)); }
}
window.dl = dl;
const persist = () => { const keep = new Set([...FAV, ...HIST.map(h => h.u), ...UPL.flatMap(p => p.urls), ...Q.slice(0, 100).map(t => t.url)]), o = {}; keep.forEach(u => { const e = TM.get(u); if (e) o[u] = e.t.c; }); J.set('koom.tracks', o); };
['logPlay', 'toggleFav', 'addToPl'].forEach(n => { const f = window[n]; window[n] = function () { const r = f.apply(this, arguments); persist(); return r; }; });

/* ---------- playback via Stream API ---------- */
let failN = 0;
window.resolveSrc = async t => {
  document.body.classList.add('kbuf');
  try { const u = await streamUrl(t.c.videoId); setTimeout(qChips, 0); return u; }
  catch (e) {
    document.body.classList.remove('kbuf'); failN++;
    setTimeout(() => toast(e.message === 'config' ? 'Stream service is not configured yet.' : /bot-check|not a bot|sign in/i.test(e.message) ? 'YouTube is blocking the music server right now. Try again later.' : 'Can’t play this song: ' + String(e.message).slice(0, 140)), 60);
    if (S.skip && failN <= 2 && !/bot-check|not a bot|sign in|config/i.test(e.message)) setTimeout(() => { if (Q[qi] === t && Q[qi + 1]) nxt(1); }, 2200);   // skip an unplayable song (max 2 in a row)
    return '';
  }
};
A.addEventListener('playing', () => { failN = 0; document.body.classList.remove('kbuf'); });
A.addEventListener('waiting', () => document.body.classList.add('kbuf'));
let pf = '';   // warm the next song's stream URL shortly before the current one ends (starts instantly instead of ~6 s)
A.addEventListener('timeupdate', () => { const d = A.duration, n = Q[qi + 1]; if (!S.pf || !d || !isFinite(d) || shuffle || !n || !n.c.videoId || d - A.currentTime > 50 || pf === n.url) return; pf = n.url; streamUrl(n.c.videoId).catch(() => { }); });
let retried = '';
A.onerror = () => {
  const t = Q[qi]; if (!A.getAttribute('src') || !t) return; dropSC(t.c.videoId);
  if (retried !== t.url) { retried = t.url; return play(qi, A.currentTime || 0); }   // expired token: fetch a fresh stream once
  toast('This song can’t be played right now. Try another one.');
};
window.getLy = async t => {
  if (t.lyr !== undefined) return; t.lyr = '';
  const id = enc(t.c.videoId), mm = ms => { const v = ms / 1000; return `[${String(Math.floor(v / 60)).padStart(2, '0')}:${(v % 60).toFixed(2).padStart(5, '0')}]`; };
  try {
    let L = await mApi('/song/' + id + '/lyrics', { timestamps: true });
    if (!L || !L.lyrics) L = await mApi('/song/' + id + '/lyrics');
    const x = L && L.lyrics; if (!x) return;
    t.lyr = (Array.isArray(x) ? x.map(l => (l.start_time != null ? mm(l.start_time) : '') + (l.text || '')).join('\n') : String(x)).trim();
  } catch (e) { t.lyr = ''; }
};
/* radio / autoplay: GET /quick-play/{id} (fallback /radio, /related) -> queue */
let radioBusy = 0;
async function fillRadio(t, force) {
  if (!t || !t.c.videoId || radioBusy || !S.autoplay || (!force && Q.length - qi > 3)) return;
  radioBusy = 1;
  try {
    let d; for (const p of ['/radio/', '/quick-play/', '/related/']) { try { d = await mApi(p + enc(t.c.videoId)); if (flat(d).length) break; } catch (e) { } }
    const have = new Set(Q.map(x => x.url));
    flat(d || []).filter(x => (x.kind === 'song' || x.kind === 'video') && !have.has('yt:' + x.id)).slice(0, 15).forEach(x => { const r = reg(x); r.rec = 1; Q.push(r); });
    drawQ();
  } catch (e) { }
  radioBusy = 0;
}
const _play = window.play;
window.play = function (i, r, k) { const x = _play(i, r, k), t = Q[i]; if (t && !r) { persist(); setTimeout(() => fillRadio(t), 800); } return x; };
window.autoNext = async () => { const n = Q.length; await fillRadio(Q[qi], true); if (Q.length > n) play(n); else toast('No more recommendations right now.'); };

/* queue: Now Playing / Up Next / Recommended + reorder/remove/play now */
const GRIP = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="4" y="6.6" width="16" height="2.4" rx="1.2"/><rect x="4" y="10.8" width="16" height="2.4" rx="1.2"/><rect x="4" y="15" width="16" height="2.4" rx="1.2"/></svg>';
window.drawQ = function () {
  npInfo(); const el = $('#qq'); if (!Q.length) { el.innerHTML = '<div class="msg">Your queue is empty.</div>'; return; }
  let g = '', h = `<div class="qtop"><b>Queue · ${Q.length}</b><small class="qhint">Hold ≡ and drag to reorder</small></div>`;
  Q.forEach((t, i) => {
    const G = i < qi ? 'Played' : i === qi ? 'Now Playing' : t.rec ? 'Recommended' : 'Up Next';
    if (G !== g) { g = G; h += `<div class="qh">${G}</div>`; }
    h += `<div class="qr ${i === qi ? 'cur' : ''}" data-i="${i}" tabindex="0" role="button"><img src="${esc(cover(t))}" alt="" loading="lazy" decoding="async"><div><b>${esc(title(t))}</b><small>${esc(artist(t))}</small></div><button class="qgrip" aria-label="Reorder: drag, or press the up and down arrow keys">${GRIP}</button>${i === qi ? '<span></span>' : `<button class="ib sm" data-x aria-label="Remove">${ic('x', 16)}</button>`}</div>`;
  });
  el.innerHTML = h;
};
function qMove(from, to) {
  if (from === to || to < 0 || to >= Q.length) return; const cur = Q[qi]; const [it] = Q.splice(from, 1); it.rec = 0; Q.splice(to, 0, it); qi = Q.indexOf(cur); drawQ(); saveSess();
}
function qgrab(e) {                                   // drag a queue row up/down (touch + mouse)
  const g = e.target.closest('.qgrip'); if (!g || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const list = $('#qq'), rows = [...list.querySelectorAll('.qr')], row = g.closest('.qr'), from = rows.indexOf(row); if (from < 0) return;
  e.preventDefault(); e.stopPropagation(); try { g.setPointerCapture(e.pointerId); } catch (x) { } navigator.vibrate && navigator.vibrate(12);
  const lt = list.getBoundingClientRect().top, s0 = list.scrollTop, r0 = rows.map(r => r.getBoundingClientRect()), ct = r0.map(r => r.top - lt + s0), h = r0[from].height;
  const step = from < rows.length - 1 ? ct[from + 1] - ct[from] : ct[from] - ct[Math.max(0, from - 1)] || h, y0 = e.clientY; let py = y0, to = from, raf = 0;
  row.classList.add('drag'); list.classList.add('dragging');
  const apply = () => {
    const dy = py - y0 + (list.scrollTop - s0); row.style.transform = `translateY(${dy}px) scale(1.02)`;
    const cy = ct[from] + h / 2 + dy; to = from;
    rows.forEach((r, i) => { const mid = ct[i] + r0[i].height / 2; if (i < from && cy < mid) to = Math.min(to, i); if (i > from && cy > mid) to = Math.max(to, i); });
    rows.forEach((r, i) => { if (i === from) return; r.style.transform = from < to && i > from && i <= to ? `translateY(${-step}px)` : from > to && i >= to && i < from ? `translateY(${step}px)` : ''; });
  };
  const loop = () => { const lr = list.getBoundingClientRect(); if (py < lr.top + 64) list.scrollTop -= 10; else if (py > lr.bottom - 64) list.scrollTop += 10; apply(); raf = requestAnimationFrame(loop); };
  loop();
  const mv = ev => { py = ev.clientY; }, done = () => {
    cancelAnimationFrame(raf); g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', done); g.removeEventListener('pointercancel', done);
    list.classList.remove('dragging'); rows.forEach(r => { r.style.transform = ''; r.classList.remove('drag'); }); qMove(from, to);
  };
  g.addEventListener('pointermove', mv); g.addEventListener('pointerup', done); g.addEventListener('pointercancel', done);
}
$('#qq').addEventListener('pointerdown', qgrab);
$('#qq').addEventListener('contextmenu', e => { if (e.target.closest('.qgrip')) e.preventDefault(); });
$('#qq').addEventListener('keydown', e => {
  const g = e.target.closest('.qgrip'); if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return; e.preventDefault();
  const i = +g.closest('.qr').dataset.i, n = i + (e.key === 'ArrowUp' ? -1 : 1); qMove(i, n);
  const f = $(`#qq .qr[data-i="${Math.max(0, Math.min(Q.length - 1, n))}"] .qgrip`); f && f.focus();
});
$('#qq').addEventListener('click', e => { if (e.target.closest('.qgrip')) { e.stopPropagation(); return; }
  const b = e.target.closest('[data-mv]'); if (!b) return; e.stopPropagation();
  const i = +b.closest('.qr').dataset.i, j = i + +b.dataset.mv; if (j < 0 || j >= Q.length || j === qi) return;
  [Q[i], Q[j]] = [Q[j], Q[i]]; drawQ();
}, true);

/* ---------- view helpers ---------- */
const sh = (h, more) => `<div class="sech"><h2>${h}</h2>${more || ''}</div>`;
const cardX = (x, attr) => `<div class="card k" tabindex="0" role="link" ${attr || `data-kd="${x.kind}" data-id="${esc(x.id)}"`}><div class="art ${x.kind === 'artist' ? 'rnd' : ''}"><img src="${esc(x.thumb || PH)}" alt="" loading="lazy" decoding="async"></div><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></div>`;
function cards(items, name) {
  const songs = items.filter(x => x.kind === 'song' || x.kind === 'video'), L = mkList(songs.map(reg), name); let n = 0;
  return `<div class="hr">${items.map(x => (x.kind === 'song' || x.kind === 'video') ? cardX(x, `data-l="${L.id}" data-i="${n++}"`) : cardX(x)).join('')}</div>`;
}
function renderSections(ss, { rank } = {}) {
  FIRST = null;
  return ss.map(s => {
    const songs = s.items.filter(x => x.kind === 'song' || x.kind === 'video');
    if (songs.length && songs.length >= s.items.length / 2) { const T = songs.map(reg), L = mkList(T, s.title); FIRST = FIRST || L; return sh(esc(s.title)) + hdr + songs.map((x, i) => row(T[i], i, L, rank && x.rank ? x.rank : i + 1)).join(''); }
    return sh(esc(s.title)) + cards(s.items, s.title);
  }).join('');
}
const skel = k => k === 'list' ? `<div class="phead"><div class="pa shim"></div><div class="pt"><div class="shim ln" style="width:60%;height:34px"></div><div class="shim ln" style="width:35%"></div></div></div>${'<div class="shim ln" style="height:46px;margin:8px 0"></div>'.repeat(8)}` : `<div class="shim ln" style="width:200px;height:22px;margin:26px 0 14px"></div><div class="hr">${'<div class="card"><div class="art shim"></div><div class="shim ln" style="margin-top:10px"></div></div>'.repeat(8)}</div>`.repeat(2);
const errMsg = e => e && e.message === 'config' ? 'KOOM isn’t connected to a music service yet. Add your API URLs in config.js.' : e && /^(http 404|http 501)/.test(e.message) ? 'This section isn’t available on the music service yet.' : 'Music service is temporarily unavailable.';
const errBox = e => `<div class="msg err"><b>Something went wrong.</b><br>${errMsg(e)}<br><button class="pill pri" data-act="retry" style="margin:16px auto 0">Try Again</button></div>`;
function setV(h, my) { if (my != null && my !== RT) return false; V.innerHTML = h + (h.includes('kfoot') ? '' : footer()); syncHearts(); markCur(); return true; }
const listHead = o => { const L = o.list; return `<div class="phead"><img class="pa" src="${esc(o.thumb || PH)}" alt=""><div class="pt"><span class="kick">${o.kick}</span><h1>${esc(o.title)}</h1>${o.desc ? `<p class="lead clamp">${esc(o.desc)}</p>` : ''}<p class="meta">${o.meta}</p><div class="btns"><button class="pill pri" data-act="pplay" data-pid="${L.id}">${ic('play', 18)}Play</button><button class="pill" data-act="pshuf" data-pid="${L.id}">${ic('shuf', 18)}Shuffle</button><button class="pill" data-act="qall" data-pid="${L.id}">${ic('qadd', 18)}Add to Queue</button><button class="pill" data-act="dlall" data-pid="${L.id}">${ic('dl', 18)}Download</button>${o.lib || ''}</div></div></div>`; };
const trackPage = (d, kick, my, key, rid) => {
  d = d || {};
  const info = d[key] || d, arr = d.tracks || d.songs || d.items || info.tracks || info.songs || [], th = thumbOf(info) || thumbOf(d);
  const def = { thumb: th, artist: nm(info.artist || info.artists || info.author || info.owner), album: key === 'album' ? nm(info.title || info.name) : '' }; if (Array.isArray(info.artists)) def.artist = info.artists.map(nm).filter(Boolean).join(', ');
  if (key === 'album' && info.type) kick = String(info.type).toUpperCase();
  const T = arr.map(x => norm(x, def)).filter(x => x && (x.kind === 'song' || x.kind === 'video')), L = mkList(T.map(reg), nm(info.title || info.name));
  const tot = T.reduce((a, x) => a + x.dur, 0), meta = [info.year || info.releaseDate || '', `${T.length} tracks`, tot ? Math.round(tot / 60) + ' min' : '', (Array.isArray(info.artists) ? info.artists.map(nm).join(', ') : nm(info.artist || info.author || info.owner))].filter(Boolean).map(esc).join(' · ');
  return setV(listHead({ list: L, thumb: th, kick, title: nm(info.title || info.name) || kick, desc: info.description || '', meta, lib: rid ? libBtn(key === 'album' ? 'albums' : 'playlists', rid, nm(info.title || info.name) || kick, def.artist || '', th) : '' }) + (T.length ? hdr + T.map((x, i) => row(L.tracks[i], i, L, i + 1)).join('') : '<div class="msg">No tracks found.</div>'), my);
};

/* ---------- views ---------- */
const quickLinks = () => `<div class="qlinks">${[['#/trending', 'bolt', 'Trending'], ['#/new', 'refresh', 'New releases'], ['#/browse', 'logo', 'Browse'], ['#/library', 'lib', 'Library'], ['#/downloads', 'dldone', 'Downloads'], ['#/stats', 'clock', 'Insights']].map(([h, i, l]) => `<a href="${h}">${ic(i, 18)}<span>${l}</span></a>`).join('')}</div>`;
function homeHero() {
  const cont = Q[qi] || byId('~hist').tracks[0]; if (!cont) return '';
  return `<div class="chero"><img class="chbg" src="${esc(cover(cont))}" alt=""><div class="chin"><img class="chart" src="${esc(cover(cont))}" alt="" width="84" height="84"><div class="cht"><span>${Q[qi] ? 'Continue listening' : 'Play it again'}</span><b>${esc(title(cont))}</b><small>${esc(artist(cont))}</small></div><button class="pill pri chp" data-act="hplay" aria-label="Play">${ic('play', 22)}</button></div></div>`;
}
async function showHome() {
  view = 'home'; const my = RT, h = new Date().getHours(), g = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
  const head = `<h1 class="lt">${g}, ${esc(NAME())}</h1><p class="lead">${esc(APP.tagline)}</p>` + quickLinks(), hero = homeHero(), rc = byId('~hist').tracks.slice(0, 12);
  const recent = rc.length ? sh('Recently Played', '<a href="#/history">See All</a>') + `<div class="hr">${rc.map((t, i) => `<div class="card rc" data-i="${i}" data-u="${esc(t.url)}" tabindex="0" role="button"><div class="art"><img src="${esc(cover(t))}" alt="" loading="lazy"></div><b>${esc(title(t))}</b><small>${esc(artist(t))}</small></div>`).join('')}</div>` : '';
  setV(head + hero + skel('cards'), my);
  const gs = J.get('koom.genres', []).slice(0, 3).map(g => ['Made For You · ' + g, '/search', '', { q: g + ' mix', filter: 'playlists', limit: 12 }]);
  const E = [['Quick Picks', '/home', '', { limit: 20 }], ...gs, ['Trending Now', '/charts', '#/trending'], ['New Releases', () => mRaw('/new-releases').then(r => r.matched ? r.data : Promise.reject(new Error('none'))), '#/new']];
  const R = await Promise.allSettled(E.map(e => typeof e[1] === 'function' ? e[1]() : mApi(e[1], e[3])));
  if (my !== RT) return;
  const seen = new Set(); let body = '', ok = 0;
  R.forEach((r, i) => {
    if (r.status !== 'fulfilled') return; ok++;
    extractSections(r.value, E[i][0]).forEach((s, j) => {
      const k = s.title.toLowerCase(); if (seen.has(k)) return; seen.add(k);
      body += sh(esc(s.title), j === 0 && E[i][2] ? `<a href="${E[i][2]}">See All</a>` : '') + cards(s.items.slice(0, 20), s.title);
    });
  });
  if (!ok) return setV(head + hero + recent + errBox(R[0].reason), my);
  setV(head + hero + recent + (body || '<div class="msg">Nothing to show yet.</div>'), my);
}
async function showTrend() { view = 'trending'; await simple('Trending', ['/trending', '/charts'], 'Trending', 1); }
async function showNew() {
  view = 'new'; const my = RT, head = '<h1 class="lt">New Releases</h1>'; setV(head + skel('cards'), my);
  try {
    const r = await mRaw('/new-releases'); let ss = r.matched ? extractSections(r.data, 'New Releases') : [];
    if (!ss.length) ss = [{ title: 'New Albums & Singles', items: flat(await mApi('/search', { q: 'new releases ' + new Date().getFullYear(), filter: 'albums', limit: 30 })) }];
    if (my === RT) setV(head + renderSections(ss), my);
  } catch (e) { setV(head + errBox(e), my); }
}
async function simple(t, eps, def, rank) {
  const my = RT, head = `<h1 class="lt">${t}</h1>`; setV(head + skel('cards'), my);
  const R = await Promise.allSettled(eps.map(e => mApi(e))); if (my !== RT) return;
  const ss = R.flatMap(r => r.status === 'fulfilled' ? extractSections(r.value, def) : []), seen = new Set();
  const u = ss.filter(s => !seen.has(s.title.toLowerCase()) && seen.add(s.title.toLowerCase()));
  setV(head + (u.length ? renderSections(u, { rank }) : R.every(r => r.status === 'rejected') ? errBox(R[0].reason) : '<div class="msg">Nothing here yet.</div>'), my);
}
async function showArtist(id) {
  view = ''; const my = RT; setV(skel('list'), my);
  try {
    const [a, b] = await Promise.allSettled([mApi('/artist/' + enc(id)), mApi('/artist/' + enc(id) + '/albums')]); if (a.status !== 'fulfilled') throw a.reason;
    const d = a.value, info = d.artist || d, th = thumbOf(info, 800) || thumbOf(d, 800), ss = extractSections(d, 'Popular Songs');
    if (b.status === 'fulfilled') extractSections(b.value, 'Albums').forEach(s => { const k = ss.findIndex(x => x.title === s.title); if (k < 0) ss.push(s); else if (s.items.length > ss[k].items.length) ss[k] = s; });
    const body = renderSections(ss), bio = info.description || info.bio || '';
    setV(`<div class="ahero"><div class="abg" style="background-image:url('${esc(th)}')"></div><div class="at"><span class="kick">ARTIST</span><h1>${esc(nm(info.name || info.title) || 'Artist')}</h1>${info.subscribers ? `<p class="meta">${esc(info.subscribers)}</p>` : ''}${bio ? `<p class="lead clamp">${esc(bio)}</p>` : ''}${FIRST ? `<div class="btns"><button class="pill pri" data-act="pplay" data-pid="${FIRST.id}">${ic('play', 18)}Play</button><button class="pill" data-act="pshuf" data-pid="${FIRST.id}">${ic('shuf', 18)}Shuffle</button>${libBtn('artists', id, nm(info.name || info.title) || 'Artist', 'Artist', th)}</div>` : `<div class="btns">${libBtn('artists', id, nm(info.name || info.title) || 'Artist', 'Artist', th)}</div>`}</div></div>` + (body || '<div class="msg">No content for this artist yet.</div>'), my);
  } catch (e) { setV(errBox(e), my); }
}
async function showAlbum(id) { view = ''; const my = RT; setV(skel('list'), my); try { trackPage(await mApi('/album/' + enc(id)), 'ALBUM', my, 'album', id); } catch (e) { setV(errBox(e), my); } }
async function showRemotePl(id) { view = ''; const my = RT; setV(skel('list'), my); try { trackPage(await mApi('/playlist/' + enc(id)), 'PLAYLIST', my, 'playlist', id); } catch (e) { setV(errBox(e), my); } }

/* search: suggestions (debounced), tabs, infinite scroll + load more */
const SQ = { q: '', f: 'all', items: [], page: 1, done: 1, busy: 0, io: null }, TABS = [['all', 'All'], ['songs', 'Songs'], ['videos', 'Videos'], ['artists', 'Artists'], ['albums', 'Albums'], ['playlists', 'Playlists']];
const KL = { artist: 'Artists', album: 'Albums', playlist: 'Playlists' };
function showSearch() {
  view = 'search'; SQ.io && SQ.io.disconnect();
  V.innerHTML = `<h1 class="lt">Search</h1><div class="sw2"><input class="sbox" id="sq" placeholder="Search songs, artists, albums, playlists..." aria-label="Search" autocomplete="off"><button class="mic" id="smic" aria-label="Voice search" type="button"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="sclr" id="sclr" type="button" aria-label="Clear search" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="sug" id="sug" hidden></div></div><div class="stabs" id="stabs">${TABS.map(([k, l]) => `<button data-f="${k}" class="${SQ.f === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="sr"></div><div id="smore"></div>` + footer();
  const s = $('#sq'); s.value = SQ.q; let tm; const cl = $('#sclr'), cs0 = () => { cl.hidden = !s.value; $('.sw2').classList.toggle('hasq', !!s.value); }; cs0();
  cl.onclick = () => { s.value = ''; sqv = ''; SQ.q = ''; SQ.items = []; SQ.page = 1; SQ.done = 1; clearTimeout(tm); $('#sug').hidden = true; $('#sr').innerHTML = '<div class="msg">Search for songs, artists, albums and playlists.</div>'; $('#smore').innerHTML = ''; cs0(); s.focus(); };
  s.addEventListener('input', cs0); s.addEventListener('sync', cs0); s.addEventListener('keydown', e => { if (e.key === 'Escape' && s.value) { e.stopPropagation(); cl.click(); } }); { const mic = $('#smic'); if (mic) mic.onclick = () => voiceSearch(mic); }
  s.oninput = () => { sqv = s.value; clearTimeout(tm); const q = s.value.trim(); if (q.length < 2) { $('#sug').hidden = true; return; } tm = setTimeout(async () => { try { const d = await mApi('/suggestions', { q }), a = (Array.isArray(d) ? d : d.suggestions || d.results || []).map(x => typeof x === 'string' ? x : x.text || x.query || x.title).filter(Boolean).slice(0, 8); if (s.value.trim() !== q) return; $('#sug').innerHTML = a.map(x => `<button data-s="${esc(x)}">${esc(x)}</button>`).join(''); $('#sug').hidden = !a.length; } catch (e) { } }, 400);
  };
  s.onkeydown = e => { if (e.key === 'Enter') runSearch(s.value.trim()); };
  const hs = () => J.get('koom.sh', []);
  s.onfocus = () => { const h = hs(); if (!h.length || s.value) return; $('#sug').innerHTML = h.map(x => `<button data-s="${esc(x)}">${ic('clock', 14)} ${esc(x)}</button>`).join('') + '<button data-clr="1" style="color:var(--mute)">Clear history</button>'; $('#sug').hidden = false; };
  $('#sug').onclick = e => { if (e.target.closest('[data-clr]')) { J.set('koom.sh', []); $('#sug').hidden = true; return; } const b = e.target.closest('[data-s]'); if (b) { s.value = b.dataset.s; runSearch(b.dataset.s); } };
  $('#stabs').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { SQ.f = b.dataset.f; showSearch(); if (SQ.q) runSearch(SQ.q, 1); } };
  SQ.io = new IntersectionObserver(en => { if (en[0].isIntersecting) moreSearch(); }, { rootMargin: '400px' }); SQ.io.observe($('#smore'));
  if (SQ.q && SQ.items.length) drawResults(); else $('#sr').innerHTML = '<div class="msg">Search for songs, artists, albums and playlists.</div>';
}
async function runSearch(q, keep) {
  if (!q) return; { const e0 = $('#sq'); e0 && e0.dispatchEvent(new Event('sync')); } J.set('koom.sh', [q, ...J.get('koom.sh', []).filter(x => x !== q)].slice(0, 8)); $('#sug').hidden = true; if (!keep) { SQ.q = q; SQ.items = []; SQ.page = 1; SQ.done = 0; }
  SQ.q = q; $('#sr').innerHTML = skel('list').replace(/<div class="phead">.*?<\/div><\/div><\/div>/, ''); SQ.items = []; SQ.page = 1; SQ.done = 0; await moreSearch(1);
}
async function moreSearch(first) {
  if (SQ.busy || SQ.done || !SQ.q || view !== 'search') return; SQ.busy = 1; const q = SQ.q, f = SQ.f;
  try {
    const d = await mRaw('/search', { q, filter: f === 'all' ? '' : f, limit: 30, page: SQ.page }); if (q !== SQ.q || f !== SQ.f) return;
    const have = new Set(SQ.items.map(x => x.kind + x.id)), n = flat(d.data || []).filter(x => !have.has(x.kind + x.id));
    SQ.items.push(...n); SQ.page++; SQ.done = !d.has_more || !n.length; drawResults();
  } catch (e) { if (view === 'search' && !SQ.items.length) $('#sr').innerHTML = errBox(e); }
  SQ.busy = 0;
}
function drawResults() {
  const L = LISTS['~search'] = LISTS['~search'] || { id: '~search', name: 'Search', tracks: [] }, T = [], rows = [], by = {};
  SQ.items.forEach(x => { if (x.kind === 'song' || x.kind === 'video') { const t = reg(x); rows.push(row(t, T.length, L, T.length + 1)); T.push(t); } else (by[x.kind] = by[x.kind] || []).push(x); }); L.tracks = T;
  const h = (rows.length ? (SQ.f === 'all' ? sh('Songs & Videos') : '') + hdr + rows.join('') : '') + Object.entries(by).map(([k, a]) => (SQ.f === 'all' ? sh(KL[k]) : '') + `<div class="grid">${a.map(x => cardX(x)).join('')}</div>`).join('');
  $('#sr').innerHTML = h || '<div class="msg">No results found.</div>'; syncHearts(); markCur();
  $('#smore').innerHTML = !SQ.done && h ? '<button class="pill" data-act="more" style="margin:24px auto">Load More</button>' : '';
}

/* ---------- welcome / about / legal / footer / settings ---------- */
const wsleep = ms => new Promise(r => setTimeout(r, ms));
const WBG = '<div class="wbg"></div><div class="wo wo1"></div><div class="wo wo2"></div>';
const wdots = n => `<div class="wdots" aria-hidden="true"><i class="${n === 1 ? 'on' : ''}"></i><i class="${n === 2 ? 'on' : ''}"></i></div>`;
function welcome() {
  if (NAME()) return Promise.resolve();
  return new Promise(res => {
    const w = document.createElement('div'); w.id = 'wel'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Welcome to KOOM');
    w.innerHTML = `${WBG}<div class="wc"><img class="wlogo" src="icon-192.png" alt="" width="84" height="84"><div class="wl">${APP.name}</div><p class="wt">${APP.tagline}</p>${wdots(1)}<h1>Welcome to ${APP.name}</h1><p class="ws">What should we call you?</p>
      <label class="wfield"><input id="wn" maxlength="30" placeholder="Your name" aria-label="Your name" autocomplete="given-name" autocapitalize="words" enterkeyhint="go" spellcheck="false"><span class="wline"></span></label>
      <p class="whint" id="whint">Stored only on this device</p><button class="pill pri wbtn" id="wgo" disabled>Continue</button></div>${wcredit()}`;
    document.body.append(w); const i = $('#wn'), btn = $('#wgo'), hint = $('#whint'); setTimeout(() => i.focus(), 500);
    mApi('/trending').then(d => { const a = flat(d).filter(x => x.thumb).slice(0, 8); if (a.length) $('.wbg').innerHTML = a.map(x => `<img src="${esc(x.thumb)}" alt="">`).join(''); }).catch(() => { });
    i.oninput = () => { btn.disabled = !i.value.trim(); hint.textContent = 'Stored only on this device'; hint.classList.remove('bad'); };
    const fin = n => { w.innerHTML = `${WBG}<div class="wc"><div class="wok"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h1 class="wh">Welcome, ${esc(n)}</h1></div>`; setTimeout(() => { w.classList.add('out'); setTimeout(() => { w.remove(); res(); }, 600); }, 1500); };
    const go = () => { const n = i.value.trim().replace(/\s+/g, ' '); if (!n) { hint.textContent = 'Please enter your name'; hint.classList.add('bad'); i.focus(); return; } LS.set('koom.name', n); pickGenres(w, () => fin(n), 2); };
    btn.onclick = go; i.onkeydown = e => { if (e.key === 'Enter') go(); };
  });
}
/* ---------- social links: real brand logos, any number of accounts ---------- */
/* Brand marks (24x24 viewBox). `bg` = tile colour, `fg` = glyph colour. */
const BRAND = {
  instagram: { n: 'Instagram', bg: 'linear-gradient(45deg,#f9ce34,#ee2a7b 55%,#6228d7)', fg: '#fff', url: 'https://instagram.com/', at: 1,
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.3" cy="6.7" r="1.15" fill="currentColor" stroke="none"/></svg>' },
  youtube: { n: 'YouTube', bg: '#ff0000', fg: '#fff', url: 'https://youtube.com/', at: 1,
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
  github: { n: 'GitHub', bg: '#24292f', fg: '#fff', url: 'https://github.com/',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>' },
  x: { n: 'X', bg: '#000', fg: '#fff', url: 'https://x.com/', at: 1,
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>' },
  telegram: { n: 'Telegram', bg: '#229ed9', fg: '#fff', url: 'https://t.me/', at: 1,
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7.85 12c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.53 1.73z"/></svg>' },
  whatsapp: { n: 'WhatsApp', bg: '#25d366', fg: '#fff', url: 'https://wa.me/',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>' },
  linkedin: { n: 'LinkedIn', bg: '#0a66c2', fg: '#fff', url: 'https://linkedin.com/in/',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' },
  facebook: { n: 'Facebook', bg: '#1877f2', fg: '#fff', url: 'https://facebook.com/',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-1 .4-1.7 1.8-1.7h1.6V3.8c-.3 0-1.3-.2-2.4-.2-2.5 0-4.1 1.5-4.1 4.2v2.7H7.6v3.3h2.8V22z"/></svg>' },
  website: { n: 'Website', bg: '#3a3a44', fg: '#fff', url: 'https://',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/></svg>' },
  email: { n: 'Email', bg: '#ff2d55', fg: '#fff', url: 'mailto:',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 5.5L20 8"/></svg>' }
};

const isReal = v => !!v && !/^\s*$|^YOUR_/i.test(String(v));
function socUrl(type, h) {
  h = String(h).trim(); if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  const c = h.replace(/^@/, ''), b = BRAND[type] || BRAND.website;
  if (type === 'youtube') return /^UC[\w-]{20,}$/.test(c) ? 'https://youtube.com/channel/' + c : 'https://youtube.com/@' + c;
  if (type === 'whatsapp') return 'https://wa.me/' + c.replace(/[^\d]/g, '');
  if (type === 'website') return 'https://' + c; if (type === 'email') return 'mailto:' + c;
  return b.url + c;
}
function socials() {                                   // CREATOR.socials = [{type, label, handle}, …] (+ the old single-field style)
  const out = [], add = (type, label, handle) => { if (!isReal(handle) || !BRAND[type]) return; const u = socUrl(type, handle); if (/^(https?:|mailto:)/.test(u) && !out.some(o => o.url === u)) out.push({ type, label: label || '', handle: String(handle).trim(), url: u }); };
  (CREATOR.socials || []).forEach(s => add(s.type, s.label, s.handle || s.url));
  ['instagram', 'youtube', 'github', 'x', 'telegram', 'whatsapp', 'linkedin', 'facebook', 'website'].forEach(k => [].concat(CREATOR[k] || []).forEach(h => typeof h === 'object' ? add(k, h.label, h.handle || h.url) : add(k, '', h)));
  return out;
}
const shown = s => { const h = s.handle; if (/^https?:/i.test(h)) { try { const u = new URL(h); return (u.host + u.pathname).replace(/\/$/, ''); } catch (e) { return h; } } if (s.type === 'email') return h.replace(/^mailto:/, ''); return BRAND[s.type].at ? '@' + h.replace(/^@/, '') : h; };
const logo = (type, size = 40) => { const b = BRAND[type]; return `<span class="blogo2" style="width:${size}px;height:${size}px;background:${b.bg};color:${b.fg}"><span style="width:${Math.round(size * .56)}px;height:${Math.round(size * .56)}px">${b.svg}</span></span>`; };
const socIcons = (size = 34) => socials().map(s => `<a class="soc2" href="${esc(s.url)}" ${s.type === 'email' ? '' : 'target="_blank" rel="noopener noreferrer"'} aria-label="${esc(BRAND[s.type].n + (s.label ? ' (' + s.label + ')' : ''))}" title="${esc(BRAND[s.type].n + (s.label ? ' · ' + s.label : ''))}">${logo(s.type, size)}</a>`).join('');
const creatorName = () => isReal(CREATOR.name) ? String(CREATOR.name).trim() : '', creatorEmail = () => isReal(CREATOR.email) ? String(CREATOR.email).trim() : '';
const by = () => creatorName() ? ' by ' + esc(creatorName()) : '';
const upd = () => esc(APP.updated || String(APP.year));
const ctc = () => creatorEmail() ? `<a href="mailto:${esc(creatorEmail())}">${esc(creatorEmail())}</a>` : 'the <a href="#/contact">Contact</a> page';
const footer = () => `<footer class="kfoot"><div class="kf1"><img src="icon-192.png" alt="" width="36" height="36"><div><b>${esc(APP.name)}</b><small>${esc(APP.tagline)}</small></div></div><nav><a href="#/about">About</a><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a><a href="#/contact">Contact</a></nav><div class="socs">${socIcons(34)}</div><p>© ${APP.year} ${esc(APP.name)} · Made with ❤️${by()} · v${esc(APP.version)}</p></footer>`;

function showAbout() {
  view = 'about'; const s = socials(), n0 = creatorName();
  const F = [['Discover', 'Home, Browse, Trending, New Releases and Made For You, tuned to your taste.'], ['Listen your way', 'A queue you can drag, autoplay radio, sleep timer, speed and quality control.'], ['Lyrics that follow along', 'Synced lyrics in the original language, in Hinglish or in English.'], ['Your library', 'Liked songs, playlists, albums, artists and listening insights, all on your device.'], ['Private by design', 'No account, no ads and no tracking. Your library never leaves your device.'], ['Install it', 'Add it to your home screen and it opens like a native app.']];
  setV(`<div class="abh"><img src="icon-512.png" alt="" width="96" height="96"><div><h1 class="lt">${esc(APP.name)}</h1><p class="lead">${esc(APP.tagline)}</p></div></div><div class="doc">
  <p class="big">${esc(APP.name)} is a fast, modern music app that runs in your browser and installs like a native app. Search millions of songs, build your own library, follow lyrics in your language and take your music anywhere, without creating an account.</p>
  <div class="fgrid">${F.map(([t, d]) => `<div class="fc"><b>${t}</b><p>${d}</p></div>`).join('')}</div>
  <h2>How it works</h2><p>${esc(APP.name)} combines two independent services: a music data service for search, artists, albums and lyrics, and a streaming service that prepares audio for playback. Everything you save, such as liked songs, playlists, history and settings, stays in your browser.</p>
  ${n0 || s.length ? `<h2>Meet the creator</h2><div class="cc"><div class="cav">${esc((n0 || APP.name)[0].toUpperCase())}</div><div class="ccb"><b>${esc(n0 || APP.name)}</b>${isReal(CREATOR.role) ? `<span>${esc(CREATOR.role)}</span>` : ''}${isReal(CREATOR.bio) ? `<p>${esc(CREATOR.bio)}</p>` : ''}<div class="socs">${socIcons(40)}</div></div></div>` : ''}
  <h2>Good to know</h2><p>${esc(APP.name)} is an independent project. It is not affiliated with, endorsed by or sponsored by YouTube, Google, Apple or any record label. Music, videos and artwork belong to their respective owners.</p>
  <div class="abt"><div><span>Version</span><b>${esc(APP.version)}</b></div><div><span>Last updated</span><b>${upd()}</b></div>${APP.website ? `<div><span>Website</span><b>${esc(String(APP.website).replace(/^https?:\/\//, ''))}</b></div>` : ''}</div>
  <div class="btns"><button class="pill pri" data-act="shareapp">Share ${esc(APP.name)}</button><a class="pill" href="#/contact">Contact</a><a class="pill" href="#/privacy">Privacy</a><a class="pill" href="#/terms">Terms</a></div></div>`);
}
function showContact() {
  view = 'contact'; const s = socials(), em = creatorEmail(), n0 = creatorName();
  const rep = em ? `mailto:${em}?subject=${enc(APP.name + ' — problem report')}&body=${enc(`Describe what happened:\n\n\n—\nApp: ${APP.name} ${APP.version}\nBrowser: ${navigator.userAgent}\nTime: ${new Date().toString()}`)}` : '';
  setV(`<h1 class="lt">Contact</h1><p class="lead">Questions, feedback, collaborations or a bug to report. We’d love to hear from you.</p><div class="doc">
  ${em ? `<div class="ccard"><div>${logo('email', 54)}</div><div class="cct"><b>Email</b><span>${esc(em)}</span></div><a class="pill pri" href="mailto:${esc(em)}">Send an email</a></div>` : ''}
  ${s.filter(x => x.type !== 'email').length ? `<h2>Follow &amp; message</h2><div class="sgrid">${s.filter(x => x.type !== 'email').map(x => `<a class="scard" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${logo(x.type, 48)}<div class="sct"><b>${esc(BRAND[x.type].n)}${x.label ? ` <em>${esc(x.label)}</em>` : ''}</b><span>${esc(shown(x))}</span></div>${SVG.chev}</a>`).join('')}</div>` : ''}
  ${!em && !s.length ? '<div class="msg">Contact details will appear here once they are added to <code>config.js</code>.</div>' : ''}
  <h2>Helpful to know</h2><div class="fgrid">
   <div class="fc"><b>Report a problem</b><p>${em ? `<a href="${rep}">Open an email</a> that already includes your app version and browser.` : 'Tell us what happened and include your browser and device.'}</p></div>
   <div class="fc"><b>Copyright &amp; takedown</b><p>Rights holders can email us with the subject “Copyright” and the details. ${esc(APP.name)} does not host any music.</p></div>
   <div class="fc"><b>Privacy requests</b><p>Your library lives on your device, so you can erase it at any time in Settings. For anything else, get in touch.</p></div></div>
  <p class="muted">${n0 ? 'Made with ❤️ by ' + esc(n0) + '. ' : ''}Thank you for helping make ${esc(APP.name)} better.</p></div>`);
}

/* ---------- legal pages ---------- */
const sections = list => `<nav class="toc" aria-label="Contents">${list.map(([t], i) => `<a href="#" data-sec="s${i}">${i + 1}. ${t}</a>`).join('')}</nav>` + list.map(([t, h], i) => `<h2 id="s${i}">${i + 1}. ${t}</h2>${h}`).join('');
const LEGAL = {
  privacy: () => ['Privacy Policy', sections([
    ['At a glance', `<ul class="ticks"><li>There are <b>no accounts</b>, no ads and no analytics or tracking tools.</li><li>Your library, playlists, history and settings are stored <b>only on your device</b>.</li><li>To play music, ${esc(APP.name)} sends song and search requests to the services described below.</li><li>You can export or erase everything yourself at any time.</li></ul>`],
    ['Who we are', `<p>${esc(APP.name)} (“we”, “us”) is an independent music app${creatorName() ? ' created and operated by ' + esc(creatorName()) : ''}. You can reach us through ${ctc()}.</p>`],
    ['What is stored on your device', `<p>${esc(APP.name)} saves the following in your browser (local storage, IndexedDB and cache storage). None of it is sent to us.</p><div class="tw"><table class="dtab"><tr><th>Information</th><th>Why</th></tr><tr><td>Display name</td><td>To greet you on Home</td></tr><tr><td>Settings and music taste</td><td>To remember your preferences</td></tr><tr><td>Liked songs, playlists, saved albums and artists</td><td>Your library</td></tr><tr><td>Recently played (last 50) and play counts</td><td>Home, history and Insights</td></tr><tr><td>Queue and playback position</td><td>To continue where you left off</td></tr><tr><td>Last 8 searches</td><td>Search suggestions</td></tr><tr><td>Song details and translated lyrics</td><td>To show your lists quickly and avoid repeat requests</td></tr><tr><td>App files and cover images (service worker cache)</td><td>Faster loading and offline start</td></tr></table></div>`],
    ['Information sent when you use the app', `<p><b>Music data service.</b> When you browse, search or open an artist, album, playlist or lyrics, your device sends the search text or the ID of the item, together with the technical details every web request carries (IP address, browser type and the time of the request). A shared app key identifies the app, not you.</p><p><b>Streaming service.</b> When you play or download a song, your device sends the YouTube link of that song and the chosen quality. The service fetches the audio and relays it to you.</p><p>These services run on cloud infrastructure and keep ordinary server logs (such as IP address, time and requested address) for security and troubleshooting. We do not use them to build profiles or to track you across sites. Your name, library, playlists and history are never sent to them.</p>`],
    ['Third parties', `<ul class="ticks"><li><b>YouTube and Google.</b> Audio and metadata originate from YouTube. Cover art is loaded straight from Google image hosts, so they can see your IP address and browser details.</li><li><b>Google Fonts</b> supplies the app typeface and receives your IP address when fonts load.</li><li><b>Google Translate</b> receives the text of a song’s lyrics only if you choose English lyrics. Hinglish conversion happens entirely on your device.</li><li><b>Voice search</b> uses your browser’s speech recognition, which may send your audio to the browser maker’s servers (for example Google in Chrome). It runs only after you tap the microphone.</li></ul><p>These companies handle data under their own privacy policies.</p>`],
    ['Cookies and similar technologies', `<p>${esc(APP.name)} does not set cookies. It uses local storage, IndexedDB, cache storage and a service worker to work quickly and to start offline. Clearing your browser’s site data removes all of it.</p>`],
    ['Analytics and advertising', `<p>None. We do not use analytics, advertising or tracking SDKs.</p>`],
    ['How long data is kept', `<p>On-device data stays until you remove it. Server logs are kept by the hosting provider for short, standard periods and then deleted.</p>`],
    ['Your choices and rights', `<ul class="ticks"><li>Change or remove your name in Settings.</li><li>Clear recently played, search history or your whole library from Library and Settings.</li><li>Export a backup or restore one in Settings, Library &amp; data.</li><li>Erase everything by clearing this site’s data in your browser.</li></ul><p>Because we do not hold an account or profile about you, most access and deletion requests are covered by these on-device controls. For requests about server logs, contact us.</p>`],
    ['Children', `<p>${esc(APP.name)} is not directed to children under 13 and does not knowingly collect personal information from anyone. There are no accounts and no sign-up.</p>`],
    ['Security', `<p>Traffic between your device and our services is encrypted with HTTPS. We take reasonable care, but no system is perfectly secure. Note that the app key included in the app is not a secret.</p>`],
    ['Changes to this policy', `<p>If our practices change, we will update this page and the “last updated” date above.</p>`],
    ['Contact', `<p>Questions about privacy? Reach us through ${ctc()}.</p>`]])],
  terms: () => ['Terms of Service', sections([
    ['Agreement', `<p>By using ${esc(APP.name)} you agree to these Terms. If you do not agree, please do not use the app.</p>`],
    ['The service', `<p>${esc(APP.name)} is a music discovery and listening interface. It helps you find music and play it through third-party sources. We do not host, store or sell music.</p>`],
    ['Personal, non-commercial use', `<p>The app is provided for your personal, non-commercial use. You may not resell it, offer it as a service to others or use it to build a competing product without permission.</p>`],
    ['Acceptable use', `<p>You agree not to:</p><ul class="ticks"><li>break the law or infringe anyone’s rights;</li><li>overload, probe, scrape or disrupt the app or the services it connects to;</li><li>bypass limits, access controls or security measures;</li><li>redistribute or publicly perform content you obtained through the app.</li></ul>`],
    ['Third-party content and copyright', `<p>Music, videos, lyrics and artwork belong to their respective owners and are accessed from third-party services. ${esc(APP.name)} claims no ownership of that content. You are responsible for making sure your use complies with copyright law and with the terms of those services in your country. Rights holders can send concerns through ${ctc()}.</p>`],
    ['Downloads', `<p>The download option is for personal offline listening of content you have the right to keep. You are solely responsible for what you download.</p>`],
    ['Your data', `<p>Your name, library, playlists and settings are stored locally on your device and are covered by the <a href="#/privacy">Privacy Policy</a>. You can export or erase them at any time.</p>`],
    ['Availability and changes', `<p>The app depends on third-party services and may be slow, limited or unavailable at times. We may change, suspend or remove features without notice.</p>`],
    ['No affiliation', `<p>${esc(APP.name)} is an independent project and is not affiliated with, endorsed by or sponsored by YouTube, Google, Apple or any record label. Product names and logos are trademarks of their owners.</p>`],
    ['Disclaimer', `<p>The app is provided “as is” and “as available”, without warranties of any kind, including accuracy, availability, fitness for a particular purpose or non-infringement.</p>`],
    ['Limitation of liability', `<p>To the fullest extent permitted by law, we are not liable for indirect, incidental or consequential damages, or for loss of data, arising from your use of the app.</p>`],
    ['Termination', `<p>You may stop using the app at any time. We may restrict access if these Terms are violated or if the service must be changed or closed.</p>`],
    ['Governing law', `<p>These Terms are governed by the laws that apply where the operator is based, without regard to conflict-of-law rules.</p>`],
    ['Changes to these Terms', `<p>We may update these Terms. Continued use after an update means you accept the new version. The “last updated” date above shows the latest change.</p>`],
    ['Contact', `<p>Questions about these Terms? Reach us through ${ctc()}.</p>`]])]
};
function showLegal(k) { view = k; const [t, h] = LEGAL[k](); setV(`<h1 class="lt">${t}</h1><p class="lead">Last updated ${upd()} · ${esc(APP.name)} v${esc(APP.version)}</p><div class="doc legal">${h}</div>`); }
V.addEventListener('click', e => { const a = e.target.closest('[data-sec]'); if (a) { e.preventDefault(); const t = document.getElementById(a.dataset.sec); t && t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });

window.kProfile = () => `<div class="sg"><h2>Profile</h2><div class="sc">${sr('Display name', 'Shown in your greeting on Home', `<button class="btn2" data-act="editname">${esc(NAME()) || 'Set name'} ✎</button>`)}</div></div>`;
window.kAbout = () => `<div class="sg"><h2>About</h2><div class="sc">${sr(APP.name + ' · v' + APP.version, APP.tagline, '')}${['about:About', 'privacy:Privacy Policy', 'terms:Terms of Service', 'contact:Contact'].map(x => { const [h, l] = x.split(':'); return sr(l, '', `<a class="btn2" href="#/${h}">Open</a>`); }).join('')}</div></div>`;
window.trackMenu = (t, p, anchor) => {
  const f = FAV.includes(t.url);
  openMenu([{ l: 'Play Next', i: 'next', fn: () => qAdd(t, true) }, { l: 'Add to Queue', i: 'qadd', fn: () => qAdd(t, false) }, { l: f ? 'Remove from Favourites' : 'Add to Favourites', i: f ? 'heartf' : 'heart', fn: () => toggleFav(t) }, { l: 'Add to Playlist…', i: 'plus', fn: () => pickPl(t) }, { l: 'Share', i: 'expand', fn: () => shareTrack(t) },
  p && p.custom ? { l: 'Remove from this playlist', i: 'trash', fn: () => rmFromPl(p, t) } : null, { sep: 1 },
  { l: 'Start Radio', i: 'shuf', fn: () => { Q = [t]; play(0); } }, { l: 'Audio quality…', i: 'sliders', fn: () => qualityMenu(t, anchor) }, { l: 'Track info', i: 'info', fn: () => showInfo(t) }, { l: OFF.has(t.url) ? 'Downloaded · options' : 'Download…', i: OFF.has(t.url) ? 'dldone' : 'dl', fn: () => dlChoose(t, anchor) }, t.c.artistId ? { l: 'Go to Artist', i: 'logo', fn: () => location.hash = '#/artist/' + enc(t.c.artistId) } : null, t.c.albumId ? { l: 'Go to Album', i: 'logo', fn: () => location.hash = '#/album/' + enc(t.c.albumId) } : null].filter(Boolean), anchor, title(t));
};

/* ---------- routing / events ---------- */
window.route = function (keep) {
  RT++; const m = (location.hash.slice(1) || '/').split('/'), k = m[1], id = decodeURIComponent(m[2] || '');
  SQ.io && k !== 'search' && SQ.io.disconnect();
  ({ search: showSearch, fav: showFav, history: showHist, downloads: showDl, settings: showSet, trending: showTrend, new: showNew, about: showAbout, privacy: () => showLegal('privacy'), terms: () => showLegal('terms'), artist: () => showArtist(id), album: () => showAlbum(id), playlist: () => showRemotePl(id), p: () => showPl(id) }[k] || showHome)();
  all('[data-k]').forEach(a => a.classList.toggle('act', a.dataset.k === view)); drawSide(); fin();
  if (!V.querySelector('.kfoot') && !V.querySelector('.shim')) V.insertAdjacentHTML('beforeend', footer());
  if (!keep) scrollTo(0, 0);
};
const _act = window.act;
window.act = (a, c) => {
  if (a === 'retry') return route(1);
  if (a === 'more') return moreSearch();
  if (a === 'qall') { const p = byId(c.dataset.pid); if (!p || !p.tracks.length) return; if (!Q.length) playFrom(p, 0); else { Q.push(...p.tracks); drawQ(); toast('Added to queue'); } return; }
  if (a === 'savename') { const n = $('#kname').value.trim(); if (!n) return toast('Please enter a name'); LS.set('koom.name', n); return toast('Name updated'); }
  _act(a, c);
};
const kgo = c => { if (c.dataset.l) playFrom(LISTS[c.dataset.l], +c.dataset.i); else location.hash = `#/${c.dataset.kd}/${enc(c.dataset.id)}`; };
V.addEventListener('click', e => { const c = e.target.closest('.k'); if (c) kgo(c); });
V.addEventListener('keydown', e => { if (e.key === 'Enter') { const c = e.target.closest('.k'); if (c) kgo(c); } });
document.addEventListener('click', e => { if (!e.target.closest('.sw2')) { const s = $('#sug'); if (s) s.hidden = true; } });
document.addEventListener('error', e => { if (e.target.tagName === 'IMG' && e.target.src !== PH) e.target.src = PH; }, true);

/* ---------- onboarding taste, browse, moods, settings extras ---------- */
const GENRES = ['Bollywood', 'Pop', 'Hip-Hop', 'Punjabi', 'Lo-fi', 'Romantic', 'Rock', 'Indie', 'EDM', 'Devotional', 'Classical', 'K-pop', 'R&B', 'Jazz', 'Sufi', 'Retro'];
function pickGenres(host, done, step) {
  const sel = new Set(J.get('koom.genres', [])), cnt = () => sel.size ? `${sel.size} selected` : 'Pick a few to get started';
  host.innerHTML = `${WBG}<div class="wc">${step ? wdots(step) : ''}<h1>Pick what you love</h1><p class="ws">We’ll build Made For You from your taste.</p><div class="chips">${GENRES.map(g => `<button class="chip ${sel.has(g) ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div><p class="whint" id="gcnt">${cnt()}</p><button class="pill pri wbtn" id="wg2">Done</button><button class="skip" id="wsk">Skip for now</button></div>${step ? wcredit() : ''}`;
  host.onclick = e => { const c = e.target.closest('.chip'); if (c) { c.classList.toggle('on'); sel.has(c.dataset.g) ? sel.delete(c.dataset.g) : sel.add(c.dataset.g); $('#gcnt').textContent = cnt(); } };
  $('#wg2').onclick = () => { J.set('koom.genres', [...sel]); done(); }; $('#wsk').onclick = done;
}
const hue = t => [...t].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
function moodGroups(d) {
  const out = [], walk = (v, t, dp = 0) => {
    if (dp > 4) return;
    if (Array.isArray(v)) {
      if (v.length && v.every(x => typeof x === 'string')) return out.push({ title: t || 'Moods & Genres', items: v.map(x => ({ t: x, p: x })) });
      const it = v.filter(x => x && typeof x === 'object' && nm(x.title || x.name || x.text) && !x.videoId && !x.playlistId).map(x => ({ t: nm(x.title || x.name || x.text), p: x.params || x.id || x.browseId || x.slug || nm(x.title || x.name) }));
      if (it.length && it.length === v.length) out.push({ title: t || 'Moods & Genres', items: it }); else v.forEach(x => x && typeof x === 'object' && walk(x, x.title || x.name || t, dp + 1));
    } else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (x && typeof x === 'object') walk(x, Array.isArray(x) ? hum(k) : t, dp + 1); });
  };
  walk(d); return out;
}
async function showBrowse() {
  view = 'browse'; const my = RT, head = '<h1 class="lt">Browse</h1>'; setV(head + skel('cards'), my);
  const [m, c] = await Promise.allSettled([mApi('/moods'), mApi('/charts')]); if (my !== RT) return;
  let h = head + '<div class="bgrid"><a class="bt t1" href="#/trending">Trending</a><a class="bt t2" href="#/new">New Releases</a></div>';
  (m.status === 'fulfilled' ? moodGroups(m.value) : []).forEach(g => h += sh(esc(g.title)) + `<div class="mgrid">${g.items.map(x => `<a class="mc" style="--h:${hue(x.t)}" href="#/mood/${enc(x.p)}/${enc(x.t)}">${esc(x.t)}</a>`).join('')}</div>`);
  if (c.status === 'fulfilled') h += renderSections(extractSections(c.value, 'Charts'), { rank: 1 });
  if (m.status !== 'fulfilled' && c.status !== 'fulfilled') h += errBox(m.reason);
  setV(h, my);
}
async function showMood(p, name) {
  view = 'browse'; const my = RT, head = `<h1 class="lt">${esc(name || 'Mood')}</h1>`; setV(head + skel('cards'), my);
  try {
    const items = flat(await mApi('/search', { q: (name || p) + ' playlist', filter: 'playlists', limit: 30 }));
    setV(head + (items.length ? sh('Playlists') + `<div class="grid">${items.map(x => cardX(x)).join('')}</div>` : '<div class="msg">Nothing here yet.</div>'), my);
  } catch (e) { setV(head + errBox(e), my); }
}
const _route = window.route;
window.route = function (keep) {
  const m = (location.hash.slice(1) || '/').split('/');
  if (['browse', 'mood', 'library', 'contact', 'stats'].includes(m[1])) { RT++; SQ.io && SQ.io.disconnect(); (m[1] === 'browse' ? showBrowse() : m[1] === 'library' ? showLibrary() : m[1] === 'contact' ? showContact() : m[1] === 'stats' ? showStats() : showMood(decodeURIComponent(m[2] || ''), decodeURIComponent(m[3] || ''))); all('[data-k]').forEach(a => a.classList.toggle('act', a.dataset.k === view)); drawSide(); fin(); if (!keep) scrollTo(0, 0); return; }
  return _route(keep);
};
const _act2 = window.act;
window.act = (a, c) => {
  if (a === 'editname') { kAsk('What should we call you?', 'Your name', NAME()).then(n => { if (n) { LS.set('koom.name', n.replace(/\s+/g, ' ').slice(0, 30)); refreshAv(); toast('Name updated'); route(1); } }); return; }
  if (a === 'install') return installFlow();
  if (a === 'shareapp') { const u = location.href.split('#')[0]; if (navigator.share) navigator.share({ title: APP.name, text: APP.tagline, url: u }).catch(() => { }); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(() => toast('Link copied')); return; }
  if (a === 'hplay') { if (Q[qi] && A.getAttribute('src')) { if (A.paused) A.play().catch(() => { }); else openNP(); return; } if (RESUME && Q[qi]) { const t = RESUME.t; RESUME = null; return play(qi, t); } const hs = byId('~hist'); if (hs.tracks.length) playFrom(hs, 0); return; }
  if (a === 'newpl') { newPlaylist().then(id => { if (id) location.hash = '#/p/' + id; }); return; }
  if (a === 'qsave') { if (!Q.length) return toast('Queue is empty'); newPlaylist(Q.filter(t => t.c && t.c.videoId).map(t => t.url)); return; }
  if (a === 'shclr') { J.set('koom.sh', []); toast('Search history cleared'); return route(1); }
  if (a === 'kexp') return exportData();
  if (a === 'kimp') return importData();
  if (a === 'qshufup') { const up = Q.splice(qi + 1); for (let i = up.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [up[i], up[j]] = [up[j], up[i]]; } Q.push(...up); drawQ(); saveSess(); return toast('Up Next shuffled'); }
  if (a === 'qdedupe') { const cur = Q[qi], seen = new Set(), n = Q.length; Q = Q.filter(t => { if (t === cur) { seen.add(t.url); return true; } if (seen.has(t.url) || (cur && t.url === cur.url)) return false; seen.add(t.url); return true; }); qi = Q.indexOf(cur); drawQ(); saveSess(); return toast(n - Q.length ? `Removed ${n - Q.length} duplicate${n - Q.length > 1 ? 's' : ''}` : 'No duplicates'); }
  if (a === 'qclear') { Q.length = qi + 1; drawQ(); return toast('Up Next cleared'); }
  if (a === 'libadd') { const k = c.dataset.lk, on = libToggle(k, { kind: k.slice(0, -1), id: c.dataset.id, title: c.dataset.t, sub: c.dataset.sub, thumb: c.dataset.th }); c.innerHTML = on ? ic('check', 18) + 'In Library' : ic('plus', 18) + 'Add to Library'; return toast(on ? 'Added to Library' : 'Removed from Library'); }
  if (a === 'taste') { const w = document.createElement('div'); w.id = 'wel'; document.body.append(w); return pickGenres(w, () => { w.classList.add('out'); setTimeout(() => w.remove(), 600); toast('Music taste saved'); }); }
  if (a === 'savename') { _act2(a, c); return refreshAv(); }
  _act2(a, c);
};
function refreshAv() { const a = document.querySelector('.mtop .av'); if (a) a.textContent = (NAME()[0] || 'K').toUpperCase(); }

/* ---------- player quality chips, library, share ---------- */
const QINFO = new Map(), ITAG = { 139: 48, 140: 128, 141: 256, 249: 50, 250: 70, 251: 130, 256: 192, 258: 384 };
const kbOf = i => i ? (i.kb || ITAG[i.fmt] || 0) : 0;
const qInfo = t => { if (!t || !t.c) return null; const i = QINFO.get(t.c.videoId); if (i) return i; const m = DM[t.url]; return m && m.ext ? { ext: m.ext, fmt: m.fmt || '', kb: m.kb || 0 } : null; };
function qChips() {
  const t = Q[qi]; if (!t || !t.c.videoId) return; const i = qInfo(t), off = OFF.has(t.url), kb = kbOf(i);
  const q = off ? 'Downloaded' : EX.has(t.c.videoId) ? 'Custom' : { best: 'Auto', high: 'High', std: 'Standard', low: 'Data saver' }[curQ()];
  const tag = i ? `${(i.ext || 'audio').toUpperCase()}${kb ? ' ' + kb + 'k' : ''}` : '';
  $('#bq').textContent = tag || (off ? 'Offline' : '…');
  $('#nbd').innerHTML = `<span class="qchip">${q}${tag ? ' · ' + tag : ''}</span>`;
  npMeta();
}
const _ui = window.ui; window.ui = function () { const r = _ui.apply(this, arguments); qChips(); return r; };
{ const vr = document.querySelector('.vrow'); if (vr) vr.append($('#nbd')); }
$('#bq').onclick = e => Q[qi] && qualityMenu(Q[qi], e.currentTarget); $('#nbd').onclick = e => Q[qi] && qualityMenu(Q[qi], e.currentTarget);
const LIB = () => J.get('koom.lib', { albums: [], artists: [], playlists: [] }), inLib = (k, id) => (LIB()[k] || []).some(x => x.id === id);
function libToggle(k, it) { const L = LIB(); L[k] = L[k] || []; const i = L[k].findIndex(x => x.id === it.id); i >= 0 ? L[k].splice(i, 1) : L[k].unshift(it); J.set('koom.lib', L); return i < 0; }
function libBtn(k, id, title, sub, thumb) { return `<button class="pill" data-act="libadd" data-lk="${k}" data-id="${esc(id)}" data-t="${esc(title)}" data-sub="${esc(sub)}" data-th="${esc(thumb)}">${inLib(k, id) ? ic('check', 18) + 'In Library' : ic('plus', 18) + 'Add to Library'}</button>`; }
function showLibrary() {
  view = 'library'; const L = LIB(), my = RT, sec = (t, a) => a.length ? sh(t) + `<div class="hr">${a.map(x => cardX(x)).join('')}</div>` : '';
  setV(`<h1 class="lt">Library</h1><div class="bgrid"><a class="bt t1" href="#/fav">Liked Songs<small>${FAV.length} songs</small></a><a class="bt t2" href="#/history">Recently Played<small>${HIST.length} songs</small></a><a class="bt t1" href="#/downloads">Downloads<small>${OFF.size} songs offline</small></a><a class="bt t3" href="#/stats">Insights<small>Top songs &amp; artists</small></a></div>` + myPl() + sec('Albums', L.albums) + sec('Artists', L.artists) + sec('Saved playlists', L.playlists) + '', my);
}
function showStats() {
  view = 'stats'; const my = RT, P0 = PLAYS || {}, ents = Object.entries(P0).filter(([u, n]) => n > 0 && TM.get(u)).sort((a, b) => b[1] - a[1]), total = Object.values(P0).reduce((a, n) => a + n, 0);
  const head = '<h1 class="lt">Insights</h1><p class="lead">Your listening, summarised on your device.</p>';
  if (!total || !ents.length) return setV(head + '<div class="msg">Play a few songs and your top songs and artists will show up here.</div>', my);
  const AR = {}; ents.forEach(([u, n]) => { const t = TM.get(u).t, a0 = (t.c.artists && t.c.artists[0]) || { n: (t.c.artist || '').split(',')[0].trim(), id: t.c.artistId || '' }; if (!a0.n) return; const o = AR[a0.n] = AR[a0.n] || { n: 0, id: a0.id, th: cover(t) }; o.n += n; if (!o.id) o.id = a0.id; });
  const topA = Object.entries(AR).sort((a, b) => b[1].n - a[1].n).slice(0, 10), T = ents.slice(0, 20).map(([u]) => TM.get(u).t), L = mkList(T, 'Top songs'), stat = (v, l) => `<div class="stc"><b>${v}</b><span>${l}</span></div>`;
  setV(head + `<div class="stg">${stat(total, 'plays')}${stat(ents.length, 'different songs')}${stat(topA[0] ? esc(topA[0][0]) : '—', 'top artist')}</div>` + sh('Top songs') + hdr + T.map((t, i) => row(t, i, L, i + 1)).join('') + (topA.filter(x => x[1].id).length ? sh('Top artists') + `<div class="hr">${topA.filter(x => x[1].id).map(([n, o]) => cardX({ kind: 'artist', id: o.id, title: n, sub: o.n + (o.n > 1 ? ' plays' : ' play'), thumb: o.th })).join('')}</div>` : ''), my);
}
const SRC = window.SpeechRecognition || window.webkitSpeechRecognition;
function voiceSearch(btn) {
  if (!SRC) return toast('Voice search isn’t supported in this browser'); if (!window.isSecureContext) return toast('Voice search needs an https address');
  const r = new SRC(); r.lang = S.vl || 'en-IN'; r.interimResults = true; r.maxAlternatives = 1; btn.classList.add('rec');
  r.onresult = e => { const tx = [...e.results].map(x => x[0].transcript).join(' ').trim(); const q = $('#sq'); if (q) q.value = tx; if (e.results[e.results.length - 1].isFinal && tx) runSearch(tx); };
  r.onend = () => btn.classList.remove('rec'); r.onerror = ev => { btn.classList.remove('rec'); if (ev.error === 'not-allowed') toast('Allow the microphone to use voice search'); };
  try { r.start(); } catch (e) { btn.classList.remove('rec'); }
}
function netBar(first) {
  let b = $('#koff');
  if (!navigator.onLine) { if (!b) { b = document.createElement('div'); b.id = 'koff'; b.setAttribute('role', 'status'); b.textContent = 'You’re offline — showing your downloads.'; document.body.append(b); } }
  else if (b) { b.remove(); if (!first) toast('Back online'); }
}
addEventListener('offline', () => netBar()); addEventListener('online', () => netBar());
const wcredit = () => { const n = creatorName(), s = socIcons(30); return n || s ? `<div class="wcredit"><span>Made with ❤️${by()}</span><div class="socs">${s}</div></div>` : ''; };
async function shareTrack(t) { const url = 'https://music.youtube.com/watch?v=' + t.c.videoId; try { if (navigator.share) await navigator.share({ title: title(t) + ' — ' + artist(t), url }); else { await navigator.clipboard.writeText(url); toast('Link copied'); } } catch (e) { } }

/* ---------- lyrics: wrap-safe word fill + smoother animation ---------- */
/* ---------- lyrics languages ---------- */
/* Devanagari + Gurmukhi -> Hinglish (rule based, offline) */
const DVC = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h' };
const DVN = { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f' };
const DVI = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' };
const DVM = { 'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };
const isNasal = c => c === 'ं' || c === 'ँ';
function romanWord(w) {
  const ch = [...w], toks = []; let i = 0;
  while (i < ch.length) {
    const c = ch[i];
    if (DVC[c]) {
      let r = DVC[c]; i++; if (ch[i] === '़') { r = DVN[c] || r; i++; }
      const t = { c: r, v: null, vir: false };
      if (ch[i] === '्') { t.vir = true; i++; } else if (DVM[ch[i]]) { t.v = DVM[ch[i]]; i++; }
      if (isNasal(ch[i])) { t.nas = true; i++; } else if (ch[i] === 'ः') { t.h = true; i++; }
      toks.push(t);
    } else if (DVI[c]) {
      const t = { c: '', v: DVI[c], ex: true }; i++;
      if (isNasal(ch[i])) { t.nas = true; i++; } else if (ch[i] === 'ः') { t.h = true; i++; }
      toks.push(t);
    } else if (c === '।' || c === '॥' || c === 'ऽ' || c === '\u200d' || c === '\u200c') i++;
    else { toks.push({ raw: c }); i++; }
  }
  const syl = []; toks.forEach((t, k) => { if (!('raw' in t)) syl.push(k); });
  let prevVowel = false, out = '';
  syl.forEach((k, p) => {
    const t = toks[k], last = p === syl.length - 1, nx = toks[syl[p + 1]];
    let v = t.v;
    if (t.v === null && !t.vir && !t.ex) {                    // inherent "a": keep or drop (schwa deletion)
      let keep = true;
      if (last) keep = false;
      else if (p > 0 && prevVowel && !toks[syl[p - 1]].nas && (nx.v !== null || nx.ex) && !t.nas) keep = false;
      v = keep ? 'a' : '';
    }
    if (v === 'aa' && last && !t.nas) v = 'a';               // mera, tera
    if (v === 'oo' && last && !t.nas) v = 'u';
    out += t.c + (t.vir ? '' : v || '');
    if (t.nas) out += 'n'; if (t.h) out += 'h';
    prevVowel = !t.vir && !!(v);
    if (t.vir) prevVowel = false;
    // raw chars between syllables
    for (let q = k + 1; q < (syl[p + 1] ?? toks.length); q++) if ('raw' in toks[q]) out += toks[q].raw;
  });
  for (let q = 0; q < (syl[0] ?? toks.length); q++) if ('raw' in toks[q]) out = toks[q].raw + out;
  return out;
}
function roman(str) {
  if (!/[\u0900-\u097F\u0A00-\u0A7F]/.test(str)) return str;
  let s = ''; for (const ch of str) { const c = ch.codePointAt(0); s += (c >= 0x0A01 && c <= 0x0A4D) ? String.fromCodePoint(c - 0x100) : c === 0x0A70 ? 'ं' : c === 0x0A71 ? '' : ch; }
  return s.replace(/[\u0900-\u097F]+/g, romanWord).replace(/\s+/g, ' ').trim();
}

const TR_URL = () => API_CONFIG.TRANSLATE_URL || 'https://translate.googleapis.com/translate_a/single';
async function trOne(line) { const r = await fetch(`${TR_URL()}?client=gtx&sl=auto&tl=en&dt=t&q=${enc(line)}`); if (!r.ok) throw new Error('tr'); const d = await r.json(); return (d[0] || []).map(x => x[0]).join('').replace(/\n+$/, ''); }
async function translateLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 40) {
    const part = lines.slice(i, i + 40), r = await fetch(`${TR_URL()}?client=gtx&sl=auto&tl=en&dt=t&q=${enc(part.join('\n'))}`); if (!r.ok) throw new Error('tr');
    const d = await r.json(); let rows = (d[0] || []).map(x => x[0]).join('').replace(/\n$/, '').split('\n');
    if (rows.length !== part.length) rows = await Promise.all(part.map(l => l.trim() ? trOne(l) : ''));   // lines got merged: translate one by one
    out.push(...rows);
  }
  return out;
}
const lyRows = t => { const L0 = lrc(t.lyr || ''); return L0.length > 1 ? L0.map(l => l.tx) : (t.lyr || '').split('\n'); };
async function ensureEn(t) {
  if (!t || !t.lyr || t.lyEn || t.lyBusy) return; const key = 'koom.tr.' + t.c.videoId, c = J.get(key, null);
  if (c) { t.lyEn = c; return Q[qi] === t && drawLy(); }
  t.lyBusy = 1;
  try { t.lyEn = await translateLines(lyRows(t)); J.set(key, t.lyEn); } catch (e) { toast('English lyrics are unavailable right now'); }
  t.lyBusy = 0; if (Q[qi] === t) drawLy();
}
window.drawLy = function () {
  const t = Q[qi]; if (!t) return; const s = t.lyr || '', b = $('#ly'); L = lrc(s); ai = -2;
  if (!s) { b.innerHTML = '<div class="msg">Lyrics aren\'t available for this song.</div>'; updLine(); lmSync(); return; }
  const mode = S.lyMode || 'orig', dual = !!S.lyDual && mode !== 'orig';
  if (mode === 'en') ensureEn(t);
  const conv = (tx, i) => mode === 'roman' ? roman(tx) : mode === 'en' ? ((t.lyEn && t.lyEn[i]) || tx) : tx;
  if (L.length > 1) {
    if (L[0].t > 6) { L.unshift({ t: 0, tx: '', w: [] }); if (t.lyEn) t.lyEn = ['', ...t.lyEn]; }
    L.forEach((l, i) => {
      l.main = dual ? l.tx : conv(l.tx, i); l.sub = dual ? conv(l.tx, i) : '';
      if (l.main !== l.tx) l.w = [];                          // timings belong to the original words
      if (S.lyAnim && l.main && !l.w.length) {                // spread words over the line (a horizontal sweep breaks on wrapped lines)
        const nx = L[i + 1] ? L[i + 1].t : l.t + 4, span = Math.max(.4, (nx - l.t) * .9), sp = /\s/.test(l.main), ws = sp ? l.main.split(/\s+/) : Array.from(l.main), tot = ws.join('').length || 1; let c = 0;
        l.w = ws.map((w, n) => { const at = l.t + span * (c / tot); c += w.length; return [at, w + (sp && n < ws.length - 1 ? ' ' : '')]; });
      }
    });
    b.innerHTML = L.map((l, i) => `<p id="l${i}" data-t="${l.t}" class="${!l.tx ? 'gap' : ''}">${!l.tx ? '<i></i><i></i><i></i>' : (l.w.length ? l.w.map(w => `<span class="wd" data-t="${w[0]}">${esc(w[1])}</span>`).join('') : esc(l.main))}${l.sub ? `<small class="sub">${esc(l.sub)}</small>` : ''}</p>`).join('');
  } else {
    L = []; const rows = s.split('\n'); b.innerHTML = `<p class="plain">${rows.map((r, i) => esc(dual ? r : conv(r, i)) + (dual ? '<small class="sub">' + esc(conv(r, i)) + '</small>' : '')).join('<br>')}</p>`;
  }
  lyStart(); updLine(); lmSync();
};
/* one-line lyric above the progress bar (mirrors the active line of the full lyrics) */
function marq(el) {                      // text wider than its box scrolls back and forth instead of being cut with "..."
  if (!el) return; let i = el.querySelector(':scope > .mqi');
  if (!i) { i = document.createElement('span'); i.className = 'mqi'; while (el.firstChild) i.append(el.firstChild); el.append(i); }
  el.classList.remove('mq'); el.style.removeProperty('--mqd'); if (!el.clientWidth) return;
  requestAnimationFrame(() => { const d = i.scrollWidth - el.clientWidth; if (d > 6) { el.style.setProperty('--mqd', d + 'px'); el.style.setProperty('--mqt', (d / 26 + 3.4).toFixed(1) + 's'); el.classList.add('mq'); } });
}
const marqAll = () => { marq($('#nt')); marq($('#na')); marq($('#lyt')); marq($('#lya')); const l = $('#nplyt'); if (l && !l.querySelector('.wd')) marq(l); };
function updLine() {
  const el = $('#nplyt'), box = $('#nplyl'); if (!el) return; const t = Q[qi];
  if (!t || !t.lyr || !L.length) { box.hidden = true; return; } box.hidden = false;
  const p = ai >= 0 ? document.getElementById('l' + ai) : null;
  if (!p || p.classList.contains('gap')) { el.innerHTML = '<span class="lyin"><span class="gp">♪</span></span>'; return; }
  const c = p.cloneNode(true); c.querySelectorAll('.sub').forEach(x => x.remove()); el.innerHTML = '<span class="lyin">' + c.innerHTML + '</span>';
  if (!el.querySelector('.wd')) marq(el);
}
const _lyA = window.lyActive; window.lyActive = function (sc) { _lyA(sc); updLine(); };
const _lyF = window.lyFrame; window.lyFrame = function () {
  _lyF();
  if (ai >= 0) { const src = document.querySelectorAll('#l' + ai + ' .wd'), dst = document.querySelectorAll('#nplyt .wd'); dst.forEach((d, k) => src[k] && d.classList.toggle('w', src[k].classList.contains('w')));
    const el = $('#nplyt'), inn = el && el.querySelector('.lyin');       // keep the filling word in view on long lines
    if (inn) { const over = inn.scrollWidth - el.clientWidth, last = [...inn.querySelectorAll('.wd.w')].pop(); el.classList.toggle('sl', over > 4 && !!last && last.offsetLeft + last.offsetWidth > el.clientWidth - 40); inn.style.transform = over > 4 && last ? `translateX(${-Math.min(over, Math.max(0, last.offsetLeft + last.offsetWidth - el.clientWidth + 40))}px)` : ''; }
  }
};
const LMODES = [['orig', 'Original'], ['roman', 'Hinglish'], ['en', 'English']];
function lmSync() { const r = $('#lymodes'); if (!r) return; r.querySelectorAll('[data-lm]').forEach(b => { const k = b.dataset.lm; b.classList.toggle('on', k === 'dual' ? !!S.lyDual : k === (S.lyMode || 'orig')); }); r.classList.toggle('busy', !!(Q[qi] && Q[qi].lyBusy)); }

/* ---------- dialogs, playlists in Library, data export ---------- */
function kAsk(title, ph = '', val = '') {
  return new Promise(res => {
    const w = document.createElement('div'); w.className = 'kdlg';
    w.innerHTML = `<div class="kbox"><h3>${esc(title)}</h3><input maxlength="60" placeholder="${esc(ph)}" value="${esc(val)}" aria-label="${esc(title)}"><div class="kbtn"><button class="btn2" data-c>Cancel</button><button class="pill pri" data-o>Save</button></div></div>`;
    document.body.append(w); const i = w.querySelector('input'); i.focus(); i.select();
    const done = v => { w.remove(); res(v); };
    w.onclick = e => { if (e.target === w || e.target.closest('[data-c]')) done(null); else if (e.target.closest('[data-o]')) done(i.value.trim() || null); };
    i.onkeydown = e => { if (e.key === 'Enter') done(i.value.trim() || null); else if (e.key === 'Escape') done(null); };
  });
}
async function newPlaylist(urls = []) {
  const n = await kAsk('New playlist', 'Playlist name'); if (!n) return null;
  const id = 'u' + Date.now().toString(36); UPL.push({ id, name: n, urls }); J.set('ml.pl', UPL); persist(); buildU(); drawSide(); toast('Playlist created'); return id;
}
function myPl() {
  const t = UPL.map(p => { const T = p.urls.map(u => TM.get(u) && TM.get(u).t).filter(Boolean); return { kind: 'p', id: p.id, title: p.name, sub: p.urls.length + ' songs', thumb: T[0] ? cover(T[0]) : '' }; });
  return sh('My Playlists') + `<div class="hr"><div class="card k newpl" tabindex="0" role="button" data-act="newpl"><div class="art"><div class="plus">+</div></div><b>New Playlist</b><small>Create</small></div>${t.map(x => cardX(x)).join('')}</div>`;
}
const exportData = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(ml|koom)\./.test(k)) o[k] = localStorage.getItem(k); } const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], { type: 'application/json' })); a.download = 'koom-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
function importData() { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.onchange = async () => { try { const o = JSON.parse(await f.files[0].text()); Object.entries(o).forEach(([k, v]) => { if (/^(ml|koom)\./.test(k)) localStorage.setItem(k, v); }); toast('Backup restored'); setTimeout(() => location.reload(), 700); } catch (e) { toast('That file is not a KOOM backup'); } }; f.click(); }

/* ---------- Settings: organised sections ---------- */
const sel = (k, opts, cur) => `<select class="sel" data-kq="${k}" aria-label="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const FMTS = [['', 'Auto'], ['m4a', 'M4A (AAC)'], ['webm', 'WebM (Opus)']];
const kPlay = () => `<div class="sg"><h2>Streaming</h2><div class="sc">${sr('Streaming quality', 'Higher quality uses more data', sel('sq', KQP, curQ()))}${sr('Audio format', 'M4A plays on every device, WebM (Opus) is smaller', sel('sf', FMTS, S.sf || ''))}${sr('Pre-load next song', 'The next song starts instantly', sw('pf'))}${sr('Skip unplayable songs', 'Moves on if a song can’t be played', sw('skip'))}${sr('Music taste', 'Used for Made For You on Home', '<button class="btn2" data-act="taste">Edit</button>')}</div></div>
<div class="sg"><h2>Downloads</h2><div class="sc">${sr('Download quality', 'Used by every Download button', sel('dq', DQP, S.dq || 'ask'))}${sr('Audio format', 'Same setting as streaming', sel('sf', FMTS, S.sf || ''))}</div></div>`;
let deferredInstall = null, INST_SHOWN = 0; const DAY = 864e5;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
async function pwaInstalled() { if (LS.get('koom.pwa') === 'in') return true; try { if (navigator.getInstalledRelatedApps) { const r = await navigator.getInstalledRelatedApps(); if (r && r.length) return true; } } catch (e) { } return false; }
function openInstalled() { window.open(location.href.split('#')[0], '_blank'); setTimeout(() => toast('If it didn’t open, tap the ' + APP.name + ' icon on your home screen'), 1400); }
async function installFlow() {
  if (isStandalone()) return toast(APP.name + ' is already installed');
  if (deferredInstall) { deferredInstall.prompt(); const c = await deferredInstall.userChoice.catch(() => null); if (c && c.outcome === 'accepted') LS.set('koom.pwa', 'in'); deferredInstall = null; return; }
  if (await pwaInstalled()) return openInstalled();
  toast(location.protocol === 'http:' && !/^(localhost|127\.)/.test(location.hostname) ? 'Installing needs an https address' : isIOS() ? 'Tap Share, then “Add to Home Screen”' : 'Open the browser menu and choose “Install app”');
}
function closeInst(snooze) { const el = $('#kinst'); if (!el) return; if (snooze) LS.set('koom.inst.snooze', Date.now() + snooze); el.classList.add('out'); setTimeout(() => el.remove(), 320); }
async function maybeInstallPrompt() {
  if (INST_SHOWN || $('#kinst') || isStandalone() || !window.isSecureContext) return;
  if (!/^#?\/?$/.test(location.hash) || Date.now() < (+LS.get('koom.inst.snooze') || 0) || (+LS.get('koom.visits') || 1) < 2) return;
  if ($('#np').classList.contains('open') || $('#wel')) return;
  const inst = await pwaInstalled(), ios = isIOS(); if (!deferredInstall && !ios && !inst) return;
  INST_SHOWN = 1; const mode = inst ? 'open' : deferredInstall ? 'install' : 'ios';
  const T = { install: ['Install ' + APP.name, 'Full-screen, faster, and one tap from your home screen.', 'Install'], open: [APP.name + ' is installed', 'Open it from your home screen for the full-screen experience.', 'Open app'], ios: ['Add ' + APP.name + ' to your Home Screen', 'Tap Share, then “Add to Home Screen”.', 'Got it'] }[mode];
  const el = document.createElement('div'); el.id = 'kinst'; el.className = 'kinst'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', T[0]);
  el.innerHTML = `<img src="icon-192.png" alt="" width="48" height="48"><div class="kit"><b>${esc(T[0])}</b><span>${esc(T[1])}</span></div><button class="kx" aria-label="Close">×</button><div class="kia"><button class="btn2" data-i="later">Later</button><button class="pill pri" data-i="go">${T[2]}</button></div><i class="kbar"></i>`;
  document.body.append(el);
  el.addEventListener('animationend', e => { if (e.target.classList.contains('kbar')) closeInst(6 * 36e5); });      // nobody tapped: close, ask again in a few hours
  ['pointerdown', 'focusin'].forEach(ev => el.addEventListener(ev, () => el.classList.add('hold')));
  ['pointerup', 'pointercancel', 'focusout'].forEach(ev => el.addEventListener(ev, () => el.classList.remove('hold')));
  el.onclick = e => {
    if (e.target.closest('.kx')) return closeInst(3 * DAY);
    const b = e.target.closest('[data-i]'); if (!b) return;
    if (b.dataset.i === 'later') return closeInst(3 * DAY);
    closeInst(mode === 'ios' ? 14 * DAY : 1 * DAY); if (mode === 'install') installFlow(); else if (mode === 'open') openInstalled();
  };
}
addEventListener('hashchange', () => { if (!/^#?\/?$/.test(location.hash)) closeInst(0); });
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; setTimeout(maybeInstallPrompt, 3500); });
addEventListener('appinstalled', () => { deferredInstall = null; LS.set('koom.pwa', 'in'); closeInst(0); toast(APP.name + ' installed'); });
const _kp = window.kProfile; window.kProfile = () => _kp() + kPlay();
const _showSet = window.showSet;
window.showSet = function () {
  _showSet();
  const g = [...V.querySelectorAll(':scope > .sg')];     // 0 Profile, 1 Streaming, 2 Downloads, 3 Appearance, 4 Audio, 5 Lyrics, 6 Storage, 7 Shortcuts, 8 About
  if (g.length < 9) return;
  g[4].querySelector('h2').textContent = 'Playback'; g[4].querySelector('.sc').insertAdjacentHTML('beforeend', sr('Voice search language', 'Used by the microphone in Search', sel('vl', [['en-IN', 'English (India)'], ['hi-IN', 'Hindi'], ['pa-IN', 'Punjabi'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)']], S.vl || 'en-IN'))); g[6].querySelector('h2').textContent = 'Library & data';
  g[3].querySelector('.sc').insertAdjacentHTML('beforeend', sr('Reduce motion', 'Fewer animations', sw('rm')));
  g[5].querySelector('.sc').insertAdjacentHTML('afterbegin', sr('Lyrics language', 'Hindi and Punjabi lyrics can be shown in Hinglish (Roman) or translated to English', sel('lyMode', [['orig', 'Original'], ['roman', 'Hinglish (Roman)'], ['en', 'English (translated)']], S.lyMode || 'orig')) + sr('Show original with translation', 'Both lines together', sw('lyDual')));
  g[6].querySelector('.sc').insertAdjacentHTML('beforeend', sr('Search history', J.get('koom.sh', []).length + ' searches', '<button class="btn2" data-act="shclr">Clear</button>') + sr('Backup', 'Save or restore your library, playlists and settings', '<span><button class="btn2" data-act="kexp">Export</button> <button class="btn2" data-act="kimp">Import</button></span>'));
  if (!matchMedia('(display-mode: standalone)').matches) g[8].querySelector('.sc').insertAdjacentHTML('afterbegin', sr('Install ' + APP.name, 'Add it to your home screen for a full-screen app', '<button class="btn2" data-act="install">' + (LS.get('koom.pwa') === 'in' ? 'Open' : 'Install') + '</button>'));
  const order = [g[0], g[3], g[4], g[1], g[2], g[5], g[6], g[7], g[8]], ids = ['profile', 'look', 'play', 'stream', 'dl', 'lyr', 'data', 'keys', 'about'];
  order.forEach((e, i) => { e.id = 'st-' + ids[i]; V.append(e); });
  const jump = [['profile', 'Profile'], ['look', 'Appearance'], ['play', 'Playback'], ['stream', 'Streaming'], ['dl', 'Downloads'], ['lyr', 'Lyrics'], ['data', 'Data'], ['about', 'About']];
  V.querySelector('h1').insertAdjacentHTML('afterend', `<nav class="sjump" aria-label="Settings sections">${jump.map(([k, l]) => `<button data-jump="st-${k}">${l}</button>`).join('')}</nav>`);
};
V.addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (b) { const t = document.getElementById(b.dataset.jump); t && t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
V.addEventListener('change', e => { const s = e.target.closest('[data-kq]'); if (!s) return; S[s.dataset.kq] = s.value; saveS(); SC.clear(); if (/^ly/.test(s.dataset.kq)) { if (s.value === 'orig') S.lyDual = 0; drawLy(); } V.querySelectorAll(`[data-kq="${s.dataset.kq}"]`).forEach(x => x.value = s.value); toast('Saved'); });
const _apply = window.applySet; window.applySet = function () { _apply(); document.body.classList.toggle('rm', !!S.rm); };

/* ---------- resume where you left off + gestures ---------- */
let RESUME = null;
function saveSess() {
  if (!Q.length || qi < 0) return; const prev = J.get('koom.sess', null) || {};
  J.set('koom.sess', { u: Q.slice(0, 100).map(t => t.url), i: Math.min(qi, 99), t: RESUME ? RESUME.t : Math.floor(A.currentTime || 0), pl: RESUME ? !!prev.pl : !A.paused, sh: shuffle ? 1 : 0, rp: rep || 0 }); persist();
}
setInterval(() => { if (!A.paused) saveSess(); }, 4000); addEventListener('pagehide', saveSess); addEventListener('beforeunload', saveSess); A.addEventListener('pause', saveSess); A.addEventListener('play', saveSess);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSess(); });
const _pl2 = window.play; window.play = function () { RESUME = null; return _pl2.apply(this, arguments); };
{ const _tf = window.toggleFav; window.toggleFav = function () { navigator.vibrate && navigator.vibrate(10); return _tf.apply(this, arguments); }; }
function applyModes() {
  all('.shf').forEach(e => e.classList.toggle('on', !!shuffle));
  all('.rpt').forEach(e => { e.classList.toggle('on', rep > 0); e.innerHTML = ic('rep', 22) + (rep === 2 ? '<b style="position:absolute;font-size:.6rem">1</b>' : ''); });
}
function saveUI() { const np = $('#np'); J.set('koom.ui', { open: np.classList.contains('open') ? 1 : 0, lyf: np.classList.contains('lyf') ? 1 : 0, tab: $('#ly') && !$('#ly').hidden ? 'ly' : 'q' }); }
function restoreSession() {
  const ss = J.get('koom.sess', null); if (!ss || !ss.u || !ss.u.length) return;
  const T = ss.u.map(u => TM.get(u) && TM.get(u).t), cur = T[ss.i] || T.find(Boolean), tr = T.filter(Boolean); if (!cur) return;
  Q = tr; qi = tr.indexOf(cur); const t0 = T[ss.i] ? ss.t || 0 : 0; RESUME = { t: t0 };
  if (ss.sh !== undefined) { shuffle = ss.sh ? 1 : 0; rep = ss.rp || 0; applyModes(); }
  ui(); drawQ(); setPP(); $('#bar').classList.add('on');                        // mini player stays visible
  const d = cur.c.duration || 0;
  if (d && t0) { const p = Math.min(1000, Math.round(t0 / d * 1000)); all('.sk').forEach(e => { e.value = p; e.style.setProperty('--p', p / 10 + '%'); }); all('.ct').forEach(e => e.textContent = mm(t0)); const r = $('.npl .dur'); if (r) r.textContent = '-' + mm(Math.max(0, d - t0)); }
  const u = J.get('koom.ui', null); if (u && u.open) { openNP(u.tab !== 'q'); if (u.lyf) $('#np').classList.add('lyf'); seg(u.tab !== 'q'); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }   // player / queue screen stays open
  if (ss.pl) setTimeout(() => { if (RESUME && Q[qi]) { const t = RESUME.t; RESUME = null; play(qi, t); } }, 600);          // was playing: try to carry on (browser may ask for a tap)
}
all('.pp').forEach(b => b.addEventListener('click', e => { if (RESUME && Q[qi] && !A.getAttribute('src')) { e.stopImmediatePropagation(); const t = RESUME.t; RESUME = null; play(qi, t); } }, true));
{ const np = $('#np'); let y0 = 0, dy = 0, on = 0;       // swipe the artwork down to close the player
  np.addEventListener('touchstart', e => { if (np.classList.contains('lyf') || !e.target.closest('.nccov,.npfrom') || np.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; on = 1; }, { passive: true });
  np.addEventListener('touchmove', e => { if (!on) return; dy = e.touches[0].clientY - y0; if (dy > 0) { np.style.transition = 'none'; np.style.transform = `translateY(${dy * .85}px)`; np.style.opacity = 1 - Math.min(.5, dy / 600); } }, { passive: true });
  np.addEventListener('touchend', () => { if (!on) return; on = 0; np.style.transition = 'transform .28s ease, opacity .28s'; const reset = () => { np.style.transform = ''; np.style.opacity = ''; np.style.transition = ''; };
    if (dy > 120) { np.style.transform = 'translateY(100%)'; setTimeout(() => { $('.npx').click(); reset(); }, 230); } else { np.style.transform = ''; np.style.opacity = ''; setTimeout(() => np.style.transition = '', 300); } }); }

/* ---------- Now Playing (Apple-style) ---------- */
const SVG = {
  quote: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm4.2 4.2c-1 .6-1.7 1.7-1.7 3.1h2.2v2.4H5.9v-2.1c0-2 .9-3.4 2.3-4.2zm5.6 0c-1 .6-1.7 1.7-1.7 3.1h2.2v2.4h-2.8v-2.1c0-2 .9-3.4 2.3-4.2z" fill-rule="evenodd"/></svg>',
  phones: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1.5a1 1 0 0 0 1-1v-6.5a1 1 0 0 0-1-1H5V12a7 7 0 0 1 14 0v1.5h-2.5a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1H18a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9z"/></svg>',
  list: '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><circle cx="4.5" cy="6.5" r="1.7"/><circle cx="4.5" cy="12" r="1.7"/><circle cx="4.5" cy="17.5" r="1.7"/><rect x="8.5" y="5.3" width="13" height="2.4" rx="1.2"/><rect x="8.5" y="10.8" width="13" height="2.4" rx="1.2"/><rect x="8.5" y="16.3" width="13" height="2.4" rx="1.2"/></svg>',
  rew: '<svg viewBox="0 0 24 24" width="50" height="50" fill="currentColor"><path d="M11 18V6l-8.5 6zM21.5 18V6L13 12z"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" width="50" height="50" fill="currentColor"><path d="M13 6v12l8.5-6zM2.5 6v12L11 12z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  spk: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/></svg>',
  spk2: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};
function buildNP() {
  const npl = document.querySelector('.npl'), nc = $('#nc'); if (!npl || document.getElementById('npfrom')) return;
  const wrap = document.createElement('div'); wrap.className = 'nccov'; nc.replaceWith(wrap); wrap.append(nc);
  wrap.insertAdjacentHTML('beforeend', '<div class="npinfo" id="npinfo" role="button" tabindex="0"></div>');
  npl.insertAdjacentHTML('afterbegin', '<div class="npfrom"><i class="grab"></i><span id="npfrom"></span></div>');
  npl.querySelector('.skr').insertAdjacentHTML('beforebegin', `<button class="nplyl" id="nplyl" hidden aria-label="Open lyrics"><span class="nplyt" id="nplyt"></span>${SVG.chev}</button>`);
  const vr = npl.querySelector('.vrow'); vr.querySelector('.vi').innerHTML = SVG.spk; vr.insertAdjacentHTML('beforeend', `<span class="vi2">${SVG.spk2}</span>`);
  npl.querySelector('.ctl .pv').innerHTML = SVG.rew; npl.querySelector('.ctl .nx').innerHTML = SVG.fwd;
  npl.insertAdjacentHTML('beforeend', `<div class="npbot"><button class="ib npb" id="npbl" aria-label="Lyrics">${SVG.quote}</button><div class="pill2"><button id="npq" aria-label="Audio quality">${SVG.phones}</button><i></i><button id="npdl" aria-label="Download">${ic('dl', 24)}</button></div><button class="ib npb" id="npqq" aria-label="Up next">${SVG.list}</button></div><div class="npdev" id="npdev"></div>`);
  document.querySelector('.segrow').insertAdjacentHTML('afterend', `<div class="lymodes" id="lymodes">${LMODES.map(([k, l]) => `<button data-lm="${k}">${l}</button>`).join('')}<button data-lm="dual" title="Show original and translation together">Both</button></div><div class="qmode" id="qmode" hidden><button class="ib shf" id="qshf" aria-label="Shuffle">${ic('shuf', 22)}</button><button class="ib rpt" id="qrpt" aria-label="Repeat">${ic('rep', 22)}</button><button class="btn2" data-act="qshufup">Shuffle Up Next</button><button class="btn2" data-act="qdedupe">Remove duplicates</button><button class="btn2" data-act="qsave">Save as playlist</button><button class="btn2" data-act="qclear">Clear</button></div>`);
  const np = $('#np');
  $('#npbl').onclick = $('#nplyl').onclick = () => { np.classList.add('lyf'); seg(true); };
  $('#npqq').onclick = () => { np.classList.add('lyf'); seg(false); };
  $('#npq').onclick = $('#npinfo').onclick = e => Q[qi] && qualityMenu(Q[qi], e.currentTarget);
  $('#npdl').onclick = e => npDownload(Q[qi], e.currentTarget);
  $('#qshf').onclick = () => $('.ctl .shf').click(); $('#qrpt').onclick = () => $('.ctl .rpt').click();     // same state as the player (they share the .shf/.rpt classes)
  new MutationObserver(saveUI).observe(np, { attributes: true, attributeFilter: ['class'] }); new MutationObserver(saveUI).observe($('#ly'), { attributes: true, attributeFilter: ['hidden'] });
  $('#lymodes').onclick = e => {
    const b = e.target.closest('[data-lm]'); if (!b) return; const k = b.dataset.lm;
    if (k === 'dual') S.lyDual = S.lyDual ? 0 : 1; else { S.lyMode = k; if (k === 'orig') S.lyDual = 0; } saveS(); drawLy();
  };
  $('.npl .skr .sk').addEventListener('input', e => { const d = A.duration; if (d) $('.npl .dur').textContent = '-' + mm(d - e.target.value / 1000 * d); });
  A.addEventListener('timeupdate', () => { if (!drag && A.duration) $('.npl .dur').textContent = '-' + mm(A.duration - A.currentTime); });
}
function artistLinks(t) {
  const L0 = t.c.artists && t.c.artists.length ? t.c.artists : t.c.artist ? [{ n: t.c.artist, id: t.c.artistId || '' }] : [];
  const a = L0.map(x => `<a class="alink" ${x.id ? `data-aid="${esc(x.id)}"` : `data-an="${esc(x.n)}"`}>${esc(x.n)}</a>`).join(', ');
  return a + (t.c.album ? ` — <a class="alink" ${t.c.albumId ? `data-alb="${esc(t.c.albumId)}"` : ''}>${esc(t.c.album)}</a>` : '');
}
function gotoArtistByName(n) {
  SQ.q = n; SQ.f = 'artists'; SQ.items = []; SQ.page = 1; SQ.done = 0;
  if (location.hash === '#/search') { showSearch(); runSearch(n, 1); } else { location.hash = '#/search'; setTimeout(() => $('#sq') && runSearch(n, 1), 140); }
}
$('#na').addEventListener('click', e => {
  const a = e.target.closest('.alink'); if (!a) return; e.stopPropagation(); closeNP();
  if (a.dataset.aid) location.hash = '#/artist/' + enc(a.dataset.aid); else if (a.dataset.alb) location.hash = '#/album/' + enc(a.dataset.alb); else if (a.dataset.an) gotoArtistByName(a.dataset.an);
});
V.addEventListener('click', e => {                     // artist name under a song row opens the artist page
  const el = e.target.closest('.tr .ar, .tr .ti small'); if (!el) return; const tr = el.closest('.tr'), en = TM.get(tr.dataset.u), t = en && en.t; if (!t) return;
  const id = (t.c.artists && t.c.artists[0] && t.c.artists[0].id) || t.c.artistId; if (!id) return; e.stopPropagation(); e.preventDefault(); location.hash = '#/artist/' + enc(id);
}, true);
/* "Up next" line under the cover — refreshed on every queue change (drawQ) and track change (npMeta) */
function npInfo() {
  const el = $('#npinfo'); if (!el) return; const t = Q[qi], n = Q[qi + 1], i = qInfo(t), kb = kbOf(i);
  const a = i && i.ext ? `${i.ext === 'm4a' ? 'AAC' : i.ext === 'webm' ? 'Opus' : (i.ext || 'Audio').toUpperCase()}${kb ? ' · ~' + kb + ' kbps' : ''} · Stereo` : (t && OFF.has(t.url) ? 'Downloaded · Plays offline' : '');
  el.innerHTML = t ? a + (n ? (a ? '<br>' : '') + `Up next · ${esc(title(n))}` : '') : '';
}
function npMeta() {
  const t = Q[qi]; if (!t || !$('#npfrom')) return; const i = QINFO.get(t.c.videoId), n = Q[qi + 1], kb = i && ITAG[i.fmt];
  const pl = KPL && KPL.name ? KPL : curPl; $('#npfrom').textContent = pl && pl.name ? 'Playing from ' + pl.name : '';
  npInfo();
  $('#npdev').textContent = (NAME() ? NAME() + '’s ' : '') + (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'Phone' : 'Device');
  $('#na').innerHTML = artistLinks(t); $('#npdl').innerHTML = ic('dl', 24); if (t.c.big && $('#nc').getAttribute('src') !== t.c.big) $('#nc').src = t.c.big; marqAll();
}
let KPL = null; const _pf = window.playFrom; window.playFrom = function (p) { KPL = p; return _pf.apply(this, arguments); };
const _op = window.openNP; window.openNP = function () { const r = _op.apply(this, arguments); requestAnimationFrame(() => requestAnimationFrame(marqAll)); return r; };
let _rz; addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(marqAll, 200); });
const _seg = window.seg;
window.seg = function (l) { _seg(l); requestAnimationFrame(() => requestAnimationFrame(marqAll)); const a = $('#lymodes'), b = $('#qmode'); if (a) a.hidden = !l; if (b) b.hidden = !!l; if (l) lmSync(); };
V.addEventListener('click', e => { if (e.target.closest('[data-st="lyDual"]')) setTimeout(() => { drawLy(); }, 60); });

/* ---------- boot ---------- */
(async function koomBoot() {
  const t0 = performance.now(); window.__koomUp = 1;
  document.title = `${APP.name} — ${APP.tagline}`; window.SITE = APP.name; all('.site').forEach(e => e.textContent = APP.name);
  const o = J.get('koom.tracks', {}); for (const [u, c] of Object.entries(o)) TM.set(u, { t: { c, url: u, tags: {}, alt: '' }, p: null });
  const mt = document.createElement('header'); mt.className = 'mtop'; mt.innerHTML = `<a class="mbrand" href="#/"><img src="icon-192.png" alt="" width="42" height="42"><div><b>${esc(APP.name)}</b><small>${esc(APP.tagline)}</small></div></a><a class="av" href="#/settings" aria-label="Profile"></a>`; V.parentNode.insertBefore(mt, V);
  { const bl = document.querySelector('.brand [data-ic]'); if (bl) { const im = document.createElement('img'); im.src = 'icon-192.png'; im.alt = ''; im.className = 'blogo'; im.width = im.height = 30; bl.replaceWith(im); } }
  LS.set('koom.visits', (+LS.get('koom.visits') || 0) + 1); if (isStandalone()) LS.set('koom.pwa', 'in');
  if (!navigator.onLine) netBar(true);
  if (S.pf === undefined) S.pf = 1; if (S.skip === undefined) S.skip = 1; saveS();
  buildNP();
  P = []; buildU(); applySet(); $('#bt').textContent = 'Not Playing'; restoreSession();
  [API_CONFIG.MUSIC_API_URL, API_CONFIG.STREAM_API_URL].forEach(u => { if (!real(u)) return; const l = document.createElement('link'); l.rel = 'preconnect'; l.href = new URL(u).origin; document.head.append(l); http(u, '/health', { ttl: 600000 }).catch(() => { }); });   // wake the services + open the connections early
  ['https://i.ytimg.com', 'https://lh3.googleusercontent.com'].forEach(h => { const l = document.createElement('link'); l.rel = 'preconnect'; l.href = h; document.head.append(l); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.)/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => { });
  const hideSplash = async () => { const sp = $('#splash'); await wsleep(Math.max(0, 1100 - (performance.now() - t0))); if (sp) { sp.classList.add('out'); await wsleep(480); sp.remove(); } };
  setTimeout(maybeInstallPrompt, 6500);
  if (NAME()) { refreshAv(); route(); await hideSplash(); }
  else { await hideSplash(); await welcome(); refreshAv(); route(); }
})();
$('#ndl').onclick = e => dlChoose(Q[qi], e.currentTarget);
