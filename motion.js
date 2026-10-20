/* KOOM — motion & "Apple Music"-style extras: adaptive artwork colour, swipe gestures, Top Result,
   "Because you listened to…", heart burst, shortcuts sheet. Presentation + additive features only. */
(function () {
  const np = $('#np'), bar = $('#bar'), nc = $('#nc'), on = () => S.adapt !== 0;

  /* ---------- adaptive colour from the artwork ---------- */
  np.insertAdjacentHTML('afterbegin', '<div class="npglow" aria-hidden="true"></div>'); $('#npbg') && np.prepend($('#npbg'));
  const TC = new Map();
  function sample(src) {
    if (TC.has(src)) return Promise.resolve(TC.get(src));
    return new Promise(res => {
      const i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0, 24, 24);
          const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, w = 0;
          for (let k = 0; k < d.length; k += 4) { const R = d[k], G = d[k + 1], B = d[k + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B), s = mx ? (mx - mn) / mx : 0, l = (mx + mn) / 510, wt = .12 + s * s * 3 * Math.max(0, 1 - Math.abs(l - .5) * 1.7); r += R * wt; g += G * wt; b += B * wt; w += wt; }
          r /= w; g /= w; b /= w; const mx = Math.max(r, g, b) || 1, f = mx < 120 ? 120 / mx : mx > 225 ? 225 / mx : 1, v = [r, g, b].map(q => Math.round(Math.min(255, q * f)));
          TC.set(src, v); res(v);
        } catch (e) { TC.set(src, null); res(null); }
      };
      i.onerror = () => { TC.set(src, null); res(null); }; i.src = src;
    });
  }
  let last = '';
  async function tint() {
    const src = nc.currentSrc || nc.src; if (!on() || !src) { clear(); return; } last = src;
    const v = await sample(src); if (src !== last) return;
    if (!v) return clear();
    const s = v.join(' '); np.style.setProperty('--tr', s); bar.style.setProperty('--tr', s); np.classList.add('tinted'); bar.classList.add('tinted');
    const m = document.querySelector('meta[name=theme-color]'); if (m && np.classList.contains('open')) m.dataset.old = m.dataset.old || m.content;
  }
  function clear() { np.classList.remove('tinted'); bar.classList.remove('tinted'); }
  new MutationObserver(tint).observe(nc, { attributes: true, attributeFilter: ['src'] }); tint();
  const _sset = window.showSet;
  window.showSet = function () {
    _sset.apply(this, arguments); const g = V.querySelector('#st-play .sc'); if (!g) return;
    g.insertAdjacentHTML('beforeend', sr('Adaptive colour', 'Tints Now Playing with the colours of the album art', `<button class="btn2" data-fx="adapt">${on() ? 'On' : 'Off'}</button>`));
  };
  document.addEventListener('click', e => { const b = e.target.closest('[data-fx="adapt"]'); if (!b) return; S.adapt = on() ? 0 : 1; saveS(); b.textContent = on() ? 'On' : 'Off'; tint(); });

  /* ---------- limits: history + downloads (default unlimited) ---------- */
  const LIM = [['0', 'Unlimited'], ['50', 'Last 50'], ['100', 'Last 100'], ['500', 'Last 500'], ['1000', 'Last 1000']], DLIM = [['0', 'Unlimited'], ['25', '25 songs'], ['50', '50 songs'], ['100', '100 songs'], ['250', '250 songs']];
  const _s2 = window.showSet;
  window.showSet = function () {
    _s2.apply(this, arguments);
    const d = V.querySelector('#st-data .sc'); if (d) d.insertAdjacentHTML('afterbegin', sr('Listening history limit', 'How many recently played songs to keep on this device', sel('histMax', LIM, String(+S.histMax || 0))));
    const o = V.querySelector('#st-dl .sc'); if (o) o.insertAdjacentHTML('afterbegin', sr('Downloads limit', 'Maximum songs saved for offline use', sel('dlMax', DLIM, String(+S.dlMax || 0))));
  };
  V.addEventListener('change', e => {
    const k = e.target.closest('[data-kq="histMax"]'); if (!k) return; const n = +k.value; if (n > 0 && HIST.length > n) { HIST = HIST.slice(0, n); J.set('ml.hist', HIST); }
  });

  /* ---------- swipe gestures: mini player + cover (left = next, right = previous, up on mini player = open) ---------- */
  function swipe(el, ignore, up) {
    let x0 = 0, y0 = 0, live = 0, blk = 0;
    el.addEventListener('pointerdown', e => { if (e.target.closest(ignore)) return; x0 = e.clientX; y0 = e.clientY; live = 1; }, { passive: true });
    el.addEventListener('pointercancel', () => { live = 0; });
    el.addEventListener('pointerup', e => {
      if (!live) return; live = 0; const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 64 && Math.abs(dy) < 48 && Q.length) { blk = Date.now(); navigator.vibrate && navigator.vibrate(8); const cv = el === bar ? $('#bc') : nc; if (cv) { cv.classList.remove('swl', 'swr'); void cv.offsetWidth; cv.classList.add(dx < 0 ? 'swl' : 'swr'); } nxt(dx < 0 ? 1 : -1); }
      else if (up && dy < -56 && Math.abs(dx) < 48) { blk = Date.now(); openNP(true); }
    });
    el.addEventListener('click', e => { if (Date.now() - blk < 380) { e.stopPropagation(); e.preventDefault(); } }, true);
  }
  swipe(nc, 'x');
  /* mini player: drag up and the player sheet follows your finger (like dragging it down closes it); sideways = skip */
  { let st = null, blk = 0;
    bar.addEventListener('pointerdown', e => { if (e.target.closest('.c,.r') || !Q.length) return; st = { x: e.clientX, y: e.clientY, t: Date.now(), drag: 0 }; });
    bar.addEventListener('pointermove', e => {
      if (!st) return; const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.drag) { if (dy < -8 && -dy > Math.abs(dx)) { st.drag = 1; try { bar.setPointerCapture(e.pointerId); } catch (x) { } np.style.transition = 'none'; np.style.visibility = 'visible'; np.classList.add('dragging'); } else return; }
      const h = innerHeight; np.style.transform = `translateY(${Math.max(0, h + dy)}px)`;
    });
    const end = e => {
      if (!st) return; const s0 = st; st = null; const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
      if (s0.drag) {
        blk = Date.now(); const v = -dy / Math.max(1, Date.now() - s0.t); np.classList.remove('dragging'); np.style.transition = ''; np.style.visibility = '';
        const open = -dy > innerHeight * .22 || v > .45; np.style.transform = ''; if (open) openNP(true); return;
      }
      if (e.type === 'pointerup' && Math.abs(dx) > 64 && Math.abs(dy) < 48 && Q.length) { blk = Date.now(); navigator.vibrate && navigator.vibrate(8); const cv = $('#bc'); if (cv) { cv.classList.remove('swl', 'swr'); void cv.offsetWidth; cv.classList.add(dx < 0 ? 'swl' : 'swr'); } nxt(dx < 0 ? 1 : -1); }
    };
    bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', e => { if (st && st.drag) { np.classList.remove('dragging'); np.style.transition = ''; np.style.transform = ''; np.style.visibility = ''; } st = null; });
    bar.addEventListener('click', e => { if (Date.now() - blk < 400) { e.stopPropagation(); e.preventDefault(); } }, true); }

  /* ---------- heart burst ---------- */
  document.addEventListener('click', e => { const h = e.target.closest('.hb'); if (!h || matchMedia('(prefers-reduced-motion:reduce)').matches) return; h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop'); setTimeout(() => h.classList.remove('pop'), 600); }, true);

  /* ---------- search: Top Result card ---------- */
  const _dr = window.drawResults;
  window.drawResults = function () {
    _dr.apply(this, arguments);
    if (SQ.f !== 'all' || !SQ.items.length || !$('#sr')) return;
    const x = SQ.items[0], song = x.kind === 'song' || x.kind === 'video', lbl = { song: 'Song', video: 'Video', artist: 'Artist', album: 'Album', playlist: 'Playlist' }[x.kind];
    const at = song ? `data-l="~search" data-i="0"` : `data-kd="${x.kind}" data-id="${esc(x.id)}"`;
    $('#sr').insertAdjacentHTML('afterbegin', `<div class="topres k card" ${at} tabindex="0" role="link"><img class="${x.kind === 'artist' ? 'rnd' : ''}" src="${esc(x.thumb || PH)}" alt=""><div class="tt"><span class="kick">TOP RESULT · ${lbl}</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></div><span class="tp">${ic(song ? 'play' : 'chev', 22)}</span></div>`);
  };

  /* ---------- Home: "Because you listened to …" ---------- */
  let bqRT = -1;
  async function because() {
    if (view !== 'home' || bqRT === RT || V.querySelector('.g-sec') || V.querySelector('.shim') || !V.querySelector('.kfoot')) return;
    const h = byId('~hist').tracks[0]; if (!h || !h.c.videoId) return; const my = RT; bqRT = my;
    try {
      const d = await mApi('/related/' + enc(h.c.videoId)), it = flat(d).filter(x => x.id !== h.c.videoId).slice(0, 20); if (my !== RT || view !== 'home' || !it.length || V.querySelector('.g-sec')) return;
      const ft = V.querySelector('.kfoot'), html = `<div class="g-sec">${sh('Because you listened to ' + esc(title(h)))}${cards(it, 'Because you listened to ' + title(h))}</div>`;
      ft ? ft.insertAdjacentHTML('beforebegin', html) : V.insertAdjacentHTML('beforeend', html);
    } catch (e) { }
  }
  const MOODS = ['Chill', 'Workout', 'Focus', 'Party', 'Romance', 'Sad', 'Road trip', 'Sleep', 'Devotional', 'Retro'];
  function homeExtras() {
    if (view !== 'home' || V.querySelector('.hx') || V.querySelector('.shim')) return; const ql = V.querySelector('.qlinks'); if (!ql) return;
    const src = [...V.querySelectorAll('.hr')].find(r => r.querySelector('.card.k') && r.querySelector('img')); if (!src) return;
    const picks = [...src.querySelectorAll('.card.k')].slice(0, 8).map(c => { const at = c.dataset.l ? `data-l="${c.dataset.l}" data-i="${c.dataset.i}"` : `data-kd="${c.dataset.kd}" data-id="${esc(c.dataset.id)}"`; return `<div class="tpick k" ${at} tabindex="0" role="link"><img src="${esc(c.querySelector('img').src)}" alt="" loading="lazy"><div class="tpg"><small>${esc((c.querySelector('small') || {}).textContent || '')}</small><b>${esc((c.querySelector('b') || {}).textContent || '')}</b></div></div>`; }).join('');
    ql.insertAdjacentHTML('afterend', `<div class="hx"><div class="moods" role="list">${MOODS.map(m => `<button class="mood" data-mood="${esc(m)}" role="listitem">${esc(m)}</button>`).join('')}</div>${picks ? `<div class="sech"><h2>Top Picks</h2></div><div class="tpicks">${picks}</div>` : ''}</div>`);
  }
  document.addEventListener('click', e => { const m = e.target.closest('[data-mood]'); if (m) gotoArtistByName(m.dataset.mood + ' mix', 'playlists'); });
  { let tm; new MutationObserver(() => { clearTimeout(tm); tm = setTimeout(() => { homeExtras(); because(); }, 250); }).observe(V, { childList: true }); }

  /* ---------- keyboard shortcuts sheet (press ?) ---------- */
  const K = [['Space / K', 'Play · pause'], ['← →', 'Seek 5 s'], ['J / L', 'Seek 10 s'], ['Shift N / P', 'Next · previous'], ['↑ ↓', 'Volume'], ['M', 'Mute'], ['F', 'Like'], ['Shift L', 'Open lyrics'], ['0–9', 'Jump to 0–90 %'], ['Esc', 'Close'], ['?', 'This sheet']];
  document.addEventListener('keydown', e => {
    if (e.key !== '?' || e.target.matches('input,textarea,select')) return; let d = $('#kbd');
    if (!d) { document.body.insertAdjacentHTML('beforeend', `<dialog id="kbd"><h3 style="margin:0 0 12px">Keyboard shortcuts</h3><dl class="kbl">${K.map(([a, b]) => `<dt><kbd>${esc(a)}</kbd></dt><dd>${esc(b)}</dd>`).join('')}</dl><button class="pill pri" style="width:100%;justify-content:center;margin-top:14px" onclick="this.closest('dialog').close()">Close</button></dialog>`); d = $('#kbd'); }
    d.showModal();
  });
})();
