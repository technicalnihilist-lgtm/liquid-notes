/* Liquid Notes — offline-first liquid glass notes.
   Plain JS, no build step, no dependencies. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const root = document.documentElement;

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
  const THEMES = ['auto', 'light', 'dark'];
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
  const uid = () => Date.now() + Math.floor(Math.random() * 1000);

  /* ---------------- storage that cannot take the app down ---------------- */
  const store = (() => {
    let usable = false;
    const mem = {};
    try {
      const probe = '__ln_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      usable = true;
    } catch (e) {
      usable = false;
    }
    return {
      get available() { return usable; },
      get(key) {
        if (usable) {
          try { return window.localStorage.getItem(key); } catch (e) { usable = false; }
        }
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      },
      set(key, value) {
        mem[key] = value;
        if (usable) {
          try { window.localStorage.setItem(key, value); return true; } catch (e) { usable = false; }
        }
        return false;
      },
      remove(key) {
        delete mem[key];
        if (usable) { try { window.localStorage.removeItem(key); } catch (e) { usable = false; } }
      },
    };
  })();

  function readJSON(key, fallback) {
    const raw = store.get(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  /* ---------------- sanitising: bad data must never crash the app ---------- */
  function toText(v) {
    if (typeof v === 'string') return v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  function sanitizeNotes(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    raw.forEach((n) => {
      if (!n || typeof n !== 'object' || Array.isArray(n)) return;
      let id = Number(n.id);
      if (!Number.isFinite(id) || seen.has(id)) id = uid();
      seen.add(id);
      const u = Number(n.u);
      out.push({
        id,
        t: toText(n.t),
        b: toText(n.b),
        u: Number.isFinite(u) && u > 0 ? u : Date.now(),
      });
    });
    return out;
  }

  function sanitizeSettings(raw) {
    const s = Object.assign({}, DEFAULTS);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
    SLIDERS.forEach(([k, , min, max]) => {
      const v = Number(raw[k]);
      if (Number.isFinite(v)) s[k] = Math.min(max, Math.max(min, v));
    });
    if (ACCENTS.indexOf(raw.accent) >= 0) s.accent = raw.accent;
    if (Object.prototype.hasOwnProperty.call(PAL, raw.bg)) s.bg = raw.bg;
    if (THEMES.indexOf(raw.theme) >= 0) s.theme = raw.theme;
    if (typeof raw.par === 'boolean') s.par = raw.par;
    if (typeof raw.snd === 'boolean') s.snd = raw.snd;
    return s;
  }

  /* ---------------- state ---------------- */
  let S = sanitizeSettings(readJSON(K_SET, {}));
  let notes = sanitizeNotes(readJSON(K_NOTES, []));
  if (!notes.length) {
    notes = [{
      id: uid(),
      t: 'Welcome to Liquid Notes',
      b: 'Move your mouse \u2014 or tilt your phone \u2014 and the glass shifts in depth.\n\nTap \u2022\u2022\u2022 to change blur, transparency, depth, bounce, colours and more. Everything is saved on this device and works offline.',
      u: Date.now(),
    }];
  }
  let cur = notes[0].id;
  let filter = '';

  const current = () => notes.find((n) => n.id === cur);

  /* ---------------- saving (debounced, flushed on exit) ---------------- */
  let saveTimer;
  function saveNotesNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!store.set(K_NOTES, JSON.stringify(notes)) && store.available) {
      toast('Could not save — storage is full. Export your notes.');
    }
  }
  function saveNotesSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(saveNotesNow, 250);
  }
  const saveSettings = () => store.set(K_SET, JSON.stringify(S));
  window.addEventListener('pagehide', saveNotesNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNotesNow();
  });

  /* ---------------- toast ---------------- */
  let toastEl;
  let toastTimer;
  function toast(msg) {
    if (!toastEl) toastEl = $('#toast');
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  /* ---------------- fatal error guard ---------------- */
  let fatalShown = false;
  function fatal(err) {
    if (fatalShown) return;
    fatalShown = true;
    try { console.error('Liquid Notes error:', err); } catch (e) {}
    const box = document.createElement('div');
    box.className = 'fatal';
    box.setAttribute('role', 'alert');
    box.innerHTML =
      '<h2>Something went wrong</h2>' +
      '<p>Liquid Notes hit an unexpected error. Your notes are still on this device.</p>' +
      '<div class="row"><button class="chip" data-fatal="reload">Reload</button>' +
      '<button class="chip" data-fatal="export">Export my notes</button>' +
      '<button class="chip" data-fatal="reset">Reset app data</button></div>';
    box.addEventListener('click', (e) => {
      const a = e.target.dataset.fatal;
      if (a === 'reload') location.reload();
      else if (a === 'export') { try { exportJSON(); } catch (err) { toast('Export failed'); } }
      else if (a === 'reset') {
        store.remove(K_NOTES);
        store.remove(K_SET);
        location.reload();
      }
    });
    document.body.appendChild(box);
  }
  window.addEventListener('error', (e) => fatal(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

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
    const menu = $('#menu');
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
      `<h4>Appearance</h4><div class="row">${THEMES.map((k) =>
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
    const menu = $('#menu');
    const open = force === undefined ? !menu.classList.contains('open') : force;
    menu.classList.toggle('open', open);
    const btn = $('#bMore');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }

  $('#menu').addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const spec = SLIDERS.find((x) => x[0] === k);
    if (!spec) return;
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    S[k] = Math.min(spec[3], Math.max(spec[2], v));
    const out = $('#o_' + k);
    if (out) out.textContent = S[k] + spec[5];
    applySettings();
    saveSettings();
  });

  $('#menu').addEventListener('click', (e) => {
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
  function saveBlob(name, blob) {
    // Android shell exposes a native file writer; browsers use the anchor trick.
    const bridge = window.LiquidBridge;
    if (bridge && typeof bridge.saveFile === 'function') {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const b64 = String(reader.result).split(',')[1] || '';
          bridge.saveFile(name, b64, blob.type || 'application/octet-stream');
        } catch (e) {
          toast('Could not save the file');
        }
      };
      reader.onerror = () => toast('Could not read the export');
      reader.readAsDataURL(blob);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportJSON() {
    saveBlob('liquid-notes-' + stamp() + '.json',
      new Blob([JSON.stringify({ app: 'liquid-notes', version: 2, notes }, null, 2)],
        { type: 'application/json' }));
    toast('Exported ' + notes.length + ' notes');
  }

  function exportMarkdown() {
    const md = notes.slice().sort((a, b) => b.u - a.u)
      .map((n) => `# ${n.t || 'Untitled'}\n\n_${new Date(n.u).toLocaleString()}_\n\n${n.b}\n`)
      .join('\n---\n\n');
    saveBlob('liquid-notes-' + stamp() + '.md', new Blob([md], { type: 'text/markdown' }));
    toast('Exported Markdown');
  }

  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json,text/plain';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) { input.remove(); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const incoming = Array.isArray(data) ? data : (data && data.notes);
          const cleaned = sanitizeNotes(incoming);
          if (!cleaned.length) throw new Error('no notes');
          const existing = new Set(notes.map((n) => n.id));
          cleaned.forEach((n) => {
            if (existing.has(n.id)) n.id = uid();
            existing.add(n.id);
            notes.push(n);
          });
          saveNotesNow();
          render();
          show();
          toast('Imported ' + cleaned.length + ' notes');
        } catch (err) {
          toast('That file is not a Liquid Notes export');
        } finally {
          input.remove();
        }
      };
      reader.onerror = () => { toast('Could not read that file'); input.remove(); };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ---------------- list rendering ---------------- */
  const fmt = (t) => {
    const d = new Date(t);
    if (isNaN(d.getTime())) return 'just now';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const previewOf = (n) => {
    const line = String(n.b || '').split('\n').find((x) => x.trim());
    return (line || 'No text').trim().slice(0, 60);
  };

  function visible() {
    const f = filter.trim().toLowerCase();
    return notes
      .filter((n) => !f || (n.t + '\n' + n.b).toLowerCase().includes(f))
      .sort((a, b) => b.u - a.u);
  }

  function render(newId) {
    const list = $('#list');
    if (!list) return;
    const items = visible();
    if (!items.length) {
      list.innerHTML = '<li class="empty">No notes found. Tap \u270e to write one.</li>';
      return;
    }
    list.innerHTML = items.map((n) =>
      `<li data-id="${n.id}" class="${n.id === cur ? 'on' : ''}${n.id === newId ? ' in' : ''}"><b></b><small></small></li>`
    ).join('');
    [...list.children].forEach((li, i) => {
      const n = items[i];
      if (!n) return;
      li.firstChild.textContent = n.t || 'Untitled';
      li.lastChild.textContent = previewOf(n);
    });
  }

  /* Update one row in place — typing must never re-sort or re-render the list. */
  function refreshRow(id) {
    const list = $('#list');
    const li = list && list.querySelector('li[data-id="' + id + '"]');
    if (!li) return;
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    li.firstChild.textContent = n.t || 'Untitled';
    li.lastChild.textContent = previewOf(n);
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
    clearTimeout(lp);
    lp = setTimeout(() => { arm(li); suppressed = true; }, 500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) =>
    L.addEventListener(t, () => clearTimeout(lp)));
  L.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#list')) disarm();
  });

  L.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    if (e.target.closest('.dbtn')) { delNote(+li.dataset.id); return; }
    if (suppressed) { suppressed = false; return; }
    if (li.classList.contains('armed')) { disarm(); return; }
    saveNotesNow();
    cur = +li.dataset.id;
    render();
    show();
    const ed = $('.ed');
    if (ed && !reduceMotion) {
      ed.animate(
        [{ transform: 'scale(.95)', opacity: 0.3 },
         { transform: `scale(${1 + 0.015 * S.bounce})`, opacity: 1 },
         { transform: 'none' }],
        { duration: 450 / S.speed, easing: 'ease-out' }
      );
    }
  });

  /* ---------------- editing ---------------- */
  function edit() {
    const n = current();
    if (!n) return;
    n.t = $('#ti').value;
    n.b = $('#tx').value;
    n.u = Date.now();
    $('#meta').textContent = 'Edited ' + fmt(n.u);
    saveNotesSoon();
    refreshRow(n.id);   // in place: no re-sort, no scroll jump, no lost focus
    stats();
  }
  $('#ti').addEventListener('input', edit);
  $('#tx').addEventListener('input', edit);
  ['#ti', '#tx'].forEach((sel) => {
    $(sel).addEventListener('blur', () => {
      saveNotesNow();
      render();          // now it is safe to re-sort
    });
  });
  $('#q').addEventListener('input', (e) => { filter = e.target.value; render(); });

  $('#bNew').addEventListener('click', () => {
    saveNotesNow();
    const n = { id: uid(), t: '', b: '', u: Date.now() };
    notes.push(n);
    cur = n.id;
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
      saveNotesNow();
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
  const reduceMotion = window.matchMedia
    ? matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const win = $('#win');
  const home = $('#home');
  let isOpen = false;

  function origin() {
    const h = home.getBoundingClientRect();
    win.style.transformOrigin = (h.left + h.width / 2) + 'px ' + (h.top + h.height / 2) + 'px';
  }
  function openWin() {
    if (isOpen) return;
    isOpen = true;
    win.style.visibility = 'visible';
    home.classList.remove('show');
    if (reduceMotion || typeof win.animate !== 'function') return;
    const b = S.bounce;
    origin();
    try {
      win.animate([
        { transform: 'scale(.08)', borderRadius: '48px', opacity: 0, offset: 0 },
        { transform: `scale(${1 + 0.05 * b})`, borderRadius: '18px', opacity: 1, offset: 0.6 },
        { transform: `scale(${1 - 0.02 * b})`, borderRadius: '6px', offset: 0.8 },
        { transform: 'none', borderRadius: '0px', offset: 1 },
      ], { duration: 700 / S.speed, easing: 'cubic-bezier(.25,.9,.3,1)' });
    } catch (e) { /* animation is decoration only */ }
  }
  function closeWin(cb) {
    if (!isOpen) return;
    isOpen = false;
    toggleMenu(false);
    const done = () => {
      win.style.visibility = 'hidden';
      home.classList.add('show');
      if (cb) cb();
    };
    if (reduceMotion || typeof win.animate !== 'function') { done(); return; }
    const b = S.bounce;
    origin();
    let a;
    try {
      a = win.animate([
        { transform: 'none', borderRadius: '0px', opacity: 1, offset: 0 },
        { transform: `scale(${1 + 0.03 * b})`, borderRadius: '12px', offset: 0.2 },
        { transform: 'scale(.12)', borderRadius: '44px', opacity: 0.6, offset: 0.85 },
        { transform: 'scale(.06)', borderRadius: '48px', opacity: 0, offset: 1 },
      ], { duration: 520 / S.speed, easing: 'cubic-bezier(.6,0,.8,.4)', fill: 'forwards' });
    } catch (e) { done(); return; }
    a.onfinish = () => {
      try { a.cancel(); } catch (e) {}
      done();
      try {
        home.animate([
          { transform: 'scale(.3)' }, { transform: 'scale(1.18)' },
          { transform: 'scale(.94)' }, { transform: 'scale(1)' },
        ], { duration: 550 / S.speed });
      } catch (e) {}
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
  }, { passive: true });

  try {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 45));
      ty = Math.max(-1, Math.min(1, (e.beta - 45) / 45));
    }, { passive: true });
  } catch (e) {}

  const orbs = [...document.querySelectorAll('.orb')];
  const zs = [...document.querySelectorAll('[data-z]')];
  const tilt = $('#tilt');
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

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); $('#bNew').click(); }
    else if (mod && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'Escape') {
      if ($('#menu').classList.contains('open')) toggleMenu(false);
      else if (document.activeElement === $('#q')) { $('#q').value = ''; filter = ''; render(); }
    }
  });

  $('#bMore').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#menu') && e.target.id !== 'bMore') toggleMenu(false);
  });

  /* Back gesture / hardware back inside the Android shell. */
  window.liquidBack = function () {
    if ($('#menu').classList.contains('open')) { toggleMenu(false); return true; }
    if (isOpen) { closeWin(); return true; }
    return false;
  };

  /* ---------------- install (PWA) ---------------- */
  let deferredPrompt = null;
  const installBtn = $('#bInstall');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') installBtn.hidden = true;
      } catch (e) {}
      deferredPrompt = null;
    });
  }
  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.hidden = true;
    toast('Installed \u2014 open it from your home screen');
  });

  /* ---------------- service worker ---------------- */
  const insideApp = location.host === 'appassets.androidplatform.net';
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !insideApp) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    applySettings();
    buildMenu();
    render();
    show();
    openWin();
    if (!reduceMotion) loop();
    if (!store.available) {
      toast('Storage is blocked in this browser \u2014 notes will not be saved');
    }
  }

  try {
    boot();
  } catch (err) {
    fatal(err);
  }
})();
