/* KOOM — player menus, accurate track info, equalizer, fade between songs, lyric sharing. Loads after offline.js. */
(function () {
  'use strict';
  const KIND = { m4a: 'AAC (M4A)', mp4: 'AAC (M4A)', webm: 'Opus (WebM)', opus: 'Opus', ogg: 'Vorbis (OGG)', mp3: 'MP3', wav: 'WAV', flac: 'FLAC' };
  const QNAME = { best: 'Auto — best available', high: 'High', std: 'Standard', low: 'Data saver' };
  const ytm = t => 'https://music.youtube.com/watch?v=' + t.c.videoId;

  /* ---------- accurate Track info ---------- */
  window.showInfo = function (t) {
    if (!t) return;
    const i = qInfo(t), kb = kbOf(i), m = DM[t.url], cur = Q[qi] === t, d = dur(t) || (cur && isFinite(A.duration) ? A.duration : 0);
    const ext = i && i.ext ? i.ext.toLowerCase() : '', setting = EX.has(t.c.videoId) ? 'Custom format' : QNAME[curQ()];
    const rows = [
      [_('iTitle'), title(t)], [_('iArtist'), t.c.artist || ''], [_('iAlbum'), t.c.album || ''], [_('iDur'), d ? mm(d) : ''],
      [_('iFormat'), ext ? KIND[ext] || ext.toUpperCase() : ''], [_('iBitrate'), kb ? '~' + kb + ' kbps' : ''],
      [_('iSize'), m ? fmtMB(m.size) : ''],
      ['Playing from', m ? 'Offline copy (downloaded ' + new Date(m.date).toLocaleDateString() + ')' : cur && A.src ? 'Streaming · ' + setting : ''],
      [_('iSrc'), 'YouTube Music'], ['Video ID', t.c.videoId || '']
    ].filter(r => r[1]);
    const aL = (t.c.artists && t.c.artists.length ? t.c.artists : t.c.artist ? [{ n: t.c.artist, id: t.c.artistId || '' }] : []);
    const link = r => r[0] === _('iArtist') && aL.length ? aL.map(x => `<a class="alink" ${x.id ? `data-aid="${esc(x.id)}"` : `data-an="${esc(x.n)}"`}>${esc(x.n)}</a>`).join(', ')
      : r[0] === _('iAlbum') ? `<a class="alink" ${t.c.albumId ? `data-alb="${esc(t.c.albumId)}"` : `data-albn="${esc(r[1])}"`}>${esc(r[1])}</a>` : esc(r[1]);
    $('#dd').innerHTML = rows.map(r => `<dt>${esc(r[0])}</dt><dd>${link(r)}</dd>`).join(''); $('#dlg').showModal();
  };
  $('#dd').addEventListener('click', e => {
    const a = e.target.closest('.alink'); if (!a) return; $('#dlg').close();
    if (typeof closeNP === 'function') try { closeNP(); } catch (x) { }
    if (a.dataset.aid) location.hash = '#/artist/' + enc(a.dataset.aid);
    else if (a.dataset.alb) location.hash = '#/album/' + enc(a.dataset.alb);
    else if (a.dataset.an || a.dataset.albn) gotoArtistByName(a.dataset.an || a.dataset.albn, a.dataset.albn ? 'albums' : 'artists');
  });
  window.qualMenu = a => Q[qi] && qualityMenu(Q[qi], a);

  /* ---------- Equalizer + fade (Web Audio) ---------- */
  const BANDS = [[60, 'lowshelf', '60'], [230, 'peaking', '230'], [910, 'peaking', '910'], [3600, 'peaking', '3.6k'], [14000, 'highshelf', '14k']];
  const PRESETS = { flat: ['Flat', [0, 0, 0, 0, 0]], bass: ['Bass boost', [7, 5, 0, -1, -1]], vocal: ['Vocal', [-2, 0, 4, 3, -1]], treble: ['Treble', [-1, 0, 0, 4, 7]], rock: ['Rock', [5, 3, -2, 3, 5]], pop: ['Pop', [-1, 3, 4, 2, -1]], hiphop: ['Hip-hop', [6, 4, 0, 2, 3]], classical: ['Classical', [4, 3, -2, 3, 4]] };
  if (!Array.isArray(S.eqG) || S.eqG.length !== 5) { S.eqG = [0, 0, 0, 0, 0]; S.eqP = 'flat'; }
  let ctx = null, graph = 0, filt = [], fg = null, pending = 0, probing = 0;
  const want = () => !!S.eqOn || +S.fade > 0;
  const head = () => S.eqOn ? Math.pow(10, -Math.max(0, ...S.eqG) / 40) : 1;
  function fxFail() {
    S.eqOn = 0; S.fade = 0; saveS(); pending = 0;
    toast('Your music server doesn’t allow audio effects (CORS), so the equalizer and fade can’t run');
    if (view === 'settings') route(1); const d = $('#eqdlg'); if (d) d.remove();
  }
  function applyEq() { if (!graph) return; filt.forEach((f, k) => f.gain.setTargetAtTime(S.eqOn ? S.eqG[k] : 0, ctx.currentTime, .05)); }
  function build() {
    if (graph) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)(); let prev = ctx.createMediaElementSource(A);
      filt = BANDS.map(([f, type]) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = 1; b.gain.value = 0; prev.connect(b); prev = b; return b; });
      fg = ctx.createGain(); prev.connect(fg); fg.connect(ctx.destination); graph = 1; pending = 0; applyEq(); if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { fxFail(); }
  }
  async function maybeInit() {
    if (graph) { applyEq(); return; }
    if (!want() || probing || pending) return;
    const t = Q[qi]; if (!t || !A.getAttribute('src')) return;                       // starts as soon as a song is playing
    probing = 1;
    try {
      if (A.src.startsWith('blob:')) { A.crossOrigin = 'anonymous'; build(); }
      else {
        if (!navigator.onLine) throw 0;
        const ac = new AbortController(), r = await fetch(await streamUrl(t.c.videoId), { signal: ac.signal }); ac.abort();   // does the server send CORS headers?
        if (!r.ok) throw 0;
        A.crossOrigin = 'anonymous'; pending = 1; play(qi, A.currentTime, A.paused);   // reload with CORS so the graph gets real audio, not silence
      }
    } catch (e) { fxFail(); }
    probing = 0;
  }
  A.addEventListener('playing', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); if (pending && !graph) build(); else maybeInit(); });
  A.addEventListener('timeupdate', () => {
    if (!graph) return; let m = 1, f = +S.fade || 0;
    if (f > 0 && A.duration && isFinite(A.duration)) { f = Math.min(f, A.duration / 3); m = Math.max(0, Math.min(1, A.currentTime / f, (A.duration - A.currentTime) / f)); }
    fg.gain.setTargetAtTime(m * head(), ctx.currentTime, .12);
  });

  function openEq() {
    if (document.getElementById('eqdlg')) return;
    const w = document.createElement('div'); w.className = 'kdlg'; w.id = 'eqdlg'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', 'Equalizer');
    const draw = () => {
      w.innerHTML = `<div class="kbox eqbox"><div class="eqtop"><h3>Equalizer</h3><button class="sw ${S.eqOn ? 'on' : ''}" id="eqsw" role="switch" aria-checked="${!!S.eqOn}" aria-label="Equalizer on or off"></button></div>
        <div class="eqp">${Object.entries(PRESETS).map(([k, [l]]) => `<button class="chip ${S.eqP === k ? 'on' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
        <div class="eqb">${BANDS.map((b, k) => `<label><span>${b[2]} Hz</span><input type="range" min="-12" max="12" step="1" value="${S.eqG[k]}" data-b="${k}" aria-label="${b[2]} Hz gain" style="--p:${(S.eqG[k] + 12) / 24 * 100}%"><em>${S.eqG[k] > 0 ? '+' : ''}${S.eqG[k]} dB</em></label>`).join('')}</div>
        <p class="eqn">Works on streamed and downloaded songs. It starts once a song is playing.</p>
        <div class="kbtn"><button class="btn2" id="eqreset">Reset</button><button class="pill pri" id="eqdone">Done</button></div></div>`;
    };
    draw(); document.body.append(w);
    const save = () => { saveS(); applyEq(); maybeInit(); };
    w.onclick = e => {
      if (e.target === w || e.target.id === 'eqdone') { w.remove(); if (view === 'settings') route(1); return; }
      if (e.target.id === 'eqsw') { S.eqOn = S.eqOn ? 0 : 1; save(); draw(); return; }
      if (e.target.id === 'eqreset') { S.eqG = [0, 0, 0, 0, 0]; S.eqP = 'flat'; save(); draw(); return; }
      const p = e.target.closest('[data-p]'); if (p) { S.eqP = p.dataset.p; S.eqG = [...PRESETS[S.eqP][1]]; S.eqOn = 1; save(); draw(); }
    };
    w.oninput = e => {
      const r = e.target.closest('[data-b]'); if (!r) return; const k = +r.dataset.b, v = +r.value; S.eqG[k] = v; S.eqP = 'custom'; S.eqOn = 1;
      r.style.setProperty('--p', (v + 12) / 24 * 100 + '%'); r.nextElementSibling.textContent = (v > 0 ? '+' : '') + v + ' dB';
      w.querySelectorAll('[data-p]').forEach(c => c.classList.remove('on')); w.querySelector('#eqsw').classList.add('on'); save();
    };
    w.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); w.remove(); } });
    w.querySelector('#eqsw').focus();
  }
  window.openEq = openEq;
  const eqLabel = () => S.eqOn ? (S.eqP === 'custom' ? 'Custom' : (PRESETS[S.eqP] || PRESETS.flat)[0]) : 'Off';

  /* ---------- Share the current lyric line ---------- */
  async function shareLyric() {
    const t = Q[qi]; if (!t) return toast(_('pickFirst'));
    const l = L.length && ai >= 0 && L[ai] && L[ai].tx || ''; if (!l) return toast('Play a song with synced lyrics first');
    const tx = `“${l}”\n— ${title(t)} · ${artist(t)}\n${ytm(t)}`;
    try { if (navigator.share) await navigator.share({ text: tx }); else { await navigator.clipboard.writeText(tx); toast('Lyric copied'); } } catch (e) { }
  }
  { const x = $('#lyx'); if (x) { x.insertAdjacentHTML('beforebegin', `<button class="ib" id="lyshare" aria-label="Share current lyric"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"/></svg></button>`); $('#lyshare').onclick = shareLyric; } }

  /* ---------- Player "more" menu (replaces the FLAC / High Efficiency one) ---------- */
  $('#nm').onclick = e => {
    const t = Q[qi]; if (!t) return toast(_('pickFirst')); const i = qInfo(t), kb = kbOf(i), off = OFF.has(t.url);
    openMenu([
      { l: _('speed'), i: 'speed', r: S.speed + '×', fn: speedMenu },
      { l: _('sleepT'), i: 'moon', r: sleep.eot ? _('eos') : _(sleep.end ? 'on' : 'off'), fn: sleepMenu },
      { l: 'Audio quality', i: 'sliders', r: i && i.ext ? i.ext.toUpperCase() + (kb ? ' ' + kb + 'k' : '') : off ? 'Offline' : 'Auto', fn: () => qualityMenu(t, e.currentTarget) },
      { l: 'Equalizer', i: 'sliders', r: eqLabel(), fn: openEq },
      { sep: 1 },
      { l: _('addPl'), i: 'plus', fn: () => pickPl(t) },
      { l: off ? 'Downloaded · options' : 'Download…', i: off ? 'dldone' : 'dl', fn: () => dlChoose(t, e.currentTarget) },
      { l: 'Share lyric line', i: 'quote', fn: shareLyric },
      { l: 'Share song', i: 'expand', fn: () => shareTrack(t) },
      { l: _('trackInfo'), i: 'info', fn: () => showInfo(t) }
    ], e.currentTarget, title(t));
  };

  /* ---------- Settings → Playback rows ---------- */
  const _ss = window.showSet;
  window.showSet = function () {
    _ss.apply(this, arguments);
    const g = V.querySelector('#st-play .sc'); if (!g) return;
    g.insertAdjacentHTML('beforeend', sr('Equalizer', 'Bass, vocal and treble presets or your own 5-band mix', `<button class="btn2" data-fx="eq">${esc(eqLabel())} · Edit</button>`) +
      sr('Fade between songs', 'Fades out the end and fades in the start of each song', sel('fade', [['0', 'Off'], ['3', '3 seconds'], ['6', '6 seconds'], ['10', '10 seconds']], String(+S.fade || 0))));
  };
  document.addEventListener('click', e => { if (e.target.closest('[data-fx="eq"]')) openEq(); });
  V.addEventListener('change', e => { const s = e.target.closest('[data-kq="fade"]'); if (!s) return; S.fade = +s.value; saveS(); maybeInit(); });
  setTimeout(maybeInit, 0);
})();
