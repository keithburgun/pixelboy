// Flash-style animation timeline: layers × frames grid, keyframes, playhead, playback, onion skin controls.
(function (E) {
  const U = E.U, el = U.el;
  const CW = 14, RH = 24, HEAD = 20; // cell width, row height, header height

  class Timeline {
    constructor(host, app) {
      this.app = app; this.host = host;
      const ui = E.ui;
      const btn = (icon, title, fn) => { const b = el('button', { class: 'icon-btn', title }, ui.icon(icon, 15)); b.addEventListener('click', fn); return b; };
      this.playBtn = btn('play', 'Play / Stop (Enter)', () => app.togglePlay());
      this.frameLabel = el('span', { class: 'tl-frame' });
      this.fps = ui.numField({ label: 'FPS', value: 12, min: 1, max: 60, width: 34, slider: false, onChange: v => { app.doc.fps = Math.round(v); if (app.playing) { app.stop(); app.play(); } }, onCommit: () => { app.doc.dirty = true; E.emit('dirty'); } });
      const v = app.view;
      this.onionBtn = ui.toggle({ icon: 'onion', value: v.onion.enabled, title: 'Onion Skin (Alt+Shift+O)', onChange: on => { v.onion.enabled = on; app.saveSettings(); v.invalidate(); this.draw(); } });
      this.before = ui.numField({ label: 'Before', value: v.onion.before, min: 0, max: 10, width: 26, slider: false, onChange: n => { v.onion.before = Math.round(n); v.invalidate(); this.draw(); }, onCommit: () => app.saveSettings() });
      this.after = ui.numField({ label: 'After', value: v.onion.after, min: 0, max: 10, width: 26, slider: false, onChange: n => { v.onion.after = Math.round(n); v.invalidate(); this.draw(); }, onCommit: () => app.saveSettings() });
      this.oop = ui.numField({ label: 'Opacity', value: Math.round(v.onion.opacity * 100), min: 5, max: 100, unit: '%', width: 40, onChange: n => { v.onion.opacity = n / 100; v.invalidate(); }, onCommit: () => app.saveSettings() });
      this.tint = ui.check({ label: 'Tint', value: v.onion.tint, title: 'Color previous frames red and next frames green', onChange: t => { v.onion.tint = t; app.saveSettings(); v.invalidate(); } });
      this.loopBtn = ui.toggle({ icon: 'loop', value: app.loop, title: 'Loop playback', onChange: l => { app.loop = l; } });
      const bar = el('div', { class: 'tl-bar' },
        btn('first', 'First frame (Home)', () => app.doc.setFrame(0)),
        btn('prev', 'Previous frame (,)', () => E.Hotkeys.run('anim.prev')),
        this.playBtn,
        btn('next', 'Next frame (.)', () => E.Hotkeys.run('anim.next')),
        btn('last', 'Last frame (End)', () => app.doc.setFrame(app.doc.frameCount - 1)),
        this.loopBtn, this.frameLabel, this.fps,
        el('div', { class: 'opt-sep' }),
        btn('frame', 'Insert Frame (F5)', () => E.Hotkeys.run('anim.insertFrame')),
        btn('key', 'Insert Keyframe (F6)', () => E.Hotkeys.run('anim.keyframe')),
        btn('blankKey', 'Insert Blank Keyframe (F7)', () => E.Hotkeys.run('anim.blankKeyframe')),
        btn('delFrame', 'Remove Frame (Shift+F5)', () => E.Hotkeys.run('anim.removeFrame')),
        el('div', { class: 'opt-sep' }),
        this.onionBtn, this.before, this.after, this.oop, this.tint,
        el('div', { class: 'tl-spacer' }),
        btn('chevron', 'Hide timeline (Ctrl+Alt+T)', () => app.toggleTimeline(false)));
      this.names = el('div', { class: 'tl-names' });
      this.canvas = el('canvas', { class: 'tl-grid' });
      this.scroller = el('div', { class: 'tl-scroll' }, this.canvas);
      const bodyEl = el('div', { class: 'tl-body' }, el('div', { class: 'tl-names-wrap' }, el('div', { class: 'tl-names-head' }), this.names), this.scroller);
      host.append(bar, bodyEl);
      this.scroller.addEventListener('scroll', () => { this.names.style.transform = `translateY(${-this.scroller.scrollTop}px)`; });
      this.canvas.addEventListener('pointerdown', (e) => this.pointer(e, true));
      this.canvas.addEventListener('pointermove', (e) => { if (e.buttons & 1) this.pointer(e, false); });
      this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault(); this.pointer(e, true);
        const H = (id) => () => E.Hotkeys.run(id);
        E.ui.popup([
          { label: 'Insert Frame', key: E.Hotkeys.label('anim.insertFrame'), action: H('anim.insertFrame') },
          { label: 'Remove Frame', key: E.Hotkeys.label('anim.removeFrame'), action: H('anim.removeFrame') },
          null,
          { label: 'Insert Keyframe', key: E.Hotkeys.label('anim.keyframe'), action: H('anim.keyframe') },
          { label: 'Insert Blank Keyframe', key: E.Hotkeys.label('anim.blankKeyframe'), action: H('anim.blankKeyframe') },
          { label: 'Clear Keyframe', key: E.Hotkeys.label('anim.clearKeyframe'), action: H('anim.clearKeyframe') },
        ], e.clientX, e.clientY);
      });
      new ResizeObserver(() => this.draw()).observe(this.scroller);
      E.on('frames', () => this.refresh()); E.on('layers', () => this.refresh()); E.on('doc', () => this.refresh());
      E.on('play', () => { this.playBtn.innerHTML = ''; this.playBtn.append(E.ui.icon(app.playing ? 'pause' : 'play', 15)); });
    }
    pointer(e, down) {
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const d = this.app.doc;
      const f = U.clamp(Math.floor(x / CW), 0, d.frameCount - 1);
      if (down && y > HEAD) {
        const row = Math.floor((y - HEAD) / RH);
        const li = d.layers.length - 1 - row;
        if (li >= 0 && li < d.layers.length && li !== d.activeIndex) { d.activeIndex = li; E.emit('layers'); }
      }
      if (this.app.playing) this.app.stop();
      d.setFrame(f);
    }
    refresh() {
      if (this.host.hidden) return;
      const d = this.app.doc;
      this.fps.set(d.fps);
      this.frameLabel.textContent = `${d.frame + 1} / ${d.frameCount}`;
      this.names.innerHTML = '';
      for (let i = d.layers.length - 1; i >= 0; i--) {
        const l = d.layers[i];
        const row = el('div', { class: 'tl-name' + (i === d.activeIndex ? ' active' : '') + (l.visible ? '' : ' hidden') }, l.name);
        row.addEventListener('click', () => { d.activeIndex = i; E.emit('layers'); E.emit('frames'); });
        this.names.append(row);
      }
      this.draw();
      this.ensureVisible();
    }
    ensureVisible() {
      const x = this.app.doc.frame * CW, s = this.scroller;
      if (x < s.scrollLeft) s.scrollLeft = x - CW * 2;
      else if (x + CW > s.scrollLeft + s.clientWidth) s.scrollLeft = x - s.clientWidth + CW * 4;
    }
    draw() {
      if (this.host.hidden) return;
      const d = this.app.doc; if (!d) return;
      const cs = getComputedStyle(document.documentElement);
      const col = (n, f) => (cs.getPropertyValue(n) || f).trim();
      const visibleFrames = Math.max(d.frameCount + 30, Math.ceil(this.scroller.clientWidth / CW) + 1);
      const w = visibleFrames * CW, h = HEAD + d.layers.length * RH;
      const dpr = window.devicePixelRatio || 1;
      const c = this.canvas;
      c.width = w * dpr; c.height = Math.max(h, 1) * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = col('--tl-bg', '#2b2b2b'); ctx.fillRect(0, 0, w, h);
      // header with frame numbers (every 5, like Flash)
      ctx.fillStyle = col('--panel-2', '#323232'); ctx.fillRect(0, 0, w, HEAD);
      ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
      for (let f = 0; f < visibleFrames; f++) {
        const x = f * CW;
        ctx.fillStyle = col('--text-dim', '#999');
        if ((f + 1) % 5 === 0 || f === 0) { ctx.fillText(String(f + 1), x + 2, HEAD / 2); ctx.fillRect(x + CW - 1, HEAD - 5, 1, 5); }
        else ctx.fillRect(x + CW - 1, HEAD - 3, 1, 3);
      }
      // onion range markers
      const o = this.app.view.onion;
      if (o.enabled) {
        const a = Math.max(0, d.frame - o.before), b = Math.min(d.frameCount - 1, d.frame + o.after);
        ctx.fillStyle = 'rgba(120,160,255,0.25)'; ctx.fillRect(a * CW, 0, (b - a + 1) * CW, HEAD);
      }
      // rows
      d.layers.slice().reverse().forEach((l, row) => {
        const y = HEAD + row * RH, li = d.layers.length - 1 - row;
        for (let f = 0; f < visibleFrames; f++) {
          const x = f * CW, inRange = f < d.frameCount;
          ctx.fillStyle = inRange ? ((f + 1) % 5 === 0 ? col('--tl-cell5', '#3a3a3a') : col('--tl-cell', '#353535')) : col('--tl-bg', '#2b2b2b');
          ctx.fillRect(x, y, CW, RH);
        }
        if (li === d.activeIndex) { ctx.fillStyle = 'rgba(70,130,220,0.18)'; ctx.fillRect(0, y, d.frameCount * CW, RH); }
        // key spans
        l.keys.forEach((k, ki) => {
          if (k.frame >= d.frameCount) return;
          const end = Math.min(d.frameCount, ki + 1 < l.keys.length ? l.keys[ki + 1].frame : d.frameCount) - 1;
          const empty = U.isCanvasEmptyFast(k.canvas);
          const x0 = k.frame * CW, x1 = (end + 1) * CW;
          ctx.fillStyle = empty ? col('--tl-blank', '#444') : col('--tl-span', '#5a5a5a');
          ctx.fillRect(x0, y + 1, x1 - x0, RH - 2);
          ctx.strokeStyle = col('--tl-line', '#1c1c1c'); ctx.lineWidth = 1;
          ctx.strokeRect(x0 + 0.5, y + 1.5, x1 - x0 - 1, RH - 3);
          // keyframe dot: filled = has drawing, hollow = blank (Flash)
          ctx.beginPath(); ctx.arc(x0 + CW / 2, y + RH - 7, 3, 0, Math.PI * 2);
          if (empty) { ctx.strokeStyle = col('--text', '#ddd'); ctx.stroke(); } else { ctx.fillStyle = col('--text', '#ddd'); ctx.fill(); }
          if (end > k.frame) { ctx.strokeStyle = col('--text-dim', '#999'); ctx.strokeRect(end * CW + 3.5, y + RH - 12.5, CW - 7, 8); }
        });
        ctx.fillStyle = col('--tl-line', '#1c1c1c'); ctx.fillRect(0, y + RH - 1, w, 1);
      });
      // playhead
      const px = d.frame * CW;
      ctx.fillStyle = 'rgba(230,60,60,0.25)'; ctx.fillRect(px, HEAD, CW, h - HEAD);
      ctx.fillStyle = '#e03c3c'; ctx.fillRect(px, 0, CW, HEAD - 2); ctx.fillRect(px + CW / 2 - 0.5, HEAD, 1, h - HEAD);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.fillText(String(d.frame + 1), px + CW / 2, HEAD / 2 - 1); ctx.textAlign = 'left';
    }
  }
  // Cheap emptiness check with a small cache keyed on canvas (invalidated each render pass)
  const emptyCache = new WeakMap();
  let emptyGen = 0;
  U.isCanvasEmptyFast = (c) => {
    const e = emptyCache.get(c);
    if (e && e.gen === emptyGen) return e.v;
    const small = U.canvas(64, 64), ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(c, 0, 0, 64, 64);
    const dd = ctx.getImageData(0, 0, 64, 64).data;
    let v = true; for (let i = 3; i < dd.length; i += 4) if (dd[i]) { v = false; break; }
    if (v && !U.isCanvasEmpty(c)) v = false; // tiny marks can vanish when downscaled
    emptyCache.set(c, { gen: emptyGen, v });
    return v;
  };
  E.on('render', () => { emptyGen++; });
  E.on('layers', () => { emptyGen++; });

  E.Timeline = Timeline;
})(window.E);
