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

  /* ---- download a song into the app ---- */
  window.addDl = async function (t) {
    if (!t || !t.c || !t.c.videoId) return toast('This item can’t be downloaded');
    if (OFF.has(t.url) || DLP[t.url] != null) return;
    if (!navigator.onLine) return toast('You’re offline — connect to the internet to download');
    DLP[t.url] = 0; syncDl(); toast('Downloading “' + title(t) + '”');
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    try {
      const lv = S.dq && S.dq !== 'ask' && LV[S.dq] ? S.dq : curQ();
      const r = await http(API_CONFIG.STREAM_API_URL, '/stream', { method: 'POST', body: { url: ytu(t.c.videoId), format_id: composeFmt(lv) }, ttl: 0 });
      const raw = r.stream_url || (r.token && 'stream/' + r.token); if (!raw) throw new Error('no stream URL');
      const res = await fetch(fix(raw)); if (!res.ok) throw new Error('http ' + res.status);
      const len = +res.headers.get('Content-Length') || 0, rd = res.body.getReader(), ch = []; let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; ch.push(value); n += value.length; DLP[t.url] = len ? Math.min(n / len, .99) : Math.min(.95, .05 + n / 9e6); syncDl(); }
      if (!n) throw new Error('empty file');
      const blob = new Blob(ch, { type: res.headers.get('Content-Type') || 'audio/mp4' });
      await idb('readwrite', s => s.put({ blob }, t.url));
      const mime = (blob.type || '').toLowerCase(), ext = (r.ext || ({ 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/webm': 'webm', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/flac': 'flac' }[mime.split(';')[0]] || '')).toLowerCase();
      OFF.add(t.url); DM[t.url] = { size: blob.size, date: Date.now(), q: lv, c: t.c, ext, fmt: String(r.format_id || ''), kb: Math.round(+r.abr || +r.tbr || +r.bitrate || 0) }; J.set('ml.dlm', DM);
      [cover(t), t.c.big].forEach(u => { if (u) { const im = new Image(); im.src = u; } });   // lets the service worker keep the artwork for offline use
      toast('Downloaded “' + title(t) + '”');
    } catch (e) {
      const m = e && e.name === 'QuotaExceededError' ? 'not enough storage' : e && e.message === 'Failed to fetch' ? 'the server blocked the file transfer' : (e && e.message) || 'error';
      toast('Download failed: ' + m);
    }
    delete DLP[t.url]; syncDl(); markDl(); if (view === 'downloads') route(1);
  };

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
  window.npDownload = function (t, a) {
    if (!t) return toast('Select a song first');
    if (OFF.has(t.url)) return openMenu([{ l: 'Remove download', i: 'trash', fn: () => rmDl(t) }, { l: 'Save to device', i: 'dl', fn: () => dl(t, null, a) }], a, title(t));
    if (DLP[t.url] == null) addDl(t);
  };
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
    g.insertAdjacentHTML('afterbegin', sr('Offline downloads', OFF.size + (OFF.size === 1 ? ' song · ' : ' songs · ') + fmtMB(usedBytes()), '<span><button class="btn2" data-off="open">Open</button> <button class="btn2 red" data-off="clear">Remove all</button></span>') + sr('Auto-download liked songs', 'Saves every song you like for offline listening', sw('autoDlFav')));
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

  /* ---- sidebar entry ---- */
  const set = document.querySelector('.side a[data-k="settings"]');
  if (set) set.insertAdjacentHTML('beforebegin', `<a href="#/downloads" data-k="downloads"><span>${ic('dldone', 22)}</span><span>${_('downloads')}</span></a>`);

  markDl();
  if (!navigator.onLine || hashKey() === 'downloads') route(1);
})();
