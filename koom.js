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
  QINFO.set(id, { fmt: String(r.format_id || ''), ext: r.ext || '' });
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
  return { kind: k, id, title, artist, artistId: (A && A[0] && (A[0].id || A[0].browseId)) || x.artistId || x.channelId || d.artistId || '', album, albumId: (al && (al.id || al.browseId)) || x.albumId || d.albumId || '', thumb, big, dur: secs(x.duration_seconds ?? x.durationSeconds ?? x.lengthSeconds ?? x.length ?? x.duration), sub, rank: x.rank || x.position || 0 };
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
  const t = { url, tags: {}, alt: '', c: { title: x.title, artist: x.artist, album: x.album, cover: x.thumb, big: x.big, duration: x.dur, videoId: x.id, artistId: x.artistId, albumId: x.albumId } };
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
const persist = () => { const keep = new Set([...FAV, ...HIST.map(h => h.u), ...UPL.flatMap(p => p.urls)]), o = {}; keep.forEach(u => { const e = TM.get(u); if (e) o[u] = e.t.c; }); J.set('koom.tracks', o); };
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
window.drawQ = function () {
  const el = $('#qq'); if (!Q.length) { el.innerHTML = '<div class="msg">Your queue is empty.</div>'; return; }
  let g = '', h = `<div class="qtop"><b>Queue · ${Q.length}</b><span><button class="btn2" data-act="qsave">Save as playlist</button> <button class="btn2" data-act="qclear">Clear</button></span></div>`;
  Q.forEach((t, i) => {
    const G = i < qi ? 'Played' : i === qi ? 'Now Playing' : t.rec ? 'Recommended' : 'Up Next';
    if (G !== g) { g = G; h += `<div class="qh">${G}</div>`; }
    h += `<div class="qr ${i === qi ? 'cur' : ''}" data-i="${i}" tabindex="0" role="button"><img src="${esc(cover(t))}" alt="" loading="lazy"><div><b>${esc(title(t))}</b><small>${esc(artist(t))}</small></div>${i === qi ? '' : `<span class="qmv"><button class="ib sm" data-mv="-1" aria-label="Move up">▲</button><button class="ib sm" data-mv="1" aria-label="Move down">▼</button><button class="ib sm" data-x aria-label="Remove">${ic('x', 16)}</button></span>`}</div>`;
  });
  el.innerHTML = h;
};
$('#qq').addEventListener('click', e => {
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
const listHead = o => { const L = o.list; return `<div class="phead"><img class="pa" src="${esc(o.thumb || PH)}" alt=""><div class="pt"><span class="kick">${o.kick}</span><h1>${esc(o.title)}</h1>${o.desc ? `<p class="lead clamp">${esc(o.desc)}</p>` : ''}<p class="meta">${o.meta}</p><div class="btns"><button class="pill pri" data-act="pplay" data-pid="${L.id}">${ic('play', 18)}Play</button><button class="pill" data-act="pshuf" data-pid="${L.id}">${ic('shuf', 18)}Shuffle</button><button class="pill" data-act="qall" data-pid="${L.id}">${ic('qadd', 18)}Add to Queue</button>${o.lib || ''}</div></div></div>`; };
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
async function showHome() {
  view = 'home'; const my = RT, h = new Date().getHours(), g = h < 5 || h >= 18 ? 'Good evening' : h < 12 ? 'Good morning' : 'Good afternoon';
  const head = `<h1 class="lt">${g}, ${esc(NAME())}</h1><p class="lead">${APP.tagline}</p>`, rc = byId('~hist').tracks.slice(0, 12);
  const recent = rc.length ? sh('Recently Played', '<a href="#/history">See All</a>') + `<div class="hr">${rc.map((t, i) => `<div class="card rc" data-i="${i}" data-u="${esc(t.url)}" tabindex="0" role="button"><div class="art"><img src="${esc(cover(t))}" alt="" loading="lazy"></div><b>${esc(title(t))}</b><small>${esc(artist(t))}</small></div>`).join('')}</div>` : '';
  setV(head + skel('cards'), my);
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
  if (!ok) return setV(head + recent + errBox(R[0].reason), my);
  setV(head + recent + (body || '<div class="msg">Nothing to show yet.</div>'), my);
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
  V.innerHTML = `<h1 class="lt">Search</h1><div class="sw2"><input class="sbox" id="sq" placeholder="Search songs, artists, albums, playlists..." aria-label="Search" autocomplete="off"><div class="sug" id="sug" hidden></div></div><div class="stabs" id="stabs">${TABS.map(([k, l]) => `<button data-f="${k}" class="${SQ.f === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="sr"></div><div id="smore"></div>` + footer();
  const s = $('#sq'); s.value = SQ.q; let tm;
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
  if (!q) return; J.set('koom.sh', [q, ...J.get('koom.sh', []).filter(x => x !== q)].slice(0, 8)); $('#sug').hidden = true; if (!keep) { SQ.q = q; SQ.items = []; SQ.page = 1; SQ.done = 0; }
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
      <p class="whint" id="whint">Stored only on this device</p><button class="pill pri wbtn" id="wgo" disabled>Continue</button></div>`;
    document.body.append(w); const i = $('#wn'), btn = $('#wgo'), hint = $('#whint'); setTimeout(() => i.focus(), 500);
    mApi('/trending').then(d => { const a = flat(d).filter(x => x.thumb).slice(0, 8); if (a.length) $('.wbg').innerHTML = a.map(x => `<img src="${esc(x.thumb)}" alt="">`).join(''); }).catch(() => { });
    i.oninput = () => { btn.disabled = !i.value.trim(); hint.textContent = 'Stored only on this device'; hint.classList.remove('bad'); };
    const fin = n => { w.innerHTML = `${WBG}<div class="wc"><div class="wok"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h1 class="wh">Welcome, ${esc(n)}</h1></div>`; setTimeout(() => { w.classList.add('out'); setTimeout(() => { w.remove(); res(); }, 600); }, 1500); };
    const go = () => { const n = i.value.trim().replace(/\s+/g, ' '); if (!n) { hint.textContent = 'Please enter your name'; hint.classList.add('bad'); i.focus(); return; } LS.set('koom.name', n); pickGenres(w, () => fin(n), 2); };
    btn.onclick = go; i.onkeydown = e => { if (e.key === 'Enter') go(); };
  });
}
const SOC = [['instagram', 'Instagram', 'https://instagram.com/', 'IG'], ['github', 'GitHub', 'https://github.com/', 'GH'], ['youtube', 'YouTube', 'https://youtube.com/@', 'YT'], ['x', 'X / Twitter', 'https://x.com/', 'X']];
const socials = () => SOC.map(([k, n, b, ab]) => { let v = CREATOR[k]; if (!real(v)) return null; v = String(v).trim(); const u = /^https?:\/\//i.test(v) ? v : b + v.replace(/^@/, ''); return /^https?:\/\//i.test(u) ? { n, u, ab } : null; }).filter(Boolean);
const by = () => real(CREATOR.name) ? ' by ' + esc(CREATOR.name) : '';
const footer = () => `<footer class="kfoot"><div><b>${APP.name}</b><small>${APP.tagline}</small></div><nav><a href="#/about">About</a><a href="#/privacy">Privacy</a><a href="#/terms">Terms</a>${real(CREATOR.email) ? `<a href="mailto:${esc(CREATOR.email)}">Contact</a>` : '<a href="#/about">Contact</a>'}</nav><div class="socs">${socials().map(s => `<a class="soc" href="${esc(s.u)}" target="_blank" rel="noopener noreferrer" aria-label="${s.n}" title="${s.n}">${s.ab}</a>`).join('')}</div><p>© ${APP.year} ${APP.name} · Made with ❤️${by()}</p></footer>`;
function showAbout() {
  view = 'about'; const s = socials();
  setV(`<h1 class="lt">About ${APP.name}</h1><p class="lead">${APP.tagline}</p><div class="doc"><p>${APP.name} is a modern music discovery and listening interface designed to make finding and enjoying music simple.</p><p>Version: ${APP.version}</p>${real(CREATOR.name) || s.length ? `<h2>Meet the Creator</h2>${real(CREATOR.name) ? `<p><b>${esc(CREATOR.name)}</b></p>` : ''}<div class="btns">${s.map(x => `<a class="pill" href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">${x.n}</a>`).join('')}</div>` : ''}<p>Made with ❤️${by()}</p><p><a href="#/privacy">Privacy Policy</a> · <a href="#/terms">Terms of Service</a></p></div>`);
}
const contact = () => real(CREATOR.email) ? `<a href="mailto:${esc(CREATOR.email)}">${esc(CREATOR.email)}</a>` : 'the contact details listed on the <a href="#/about">About</a> page';
const LEGAL = {
  privacy: ['Privacy Policy', [
    ['What KOOM stores', `${APP.name} has no accounts. Everything it remembers stays in your browser’s local storage on your device: the display name you enter, your theme, language and playback settings, liked songs, your own playlists, recently played songs (up to 50), and a small cache of song details (title, artist, artwork link) needed to show those lists.`],
    ['What leaves your device', 'To work, KOOM sends requests to two services configured by the operator: a music data service (your search text, search suggestions, and the IDs of songs, artists, albums and playlists you open) and a stream service (the YouTube link of a song you choose to play). These requests necessarily include your IP address and browser details, and an API key. Your display name, liked songs, playlists and listening history are not sent to either service. If you choose English lyrics, the lyric text of that song is sent to Google Translate (translate.googleapis.com) and the result is kept on your device. Hinglish (Roman) lyrics are converted entirely on your device. Artwork is loaded from third-party image servers (such as Google and YouTube), and fonts are loaded from Google Fonts, which also see your IP address.'],
    ['Cookies and analytics', 'KOOM itself sets no cookies and includes no analytics or advertising tools. Third-party services above may log requests under their own policies.'],
    ['Retention and your choices', 'Local data stays until you clear it. You can change your name, clear recently played, remove liked songs or reset settings in Settings, or erase everything by clearing this site’s data in your browser.'],
    ['Children', 'KOOM is not directed to children under 13 and does not knowingly collect personal information from anyone.'],
    ['Contact', `Questions about this policy: ${contact()}.`]]],
  terms: ['Terms of Service', [
    ['Using KOOM', 'KOOM is a personal music discovery and listening interface. Use it lawfully and do not misuse, overload or attempt to disrupt the services it connects to.'],
    ['Third-party content', 'Music, videos, artwork, lyrics and metadata are provided by third parties and belong to their respective owners. KOOM does not own or host this content and claims no rights to it.'],
    ['Copyright and your responsibility', 'You are responsible for making sure your use of any content complies with copyright law and the terms of the content providers in your region.'],
    ['Availability and limits', 'The service depends on external APIs and may be slow, limited or unavailable at any time, and features may change or be removed without notice.'],
    ['Local profile', 'Your display name and library are stored only on your device; clearing browser data removes them.'],
    ['Disclaimer', 'KOOM is provided “as is” without warranties of any kind, and to the extent permitted by law its operator is not liable for losses arising from its use.'],
    ['Contact', `Questions about these terms: ${contact()}.`]]]
};
function showLegal(k) { view = k; const [t, s] = LEGAL[k]; setV(`<h1 class="lt">${t}</h1><p class="lead">Last updated: October 2026 · ${APP.name} v${APP.version}</p><div class="doc">${s.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join('')}</div>`); }
window.kProfile = () => `<div class="sg"><h2>Profile</h2><div class="sc">${sr('Display name', 'Shown in your greeting on Home', `<button class="btn2" data-act="editname">${esc(NAME()) || 'Set name'} ✎</button>`)}</div></div>`;
window.kAbout = () => `<div class="sg"><h2>About</h2><div class="sc">${sr(APP.name + ' · v' + APP.version, APP.tagline, '')}${['about:About', 'privacy:Privacy Policy', 'terms:Terms of Service'].map(x => { const [h, l] = x.split(':'); return sr(l, '', `<a class="btn2" href="#/${h}">Open</a>`); }).join('')}</div></div>`;
window.trackMenu = (t, p, anchor) => {
  const f = FAV.includes(t.url);
  openMenu([{ l: 'Play Next', i: 'next', fn: () => qAdd(t, true) }, { l: 'Add to Queue', i: 'qadd', fn: () => qAdd(t, false) }, { l: f ? 'Remove from Favourites' : 'Add to Favourites', i: f ? 'heartf' : 'heart', fn: () => toggleFav(t) }, { l: 'Add to Playlist…', i: 'plus', fn: () => pickPl(t) }, { l: 'Share', i: 'expand', fn: () => shareTrack(t) },
  p && p.custom ? { l: 'Remove from this playlist', i: 'trash', fn: () => rmFromPl(p, t) } : null, { sep: 1 },
  { l: 'Start Radio', i: 'shuf', fn: () => { Q = [t]; play(0); } }, { l: 'Audio quality…', i: 'info', fn: () => qualityMenu(t, anchor) }, { l: 'Download', i: 'dl', fn: () => dl(t, null, anchor) }, t.c.artistId ? { l: 'Go to Artist', i: 'logo', fn: () => location.hash = '#/artist/' + enc(t.c.artistId) } : null, t.c.albumId ? { l: 'Go to Album', i: 'logo', fn: () => location.hash = '#/album/' + enc(t.c.albumId) } : null].filter(Boolean), anchor, title(t));
};

/* ---------- routing / events ---------- */
window.route = function (keep) {
  RT++; const m = (location.hash.slice(1) || '/').split('/'), k = m[1], id = decodeURIComponent(m[2] || '');
  SQ.io && k !== 'search' && SQ.io.disconnect();
  ({ search: showSearch, fav: showFav, history: showHist, settings: showSet, trending: showTrend, new: showNew, about: showAbout, privacy: () => showLegal('privacy'), terms: () => showLegal('terms'), artist: () => showArtist(id), album: () => showAlbum(id), playlist: () => showRemotePl(id), p: () => showPl(id) }[k] || showHome)();
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
  host.innerHTML = `${WBG}<div class="wc">${step ? wdots(step) : ''}<h1>Pick what you love</h1><p class="ws">We’ll build Made For You from your taste.</p><div class="chips">${GENRES.map(g => `<button class="chip ${sel.has(g) ? 'on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div><p class="whint" id="gcnt">${cnt()}</p><button class="pill pri wbtn" id="wg2">Done</button><button class="skip" id="wsk">Skip for now</button></div>`;
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
  if (m[1] === 'browse' || m[1] === 'mood' || m[1] === 'library') { RT++; SQ.io && SQ.io.disconnect(); (m[1] === 'browse' ? showBrowse() : m[1] === 'library' ? showLibrary() : showMood(decodeURIComponent(m[2] || ''), decodeURIComponent(m[3] || ''))); all('[data-k]').forEach(a => a.classList.toggle('act', a.dataset.k === view)); drawSide(); fin(); if (!keep) scrollTo(0, 0); return; }
  return _route(keep);
};
const _act2 = window.act;
window.act = (a, c) => {
  if (a === 'editname') { kAsk('What should we call you?', 'Your name', NAME()).then(n => { if (n) { LS.set('koom.name', n.replace(/\s+/g, ' ').slice(0, 30)); refreshAv(); toast('Name updated'); route(1); } }); return; }
  if (a === 'install') { if (deferredInstall) { deferredInstall.prompt(); return; } return toast(location.protocol === 'http:' && !/^(localhost|127\.)/.test(location.hostname) ? 'Installing needs an https address' : /iPhone|iPad/i.test(navigator.userAgent) ? 'Tap Share, then “Add to Home Screen”' : 'Open the browser menu and choose “Install app”'); }
  if (a === 'newpl') { newPlaylist().then(id => { if (id) location.hash = '#/p/' + id; }); return; }
  if (a === 'qsave') { if (!Q.length) return toast('Queue is empty'); newPlaylist(Q.filter(t => t.c && t.c.videoId).map(t => t.url)); return; }
  if (a === 'shclr') { J.set('koom.sh', []); toast('Search history cleared'); return route(1); }
  if (a === 'kexp') return exportData();
  if (a === 'kimp') return importData();
  if (a === 'qclear') { Q.length = qi + 1; drawQ(); return toast('Up Next cleared'); }
  if (a === 'libadd') { const k = c.dataset.lk, on = libToggle(k, { kind: k.slice(0, -1), id: c.dataset.id, title: c.dataset.t, sub: c.dataset.sub, thumb: c.dataset.th }); c.innerHTML = on ? ic('check', 18) + 'In Library' : ic('plus', 18) + 'Add to Library'; return toast(on ? 'Added to Library' : 'Removed from Library'); }
  if (a === 'taste') { const w = document.createElement('div'); w.id = 'wel'; document.body.append(w); return pickGenres(w, () => { w.classList.add('out'); setTimeout(() => w.remove(), 600); toast('Music taste saved'); }); }
  if (a === 'savename') { _act2(a, c); return refreshAv(); }
  _act2(a, c);
};
function refreshAv() { const a = document.querySelector('.mtop .av'); if (a) a.textContent = (NAME()[0] || 'K').toUpperCase(); }

/* ---------- player quality chips, library, share ---------- */
const QINFO = new Map(), ITAG = { 139: 48, 140: 128, 141: 256, 249: 50, 250: 70, 251: 130, 256: 192, 258: 384 };
function qChips() {
  const t = Q[qi]; if (!t || !t.c.videoId) return; const i = QINFO.get(t.c.videoId);
  const q = EX.has(t.c.videoId) ? 'Custom' : { best: 'Auto', high: 'High', std: 'Standard', low: 'Data saver' }[curQ()];
  const kb = i && ITAG[i.fmt], main = i ? `${(i.ext || 'audio').toUpperCase()}${kb ? ' · ~' + kb + ' kbps' : ''}` : 'Loading…';
  $('#bq').textContent = i ? (i.ext || 'audio').toUpperCase() + (kb ? ' ' + kb + 'k' : '') : '…';
  $('#nbd').innerHTML = `<span class="qchip">${q}${i ? ' · ' + (i.ext || 'audio').toUpperCase() + (kb ? ' ' + kb + 'k' : '') : ''}</span>`;
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
  setV(`<h1 class="lt">Library</h1><div class="bgrid"><a class="bt t1" href="#/fav">Liked Songs<small>${FAV.length} songs</small></a><a class="bt t2" href="#/history">Recently Played<small>${HIST.length} songs</small></a></div>` + myPl() + sec('Albums', L.albums) + sec('Artists', L.artists) + sec('Saved playlists', L.playlists) + '', my);
}
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
const marqAll = () => { marq($('#nt')); marq($('#na')); const l = $('#nplyt'); if (l && !l.querySelector('.wd')) marq(l); };
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
let deferredInstall = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; }); addEventListener('appinstalled', () => { deferredInstall = null; toast('KOOM installed'); });
const _kp = window.kProfile; window.kProfile = () => _kp() + kPlay();
const _showSet = window.showSet;
window.showSet = function () {
  _showSet();
  const g = [...V.querySelectorAll(':scope > .sg')];     // 0 Profile, 1 Streaming, 2 Downloads, 3 Appearance, 4 Audio, 5 Lyrics, 6 Storage, 7 Shortcuts, 8 About
  if (g.length < 9) return;
  g[4].querySelector('h2').textContent = 'Playback'; g[6].querySelector('h2').textContent = 'Library & data';
  g[3].querySelector('.sc').insertAdjacentHTML('beforeend', sr('Reduce motion', 'Fewer animations', sw('rm')));
  g[5].querySelector('.sc').insertAdjacentHTML('afterbegin', sr('Lyrics language', 'Hindi and Punjabi lyrics can be shown in Hinglish (Roman) or translated to English', sel('lyMode', [['orig', 'Original'], ['roman', 'Hinglish (Roman)'], ['en', 'English (translated)']], S.lyMode || 'orig')) + sr('Show original with translation', 'Both lines together', sw('lyDual')));
  g[6].querySelector('.sc').insertAdjacentHTML('beforeend', sr('Search history', J.get('koom.sh', []).length + ' searches', '<button class="btn2" data-act="shclr">Clear</button>') + sr('Backup', 'Save or restore your library, playlists and settings', '<span><button class="btn2" data-act="kexp">Export</button> <button class="btn2" data-act="kimp">Import</button></span>'));
  if (!matchMedia('(display-mode: standalone)').matches) g[8].querySelector('.sc').insertAdjacentHTML('afterbegin', sr('Install KOOM', 'Add it to your home screen for a full-screen app', '<button class="btn2" data-act="install">Install</button>'));
  const order = [g[0], g[3], g[4], g[1], g[2], g[5], g[6], g[7], g[8]], ids = ['profile', 'look', 'play', 'stream', 'dl', 'lyr', 'data', 'keys', 'about'];
  order.forEach((e, i) => { e.id = 'st-' + ids[i]; V.append(e); });
  const jump = [['profile', 'Profile'], ['look', 'Appearance'], ['play', 'Playback'], ['stream', 'Streaming'], ['dl', 'Downloads'], ['lyr', 'Lyrics'], ['data', 'Data'], ['about', 'About']];
  V.querySelector('h1').insertAdjacentHTML('afterend', `<nav class="sjump" aria-label="Settings sections">${jump.map(([k, l]) => `<button data-jump="st-${k}">${l}</button>`).join('')}</nav>`);
};
V.addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (b) { const t = document.getElementById(b.dataset.jump); t && t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
V.addEventListener('change', e => { const s = e.target.closest('[data-kq]'); if (!s) return; S[s.dataset.kq] = s.value; saveS(); SC.clear(); if (/^ly/.test(s.dataset.kq)) { if (s.value === 'orig') S.lyDual = 0; drawLy(); } V.querySelectorAll(`[data-kq="${s.dataset.kq}"]`).forEach(x => x.value = s.value); toast('Saved'); });
const _apply = window.applySet; window.applySet = function () { _apply(); document.body.classList.toggle('rm', !!S.rm); };

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
  document.querySelector('.segrow').insertAdjacentHTML('afterend', `<div class="lymodes" id="lymodes">${LMODES.map(([k, l]) => `<button data-lm="${k}">${l}</button>`).join('')}<button data-lm="dual" title="Show original and translation together">Both</button></div><div class="qmode" id="qmode" hidden><button class="ib" id="qshf" aria-label="Shuffle">${ic('shuf', 22)}</button><button class="ib" id="qrpt" aria-label="Repeat">${ic('rep', 22)}</button><button class="btn2" data-act="qsave">Save as playlist</button><button class="btn2" data-act="qclear">Clear</button></div>`);
  const np = $('#np');
  $('#npbl').onclick = $('#nplyl').onclick = () => { np.classList.add('lyf'); seg(true); };
  $('#npqq').onclick = () => { np.classList.add('lyf'); seg(false); };
  $('#npq').onclick = $('#npinfo').onclick = e => Q[qi] && qualityMenu(Q[qi], e.currentTarget);
  $('#npdl').onclick = e => dl(Q[qi], null, e.currentTarget);
  $('#qshf').onclick = () => { $('.ctl .shf').click(); setTimeout(() => $('#qshf').className = 'ib ' + ($('.ctl .shf').classList.contains('on') ? 'on' : ''), 30); };
  $('#qrpt').onclick = () => { $('.ctl .rpt').click(); setTimeout(() => { $('#qrpt').innerHTML = $('.ctl .rpt').innerHTML; $('#qrpt').className = 'ib ' + ($('.ctl .rpt').classList.contains('on') ? 'on' : ''); }, 30); };
  $('#lymodes').onclick = e => {
    const b = e.target.closest('[data-lm]'); if (!b) return; const k = b.dataset.lm;
    if (k === 'dual') S.lyDual = S.lyDual ? 0 : 1; else { S.lyMode = k; if (k === 'orig') S.lyDual = 0; } saveS(); drawLy();
  };
  $('.npl .skr .sk').addEventListener('input', e => { const d = A.duration; if (d) $('.npl .dur').textContent = '-' + mm(d - e.target.value / 1000 * d); });
  A.addEventListener('timeupdate', () => { if (!drag && A.duration) $('.npl .dur').textContent = '-' + mm(A.duration - A.currentTime); });
}
function npMeta() {
  const t = Q[qi]; if (!t || !$('#npfrom')) return; const i = QINFO.get(t.c.videoId), n = Q[qi + 1], kb = i && ITAG[i.fmt];
  const pl = KPL && KPL.name ? KPL : curPl; $('#npfrom').textContent = pl && pl.name ? 'Playing from ' + pl.name : '';
  $('#npinfo').innerHTML = i ? `${i.ext === 'm4a' ? 'AAC' : i.ext === 'webm' ? 'Opus' : (i.ext || 'Audio').toUpperCase()}${kb ? ' · ~' + kb + ' kbps' : ''} · Stereo` + (n ? `<br>Up next · ${esc(title(n))}` : '') : '';
  $('#npdev').textContent = (NAME() ? NAME() + '’s ' : '') + (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? 'Phone' : 'Device');
  $('#npdl').innerHTML = ic('dl', 24); if (t.c.big && $('#nc').getAttribute('src') !== t.c.big) $('#nc').src = t.c.big; marqAll();
}
let KPL = null; const _pf = window.playFrom; window.playFrom = function (p) { KPL = p; return _pf.apply(this, arguments); };
const _op = window.openNP; window.openNP = function () { const r = _op.apply(this, arguments); requestAnimationFrame(() => requestAnimationFrame(marqAll)); return r; };
let _rz; addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(marqAll, 200); });
const _seg = window.seg;
window.seg = function (l) { _seg(l); const a = $('#lymodes'), b = $('#qmode'); if (a) a.hidden = !l; if (b) b.hidden = !!l; if (l) lmSync(); };
V.addEventListener('click', e => { if (e.target.closest('[data-st="lyDual"]')) setTimeout(() => { drawLy(); }, 60); });

