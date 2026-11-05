// UI widgets and the Photoshop-style layout: menu bar, options bar, tools panel, docked panels, status bar.
(function (E) {
  const U = E.U;
  const el = U.el;
  const ui = {};

  // ---------- icons (original line icons, 24×24) ----------
  const P = {
    move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
    marquee: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="2.5 2"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="2.5 2"/>',
    row: '<line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2.5 2"/><path d="M2 8h20M2 16h20" opacity=".35"/>',
    col: '<line x1="12" y1="2" x2="12" y2="22" stroke-dasharray="2.5 2"/><path d="M8 2v20M16 2v20" opacity=".35"/>',
    lasso: 'M12 4c-5 0-8.5 2.6-8.5 5.7S7 15.2 12 15.2s8.5-2.4 8.5-5.5S17 4 12 4zM7 14.2c-1.5 1.5-1 3.4.7 3.6 1.6.2 1.8 1.6.6 3.2',
    polylasso: 'M4 9l8-5 8 6-3.5 6.5H7.5zM7.5 16.5c-1 1.6-.4 3 1 3.2',
    wand: 'M4 20L14 10M15 3v3M15 12v3M10.5 7.5h3M17 7.5h3M12 5l1.3 1.3M18.2 9.8L17 8.6',
    eyedropper: 'M15 3.5l5.5 5.5-2.2 2.2-5.5-5.5zM14.2 7.3L5.5 16l-1 4.5 4.5-1 8.7-8.7',
    brush: 'M19.5 3.5l1 1-9 10.5-2.5-2.5zM8.6 13.2c-2.6-.2-4.1 1.6-4.1 4 0 1.6-.8 2.6-2 3.3 3.8.6 7.6-.3 8.6-3.6',
    pixel: 'M15 4l5 5-9.5 9.5H5.5v-5zM3 3h4v4H3zM7 7h3v3H7z',
    eraser: 'M8.5 20.5H20M3.5 15l9.5-9.5 6.5 6.5-8.5 8.5H8zM8.5 10l6.5 6.5',
    bucket: 'M4.5 11.5L11.5 4.5 19 12l-7 7zM4.5 11.5h14.5M19.5 14.5c1.1 1.8 1.8 3 1.8 3.9a1.8 1.8 0 0 1-3.6 0c0-.9.7-2.1 1.8-3.9z',
    hand: 'M8.5 12.5V5.8a1.4 1.4 0 0 1 2.8 0V11M11.3 11V4.4a1.4 1.4 0 0 1 2.8 0V11M14.1 11V5.6a1.4 1.4 0 0 1 2.8 0V12M16.9 12V8.6a1.4 1.4 0 0 1 2.8 0v5.6c0 4.2-2.8 7.3-6.8 7.3h-1c-2.8 0-4.4-1.4-5.6-3.6l-2.2-4a1.4 1.4 0 0 1 2.3-1.6l2.1 2.3',
    rotate: 'M19.5 12a7.5 7.5 0 1 1-2.6-5.7M19.5 4v4.5H15M12 12l-3-3',
    zoom: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M8 10.5h5M10.5 8v5"/>',
    swap: 'M7 4h9a3 3 0 0 1 3 3v8M16.5 12.5L19 15l2.5-2.5M10 7L7 4l3-3',
    defaults: '<rect x="3" y="3" width="8" height="8" fill="currentColor"/><rect x="7" y="7" width="8" height="8"/>',
    eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z<circle cx="12" cy="12" r="2.8"/>',
    plus: 'M12 5v14M5 12h14',
    newLayer: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
    dup: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    merge: 'M12 4v10M8 10l4 4 4-4M5 19h14',
    lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    checker: '<path d="M4 4h8v8H4zM12 12h8v8h-8z" fill="currentColor" opacity=".9"/><rect x="4" y="4" width="16" height="16"/>',
    play: '<path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/>',
    pause: '<path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor"/>',
    first: '<path d="M6 5v14M19 5l-10 7 10 7z" fill="currentColor"/>',
    last: '<path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor"/>',
    prev: '<path d="M17 5l-10 7 10 7z" fill="currentColor"/>',
    next: '<path d="M7 5l10 7-10 7z" fill="currentColor"/>',
    onion: '<circle cx="9" cy="12" r="6" opacity=".45"/><circle cx="15" cy="12" r="6"/>',
    loop: 'M4 12a6 6 0 0 1 6-6h8M15.5 3.5L18 6l-2.5 2.5M20 12a6 6 0 0 1-6 6H6M8.5 20.5L6 18l2.5-2.5',
    frame: '<rect x="5" y="4" width="14" height="16" rx="1"/>',
    key: '<rect x="5" y="4" width="14" height="16" rx="1"/><circle cx="12" cy="14" r="3" fill="currentColor"/>',
    blankKey: '<rect x="5" y="4" width="14" height="16" rx="1"/><circle cx="12" cy="14" r="3"/>',
    delFrame: '<rect x="5" y="4" width="14" height="16" rx="1"/><path d="M9 10l6 6M15 10l-6 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    pressure: '<path d="M4 20l6-6M14.5 3.5l6 6-8 8-6-6z"/><circle cx="18" cy="18" r="2.5" fill="currentColor"/>',
    chevron: 'M6 9l6 6 6-6',
    selNew: '<rect x="5" y="5" width="14" height="14" fill="currentColor"/>',
    selAdd: '<rect x="3" y="3" width="11" height="11" fill="currentColor"/><rect x="10" y="10" width="11" height="11" fill="currentColor"/>',
    selSub: '<rect x="3" y="3" width="11" height="11" fill="currentColor"/><rect x="10" y="10" width="11" height="11"/>',
    selInt: '<rect x="3" y="3" width="11" height="11"/><rect x="10" y="10" width="11" height="11"/><rect x="10" y="10" width="4" height="4" fill="currentColor"/>',
  };
  ui.icon = (name, size = 18) => {
    const d = P[name] || '';
    const inner = d.trim().startsWith('<') ? d : `<path d="${d.replace(/<.*$/, '')}"/>` + (d.includes('<') ? d.slice(d.indexOf('<')) : '');
    const span = el('span', { class: 'icon' });
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    return span;
  };

  // ---------- generic widgets ----------
  ui.toast = (msg, ms = 2800) => {
    const t = el('div', { class: 'toast' }, msg);
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
  };
  ui.dialog = ({ title, body, buttons = [{ label: 'OK', primary: true }], cls = '', onClose }) => {
    const back = el('div', { class: 'modal-back' });
    const close = (viaButton) => { back.remove(); document.removeEventListener('keydown', onKey, true); if (!viaButton && onClose) onClose(); };
    const btns = buttons.map(b => el('button', {
      class: 'btn' + (b.primary ? ' primary' : ''), onclick: () => { if (b.action && b.action() === false) return; close(true); },
    }, b.label));
    const dlg = el('div', { class: 'modal ' + cls },
      el('div', { class: 'modal-title' }, title, el('button', { class: 'modal-x', onclick: () => close(false), title: 'Close' }, '×')),
      el('div', { class: 'modal-body' }, body),
      el('div', { class: 'modal-buttons' }, btns));
    back.append(dlg);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
      else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const p = buttons.findIndex(b => b.primary); if (p >= 0) { e.preventDefault(); btns[p].click(); }
      }
      e.stopPropagation();
    };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) close(false); });
    document.body.append(back);
    const first = dlg.querySelector('input,select');
    if (first) setTimeout(() => { first.focus(); first.select && first.select(); }, 20);
    return { close, el: dlg };
  };
  ui.confirm = (title, message, okLabel = 'OK') => new Promise(res => ui.dialog({
    title, body: el('p', {}, message), onClose: () => res(false),
    buttons: [{ label: 'Cancel', action: () => res(false) }, { label: okLabel, primary: true, action: () => res(true) }],
  }));

  // Number field with a scrubby label (drag the label left/right, like Photoshop) and optional slider popup.
  ui.numField = ({ label, value, min = 0, max = 100, step = 1, unit = '', width = 46, onChange, onCommit, slider = true, title }) => {
    const input = el('input', { type: 'text', class: 'num', style: { width: width + 'px' }, spellcheck: 'false', title: title || '' });
    const lab = el('span', { class: 'num-label', title: (title || label) + ' — drag to adjust' }, label);
    const wrap = el('label', { class: 'numfield' }, lab, input);
    let cur = value;
    const fmt = (v) => (step < 1 ? (Math.round(v * 10) / 10) : Math.round(v)) + unit;
    const set = (v, fire, commit) => {
      v = U.clamp(Number(v), min, max);
      if (isNaN(v)) v = cur;
      cur = v; input.value = fmt(v);
      if (pop) pop.range.value = v;
      if (fire && onChange) onChange(v);
      if (commit && onCommit) onCommit(v);
    };
    input.addEventListener('change', () => set(parseFloat(input.value), true, true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); set(cur + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1), true, true); }
      if (e.key === 'Enter') input.blur();
      e.stopPropagation();
    });
    lab.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      lab.setPointerCapture(e.pointerId);
      const x0 = e.clientX, v0 = cur;
      const range = max - min;
      const mv = (ev) => { const dx = ev.clientX - x0; set(v0 + dx * Math.max(step, range / 300) * (ev.shiftKey ? 10 : 1), true, false); };
      const up = () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); if (onCommit) onCommit(cur); };
      lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up);
    });
    let pop = null;
    if (slider) {
      const btn = el('button', { class: 'num-drop', tabindex: -1 }, ui.icon('chevron', 10));
      wrap.append(btn);
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (pop) { pop.remove(); pop = null; return; }
        const range = el('input', { type: 'range', min, max, step, value: cur });
        pop = el('div', { class: 'num-pop' }, range); pop.range = range;
        range.addEventListener('input', () => set(range.value, true, false));
        range.addEventListener('change', () => { if (onCommit) onCommit(cur); });
        const r = wrap.getBoundingClientRect();
        pop.style.left = r.left + 'px'; pop.style.top = (r.bottom + 4) + 'px';
        document.body.append(pop);
        const off = (ev) => { if (pop && !pop.contains(ev.target) && !btn.contains(ev.target)) { pop.remove(); pop = null; document.removeEventListener('pointerdown', off, true); if (onCommit) onCommit(cur); } };
        setTimeout(() => document.addEventListener('pointerdown', off, true));
      });
    }
    set(value);
    wrap.set = (v) => { if (document.activeElement !== input) set(v); };
    return wrap;
  };
  ui.check = ({ label, value, onChange, title }) => {
    const input = el('input', { type: 'checkbox' });
    input.checked = !!value;
    input.addEventListener('change', () => onChange(input.checked));
    const w = el('label', { class: 'check', title: title || '' }, input, label);
    w.set = (v) => input.checked = !!v;
    return w;
  };
  ui.toggle = ({ icon, value, onChange, title }) => {
    const b = el('button', { class: 'toggle' + (value ? ' on' : ''), title }, ui.icon(icon, 16));
    b.addEventListener('click', () => { value = !value; b.classList.toggle('on', value); onChange(value); });
    return b;
  };
  ui.select = ({ options, value, onChange, title, cls }) => {
    const s = el('select', { title: title || '', class: cls || '' });
    for (const o of options) {
      if (!o) { const sep = el('option', { disabled: true }, '──────────'); s.append(sep); continue; }
      const [v, l] = Array.isArray(o) ? o : [o, o];
      s.append(el('option', { value: v }, l));
    }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    s.addEventListener('keydown', (e) => e.stopPropagation());
    return s;
  };
  ui.segmented = ({ options, value, onChange }) => { // options: [[value, icon, title]]
    const w = el('div', { class: 'seg' });
    const btns = options.map(([v, icon, title]) => {
      const b = el('button', { class: 'seg-btn' + (v === value ? ' on' : ''), title }, ui.icon(icon, 16));
      b.addEventListener('click', () => { btns.forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange(v); });
      return b;
    });
    w.append(...btns);
    return w;
  };
  ui.sep = () => el('div', { class: 'opt-sep' });

  // Popup menu at a position. items: [{label, action, key, disabled, checked}] or null for separator
  ui.popup = (items, x, y) => {
    ui.closePopups();
    const m = el('div', { class: 'menu popup' });
    for (const it of items) {
      if (!it) { m.append(el('div', { class: 'menu-sep' })); continue; }
      const row = el('div', { class: 'menu-item' + (it.disabled ? ' disabled' : '') },
        el('span', { class: 'menu-check' }, it.checked ? '✓' : ''), el('span', { class: 'menu-label' }, it.label), el('span', { class: 'menu-key' }, it.key || ''));
      if (!it.disabled) row.addEventListener('click', () => { ui.closePopups(); it.action && it.action(); });
      m.append(row);
    }
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px';
    m.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', ui._popupOff, true));
    return m;
  };
  ui._popupOff = (e) => { if (!e.target.closest('.popup')) ui.closePopups(); };
  ui.closePopups = () => { document.querySelectorAll('.popup').forEach(p => p.remove()); document.removeEventListener('pointerdown', ui._popupOff, true); };

  // ---------- menu bar ----------
  ui.buildMenuBar = (host, menus) => {
    host.innerHTML = '';
    let open = null;
    const logo = el('div', { class: 'logo', title: 'PixelBoy' }, el('span', { class: 'logo-screen' }, el('i')), 'Pixel', el('b', {}, 'Boy'));
    host.append(logo);
    const closeAll = () => { if (open) { open.btn.classList.remove('open'); open.menu.remove(); open = null; } document.removeEventListener('pointerdown', off, true); };
    const off = (e) => { if (!e.target.closest('.menubar-btn') && !e.target.closest('.menu.dropdown')) closeAll(); };
    const show = (btn, menu) => {
      closeAll();
      const m = el('div', { class: 'menu dropdown' });
      for (const it of menu.items()) {
        if (!it) { m.append(el('div', { class: 'menu-sep' })); continue; }
        const key = it.action ? E.Hotkeys.label(it.action) : (it.key || '');
        const enabled = !it.enabled || it.enabled();
        const row = el('div', { class: 'menu-item' + (enabled ? '' : ' disabled') },
          el('span', { class: 'menu-check' }, it.checked && it.checked() ? '✓' : ''),
          el('span', { class: 'menu-label' }, it.label), el('span', { class: 'menu-key' }, key));
        if (enabled) row.addEventListener('click', () => { closeAll(); if (it.action) E.Hotkeys.run(it.action); else if (it.run) it.run(); });
        m.append(row);
      }
      const r = btn.getBoundingClientRect();
      m.style.left = r.left + 'px'; m.style.top = r.bottom + 'px';
      document.body.append(m);
      btn.classList.add('open');
      open = { btn, menu: m };
      setTimeout(() => document.addEventListener('pointerdown', off, true));
    };
    for (const menu of menus) {
      const btn = el('div', { class: 'menubar-btn' }, menu.label);
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (open && open.btn === btn) closeAll(); else show(btn, menu); });
      btn.addEventListener('pointerenter', () => { if (open && open.btn !== btn) show(btn, menu); });
      host.append(btn);
    }
    host.append(el('div', { class: 'menubar-spacer' }));
  };

  // ---------- tools panel ----------
  ui.buildToolbar = (host, app) => {
    host.innerHTML = '';
    const { GROUPS, TOOLS } = E.Tools;
    const buttons = {};
    for (const g of GROUPS) {
      const b = el('button', { class: 'tool-btn' + (g.tools.length > 1 ? ' has-group' : '') });
      b.addEventListener('click', () => app.selectTool(app.groupTool[g.id]));
      const flyout = (e) => {
        e.preventDefault();
        if (g.tools.length < 2) return;
        const r = b.getBoundingClientRect();
        ui.popup(g.tools.map(id => ({ label: TOOLS[id].name, key: g.key, checked: app.toolId === id, action: () => app.selectTool(id) })), r.right + 2, r.top);
      };
      b.addEventListener('contextmenu', flyout);
      let lp; b.addEventListener('pointerdown', (e) => { lp = setTimeout(() => flyout(e), 450); });
      b.addEventListener('pointerup', () => clearTimeout(lp)); b.addEventListener('pointerleave', () => clearTimeout(lp));
      if (g.id === 'g-hand') b.addEventListener('dblclick', () => app.view.fit());
      if (g.id === 'g-zoom') b.addEventListener('dblclick', () => app.view.actualPixels());
      buttons[g.id] = b;
      host.append(b);
      if (['g-move', 'g-wand', 'g-bucket', 'g-rotate'].includes(g.id)) host.append(el('div', { class: 'tool-sep' }));
    }
    // foreground / background swatches
    const fg = el('div', { class: 'swatch fg', title: 'Set foreground color' });
    const bg = el('div', { class: 'swatch bg', title: 'Set background color' });
    const swap = el('button', { class: 'mini swap', title: 'Switch Foreground and Background Colors (X)' }, ui.icon('swap', 12));
    const def = el('button', { class: 'mini def', title: 'Default Foreground and Background Colors (D)' }, ui.icon('defaults', 11));
    fg.addEventListener('click', async () => { const c = await E.ColorPicker.open(app.fg, 'Color Picker (Foreground Color)'); if (c) app.setFg(c); });
    bg.addEventListener('click', async () => { const c = await E.ColorPicker.open(app.bg, 'Color Picker (Background Color)'); if (c) app.setBg(c); });
    swap.addEventListener('click', () => E.Hotkeys.run('color.swap'));
    def.addEventListener('click', () => E.Hotkeys.run('color.default'));
    host.append(el('div', { class: 'swatches' }, bg, fg, swap, def));
    const update = () => {
      for (const g of GROUPS) {
        const id = app.groupTool[g.id], t = TOOLS[id], b = buttons[g.id];
        b.innerHTML = ''; b.append(ui.icon(id, 20));
        b.classList.toggle('active', g.tools.includes(app.toolId));
        const k = E.Hotkeys.label('tool.' + g.id);
        b.title = t.name + (k ? ` (${k})` : '');
      }
      fg.style.background = app.fg; bg.style.background = app.bg;
    };
    E.on('tool', update); E.on('color', update); E.on('keymap', update);
    update();
  };

  // ---------- options bar ----------
  ui.buildOptions = (host, app) => {
    const t = app.tool, s = app.settings;
    host.innerHTML = '';
    host.append(el('div', { class: 'opt-tool' }, ui.icon(t.id, 20)), ui.sep());
    const save = () => app.saveSettings();
    const pct = (label, obj, key, title) => ui.numField({ label, value: Math.round(obj[key] * 100), min: 0, max: 100, unit: '%', onChange: v => { obj[key] = v / 100; }, onCommit: save, title });
    const pressBtn = (obj, key, title) => ui.toggle({ icon: 'pressure', value: obj[key], title, onChange: v => { obj[key] = v; save(); } });
    const add = (...xs) => host.append(...xs);
    const smoothing = (obj) => {
      const f = ui.numField({ label: 'Smoothing:', value: obj.smoothing, min: 0, max: 100, unit: '%', onChange: v => obj.smoothing = v, onCommit: save, title: 'Smoothing (pulled-string stabilizer)' });
      const gear = el('button', { class: 'icon-btn', title: 'Smoothing options' }, ui.icon('gear', 15));
      gear.addEventListener('click', () => { const r = gear.getBoundingClientRect(); ui.popup([{ label: 'Catch-up on stroke end', checked: obj.catchUp !== false, action: () => { obj.catchUp = obj.catchUp === false; save(); } }], r.left, r.bottom + 4); });
      return [f, gear];
    };
    if (t.id === 'brush' || (t.id === 'eraser')) {
      const ts = s[t.id];
      if (t.id === 'eraser') {
        add(el('span', { class: 'opt-label' }, 'Mode:'), ui.select({ options: [['brush', 'Brush'], ['pixel', 'Pixel']], value: ts.mode, onChange: v => { ts.mode = v; save(); app.refreshOptions(true); } }), ui.sep());
      }
      if (t.id === 'eraser' && ts.mode === 'pixel') {
        add(ui.numField({ label: 'Size:', value: ts.pixelSize, min: 1, max: 500, unit: ' px', onChange: v => ts.pixelSize = Math.round(v), onCommit: save }));
        add(ui.sep(), pct('Opacity:', ts, 'opacity'));
      } else {
        add(ui.brushPickerButton(app, t.id), ui.sep());
        app._sizeField = ui.numField({ label: 'Size:', value: ts.params.size, min: 1, max: 5000, unit: ' px', onChange: v => ts.params.size = v, onCommit: save });
        add(app._sizeField);
        if (ts.params.kind === 'round') add(app._hardField = ui.numField({ label: 'Hardness:', value: Math.round(ts.params.hardness * 100), min: 0, max: 100, unit: '%', onChange: v => ts.params.hardness = v / 100, onCommit: save }));
        add(ui.sep(), app._opField = pct('Opacity:', ts, 'opacity', 'Opacity (number keys)'), pressBtn(ts.params, 'pressureOpacity', 'Use pressure for opacity'));
        add(app._flowField = pct('Flow:', ts, 'flow', 'Flow (Shift + number keys)'));
        add(ui.sep(), ...smoothing(ts), ui.sep(), pressBtn(ts.params, 'pressureSize', 'Use pressure for size'));
      }
    } else if (t.id === 'pixel') {
      const ps = s.pixel;
      add(ui.numField({ label: 'Size:', value: ps.size, min: 1, max: 500, unit: ' px', onChange: v => ps.size = Math.round(v), onCommit: save }));
      add(el('span', { class: 'opt-label' }, 'Shape:'), ui.select({ options: [['square', 'Square'], ['circle', 'Round']], value: ps.shape, onChange: v => { ps.shape = v; save(); } }));
      add(ui.sep(), app._opField = pct('Opacity:', ps, 'opacity'));
      add(ui.sep(), ui.check({ label: 'Pixel-perfect', value: ps.pixelPerfect, title: 'Removes doubled corner pixels from 1px lines', onChange: v => { ps.pixelPerfect = v; save(); } }));
      add(ui.sep(), ...smoothing(ps));
    } else if (t.selection) {
      add(ui.segmented({
        value: s.selection.mode, onChange: v => { s.selection.mode = v; save(); },
        options: [['new', 'selNew', 'New selection'], ['add', 'selAdd', 'Add to selection (Shift)'], ['sub', 'selSub', 'Subtract from selection (Alt)'], ['int', 'selInt', 'Intersect with selection (Shift+Alt)']],
      }));
      if (t.id === 'wand') {
        const w = s.wand;
        add(ui.sep(), ui.numField({ label: 'Tolerance:', value: w.tolerance, min: 0, max: 255, onChange: v => w.tolerance = Math.round(v), onCommit: save }));
        add(ui.check({ label: 'Contiguous', value: w.contiguous, onChange: v => { w.contiguous = v; save(); } }));
        add(ui.check({ label: 'Sample All Layers', value: w.allLayers, onChange: v => { w.allLayers = v; save(); } }));
      }
      if (t.id === 'polylasso') add(ui.sep(), el('span', { class: 'opt-hint' }, 'Click to add points · double-click or Enter to close · Backspace removes a point'));
      add(ui.sep(), el('button', { class: 'btn small', onclick: () => E.Hotkeys.run('select.deselect') }, 'Deselect'));
    } else if (t.id === 'move') {
      add(el('span', { class: 'opt-hint' }, 'Drag to move the layer (or the selected pixels). Shift constrains. Arrow keys nudge 1px, Shift+Arrow 10px.'));
    } else if (t.id === 'eyedropper') {
      const es = s.eyedropper;
      add(el('span', { class: 'opt-label' }, 'Sample Size:'), ui.select({ options: [[1, 'Point Sample'], [3, '3 by 3 Average'], [5, '5 by 5 Average'], [11, '11 by 11 Average']], value: es.size, onChange: v => { es.size = Number(v); save(); } }));
      add(el('span', { class: 'opt-label' }, 'Sample:'), ui.select({ options: [['all', 'All Layers'], ['cur', 'Current Layer']], value: es.allLayers ? 'all' : 'cur', onChange: v => { es.allLayers = v === 'all'; save(); } }));
      add(ui.sep(), el('span', { class: 'opt-hint' }, 'Alt-click samples the background color'));
    } else if (t.id === 'bucket') {
      const bs = s.bucket;
      add(app._opField = pct('Opacity:', bs, 'opacity'));
      add(ui.sep(), ui.numField({ label: 'Tolerance:', value: bs.tolerance, min: 0, max: 255, onChange: v => bs.tolerance = Math.round(v), onCommit: save }));
      add(ui.check({ label: 'Contiguous', value: bs.contiguous, onChange: v => { bs.contiguous = v; save(); } }));
      add(ui.check({ label: 'All Layers', value: bs.allLayers, onChange: v => { bs.allLayers = v; save(); } }));
    } else if (t.nav) {
      if (t.id === 'rotate') {
        add(app._rotField = ui.numField({ label: 'Rotation Angle:', value: Math.round(app.view.rot), min: 0, max: 359, unit: '°', onChange: v => app.view.rotateBy(v - app.view.rot), slider: false }));
        add(el('button', { class: 'btn small', onclick: () => app.view.rotateBy(-app.view.rot) }, 'Reset View'));
        add(ui.sep());
      }
      add(el('button', { class: 'btn small', onclick: () => app.view.actualPixels() }, '100%'));
      add(el('button', { class: 'btn small', onclick: () => app.view.fit() }, 'Fit Screen'));
      if (t.id === 'zoom') add(el('span', { class: 'opt-hint' }, 'Click to zoom in · Alt-click to zoom out · drag to scrub'));
    }
  };

  // Brush preset picker button + popover (like Photoshop's brush preset picker)
  ui.brushPickerButton = (app, toolId) => {
    const ts = app.settings[toolId];
    const b = el('button', { class: 'brush-pick', title: 'Brush preset picker' });
    b.append(E.Brushes.thumbnail(ts.params, 44, 24), el('span', { class: 'brush-pick-size' }, Math.round(ts.params.size)), ui.icon('chevron', 10));
    b.addEventListener('click', () => {
      if (document.querySelector('.brush-pop')) { ui.closePopups(); return; }
      ui.closePopups();
      const pop = el('div', { class: 'popup brush-pop' });
      const size = ui.numField({ label: 'Size:', value: ts.params.size, min: 1, max: 5000, unit: ' px', slider: false, onChange: v => { ts.params.size = v; app.refreshOptions(); }, onCommit: () => app.saveSettings() });
      pop.append(size);
      if (ts.params.kind === 'round') pop.append(ui.numField({ label: 'Hardness:', value: Math.round(ts.params.hardness * 100), min: 0, max: 100, unit: '%', slider: false, onChange: v => { ts.params.hardness = v / 100; app.refreshOptions(); }, onCommit: () => app.saveSettings() }));
      pop.append(ui.brushGrid(app, toolId, () => ui.closePopups()));
      const r = b.getBoundingClientRect();
      pop.style.left = r.left + 'px'; pop.style.top = (r.bottom + 4) + 'px';
      document.body.append(pop);
      setTimeout(() => document.addEventListener('pointerdown', ui._popupOff, true));
    });
    return b;
  };
  ui.brushGrid = (app, toolId, after) => {
    const grid = el('div', { class: 'brush-grid' });
    const ts = app.settings[toolId];
    let lastSet = null;
    for (const p of E.Brushes.presets) {
      const set = p.builtIn ? 'PixelBoy Brushes' : (p.set || 'Imported');
      if (set !== lastSet) { grid.append(el('div', { class: 'brush-set' }, set)); lastSet = set; }
      const item = el('div', { class: 'brush-item' + (ts.presetId === p.id ? ' on' : ''), title: p.name },
        E.Brushes.thumbnail(p, 64, 34), el('div', { class: 'brush-name' }, p.name));
      item.addEventListener('click', () => { app.selectPreset(toolId, p.id); if (after) after(); });
      if (!p.builtIn) item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ui.popup([{ label: 'Delete Brush', action: () => { E.Brushes.remove(p.id); E.emit('brushes'); } }], e.clientX, e.clientY);
      });
      grid.append(item);
    }
    return grid;
  };

  // ---------- docked panels ----------
  ui.panel = (title, body, tabs) => {
    const head = el('div', { class: 'panel-head' });
    const p = el('div', { class: 'panel' }, head);
    if (tabs) {
      const bodies = tabs.map(t => t.body);
      tabs.forEach((t, i) => {
        const tab = el('div', { class: 'panel-tab' + (i === 0 ? ' on' : '') }, t.title);
        tab.addEventListener('click', () => {
          head.querySelectorAll('.panel-tab').forEach(x => x.classList.remove('on')); tab.classList.add('on');
          bodies.forEach((b, j) => b.style.display = j === i ? '' : 'none');
        });
        head.append(tab);
        if (i) t.body.style.display = 'none';
        p.append(t.body);
      });
    } else { head.append(el('div', { class: 'panel-tab on' }, title)); p.append(body); }
    return p;
  };

  ui.buildColorPanel = (app) => {
    const cp = new E.ColorPicker({ onChange: (hex, final) => app.setFg(hex, !final) });
    cp.set(app.fg);
    E.on('color', (src) => { if (src !== 'panel') cp.set(app.fg); });
    const swatches = el('div', { class: 'swatch-row' });
    const renderSw = () => {
      swatches.innerHTML = '';
      for (const c of app.recentColors) {
        const s = el('div', { class: 'swatch-cell', style: { background: c }, title: c });
        s.addEventListener('click', () => app.setFg(c));
        swatches.append(s);
      }
    };
    E.on('recent', renderSw); renderSw();
    const body = el('div', { class: 'panel-body color-body' }, cp.el, swatches);
    return ui.panel('Color', body);
  };

  ui.buildBrushPanel = (app) => {
    const presets = el('div', { class: 'panel-body brushes-body' });
    const settings = el('div', { class: 'panel-body brush-settings' });
    const toolFor = () => (app.toolId === 'eraser' ? 'eraser' : 'brush');
    const renderPresets = () => {
      presets.innerHTML = '';
      presets.append(ui.brushGrid(app, toolFor()));
      presets.append(el('div', { class: 'panel-actions' },
        el('button', { class: 'btn small', onclick: () => E.Hotkeys.run('file.importAbr'), title: 'Load Photoshop .abr brushes' }, 'Import .ABR…'),
        el('button', { class: 'btn small', onclick: () => E.Hotkeys.run('file.importBrushImage'), title: 'Make a brush tip from an image (dark = paint)' }, 'Tip from Image…')));
    };
    const renderSettings = () => {
      settings.innerHTML = '';
      const ts = app.settings[toolFor()], p = ts.params, save = () => app.saveSettings();
      const row = (f) => settings.append(el('div', { class: 'bs-row' }, f));
      settings.append(el('div', { class: 'bs-title' }, `${p.name || 'Brush'} — ${toolFor() === 'eraser' ? 'Eraser' : 'Brush'}`));
      row(ui.numField({ label: 'Size', value: p.size, min: 1, max: 5000, unit: ' px', width: 60, onChange: v => { p.size = v; app.refreshOptions(); }, onCommit: save }));
      if (p.kind === 'round') row(ui.numField({ label: 'Hardness', value: Math.round(p.hardness * 100), min: 0, max: 100, unit: '%', width: 60, onChange: v => { p.hardness = v / 100; app.refreshOptions(); }, onCommit: save }));
      row(ui.numField({ label: 'Spacing', value: Math.round(p.spacing * 100), min: 1, max: 300, unit: '%', width: 60, onChange: v => p.spacing = v / 100, onCommit: save }));
      row(ui.numField({ label: 'Angle', value: Math.round(p.angle), min: -180, max: 180, unit: '°', width: 60, onChange: v => p.angle = v, onCommit: save }));
      row(ui.numField({ label: 'Roundness', value: Math.round(p.roundness * 100), min: 1, max: 100, unit: '%', width: 60, onChange: v => p.roundness = v / 100, onCommit: save }));
      settings.append(el('div', { class: 'bs-sub' }, 'Shape Dynamics'));
      row(ui.check({ label: 'Pressure controls size', value: p.pressureSize, onChange: v => { p.pressureSize = v; save(); app.refreshOptions(true); } }));
      row(ui.numField({ label: 'Minimum Diameter', value: Math.round(p.minSize * 100), min: 0, max: 100, unit: '%', width: 60, onChange: v => p.minSize = v / 100, onCommit: save }));
      row(ui.numField({ label: 'Size Jitter', value: Math.round(p.sizeJitter * 100), min: 0, max: 100, unit: '%', width: 60, onChange: v => p.sizeJitter = v / 100, onCommit: save }));
      row(ui.numField({ label: 'Angle Jitter', value: Math.round(p.angleJitter), min: 0, max: 180, unit: '°', width: 60, onChange: v => p.angleJitter = v, onCommit: save }));
      row(ui.check({ label: 'Angle follows stroke direction', value: p.followDirection, onChange: v => { p.followDirection = v; save(); } }));
      settings.append(el('div', { class: 'bs-sub' }, 'Scattering'));
      row(ui.numField({ label: 'Scatter', value: Math.round(p.scatter * 100), min: 0, max: 500, unit: '%', width: 60, onChange: v => p.scatter = v / 100, onCommit: save }));
      row(ui.numField({ label: 'Count', value: p.count || 1, min: 1, max: 16, width: 60, onChange: v => p.count = Math.round(v), onCommit: save }));
      settings.append(el('div', { class: 'bs-sub' }, 'Transfer'));
      row(ui.check({ label: 'Pressure controls opacity', value: p.pressureOpacity, onChange: v => { p.pressureOpacity = v; save(); app.refreshOptions(true); } }));
      settings.append(el('div', { class: 'panel-actions' },
        el('button', { class: 'btn small', onclick: () => app.selectPreset(toolFor(), ts.presetId) }, 'Reset to Preset'),
        el('button', { class: 'btn small', onclick: () => app.saveAsPreset(toolFor()) }, 'Save as New Preset…')));
    };
    const rerender = () => { renderPresets(); renderSettings(); };
    E.on('brushes', rerender); E.on('preset', rerender);
    E.on('tool', () => { if (app.toolId === 'eraser' || app.toolId === 'brush') rerender(); });
    rerender();
    return ui.panel('Brushes', null, [{ title: 'Brushes', body: presets }, { title: 'Brush Settings', body: settings }]);
  };

  ui.buildLayersPanel = (app) => {
    const body = el('div', { class: 'panel-body layers-body' });
    const blend = ui.select({ options: U.BLEND_MODES, value: 'source-over', title: 'Blending mode', cls: 'blend-select', onChange: v => app.doc.setLayerProps(app.doc.activeLayer, { blend: v }, 'Blending Change') });
    let opBefore = null;
    const opacity = ui.numField({
      label: 'Opacity:', value: 100, min: 0, max: 100, unit: '%',
      onChange: v => { if (!opBefore) opBefore = app.doc.snapshot(); app.doc.activeLayer.opacity = v / 100; app.view.invalidate(); },
      onCommit: () => { if (opBefore) { app.doc.history.structural('Opacity Change', opBefore, app.doc.snapshot()); opBefore = null; E.emit('layers'); } },
    });
    const lockBtn = el('button', { class: 'toggle', title: 'Lock transparent pixels (/)' }, ui.icon('checker', 15));
    lockBtn.addEventListener('click', () => E.Hotkeys.run('layer.lockAlpha'));
    const top = el('div', { class: 'layers-top' }, blend, opacity);
    const locks = el('div', { class: 'layers-locks' }, el('span', { class: 'opt-label' }, 'Lock:'), lockBtn);
    const list = el('div', { class: 'layer-list' });
    const actions = el('div', { class: 'layer-actions' },
      ...[['newLayer', 'layer.new', 'Create a new layer'], ['dup', 'layer.duplicate', 'Duplicate layer'], ['merge', 'layer.mergeDown', 'Merge down'], ['trash', 'layer.delete', 'Delete layer']]
        .map(([ic, act, title]) => { const b = el('button', { class: 'icon-btn', title }, ui.icon(ic, 16)); b.addEventListener('click', () => E.Hotkeys.run(act)); return b; }));
    body.append(top, locks, list, actions);
    const thumbs = new Map();
    const thumbFor = (layer) => {
      const d = app.doc, c = d.celCanvas(layer, d.frame);
      const tw = 40, th = Math.max(16, Math.round(40 * Math.min(1.5, d.height / d.width)));
      let t = thumbs.get(layer.id);
      if (!t) { t = el('canvas', { class: 'layer-thumb' }); thumbs.set(layer.id, t); }
      t.width = tw; t.height = th;
      const ctx = t.getContext('2d');
      ctx.clearRect(0, 0, tw, th);
      if (c) { ctx.imageSmoothingQuality = 'high'; const k = Math.min(tw / d.width, th / d.height); ctx.drawImage(c, (tw - d.width * k) / 2, (th - d.height * k) / 2, d.width * k, d.height * k); }
      return t;
    };
    let dragFrom = null;
    const render = () => {
      const d = app.doc; if (!d) return;
      const L = d.activeLayer;
      blend.value = L.blend; opacity.set(Math.round(L.opacity * 100)); lockBtn.classList.toggle('on', L.lockAlpha);
      list.innerHTML = '';
      for (let i = d.layers.length - 1; i >= 0; i--) {
        const l = d.layers[i];
        const eye = el('button', { class: 'layer-eye' + (l.visible ? ' on' : ''), title: 'Toggle visibility' }, l.visible ? ui.icon('eye', 15) : '');
        eye.addEventListener('click', (e) => { e.stopPropagation(); d.setLayerProps(l, { visible: !l.visible }, l.visible ? 'Hide Layer' : 'Show Layer'); });
        const name = el('div', { class: 'layer-name' }, l.name);
        const badges = el('div', { class: 'layer-badges' },
          l.lockAlpha ? ui.icon('checker', 12) : null,
          l.blend !== 'source-over' ? el('span', { class: 'badge' }, (U.BLEND_MODES.find(m => m && m[0] === l.blend) || [, ''])[1]) : null,
          l.opacity < 1 ? el('span', { class: 'badge' }, Math.round(l.opacity * 100) + '%') : null);
        const row = el('div', { class: 'layer-row' + (i === d.activeIndex ? ' active' : ''), draggable: 'true' }, eye, thumbFor(l), name, badges);
        row.addEventListener('pointerdown', () => { if (d.activeIndex !== i) { d.activeIndex = i; E.emit('layers'); E.emit('frames'); } });
        name.addEventListener('dblclick', () => {
          const inp = el('input', { class: 'layer-rename', value: l.name });
          name.innerHTML = ''; name.append(inp); inp.focus(); inp.select();
          const done = (ok) => { if (ok && inp.value.trim() && inp.value !== l.name) d.setLayerProps(l, { name: inp.value.trim() }, 'Rename Layer'); else render(); };
          inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
          inp.addEventListener('blur', () => done(true));
        });
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault(); d.activeIndex = i; E.emit('layers');
          ui.popup([
            { label: 'Duplicate Layer', action: () => E.Hotkeys.run('layer.duplicate') },
            { label: 'Delete Layer', action: () => E.Hotkeys.run('layer.delete'), disabled: d.layers.length < 2 },
            null,
            { label: 'Merge Down', action: () => E.Hotkeys.run('layer.mergeDown'), disabled: i === 0 },
            { label: 'Flatten Image', action: () => E.Hotkeys.run('layer.flatten') },
          ], e.clientX, e.clientY);
        });
        row.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop'); });
        row.addEventListener('dragleave', () => row.classList.remove('drop'));
        row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('drop'); if (dragFrom != null) d.moveLayer(dragFrom, i); dragFrom = null; });
        list.append(row);
      }
    };
    const refreshThumbs = U.debounce(() => { const d = app.doc; if (d) d.layers.forEach(thumbFor); }, 120);
    E.on('layers', render); E.on('doc', render);
    E.on('render', refreshThumbs);
    render();
    ui.refreshLayers = render;
    return ui.panel('Layers', body);
  };

  E.ui = ui;
})(window.E);
