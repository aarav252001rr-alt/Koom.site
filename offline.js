/* KOOM — in-app downloads + offline mode.
   Songs are fetched through the existing Stream API, stored as blobs in IndexedDB (db "ml", store "dl")
   and played back from there. Metadata lives in DM (localStorage "ml.dlm") so the list works with no network. */
(function () {
  'use strict';
  const NET = ['', 'home', 'search', 'trending', 'new', 'browse', 'mood', 'artist', 'album', 'playlist'];   // pages that need the network
  const hashKey = () => (location.hash.slice(1) || '/').split('/')[1] || '';
  const usedBytes = () => Object.values(DM).reduce((a, x) => a + (x.size || 0), 0);
  const tr = u => { const e = TM.get(u); return e && e.t; };

  /* ---- restore state from the previous session ---- */
  OFF = new Set(Object.keys(DM));
  for (const [u, m] of Object.entries(DM)) if (m && m.c && !TM.has(u)) TM.set(u, { t: { c: m.c, url: u, tags: {}, alt: '' }, p: null });
  idb('readonly', s => s.getAllKeys()).then(keys => {                    // drop entries whose file was evicted by the browser
    const have = new Set(keys || []); let ch = 0;
    for (const u of [...OFF]) if (!have.has(u)) { OFF.delete(u); delete DM[u]; ch = 1; }
    if (ch) { J.set('ml.dlm', DM); markDl(); if (view === 'downloads') route(1); }
  }).catch(() => { });

  /* ---- download a song into the app ----
     Uses POST /download (the fast file endpoint, same one "Save to device" uses) and falls back to /stream only if it is unavailable.
     Lyrics are fetched and stored with the song so they work offline too. */
  const ABORT = {};
  const MIMEX = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac' };
  const dlQ = () => S.dq && S.dq !== 'ask' && LV[S.dq] ? S.dq : curQ();
  window.cancelDl = t => { const ac = t && ABORT[t.url]; if (ac) ac.abort(); };
  window.addDl = async function (t) {
    if (!t || !t.c || !t.c.videoId) return toast('This item can’t be downloaded');
    if (OFF.has(t.url) || DLP[t.url] != null) return;
    if (+S.dlMax > 0 && OFF.size + Object.keys(DLP).length >= +S.dlMax) return toast('Downloads limit reached (' + S.dlMax + ' songs). Change it in Settings → Downloads.');
    if (!navigator.onLine) return toast('You’re offline — connect to the internet to download');
    const cn = navigator.connection; if (S.dlWifi && cn && (cn.type === 'cellular' || cn.saveData)) return toast('Wi-Fi only downloads is on — connect to Wi-Fi or turn it off in Settings');
    const ac = ABORT[t.url] = new AbortController();
    DLP[t.url] = 0; syncDl(); toast('Downloading “' + title(t) + '”'); if (view === 'downloads') route(1);
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    try {
      const lv = dlQ(), body = { url: ytu(t.c.videoId), format_id: composeFmt(lv) };
      let r; try { r = await http(API_CONFIG.STREAM_API_URL, '/download', { method: 'POST', body, ttl: 0 }); } catch (e) { if (!/^(http (404|405|501)|config)/.test(e.message) || e.message === 'config') throw e; r = await http(API_CONFIG.STREAM_API_URL, '/stream', { method: 'POST', body, ttl: 0 }); }
      const raw = r.download_url || r.stream_url || (r.token && 'download/' + r.token); if (!raw) throw new Error('the server returned no file');
      const res = await fetch(fix(raw), { signal: ac.signal }); if (!res.ok) throw new Error('http ' + res.status);
      const len = +res.headers.get('Content-Length') || 0, rd = res.body.getReader(), ch = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; ch.push(value); n += value.length; DLP[t.url] = len ? Math.min(n / len, .98) : Math.min(.95, .05 + n / 9e6); syncDl(); }
      if (!n) throw new Error('empty file');
      const blob = new Blob(ch, { type: res.headers.get('Content-Type') || 'audio/mp4' });
      await idb('readwrite', s => s.put({ blob }, t.url));
      DLP[t.url] = .99; syncDl();
      let hasLy = 0;                                                                       // lyrics travel with the song
      try { if (t.lyr === undefined) await getLy(t); if (t.lyr) { await idb('readwrite', s => s.put({ lyr: t.lyr }, 'lyr:' + t.url)); hasLy = 1; } } catch (e) { }
      const mime = (blob.type || '').toLowerCase().split(';')[0], ext = (r.ext || MIMEX[mime] || '').toLowerCase(), fmt = String(r.format_id || '');
      if (ext) QINFO.set(t.c.videoId, { fmt, ext, kb: Math.round(+r.abr || +r.tbr || +r.bitrate || 0) });
      OFF.add(t.url); DM[t.url] = { size: blob.size, date: Date.now(), q: lv, c: t.c, ext, fmt, kb: Math.round(+r.abr || +r.tbr || +r.bitrate || 0), ly: hasLy }; J.set('ml.dlm', DM);
      [cover(t), t.c.big].forEach(u => { if (u) { const im = new Image(); im.src = u; } });   // lets the service worker keep the artwork for offline use
      toast('Downloaded “' + title(t) + '”' + (hasLy ? ' with lyrics' : ''));
    } catch (e) {
      const m = e && e.name === 'AbortError' ? 'cancelled' : e && e.name === 'QuotaExceededError' ? 'not enough storage' : e && e.message === 'Failed to fetch' ? 'the server blocked the file transfer' : (e && e.message) || 'error';
      toast(m === 'cancelled' ? 'Download cancelled' : 'Download failed: ' + m);
    }
    delete ABORT[t.url]; delete DLP[t.url]; syncDl(); markDl(); if (view === 'downloads') route(1);
  };

  /* ---- one "Download" button: ask where to save ---- */
  window.dlChoose = function (t, a) {
    if (!t || !t.c || !t.c.videoId) return toast('This item can’t be downloaded');
    const off = OFF.has(t.url), busy = DLP[t.url] != null, it = [];
    if (busy) it.push({ l: 'Cancel download', i: 'x', fn: () => cancelDl(t) });
    else if (off) it.push({ l: 'Downloaded in the app — remove', i: 'trash', fn: () => rmDl(t) });
    else it.push({ l: 'In the app — offline, with lyrics', i: 'dldone', fn: () => addDl(t) });
    it.push({ l: 'To this device — file', i: 'dl', fn: () => dl(t, null, a) });
    openMenu(it, a, 'Download “' + title(t) + '”');
  };
  window.npDownload = (t, a) => t ? dlChoose(t, a) : toast('Select a song first');
  window.dlAll = function (p) {
    if (!p || !p.tracks.length) return; const a = document.activeElement, T = p.tracks.filter(t => t.c && t.c.videoId);
    openMenu([
      { l: 'All in the app — offline, with lyrics', i: 'dldone', fn: async () => { const todo = T.filter(t => !OFF.has(t.url)); if (!todo.length) return toast(_('dlAllDone')); toast(_('dlMany', { n: todo.length })); let k = 0; await Promise.all([0, 1, 2].map(async () => { while (k < todo.length) await addDl(todo[k++]); })); } },
      { l: 'All to this device — files', i: 'dl', fn: async () => { toast('Saving ' + T.length + ' songs to your device'); for (const t of T) { await dl(t, dlQ()); await new Promise(r => setTimeout(r, 700)); } } }
    ], a, 'Download ' + T.length + ' songs');
  };
  window.kIdb = idb;
  const _gl = window.getLy;                                                                // offline lyrics
  window.getLy = async function (t) {
    if (t.lyr !== undefined) return;
    if (OFF.has(t.url) && !t.lyForce) { try { const r = await idb('readonly', s => s.get('lyr:' + t.url)); if (r && r.lyr) { t.lyr = r.lyr; return; } } catch (e) { } }
    return _gl.apply(this, arguments);
  };
  const _rd = window.rmDl; window.rmDl = async function (t) { await _rd.apply(this, arguments); idb('readwrite', s => s.delete('lyr:' + t.url)).catch(() => { }); };

  /* ---- playback: prefer the offline copy; never hit the network when offline ---- */
  const _rs = window.resolveSrc;
  window.resolveSrc = async function (t) {
    if (OFF.has(t.url)) {
      try { if (!OBJ[t.url]) { const r = await idb('readonly', s => s.get(t.url)); if (r && r.blob) OBJ[t.url] = URL.createObjectURL(r.blob); } } catch (e) { }
      if (OBJ[t.url]) { document.body.classList.remove('kbuf'); return OBJ[t.url]; }
      OFF.delete(t.url); delete DM[t.url]; J.set('ml.dlm', DM); markDl();
    }
    if (!navigator.onLine) {
      toast('You’re offline — this song isn’t downloaded');
      const k = Q.findIndex((x, i) => i > qi && OFF.has(x.url)); if (k >= 0) setTimeout(() => play(k), 900);
      return '';
    }
    return _rs.apply(this, arguments);
  };
  const _an = window.autoNext;
  window.autoNext = async function () {
    if (navigator.onLine) return _an.apply(this, arguments);
    const pool = [...OFF].map(tr).filter(t => t && t !== Q[qi]).sort(() => Math.random() - .5).slice(0, 15);
    if (!pool.length) return toast('No downloaded songs to play');
    const n = Q.length; Q.push(...pool); drawQ(); play(n);
  };

  /* ---- UI state: ✓ on downloaded rows, Now Playing button ---- */
  function markDl() {
    all('.tr[data-u]').forEach(r => r.classList.toggle('dled', OFF.has(r.dataset.u)));
    npdlState();
  }
  function npdlState() {
    const b = $('#npdl'), t = Q[qi]; if (!b || !t) return; const p = DLP[t.url], on = OFF.has(t.url);
    b.innerHTML = p != null ? `<span style="font-size:.78rem;font-weight:700">${Math.round(p * 100)}%</span>` : ic(on ? 'dldone' : 'dl', 24);
    b.classList.toggle('on', on); b.setAttribute('aria-label', on ? 'Downloaded — options' : 'Download for offline');
  }
  const _sh = window.syncHearts; window.syncHearts = function () { _sh.apply(this, arguments); markDl(); };
  const _sd = window.syncDl; window.syncDl = function () { _sd.apply(this, arguments); npdlState(); };
  const _tf = window.toggleFav;
  window.toggleFav = function (t) { const r = _tf.apply(this, arguments); if (t && S.autoDlFav && FAV.includes(t.url) && navigator.onLine) addDl(t); return r; };

  /* ---- offline routing: network pages fall back to Downloads ---- */
  let redirected = false;
  const _route = window.route;
  window.route = function (keep) {
    if (!navigator.onLine && NET.includes(hashKey())) {
      redirected = true; RT++; SQ.io && SQ.io.disconnect(); showDl();
      V.querySelector('h1').insertAdjacentHTML('afterend', '<div class="offnote" role="status"><b>You’re offline</b><span>Showing the songs you downloaded. Everything else returns when you’re back online.</span></div>');
      V.insertAdjacentHTML('beforeend', footer());
      all('[data-k]').forEach(a => a.classList.toggle('act', a.dataset.k === view)); drawSide(); fin(); if (!keep) scrollTo(0, 0); return;
    }
    redirected = false; return _route.apply(this, arguments);
  };
  addEventListener('offline', () => { if (NET.includes(hashKey())) route(1); });
  addEventListener('online', () => { if (redirected) route(1); });

  /* ---- settings: storage manager ---- */
  const _ss = window.showSet;
  window.showSet = function () {
    _ss.apply(this, arguments);
    const g = V.querySelector('#st-dl .sc'); if (!g) return;
    g.insertAdjacentHTML('afterbegin', sr('Offline downloads', OFF.size + (OFF.size === 1 ? ' song · ' : ' songs · ') + fmtMB(usedBytes()), '<span><button class="btn2" data-off="open">Open</button> <button class="btn2 red" data-off="clear">Remove all</button></span>') + sr('Auto-download liked songs', 'Saves every song you like for offline listening', sw('autoDlFav')) + sr('Download on Wi-Fi only', 'Blocks in-app downloads on mobile data (where the browser can tell)', sw('dlWifi')));
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-off]'); if (!b) return;
    if (b.dataset.off === 'open') location.hash = '#/downloads';
    else if (b.dataset.off === 'clear') {
      if (!OFF.size || !confirm(_('cfDl'))) return;
      idb('readwrite', s => s.clear()).catch(() => { }); Object.values(OBJ).forEach(u => URL.revokeObjectURL(u)); OBJ = {}; OFF = new Set(); DM = {}; J.set('ml.dlm', DM);
      syncDl(); markDl(); toast(_('allDlRm')); route(1);
    }
  });

  /* ---- Downloads page: search, sort, cancel running downloads ---- */
  const SORTS = { recent: ['Recently added', (a, b) => (DM[b.dataset.u]?.date || 0) - (DM[a.dataset.u]?.date || 0)], title: ['Title A–Z', (a, b) => a.querySelector('.ti b').textContent.localeCompare(b.querySelector('.ti b').textContent)], artist: ['Artist A–Z', (a, b) => a.querySelector('.ar').textContent.localeCompare(b.querySelector('.ar').textContent)], size: ['Largest first', (a, b) => (DM[b.dataset.u]?.size || 0) - (DM[a.dataset.u]?.size || 0)] };
  const _showDl = window.showDl;
  window.showDl = function () {
    _showDl.apply(this, arguments);
    V.querySelectorAll('.qk').forEach(q => { const pg = q.querySelector('[data-pg]'); if (pg) q.insertAdjacentHTML('beforeend', `<button class="ib sm" data-cancel="${esc(pg.dataset.pg)}" aria-label="Cancel download">${ic('x', 16)}</button>`); });
    const th = V.querySelector('.th'), rows = () => [...V.querySelectorAll('.tr[data-u]')]; if (!th || rows().length < 2) return;
    th.insertAdjacentHTML('beforebegin', `<div class="dltool"><input class="sbox" id="dlq" type="search" placeholder="Search downloads" aria-label="Search downloads" autocomplete="off"><select class="sel" id="dls" aria-label="Sort downloads">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${(S.dlSort || 'recent') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>`);
    const apply = () => {
      const q = $('#dlq').value.trim().toLowerCase(), k = $('#dls').value; let ref = th, n = 0;
      rows().sort((SORTS[k] || SORTS.recent)[1]).forEach(r => { ref.after(r); ref = r; const hit = !q || r.textContent.toLowerCase().includes(q); r.hidden = !hit; if (hit) r.querySelector('.no').textContent = ++n; });
    };
    $('#dlq').oninput = apply; $('#dls').onchange = () => { S.dlSort = $('#dls').value; saveS(); apply(); }; apply();
  };
  document.addEventListener('click', e => { const c = e.target.closest('[data-cancel]'); if (c) { const t = tr(c.dataset.cancel); t && cancelDl(t); } });

  /* ---- sidebar entry ---- */
  const set = document.querySelector('.side a[data-k="settings"]');
  if (set) set.insertAdjacentHTML('beforebegin', `<a href="#/downloads" data-k="downloads"><span>${ic('dldone', 22)}</span><span>${_('downloads')}</span></a>`);

  markDl();
  if (!navigator.onLine || hashKey() === 'downloads') route(1);
})();
