/* Liquid Notes — offline-first liquid glass notes.
   Plain JS, no build step, no dependencies. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;
  const win = $('#win');
  const home = $('#home');
  const menu = $('#menu');
  const toastEl = $('#toast');

  const DEFAULTS = {
    blur: 28, op: 22, sat: 180, depth: 18, tilt: 0, speed: 1, bounce: 1,
    fs: 17, rad: 28, accent: '#0a84ff', bg: 'aurora', theme: 'auto',
    par: true, snd: true,
  };
  const PAL = {
    aurora: ['#7c5cff', '#22d3ee', '#f472b6', '#0b1030', '#dfe6ff'],
    sunset: ['#ff7a45', '#ff3d81', '#ffc857', '#2a0f2e', '#ffe3d6'],
    ocean: ['#0ea5e9', '#14b8a6', '#6366f1', '#06202e', '#d6f1ff'],
    mono: ['#9ca3af', '#e5e7eb', '#6b7280', '#111318', '#eceef2'],
  };
  const ACCENTS = ['#0a84ff', '#30d158', '#ff375f', '#ff9f0a', '#bf5af2'];
  const SLIDERS = [
    ['blur', 'Blur', 0, 60, 1, 'px'],
    ['op', 'Glass transparency', 0, 70, 1, '%'],
    ['sat', 'Color boost', 100, 260, 5, '%'],
    ['depth', 'Parallax depth', 0, 40, 1, ''],
    ['tilt', '3D tilt', 0, 14, 1, '\u00b0'],
    ['speed', 'Animation speed', 0.5, 2, 0.1, '\u00d7'],
    ['bounce', 'Bounce', 0, 2, 0.1, ''],
    ['fs', 'Text size', 13, 24, 1, 'px'],
    ['rad', 'Corner radius', 8, 44, 1, 'px'],
  ];
  const K_NOTES = 'ln_notes';
  const K_SET = 'ln_set';

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  };
  const writeJSON = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast('Storage is full — export your notes to be safe');
      return false;
    }
  };

  /* ---------------- state ---------------- */
  let S = Object.assign({}, DEFAULTS, readJSON(K_SET, {}));
  let notes = readJSON(K_NOTES, []);
  if (!Array.isArray(notes)) notes = [];
  if (!notes.length) {
    notes = [{
      id: 1,
      t: 'Welcome to Liquid Notes',
      b: 'Move your mouse — or tilt your phone — and the glass shifts in depth.\n\nTap \u2022\u2022\u2022 to change blur, transparency, depth, bounce, colours and more. Everything is saved on this device and works offline.',
      u: Date.now(),
    }];
  }
  let cur = notes[0].id;
  let filter = '';

  const saveNotes = () => writeJSON(K_NOTES, notes);
  const saveSettings = () => writeJSON(K_SET, S);
  const current = () => notes.find((n) => n.id === cur);
  const uid = () => Date.now() + Math.floor(Math.random() * 1000);

  /* ---------------- toast ---------------- */
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------------- theme ---------------- */
  function applySettings() {
    const r = root.style;
    const p = PAL[S.bg] || PAL.aurora;
    r.setProperty('--blur', S.blur + 'px');
    r.setProperty('--op', S.op / 100);
    r.setProperty('--sat', S.sat + '%');
    r.setProperty('--speed', S.speed);
    r.setProperty('--fs', S.fs + 'px');
    r.setProperty('--rad', S.rad + 'px');
    r.setProperty('--accent', S.accent);
    r.setProperty('--pa', p[0]);
    r.setProperty('--pb', p[1]);
    r.setProperty('--pc', p[2]);
    r.setProperty('--bd', p[3]);
    r.setProperty('--bl', p[4]);
    if (S.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', S.theme);
  }

  /* ---------------- settings panel ---------------- */
  function buildMenu() {
    menu.innerHTML =
      SLIDERS.map(([k, n, a, b, s, u]) =>
        `<label>${n}<output id="o_${k}">${S[k]}${u}</output></label>` +
        `<input type="range" data-k="${k}" min="${a}" max="${b}" step="${s}" value="${S[k]}" aria-label="${n}">`
      ).join('') +
      `<h4>Accent</h4><div class="row">${ACCENTS.map((c) =>
        `<button class="sw${S.accent === c ? ' on' : ''}" data-acc="${c}" style="background:${c}" aria-label="Accent ${c}"></button>`
      ).join('')}</div>` +
      `<h4>Background</h4><div class="row">${Object.keys(PAL).map((k) =>
        `<button class="chip${S.bg === k ? ' on' : ''}" data-bg="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`
      ).join('')}</div>` +
      `<h4>Appearance</h4><div class="row">${['auto', 'light', 'dark'].map((k) =>
        `<button class="chip${S.theme === k ? ' on' : ''}" data-th="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`
      ).join('')}` +
      `<button class="chip${S.par ? ' on' : ''}" data-par="1">Parallax</button>` +
      `<button class="chip${S.snd ? ' on' : ''}" data-snd="1">Sound</button></div>` +
      `<h4>Notes</h4><div class="row">` +
      `<button class="chip" data-a="export">Export JSON</button>` +
      `<button class="chip" data-a="import">Import JSON</button>` +
      `<button class="chip" data-a="md">Export Markdown</button>` +
      `</div>` +
      `<h4>Actions</h4><div class="row">` +
      `<button class="chip" data-a="replay">Replay animation</button>` +
      `<button class="chip" data-a="close">Close app</button>` +
      `<button class="chip" data-a="del">Delete note</button>` +
      `<button class="chip" data-a="reset">Reset settings</button>` +
      `</div>`;
  }

  function toggleMenu(force) {
    const open = force === undefined ? !menu.classList.contains('open') : force;
    menu.classList.toggle('open', open);
    $('#bMore').setAttribute('aria-expanded', String(open));
  }

  menu.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    S[k] = +e.target.value;
    const unit = SLIDERS.find((x) => x[0] === k)[5];
    $('#o_' + k).textContent = S[k] + unit;
    applySettings();
    saveSettings();
  });

  menu.addEventListener('click', (e) => {
    const d = e.target.dataset;
    if (d.acc) S.accent = d.acc;
    else if (d.bg) S.bg = d.bg;
    else if (d.th) S.theme = d.th;
    else if (d.par) S.par = !S.par;
    else if (d.snd) { S.snd = !S.snd; if (S.snd) cleanSound(); }
    else if (d.a === 'replay') { toggleMenu(false); closeWin(() => setTimeout(openWin, 250)); return; }
    else if (d.a === 'close') { closeWin(); return; }
    else if (d.a === 'del') { delNote(); return; }
    else if (d.a === 'reset') { S = Object.assign({}, DEFAULTS); }
    else if (d.a === 'export') { exportJSON(); return; }
    else if (d.a === 'import') { importJSON(); return; }
    else if (d.a === 'md') { exportMarkdown(); return; }
    else return;
    applySettings();
    saveSettings();
    buildMenu();
  });

  /* ---------------- export / import ---------------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportJSON() {
    download('liquid-notes-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({ app: 'liquid-notes', version: 1, notes }, null, 2), 'application/json');
    toast('Exported ' + notes.length + ' notes');
  }
  function exportMarkdown() {
    const md = notes
      .slice()
      .sort((a, b) => b.u - a.u)
      .map((n) => `# ${n.t || 'Untitled'}\n\n_${new Date(n.u).toLocaleString()}_\n\n${n.b}\n`)
      .join('\n---\n\n');
    download('liquid-notes-' + new Date().toISOString().slice(0, 10) + '.md', md, 'text/markdown');
    toast('Exported Markdown');
  }
  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const incoming = Array.isArray(data) ? data : data.notes;
          if (!Array.isArray(incoming)) throw new Error('no notes array');
          let added = 0;
          incoming.forEach((n) => {
            if (!n || typeof n !== 'object') return;
            const id = notes.some((x) => x.id === n.id) ? uid() : (n.id || uid());
            notes.push({ id, t: String(n.t || ''), b: String(n.b || ''), u: +n.u || Date.now() });
            added++;
          });
          saveNotes();
          render();
          show();
          toast('Imported ' + added + ' notes');
        } catch (err) {
          toast('That file is not a Liquid Notes export');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ---------------- list rendering ---------------- */
  const fmt = (t) => {
    const d = new Date(t);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  function visible() {
    const f = filter.trim().toLowerCase();
    return notes
      .filter((n) => !f || (n.t + '\n' + n.b).toLowerCase().includes(f))
      .sort((a, b) => b.u - a.u);
  }

  function render(newId) {
    const list = $('#list');
    const items = visible();
    if (!items.length) {
      list.innerHTML = '<li style="cursor:default;color:var(--ink2)">No notes found. Tap \u270e to write one.</li>';
      return;
    }
    list.innerHTML = items.map((n) =>
      `<li data-id="${n.id}" class="${n.id === cur ? 'on' : ''}${n.id === newId ? ' in' : ''}"><b></b><small></small></li>`
    ).join('');
    [...list.children].forEach((li, i) => {
      const n = items[i];
      li.firstChild.textContent = n.t || 'Untitled';
      const preview = (n.b.split('\n').find((x) => x.trim()) || 'No text').trim();
      li.lastChild.textContent = preview.slice(0, 60);
    });
  }

  function show() {
    const n = current();
    $('#ti').value = n ? n.t : '';
    $('#tx').value = n ? n.b : '';
    $('#meta').textContent = n ? 'Edited ' + fmt(n.u) : '';
    stats();
  }

  function stats() {
    const text = $('#tx').value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    $('#stats').textContent = words + ' words \u00b7 ' + text.length + ' chars';
  }

  /* ---------------- hold to delete ---------------- */
  const L = $('#list');
  let lp;
  let suppressed = false;

  function disarm() {
    L.querySelectorAll('.armed').forEach((li) => {
      li.classList.remove('armed');
      const b = li.querySelector('.dbtn');
      if (b) b.remove();
    });
  }
  function arm(li) {
    disarm();
    li.classList.add('armed');
    const b = document.createElement('button');
    b.className = 'dbtn';
    b.textContent = 'Delete';
    li.appendChild(b);
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
  }

  L.addEventListener('pointerdown', (e) => {
    suppressed = false;
    const li = e.target.closest('li[data-id]');
    if (!li || e.target.closest('.dbtn')) return;
    lp = setTimeout(() => { arm(li); suppressed = true; }, 500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => L.addEventListener(t, () => clearTimeout(lp)));
  L.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#list')) disarm(); });

  L.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    if (e.target.closest('.dbtn')) { delNote(+li.dataset.id); return; }
    if (suppressed) { suppressed = false; return; }
    if (li.classList.contains('armed')) { disarm(); return; }
    cur = +li.dataset.id;
    render();
    show();
    $('.ed').animate(
      [{ transform: 'scale(.95)', opacity: 0.3 },
       { transform: `scale(${1 + 0.015 * S.bounce})`, opacity: 1 },
       { transform: 'none' }],
      { duration: 450 / S.speed, easing: 'ease-out' }
    );
  });

  /* ---------------- editing ---------------- */
  function edit() {
    const n = current();
    if (!n) return;
    n.t = $('#ti').value;
    n.b = $('#tx').value;
    n.u = Date.now();
    $('#meta').textContent = 'Edited ' + fmt(n.u);
    saveNotes();
    render();
    stats();
  }
  $('#ti').addEventListener('input', edit);
  $('#tx').addEventListener('input', edit);
  $('#q').addEventListener('input', (e) => { filter = e.target.value; render(); });

  $('#bNew').addEventListener('click', () => {
    const n = { id: uid(), t: '', b: '', u: Date.now() };
    notes.push(n);
    cur = n.id;
    saveNotes();
    filter = '';
    $('#q').value = '';
    render(n.id);
    show();
    $('#ti').focus();
  });

  /* ---------------- sound ---------------- */
  let AC;
  function cleanSound() {
    if (!S.snd) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      AC = AC || new Ctx();
      if (AC.state === 'suspended') AC.resume();
      const t = AC.currentTime;
      const n = AC.sampleRate * 0.5;
      const buf = AC.createBuffer(1, n, AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource();
      const bp = AC.createBiquadFilter();
      const g = AC.createGain();
      src.buffer = buf;
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(6000, t + 0.38);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      src.connect(bp); bp.connect(g); g.connect(AC.destination);
      src.start(t); src.stop(t + 0.5);
      [1319, 1760, 2349].forEach((f, i) => {
        const o = AC.createOscillator();
        const h = AC.createGain();
        const s0 = t + 0.3 + i * 0.08;
        o.type = 'sine';
        o.frequency.value = f;
        h.gain.setValueAtTime(0.0001, s0);
        h.gain.exponentialRampToValueAtTime(0.14, s0 + 0.015);
        h.gain.exponentialRampToValueAtTime(0.0001, s0 + 0.35);
        o.connect(h); h.connect(AC.destination);
        o.start(s0); o.stop(s0 + 0.4);
      });
    } catch (e) { /* audio is optional */ }
  }

  /* ---------------- delete ---------------- */
  function delNote(id) {
    const target = id || cur;
    const i = notes.findIndex((x) => x.id === target);
    if (i < 0) return;
    cleanSound();
    const li = L.querySelector('li[data-id="' + target + '"]');
    toggleMenu(false);
    const finish = () => {
      notes.splice(i, 1);
      if (!notes.length) notes.push({ id: uid(), t: '', b: '', u: Date.now() });
      if (!notes.find((x) => x.id === cur)) cur = notes[Math.max(0, i - 1)].id;
      saveNotes();
      render();
      show();
    };
    if (li) {
      li.classList.remove('armed');
      li.classList.add('out');
      setTimeout(finish, 350 / S.speed);
    } else finish();
  }

  /* ---------------- open / close animation ---------------- */
  let isOpen = false;
  function origin() {
    const h = home.getBoundingClientRect();
    win.style.transformOrigin = (h.left + h.width / 2) + 'px ' + (h.top + h.height / 2) + 'px';
  }
  function openWin() {
    if (isOpen) return;
    isOpen = true;
    const b = S.bounce;
    win.style.visibility = 'visible';
    origin();
    home.classList.remove('show');
    win.animate([
      { transform: 'scale(.08)', borderRadius: '48px', opacity: 0, offset: 0 },
      { transform: `scale(${1 + 0.05 * b})`, borderRadius: '18px', opacity: 1, offset: 0.6 },
      { transform: `scale(${1 - 0.02 * b})`, borderRadius: '6px', offset: 0.8 },
      { transform: 'none', borderRadius: '0px', offset: 1 },
    ], { duration: 700 / S.speed, easing: 'cubic-bezier(.25,.9,.3,1)' });
  }
  function closeWin(cb) {
    if (!isOpen) return;
    isOpen = false;
    toggleMenu(false);
    origin();
    const b = S.bounce;
    const a = win.animate([
      { transform: 'none', borderRadius: '0px', opacity: 1, offset: 0 },
      { transform: `scale(${1 + 0.03 * b})`, borderRadius: '12px', offset: 0.2 },
      { transform: 'scale(.12)', borderRadius: '44px', opacity: 0.6, offset: 0.85 },
      { transform: 'scale(.06)', borderRadius: '48px', opacity: 0, offset: 1 },
    ], { duration: 520 / S.speed, easing: 'cubic-bezier(.6,0,.8,.4)', fill: 'forwards' });
    a.onfinish = () => {
      win.style.visibility = 'hidden';
      a.cancel();
      home.classList.add('show');
      home.animate([
        { transform: 'scale(.3)' }, { transform: 'scale(1.18)' },
        { transform: 'scale(.94)' }, { transform: 'scale(1)' },
      ], { duration: 550 / S.speed });
      if (cb) cb();
    };
  }
  home.addEventListener('click', openWin);

  /* ---------------- parallax + tilt + specular ---------------- */
  let tx = 0, ty = 0, cx = 0, cy = 0;
  window.addEventListener('pointermove', (e) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    const r = win.getBoundingClientRect();
    win.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    win.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
  try {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 45));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
    });
  } catch (e) {}

  const orbs = [...document.querySelectorAll('.orb')];
  const zs = [...document.querySelectorAll('[data-z]')];
  const tilt = $('#tilt');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lx = 9, ly = 9, ld = -1, lt = -1;

  function loop() {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    if (Math.abs(cx - lx) < 0.0008 && Math.abs(cy - ly) < 0.0008 &&
        ld === S.depth + S.par && lt === S.tilt) {
      requestAnimationFrame(loop);
      return;
    }
    lx = cx; ly = cy; ld = S.depth + S.par; lt = S.tilt;
    const on = S.par;
    const d = on ? S.depth : 0;
    const t = on ? S.tilt : 0;
    orbs.forEach((o) => {
      o.style.transform = `translate3d(${-cx * o.dataset.d * (d / 18) * 2}px,${-cy * o.dataset.d * (d / 18) * 2}px,0)`;
    });
    tilt.style.transform = `rotateX(${-cy * t}deg) rotateY(${cx * t}deg)`;
    zs.forEach((z) => {
      z.style.transform = `translate3d(${cx * d * z.dataset.z}px,${cy * d * z.dataset.z}px,0)`;
    });
    requestAnimationFrame(loop);
  }

  /* ---------------- keyboard shortcuts ---------------- */
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); $('#bNew').click(); }
    else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'Escape') { if (menu.classList.contains('open')) toggleMenu(false); }
  });
  $('#bMore').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('pointerdown', (e) => {
    if (!menu.contains(e.target) && e.target.id !== 'bMore') toggleMenu(false);
  });

  /* ---------------- install (PWA) ---------------- */
  let deferredPrompt = null;
  const installBtn = $('#bInstall');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    deferredPrompt = null;
  });
  window.addEventListener('appinstalled', () => { installBtn.hidden = true; toast('Installed — open it from your home screen'); });

  /* ---------------- service worker ---------------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ---------------- boot ---------------- */
  applySettings();
  buildMenu();
  render();
  show();
  openWin();
  if (!reduceMotion) loop();
})();