/* ---------- boot ---------- */
(async function koomBoot() {
  const t0 = performance.now(); window.__koomUp = 1;
  document.title = `${APP.name} — ${APP.tagline}`; window.SITE = APP.name; all('.site').forEach(e => e.textContent = APP.name);
  const o = J.get('koom.tracks', {}); for (const [u, c] of Object.entries(o)) TM.set(u, { t: { c, url: u, tags: {}, alt: '' }, p: null });
  const mt = document.createElement('header'); mt.className = 'mtop'; mt.innerHTML = `<div><b>${APP.name}</b><small>${APP.tagline}</small></div><a class="av" href="#/settings" aria-label="Profile"></a>`; V.parentNode.insertBefore(mt, V);
  if (S.pf === undefined) S.pf = 1; if (S.skip === undefined) S.skip = 1; saveS();
  buildNP();
  P = []; buildU(); applySet(); $('#bt').textContent = 'Not Playing';
  [API_CONFIG.MUSIC_API_URL, API_CONFIG.STREAM_API_URL].forEach(u => { if (!real(u)) return; const l = document.createElement('link'); l.rel = 'preconnect'; l.href = new URL(u).origin; document.head.append(l); http(u, '/health', { ttl: 600000 }).catch(() => { }); });   // wake the services + open the connections early
  ['https://i.ytimg.com', 'https://lh3.googleusercontent.com'].forEach(h => { const l = document.createElement('link'); l.rel = 'preconnect'; l.href = h; document.head.append(l); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.)/.test(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => { });
  const hideSplash = async () => { const sp = $('#splash'); await wsleep(Math.max(0, 1100 - (performance.now() - t0))); if (sp) { sp.classList.add('out'); await wsleep(480); sp.remove(); } };
  if (NAME()) { refreshAv(); route(); await hideSplash(); }
  else { await hideSplash(); await welcome(); refreshAv(); route(); }
})();
$('#ndl').onclick = e => dl(Q[qi], null, e.currentTarget);
