// Viewport: zoom / pan / rotate / flip, compositing to screen, onion skin, pixel grid, overlay (cursor, ants, tool previews).
(function (E) {
  const U = E.U;

  class View {
    constructor(host) {
      this.host = host;
      this.canvas = U.el('canvas', { class: 'view-main' });
      this.overlay = U.el('canvas', { class: 'view-overlay' });
      host.append(this.canvas, this.overlay);
      this.zoom = 1; this.panX = 0; this.panY = 0; this.rot = 0; this.flip = false;
      this.dpr = window.devicePixelRatio || 1;
      this.composite = null; this.compositeDirty = true;
      this.needsRender = true; this.needsOverlay = true;
      this.onion = { enabled: false, before: 2, after: 1, opacity: 0.35, tint: true };
      this.pixelGrid = true;
      this.mouse = null; // last screen position (CSS px, relative to host)
      this.antsOffset = 0;
      this.checker = null;
      new ResizeObserver(() => this.resize()).observe(host);
      this.resize();
      const loop = () => { this.frame(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      setInterval(() => { if (E.app && E.app.doc && E.app.doc.selection.active) { this.antsOffset = (this.antsOffset + 1) % 8; this.needsOverlay = true; } }, 90);
    }
    get doc() { return E.app.doc; }
    resize() {
      const r = this.host.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      this.cw = r.width; this.ch = r.height;
      for (const c of [this.canvas, this.overlay]) {
        c.width = Math.max(1, Math.round(r.width * this.dpr)); c.height = Math.max(1, Math.round(r.height * this.dpr));
        c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
      }
      this.needsRender = this.needsOverlay = true;
    }
    matrix() {
      const d = this.doc;
      return new DOMMatrix()
        .translate(this.cw / 2 + this.panX, this.ch / 2 + this.panY)
        .rotate(this.rot)
        .scale(this.zoom * (this.flip ? -1 : 1), this.zoom)
        .translate(-d.width / 2, -d.height / 2);
    }
    toDoc(sx, sy) { const p = this.matrix().inverse().transformPoint(new DOMPoint(sx, sy)); return { x: p.x, y: p.y }; }
    toScreen(x, y) { const p = this.matrix().transformPoint(new DOMPoint(x, y)); return { x: p.x, y: p.y }; }
    invalidate() { this.compositeDirty = true; this.needsRender = true; this.needsOverlay = true; }
    changed() { this.needsRender = true; this.needsOverlay = true; E.emit('view'); }

    fit() {
      const d = this.doc;
      this.zoom = Math.max(0.01, Math.min((this.cw - 60) / d.width, (this.ch - 60) / d.height));
      if (d.width <= 256 && d.height <= 256) this.zoom = Math.max(1, Math.floor(this.zoom)); // crisp integer zoom for pixel art
      this.panX = this.panY = 0; this.rot = 0;
      this.changed();
    }
    actualPixels() { this.setZoom(1); }
    setZoom(z, sx = this.cw / 2, sy = this.ch / 2) {
      z = U.clamp(z, 0.02, 64);
      const p = this.toDoc(sx, sy);
      this.zoom = z;
      const s = this.toScreen(p.x, p.y);
      this.panX += sx - s.x; this.panY += sy - s.y;
      this.changed();
    }
    zoomStep(dir, sx, sy) { // Photoshop-like preset zoom steps
      const steps = [0.02, 0.03, 0.05, 0.0667, 0.0833, 0.125, 0.1667, 0.25, 0.333, 0.5, 0.6667, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];
      let z = this.zoom;
      if (dir > 0) z = steps.find(s => s > this.zoom * 1.001) || 64;
      else z = [...steps].reverse().find(s => s < this.zoom * 0.999) || 0.02;
      this.setZoom(z, sx, sy);
    }
    rotateBy(deg, sx = this.cw / 2, sy = this.ch / 2) {
      const p = this.toDoc(sx, sy);
      this.rot = ((this.rot + deg) % 360 + 360) % 360;
      const s = this.toScreen(p.x, p.y);
      this.panX += sx - s.x; this.panY += sy - s.y;
      this.changed();
    }
    flipView() {
      const c = this.toDoc(this.cw / 2, this.ch / 2);
      this.flip = !this.flip;
      const s = this.toScreen(c.x, c.y);
      this.panX += this.cw / 2 - s.x; this.panY += this.ch / 2 - s.y;
      this.changed();
    }

    // ---------- drawing ----------
    frame() {
      const app = E.app;
      if (!app || !app.doc) return;
      const live = app.liveOverride && app.liveOverride();
      if (live || this.compositeDirty) { this.buildComposite(live); this.needsRender = true; }
      if (this.needsRender) { this.renderMain(); this.needsRender = false; this.needsOverlay = true; }
      if (this.needsOverlay) { this.renderOverlay(); this.needsOverlay = false; }
    }
    buildComposite(live) {
      const d = this.doc;
      if (!this.composite || this.composite.width !== d.width || this.composite.height !== d.height) {
        this.composite = U.canvas(d.width, d.height);
      }
      const ctx = this.composite.getContext('2d');
      d.renderFrame(ctx, d.frame, live);
      if (this.onion.enabled && E.app.timelineVisible && !E.app.playing && d.frameCount > 1) this.drawOnion(ctx);
      this.compositeDirty = false;
    }
    drawOnion(ctx) {
      const d = this.doc, o = this.onion;
      if (!this.onionTmp || this.onionTmp.width !== d.width || this.onionTmp.height !== d.height) this.onionTmp = U.canvas(d.width, d.height);
      const tmp = this.onionTmp, t = tmp.getContext('2d');
      const draw = (f, dist, total, tint) => {
        t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1;
        t.clearRect(0, 0, d.width, d.height);
        let any = false;
        for (const layer of d.layers) {
          if (!layer.visible) continue;
          const k = layer.keyAt(f), cur = layer.keyAt(d.frame);
          if (!k || k === cur) continue; // unchanged drawings (e.g. a static background) are skipped
          t.globalAlpha = layer.opacity; t.drawImage(k.canvas, 0, 0); any = true;
        }
        if (!any) return;
        if (o.tint) { t.globalAlpha = 0.85; t.globalCompositeOperation = 'source-atop'; t.fillStyle = tint; t.fillRect(0, 0, d.width, d.height); }
        ctx.save();
        ctx.globalAlpha = o.opacity * (1 - (dist - 1) / (total + 0.5));
        ctx.drawImage(tmp, 0, 0);
        ctx.restore();
      };
      for (let i = o.before; i >= 1; i--) if (d.frame - i >= 0) draw(d.frame - i, i, o.before, '#e0405a');
      for (let i = o.after; i >= 1; i--) if (d.frame + i < d.frameCount) draw(d.frame + i, i, o.after, '#30b860');
    }
    checkerPattern(ctx) {
      if (!this.checker) {
        const s = 8, c = U.canvas(s * 2, s * 2), g = c.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, s * 2, s * 2);
        g.fillStyle = '#cccccc'; g.fillRect(0, 0, s, s); g.fillRect(s, s, s, s);
        this.checker = c;
      }
      return ctx.createPattern(this.checker, 'repeat');
    }
    renderMain() {
      const ctx = this.canvas.getContext('2d'), d = this.doc, dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--pasteboard') || '#262626';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      const m = new DOMMatrix().scale(dpr, dpr).multiply(this.matrix());
      // drop shadow + checkerboard (constant on-screen size like Photoshop)
      ctx.save();
      ctx.setTransform(m);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 12 * dpr;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, d.width, d.height);
      ctx.restore();
      ctx.save();
      ctx.setTransform(m);
      ctx.beginPath(); ctx.rect(0, 0, d.width, d.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clip();
      ctx.fillStyle = this.checkerPattern(ctx);
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.restore();
      // image
      ctx.save();
      ctx.setTransform(m);
      ctx.imageSmoothingEnabled = this.zoom < 1;
      ctx.imageSmoothingQuality = 'high';
      if (this.composite) ctx.drawImage(this.composite, 0, 0);
      ctx.restore();
      // pixel grid
      if (this.pixelGrid && this.zoom >= 8) this.drawGrid(ctx, m);
    }
    drawGrid(ctx, m) {
      const d = this.doc;
      const corners = [[0, 0], [this.cw, 0], [0, this.ch], [this.cw, this.ch]].map(([x, y]) => this.toDoc(x, y));
      const x0 = U.clamp(Math.floor(Math.min(...corners.map(p => p.x))), 0, d.width), x1 = U.clamp(Math.ceil(Math.max(...corners.map(p => p.x))), 0, d.width);
      const y0 = U.clamp(Math.floor(Math.min(...corners.map(p => p.y))), 0, d.height), y1 = U.clamp(Math.ceil(Math.max(...corners.map(p => p.y))), 0, d.height);
      ctx.save();
      ctx.setTransform(m);
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.lineWidth = 1 / this.zoom;
      ctx.strokeStyle = 'rgba(128,128,128,0.35)';
      ctx.stroke();
      ctx.restore();
    }
    renderOverlay() {
      const ctx = this.overlay.getContext('2d'), dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
      const m = new DOMMatrix().scale(dpr, dpr).multiply(this.matrix());
      const sel = this.doc.selection;
      if (sel.active && !(E.app.tool && E.app.tool.hideAnts)) this.drawAnts(ctx, m, sel.edges(), 0, 0);
      const tool = E.app.tool;
      if (tool && tool.drawOverlay) {
        ctx.save();
        tool.drawOverlay(ctx, this, m);
        ctx.restore();
      }
    }
    // Marching ants for segment list in doc space, optionally offset
    drawAnts(ctx, m, seg, ox, oy) {
      if (!seg.length) return;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.beginPath();
      for (let i = 0; i < seg.length; i += 4) {
        const a = m.transformPoint(new DOMPoint(seg[i] + ox, seg[i + 1] + oy));
        const b = m.transformPoint(new DOMPoint(seg[i + 2] + ox, seg[i + 3] + oy));
        ctx.moveTo(Math.round(a.x / this.dpr) + 0.5, Math.round(a.y / this.dpr) + 0.5);
        ctx.lineTo(Math.round(b.x / this.dpr) + 0.5, Math.round(b.y / this.dpr) + 0.5);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff'; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -this.antsOffset; ctx.stroke();
      ctx.restore();
    }
    // Draw a path (doc space) as a dashed outline, used for selection previews
    strokePath(ctx, m, buildPath) {
      ctx.save();
      ctx.setTransform(m);
      buildPath(ctx);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff'; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = '#000'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -this.antsOffset; ctx.stroke();
      ctx.restore();
    }
  }
  E.View = View;
})(window.E);
