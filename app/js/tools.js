// Tools. Each tool gets pointer input in document coordinates and can draw on the overlay.
(function (E) {
  const U = E.U;
  const app = () => E.app;
  const PAINT_TOOLS = new Set(['brush', 'pixel', 'eraser', 'bucket']);

  // ---------- helpers ----------
  function sizeStep(size, dir) { // Photoshop-like bracket increments
    const steps = [[10, 1], [100, 10], [200, 25], [300, 50], [1000, 100], [5000, 250]];
    const ref = dir > 0 ? size : size - 0.001;
    let st = 250; for (const [lim, s] of steps) if (ref < lim) { st = s; break; }
    const n = dir > 0 ? Math.floor(size / st) * st + st : Math.ceil(size / st) * st - st;
    return U.clamp(n, 1, 5000);
  }
  function canPaint(layer) {
    if (!layer.visible) { app().toast('Could not use the tool because the target layer is hidden.'); return false; }
    return true;
  }
  function selectionMode(e, base) {
    if (e.shift && e.alt) return 'int';
    if (e.shift) return 'add';
    if (e.alt) return 'sub';
    return base;
  }
  function drawCrosshair(ctx, s, r = 5) {
    ctx.beginPath();
    ctx.moveTo(s.x - r, s.y); ctx.lineTo(s.x + r, s.y); ctx.moveTo(s.x, s.y - r); ctx.lineTo(s.x, s.y + r);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  function sampleColor(x, y, allLayers, size = 1) {
    const a = app(), d = a.doc;
    const src = allLayers ? a.view.composite : d.celCanvas(d.activeLayer, d.frame);
    if (!src) return null;
    const half = Math.floor(size / 2);
    const sx = Math.floor(x) - half, sy = Math.floor(y) - half;
    if (sx + size <= 0 || sy + size <= 0 || sx >= d.width || sy >= d.height) return null;
    const px = src.getContext('2d').getImageData(sx, sy, size, size).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { const w = px[i + 3] / 255; r += px[i] * w; g += px[i + 1] * w; b += px[i + 2] * w; n += w; }
    if (!n) return null;
    return U.rgbToHex({ r: r / n, g: g / n, b: b / n });
  }

  // ---------- Painting tools (brush / eraser) ----------
  function makePaintTool(id, name, isEraser) {
    return {
      id, name, cursor: 'none', paint: true,
      get s() { return app().settings[id]; },
      get params() { return this.s.params; },
      stroke: null, lastPt: null, resizing: null,
      isPixel() { return isEraser && this.s.mode === 'pixel'; },
      down(e) {
        const a = app(), d = a.doc;
        if (e.button === 2 && e.alt) { this.resizing = { sx: e.sx, sy: e.sy, x: e.x, y: e.y, size: this.getSize(), hard: this.params.hardness }; return; }
        if (e.button !== 0) return;
        if (!canPaint(d.activeLayer)) return;
        const opts = {
          doc: d, layer: d.activeLayer, color: a.fg, opacity: this.s.opacity, flow: this.s.flow,
          eraser: isEraser, smoothing: e.shift && this.lastPt ? 0 : this.s.smoothing, zoom: a.view.zoom, catchUp: this.s.catchUp,
        };
        if (this.isPixel()) this.stroke = new E.PixelStroke(Object.assign(opts, { size: this.s.pixelSize, shape: 'square', brush: { spacing: 1 } }));
        else this.stroke = new E.Stroke(Object.assign(opts, { brush: Object.assign({}, this.params, { flow: 1 }) }));
        if (e.shift && this.lastPt) { // Shift-click: straight line from the last point
          this.stroke.begin(this.lastPt.x, this.lastPt.y, this.lastPt.p);
          this.stroke.move(e.x, e.y, e.p);
          this.finish(e.x, e.y, e.p);
          return;
        }
        this.stroke.begin(e.x, e.y, e.p);
        a.view.invalidate();
      },
      move(e) {
        const a = app();
        if (this.resizing) {
          const r = this.resizing, dx = (e.sx - r.sx) / a.view.zoom, dy = (e.sy - r.sy);
          this.setSize(Math.max(1, Math.round(r.size + dx * 2)));
          if (!this.isPixel()) this.params.hardness = U.clamp(r.hard - dy / 150, 0, 1);
          a.refreshOptions();
          a.view.needsOverlay = true;
          return;
        }
        if (this.stroke) {
          for (const pt of e.coalesced || [e]) this.stroke.move(pt.x, pt.y, pt.p);
          a.view.needsOverlay = true;
        }
      },
      up(e) {
        if (this.resizing) { this.resizing = null; app().saveSettings(); return; }
        if (this.stroke) this.finish(e.x, e.y, e.p);
      },
      finish(x, y, p) {
        const a = app();
        this.stroke.end(x, y, p);
        this.stroke.commit(isEraser ? 'Eraser' : 'Brush Tool');
        this.lastPt = { x, y, p };
        this.stroke = null;
        a.view.invalidate();
        E.emit('layers'); E.emit('frames');
      },
      cancel() { this.stroke = null; app().view.invalidate(); },
      live() { return this.stroke ? { layer: this.stroke.layer, canvas: this.stroke.previewCanvas() } : null; },
      getSize() { return this.isPixel() ? this.s.pixelSize : this.params.size; },
      setSize(v) { if (this.isPixel()) this.s.pixelSize = U.clamp(Math.round(v), 1, 500); else this.params.size = U.clamp(v, 1, 5000); },
      bracket(dir, shift) {
        if (shift) { if (!this.isPixel()) this.params.hardness = U.clamp(Math.round((this.params.hardness + dir * 0.25) * 4) / 4, 0, 1); }
        else this.setSize(this.isPixel() ? this.getSize() + dir : sizeStep(this.getSize(), dir));
        app().refreshOptions(); app().saveSettings(); app().view.needsOverlay = true;
      },
      drawOverlay(ctx, view, m) {
        const mp = view.mouse; if (!mp) return;
        if (this.isPixel()) return pixelCursor(ctx, view, m, this.s.pixelSize, mp, this.resizing);
        const center = this.resizing ? view.toScreen(this.resizing.x, this.resizing.y) : mp;
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        // pulled-string indicator
        if (this.stroke && this.s.smoothing > 0 && this.stroke.stringPos) {
          const sp = view.toScreen(this.stroke.stringPos().x, this.stroke.stringPos().y);
          ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(mp.x, mp.y);
          ctx.strokeStyle = 'rgba(232,90,160,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(232,90,160,0.9)'; ctx.fill();
        }
        const b = this.params, r = (b.size * view.zoom) / 2;
        const at = this.stroke && this.s.smoothing > 0 ? view.toScreen(this.stroke.stringPos().x, this.stroke.stringPos().y) : center;
        if (r < 3) { drawCrosshair(ctx, at); return; }
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(((b.angle + view.rot) * Math.PI) / 180);
        ctx.scale(view.flip ? -1 : 1, b.roundness);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.restore();
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.stroke();
        if (this.resizing && b.kind === 'round') { // show hardness as an inner ring
          ctx.beginPath(); ctx.arc(at.x, at.y, Math.max(1, r * b.hardness), 0, Math.PI * 2);
          ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        }
      },
    };
  }
  function pixelCursor(ctx, view, m, size, mp, resizing) {
    const p = resizing ? { x: resizing.x, y: resizing.y } : view.toDoc(mp.x, mp.y);
    const half = Math.floor((size - 1) / 2);
    const x = Math.floor(p.x) - half, y = Math.floor(p.y) - half;
    ctx.setTransform(m);
    ctx.beginPath(); ctx.rect(x, y, size, size);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = '#fff'; ctx.stroke();
    if (size * view.zoom < 6) drawCrosshair(ctx, mp, 6);
  }

  const brush = makePaintTool('brush', 'Brush Tool', false);
  const eraser = makePaintTool('eraser', 'Eraser Tool', true);

  // ---------- Pixel brush (aliased "Pencil") ----------
  const pixel = {
    id: 'pixel', name: 'Pixel Brush Tool', cursor: 'none', paint: true,
    get s() { return app().settings.pixel; },
    stroke: null, lastPt: null, resizing: null,
    down(e) {
      const a = app(), d = a.doc;
      if (e.button === 2 && e.alt) { this.resizing = { sx: e.sx, x: e.x, y: e.y, size: this.s.size }; return; }
      if (e.button !== 0 || !canPaint(d.activeLayer)) return;
      this.stroke = new E.PixelStroke({
        doc: d, layer: d.activeLayer, color: this.s.eraseMode ? '#000' : a.fg, opacity: this.s.opacity, flow: 1, eraser: !!this.s.eraseMode,
        size: this.s.size, shape: this.s.shape, pixelPerfect: this.s.pixelPerfect, smoothing: e.shift && this.lastPt ? 0 : this.s.smoothing,
        zoom: a.view.zoom, brush: { spacing: 1 }, catchUp: true,
      });
      if (e.shift && this.lastPt) { this.stroke.begin(this.lastPt.x, this.lastPt.y, 1); this.stroke.plotTo(e.x, e.y); this.finish(e.x, e.y); return; }
      this.stroke.begin(e.x, e.y, 1);
      a.view.invalidate();
    },
    move(e) {
      if (this.resizing) { this.s.size = U.clamp(Math.round(this.resizing.size + (e.sx - this.resizing.sx) / 8), 1, 500); app().refreshOptions(); app().view.needsOverlay = true; return; }
      if (!this.stroke) return;
      for (const pt of e.coalesced || [e]) this.stroke.move(pt.x, pt.y, 1);
      app().view.needsOverlay = true;
    },
    up(e) { if (this.resizing) { this.resizing = null; app().saveSettings(); return; } if (this.stroke) this.finish(e.x, e.y); },
    finish(x, y) {
      this.stroke.end(x, y, 1);
      this.stroke.commit('Pixel Brush');
      this.lastPt = { x, y };
      this.stroke = null;
      app().view.invalidate(); E.emit('layers'); E.emit('frames');
    },
    cancel() { this.stroke = null; app().view.invalidate(); },
    live() { return this.stroke ? { layer: this.stroke.layer, canvas: this.stroke.previewCanvas() } : null; },
    bracket(dir) { this.s.size = U.clamp(this.s.size + dir, 1, 500); app().refreshOptions(); app().saveSettings(); app().view.needsOverlay = true; },
    drawOverlay(ctx, view, m) { if (view.mouse) pixelCursor(ctx, view, m, this.s.size, view.mouse, this.resizing); },
  };

  // ---------- Marquee / lasso / wand ----------
  function selectionTool(id, name, shape) {
    return {
      id, name, cursor: 'crosshair', selection: true,
      drag: null, poly: null,
      down(e) {
        if (e.button !== 0) return;
        const a = app(), sel = a.doc.selection;
        const base = a.settings.selection.mode;
        const mode = selectionMode(e, base);
        if (shape === 'poly') {
          if (!this.poly) { this.poly = { pts: [{ x: e.x, y: e.y }], mode }; }
          else {
            const p0 = this.poly.pts[0], s0 = a.view.toScreen(p0.x, p0.y);
            if (this.poly.pts.length > 2 && Math.hypot(s0.x - e.sx, s0.y - e.sy) < 8) return this.closePoly();
            this.poly.pts.push({ x: e.x, y: e.y });
          }
          a.view.needsOverlay = true;
          return;
        }
        if (shape === 'wand') return this.wand(e, mode);
        // Drag inside an existing selection (new mode) moves the outline, like Photoshop
        if (mode === 'new' && sel.active && sel.contains(e.x, e.y) && (shape === 'rect' || shape === 'ellipse' || shape === 'lasso')) {
          this.drag = { moving: true, x0: e.x, y0: e.y, dx: 0, dy: 0, edges: sel.edges() };
          this.hideAnts = true;
          return;
        }
        this.drag = { x0: e.x, y0: e.y, x1: e.x, y1: e.y, mode, pts: [{ x: e.x, y: e.y }], downMods: { shift: e.shift, alt: e.alt } };
        if (shape === 'row' || shape === 'col') { this.drag.x1 = e.x; this.drag.y1 = e.y; }
      },
      move(e) {
        const a = app();
        if (this.poly) { a.view.needsOverlay = true; return; }
        if (!this.drag) return;
        const g = this.drag;
        if (g.moving) { g.dx = Math.round(e.x - g.x0); g.dy = Math.round(e.y - g.y0); a.view.needsOverlay = true; return; }
        g.x1 = e.x; g.y1 = e.y;
        g.constrain = e.shift && !g.downMods.shift;
        g.center = e.alt && !g.downMods.alt;
        if (shape === 'lasso') g.pts.push({ x: e.x, y: e.y });
        a.view.needsOverlay = true;
      },
      up(e) {
        const a = app(), d = a.doc, sel = d.selection;
        const g = this.drag; this.drag = null; this.hideAnts = false;
        if (!g) return;
        const before = sel.snapshot();
        if (g.moving) {
          if (g.dx || g.dy) { sel.translate(g.dx, g.dy); d.history.selection('Move Selection', before, sel.snapshot()); }
          a.view.needsOverlay = true;
          return;
        }
        const r = this.rect(g);
        if (shape === 'row') sel.apply(c => c.fillRect(0, Math.floor(g.y1), d.width, 1), g.mode);
        else if (shape === 'col') sel.apply(c => c.fillRect(Math.floor(g.x1), 0, 1, d.height), g.mode);
        else if (shape === 'lasso') {
          if (g.pts.length < 3) { if (g.mode === 'new') sel.clear(); }
          else sel.apply(c => { c.beginPath(); g.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill(); }, g.mode);
        } else if (r.w < 1 || r.h < 1) { // a click deselects
          if (g.mode === 'new') sel.clear(); else return;
        } else if (shape === 'rect') sel.apply(c => c.fillRect(r.x, r.y, r.w, r.h), g.mode);
        else sel.apply(c => { c.beginPath(); c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); c.fill(); }, g.mode);
        d.history.selection('Selection', before, sel.snapshot());
        E.emit('selection');
        a.view.needsOverlay = true;
      },
      rect(g) {
        let x0 = g.x0, y0 = g.y0, x1 = g.x1, y1 = g.y1;
        if (g.constrain) { const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); x1 = x0 + Math.sign(x1 - x0 || 1) * s; y1 = y0 + Math.sign(y1 - y0 || 1) * s; }
        if (g.center) { x0 = g.x0 - (x1 - g.x0); y0 = g.y0 - (y1 - g.y0); }
        x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
        return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      },
      closePoly() {
        const a = app(), sel = a.doc.selection, P = this.poly; this.poly = null;
        if (!P || P.pts.length < 3) { a.view.needsOverlay = true; return; }
        const before = sel.snapshot();
        sel.apply(c => { c.beginPath(); P.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); c.fill(); }, P.mode);
        a.doc.history.selection('Polygonal Lasso', before, sel.snapshot());
        E.emit('selection'); a.view.needsOverlay = true;
      },
      dblclick() { if (this.poly) { this.poly.pts.pop(); this.closePoly(); } },
      keydown(ev) {
        if (!this.poly) return false;
        if (ev.key === 'Enter') { this.closePoly(); return true; }
        if (ev.key === 'Escape') { this.poly = null; app().view.needsOverlay = true; return true; }
        if (ev.key === 'Backspace' || ev.key === 'Delete') { this.poly.pts.pop(); if (!this.poly.pts.length) this.poly = null; app().view.needsOverlay = true; return true; }
        return false;
      },
      cancel() { this.drag = null; this.poly = null; this.hideAnts = false; },
      wand(e, mode) {
        const a = app(), d = a.doc, s = a.settings.wand, sel = d.selection;
        const src = s.allLayers ? a.view.composite : d.celCanvas(d.activeLayer, d.frame);
        const before = sel.snapshot();
        if (!src) { if (mode === 'new') sel.clear(); }
        else {
          const img = src.getContext('2d').getImageData(0, 0, d.width, d.height);
          const mask = E.Selection.floodMask(img, e.x, e.y, s.tolerance, s.contiguous);
          const mc = E.Selection.maskToCanvas(mask, d.width, d.height);
          sel.apply(c => c.drawImage(mc, 0, 0), mode);
        }
        d.history.selection('Magic Wand', before, sel.snapshot());
        E.emit('selection'); a.view.needsOverlay = true;
      },
      drawOverlay(ctx, view, m) {
        const g = this.drag;
        if (g && g.moving) { view.drawAnts(ctx, m, g.edges, g.dx, g.dy); }
        else if (g) {
          view.strokePath(ctx, m, c => {
            c.beginPath();
            if (shape === 'lasso') g.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
            else if (shape === 'row') c.rect(0, Math.floor(g.y1), view.doc.width, 1);
            else if (shape === 'col') c.rect(Math.floor(g.x1), 0, 1, view.doc.height);
            else {
              const r = this.rect(g);
              if (shape === 'rect') c.rect(r.x, r.y, r.w, r.h);
              else c.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.1, r.w / 2), Math.max(0.1, r.h / 2), 0, 0, Math.PI * 2);
            }
          });
        }
        if (this.poly && view.mouse) {
          const mp = view.toDoc(view.mouse.x, view.mouse.y);
          view.strokePath(ctx, m, c => { c.beginPath(); this.poly.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.lineTo(mp.x, mp.y); });
        }
      },
    };
  }

  // ---------- Move ----------
  const move = {
    id: 'move', name: 'Move Tool', cursor: 'move',
    drag: null,
    begin() {
      const a = app(), d = a.doc, layer = d.activeLayer;
      const cel = d.celCanvas(layer, d.frame);
      if (!cel) return null;
      const sel = d.selection;
      const before = U.cloneCanvas(cel);
      const floating = U.cloneCanvas(cel), hole = U.cloneCanvas(cel);
      if (sel.active) {
        sel.clip(floating.getContext('2d'));
        const h = hole.getContext('2d'); h.globalCompositeOperation = 'destination-out'; h.drawImage(sel.mask, 0, 0);
      } else hole.getContext('2d').clearRect(0, 0, d.width, d.height);
      return { layer, cel, before, floating, hole, preview: U.canvas(d.width, d.height), dx: 0, dy: 0, selBefore: sel.snapshot(), edges: sel.active ? sel.edges() : null };
    },
    down(e) {
      if (e.button !== 0) return;
      const d = app().doc;
      if (!canPaint(d.activeLayer)) return;
      this.drag = this.begin();
      if (this.drag) { this.drag.x0 = e.x; this.drag.y0 = e.y; this.hideAnts = !!this.drag.edges; }
    },
    move(e) {
      const g = this.drag; if (!g) return;
      let dx = e.x - g.x0, dy = e.y - g.y0;
      if (e.shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      g.dx = Math.round(dx); g.dy = Math.round(dy);
      this.updatePreview();
      app().view.invalidate();
    },
    updatePreview() {
      const g = this.drag, c = g.preview.getContext('2d');
      c.clearRect(0, 0, g.preview.width, g.preview.height);
      c.drawImage(g.hole, 0, 0); c.drawImage(g.floating, g.dx, g.dy);
    },
    up() { if (this.drag) this.commit(); },
    commit() {
      const a = app(), d = a.doc, g = this.drag; this.drag = null; this.hideAnts = false;
      if (!g.dx && !g.dy) { a.view.invalidate(); return; }
      this.updatePreviewFor(g);
      const ctx = g.cel.getContext('2d');
      ctx.clearRect(0, 0, d.width, d.height); ctx.drawImage(g.preview, 0, 0);
      const sel = d.selection;
      if (sel.active) sel.translate(g.dx, g.dy);
      const selAfter = sel.snapshot();
      const after = U.cloneCanvas(g.cel);
      const put = (img, s) => { const c = g.cel.getContext('2d'); c.clearRect(0, 0, d.width, d.height); c.drawImage(img, 0, 0); sel.restore(s); E.emit('render'); E.emit('layers'); E.emit('selection'); };
      d.history.push({ label: 'Move', undo: () => put(g.before, g.selBefore), redo: () => put(after, selAfter) });
      a.view.invalidate(); E.emit('layers');
    },
    updatePreviewFor(g) { const c = g.preview.getContext('2d'); c.clearRect(0, 0, g.preview.width, g.preview.height); c.drawImage(g.hole, 0, 0); c.drawImage(g.floating, g.dx, g.dy); },
    nudge(dx, dy) {
      const g = this.begin(); if (!g) return;
      g.dx = dx; g.dy = dy; this.drag = g; this.commit();
    },
    cancel() { this.drag = null; this.hideAnts = false; app().view.invalidate(); },
    live() { return this.drag ? { layer: this.drag.layer, canvas: this.drag.preview } : null; },
    drawOverlay(ctx, view, m) { if (this.drag && this.drag.edges) view.drawAnts(ctx, m, this.drag.edges, this.drag.dx, this.drag.dy); },
  };

  // ---------- Eyedropper ----------
  const eyedropper = {
    id: 'eyedropper', name: 'Eyedropper Tool', cursor: 'crosshair',
    sampling: null,
    down(e) { this.sampling = { bg: e.alt && app().tool === this, old: e.alt && app().tool === this ? app().bg : app().fg }; this.pick(e); },
    move(e) { if (this.sampling) this.pick(e); },
    up() { this.sampling = null; app().view.needsOverlay = true; },
    pick(e) {
      const s = app().settings.eyedropper;
      const c = sampleColor(e.x, e.y, s.allLayers, s.size);
      if (!c) return;
      if (this.sampling.bg) app().setBg(c); else app().setFg(c);
      this.current = c;
      app().view.needsOverlay = true;
    },
    drawOverlay(ctx, view) { // Photoshop's sampling ring: new color on top, previous below
      if (!this.sampling || !view.mouse) return;
      const p = view.mouse;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.lineWidth = 14;
      ctx.beginPath(); ctx.arc(p.x, p.y, 40, Math.PI, 0); ctx.strokeStyle = this.current || this.sampling.old; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 40, 0, Math.PI); ctx.strokeStyle = this.sampling.old; ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(128,128,128,0.8)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 47, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 33, 0, Math.PI * 2); ctx.stroke();
    },
  };

  // ---------- Paint bucket ----------
  const bucket = {
    id: 'bucket', name: 'Paint Bucket Tool', cursor: 'crosshair', paint: true,
    down(e) {
      if (e.button !== 0) return;
      const a = app(), d = a.doc, s = a.settings.bucket, layer = d.activeLayer;
      if (!canPaint(layer)) return;
      if (!d.selection.contains(e.x, e.y)) return;
      const cel = d.ensureCel(layer, d.frame);
      const src = s.allLayers ? a.view.composite : cel.canvas;
      const img = src.getContext('2d').getImageData(0, 0, d.width, d.height);
      const mask = E.Selection.floodMask(img, e.x, e.y, s.tolerance, s.contiguous);
      const fill = E.Selection.maskToCanvas(mask, d.width, d.height, U.hexToRgb(a.fg));
      d.selection.clip(fill.getContext('2d'));
      const before = U.cloneCanvas(cel.canvas);
      const ctx = cel.canvas.getContext('2d');
      ctx.save(); ctx.globalAlpha = s.opacity; ctx.globalCompositeOperation = layer.lockAlpha ? 'source-atop' : 'source-over';
      ctx.drawImage(fill, 0, 0); ctx.restore();
      d.history.pixels('Paint Bucket', layer, cel.canvas, before, { x: 0, y: 0, w: d.width, h: d.height }, cel.created ? cel.key : null);
      a.view.invalidate(); E.emit('layers'); E.emit('frames');
    },
    move() { }, up() { },
  };

  // ---------- Navigation ----------
  const hand = {
    id: 'hand', name: 'Hand Tool', cursor: 'grab', nav: true,
    down(e) { this.d = { sx: e.sx, sy: e.sy, px: app().view.panX, py: app().view.panY }; app().view.overlay.style.cursor = 'grabbing'; },
    move(e) { if (!this.d) return; const v = app().view; v.panX = this.d.px + e.sx - this.d.sx; v.panY = this.d.py + e.sy - this.d.sy; v.changed(); },
    up() { this.d = null; app().updateCursor(); },
  };
  const zoom = {
    id: 'zoom', name: 'Zoom Tool', cursor: 'zoom-in', nav: true,
    down(e) { this.d = { sx: e.sx, sy: e.sy, z: app().view.zoom, moved: false, alt: e.alt }; },
    move(e) {
      if (!this.d) return;
      const dx = e.sx - this.d.sx;
      if (Math.abs(dx) > 3) this.d.moved = true;
      if (this.d.moved) app().view.setZoom(this.d.z * Math.pow(1.01, dx), this.d.sx, this.d.sy); // scrubby zoom
    },
    up(e) { if (this.d && !this.d.moved) app().view.zoomStep(this.d.alt ? -1 : 1, e.sx, e.sy); this.d = null; },
  };
  const rotate = {
    id: 'rotate', name: 'Rotate View Tool', cursor: 'crosshair', nav: true,
    down(e) { const v = app().view; this.d = { a0: Math.atan2(e.sy - v.ch / 2, e.sx - v.cw / 2), r0: v.rot, px: v.panX, py: v.panY }; },
    move(e) {
      if (!this.d) return;
      const v = app().view;
      const ang = Math.atan2(e.sy - v.ch / 2, e.sx - v.cw / 2);
      let r = this.d.r0 + (ang - this.d.a0) * 180 / Math.PI;
      if (e.shift) r = Math.round(r / 15) * 15;
      // rotate around the view center
      v.rot = this.d.r0; v.panX = this.d.px; v.panY = this.d.py;
      v.rotateBy(r - this.d.r0);
    },
    up() { this.d = null; },
    keydown(ev) { if (ev.key === 'Escape') { const v = app().view; v.rotateBy(-v.rot); return true; } return false; },
    drawOverlay(ctx, view) { // compass needle pointing to the canvas' "up"
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      const cx = view.cw / 2, cy = view.ch / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(view.rot * Math.PI / 180);
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, 0); ctx.strokeStyle = '#e04050'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    },
  };

  const TOOLS = {
    move, brush, pixel, eraser, eyedropper, bucket, hand, zoom, rotate,
    marquee: selectionTool('marquee', 'Rectangular Marquee Tool', 'rect'),
    ellipse: selectionTool('ellipse', 'Elliptical Marquee Tool', 'ellipse'),
    row: selectionTool('row', 'Single Row Marquee Tool', 'row'),
    col: selectionTool('col', 'Single Column Marquee Tool', 'col'),
    lasso: selectionTool('lasso', 'Lasso Tool', 'lasso'),
    polylasso: selectionTool('polylasso', 'Polygonal Lasso Tool', 'poly'),
    wand: selectionTool('wand', 'Magic Wand Tool', 'wand'),
  };
  // Toolbar groups in Photoshop order, with default keys (Shift+key cycles within a group)
  const GROUPS = [
    { id: 'g-move', key: 'V', tools: ['move'] },
    { id: 'g-marquee', key: 'M', tools: ['marquee', 'ellipse', 'row', 'col'] },
    { id: 'g-lasso', key: 'L', tools: ['lasso', 'polylasso'] },
    { id: 'g-wand', key: 'W', tools: ['wand'] },
    { id: 'g-eyedropper', key: 'I', tools: ['eyedropper'] },
    { id: 'g-brush', key: 'B', tools: ['brush', 'pixel'] },
    { id: 'g-eraser', key: 'E', tools: ['eraser'] },
    { id: 'g-bucket', key: 'G', tools: ['bucket'] },
    { id: 'g-hand', key: 'H', tools: ['hand'] },
    { id: 'g-rotate', key: 'R', tools: ['rotate'] },
    { id: 'g-zoom', key: 'Z', tools: ['zoom'] },
  ];

  E.Tools = { TOOLS, GROUPS, PAINT_TOOLS, sampleColor, sizeStep };
})(window.E);
