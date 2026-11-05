// Stroke engine: Photoshop-style "pulled string" smoothing, dab stamping into a stroke buffer,
// and an aliased pixel brush (with optional pixel-perfect lines).
// Flow builds up inside the stroke; Opacity caps the whole stroke when it's committed — like Photoshop.
(function (E) {
  const U = E.U;

  // ---------- Smoother (lazy mouse / pulled string) ----------
  class Smoother {
    constructor(amount, zoom, catchUp) {
      // amount 0..100 -> string length in screen pixels, converted to document pixels
      const t = amount / 100;
      this.len = (t * t * 140 + t * 10) / zoom;
      this.catchUp = catchUp;
      this.pos = null; this.p = 1;
    }
    start(x, y, p) { this.pos = { x, y }; this.p = p; return { x, y, p }; }
    // Feed a raw cursor sample; returns the new brush position or null if the brush didn't move.
    update(x, y, p) {
      const s = this.pos, dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
      this.p += (p - this.p) * (this.len > 0 ? 0.35 : 1);
      if (d <= this.len) return null;
      const k = (d - this.len) / d;
      s.x += dx * k; s.y += dy * k;
      return { x: s.x, y: s.y, p: this.p };
    }
    finish(x, y, p) { // catch up to the cursor at stroke end
      if (!this.catchUp || this.len <= 0) return [];
      const s = this.pos, d = Math.hypot(x - s.x, y - s.y);
      if (d < 0.5) return [];
      const out = [], n = Math.ceil(d / 4);
      for (let i = 1; i <= n; i++) { const t = i / n; out.push({ x: U.lerp(s.x, x, t), y: U.lerp(s.y, y, t), p: U.lerp(this.p, p, t) }); }
      this.pos = { x, y };
      return out;
    }
  }

  // ---------- Painted stroke (brush & eraser) ----------
  class Stroke {
    // opts: {doc, layer, brush (preset-like params), color, opacity, flow, eraser, smoothing, zoom, catchUp}
    constructor(opts) {
      Object.assign(this, opts);
      const doc = this.doc;
      this.cel = doc.ensureCel(this.layer, doc.frame);
      this.before = U.cloneCanvas(this.cel.canvas);
      this.buffer = U.canvas(doc.width, doc.height);
      this.bctx = this.buffer.getContext('2d');
      this.preview = U.canvas(doc.width, doc.height);
      this.clipBuf = doc.selection.active ? U.canvas(doc.width, doc.height) : null;
      this.bbox = null;
      this.smoother = new Smoother(this.smoothing || 0, this.zoom || 1, this.catchUp !== false);
      this.rand = U.rng((Math.random() * 1e9) | 0);
      this.pts = [];     // emitted (smoothed) points
      this.carry = 0;    // distance left until next dab
      this.last = null;  // last dab position
      this.dir = 0;
      this.color = this.eraser ? '#000000' : this.color;
      this.dirty = true;
    }
    begin(x, y, p) {
      const s = this.smoother.start(x, y, p);
      this.pts.push(s);
      this.dab(s.x, s.y, s.p, this.dir);
      this.last = s;
    }
    move(x, y, p) {
      const s = this.smoother.update(x, y, p);
      if (s) this.addPoint({ x: s.x, y: s.y, p: s.p });
    }
    end(x, y, p) {
      if (x != null) for (const s of this.smoother.finish(x, y, p)) this.addPoint(s);
      const n = this.pts.length;
      if (n >= 2) { // finish the curve to the last point
        const a = this.pts[n - 2], b = this.pts[n - 1];
        this.segment(mid(a, b), b);
      }
    }
    // Quadratic smoothing through midpoints keeps joints round even with sparse input.
    addPoint(c) {
      this.pts.push(c);
      const n = this.pts.length;
      if (n === 2) { this.segment(this.pts[0], mid(this.pts[0], c)); return; }
      const a = this.pts[n - 3], b = this.pts[n - 2];
      const m1 = mid(a, b), m2 = mid(b, c);
      const len = Math.hypot(b.x - m1.x, b.y - m1.y) + Math.hypot(m2.x - b.x, m2.y - b.y);
      const steps = Math.max(1, Math.ceil(len / 2));
      let prev = m1;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, it = 1 - t;
        const q = {
          x: it * it * m1.x + 2 * it * t * b.x + t * t * m2.x,
          y: it * it * m1.y + 2 * it * t * b.y + t * t * m2.y,
          p: it * it * m1.p + 2 * it * t * b.p + t * t * m2.p,
        };
        this.segment(prev, q);
        prev = q;
      }
    }
    sizeAt(p) { const b = this.brush; return b.size * (b.pressureSize ? U.lerp(b.minSize, 1, p) : 1); }
    segment(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      this.dir = Math.atan2(dy, dx) * 180 / Math.PI;
      let t = 0;
      while (true) {
        const p = U.lerp(a.p, b.p, t / len);
        const step = Math.max(0.35, this.sizeAt(p) * Math.max(0.01, this.brush.spacing));
        const need = step - this.carry;
        if (t + need > len) { this.carry += len - t; break; }
        t += need; this.carry = 0;
        const k = t / len;
        this.dab(a.x + dx * k, a.y + dy * k, U.lerp(a.p, b.p, k), this.dir);
      }
    }
    dab(x, y, p, dir) {
      const b = this.brush, r = this.rand;
      const count = Math.max(1, Math.round(b.count || 1));
      for (let n = 0; n < count; n++) {
        let size = this.sizeAt(p);
        if (b.sizeJitter) size *= 1 - b.sizeJitter * r();
        let alphaMul = 1;
        if (size < 1) { alphaMul = Math.max(size, 0.05); size = 1; }
        // Pressure → opacity: choose per-dab alpha so overlapping dabs accumulate to roughly the target.
        let target = b.pressureOpacity ? U.clamp(p, 0.02, 1) : 1;
        let a = target >= 1 ? 1 : 1 - Math.pow(1 - target, Math.min(1, Math.max(0.02, b.spacing)));
        a *= this.flow * b.flow * alphaMul;
        if (a <= 0.002) continue;
        let angle = b.angle + (b.followDirection ? dir : 0);
        if (b.angleJitter) angle += (r() - 0.5) * 2 * b.angleJitter;
        let px = x, py = y;
        if (b.scatter) { px += (r() - 0.5) * 2 * b.scatter * size; py += (r() - 0.5) * 2 * b.scatter * size; }
        const img = E.Brushes.dabImage(b, this.color, size);
        if (!img) return;
        const ctx = this.bctx;
        ctx.setTransform(1, 0, 0, 1, px, py);
        if (angle) ctx.rotate(angle * Math.PI / 180);
        if (b.roundness !== 1) ctx.scale(1, b.roundness);
        ctx.globalAlpha = Math.min(1, a);
        const h = size * img.aspect;
        ctx.drawImage(img.canvas, -size / 2, -h / 2, size, h);
        const ext = Math.max(size, h) * 0.75 + 2;
        this.bbox = U.rectUnion(this.bbox, { x: px - ext, y: py - ext, w: ext * 2, h: ext * 2 });
      }
      this.bctx.setTransform(1, 0, 0, 1, 0, 0);
      this.dirty = true;
    }
    stringPos() { return this.smoother.pos; }
    // Buffer with the selection applied
    clipped() {
      if (!this.clipBuf) return this.buffer;
      const c = this.clipBuf.getContext('2d');
      c.globalCompositeOperation = 'copy'; c.drawImage(this.buffer, 0, 0);
      this.doc.selection.clip(c);
      return this.clipBuf;
    }
    compositeOp() { return this.eraser ? 'destination-out' : (this.layer.lockAlpha ? 'source-atop' : 'source-over'); }
    // Live canvas for the active layer while painting
    previewCanvas() {
      if (!this.dirty) return this.preview;
      const ctx = this.preview.getContext('2d');
      ctx.globalCompositeOperation = 'copy'; ctx.globalAlpha = 1;
      ctx.drawImage(this.cel.canvas, 0, 0);
      ctx.globalCompositeOperation = this.compositeOp();
      ctx.globalAlpha = this.opacity;
      ctx.drawImage(this.clipped(), 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      this.dirty = false;
      return this.preview;
    }
    commit(label) {
      const ctx = this.cel.canvas.getContext('2d');
      ctx.save();
      ctx.globalCompositeOperation = this.compositeOp();
      ctx.globalAlpha = this.opacity;
      ctx.drawImage(this.clipped(), 0, 0);
      ctx.restore();
      this.doc.history.pixels(label, this.layer, this.cel.canvas, this.before, this.bbox, this.cel.created ? this.cel.key : null);
    }
  }
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 });

  // ---------- Pixel stroke (aliased, grid-aligned) ----------
  class PixelStroke extends Stroke {
    constructor(opts) {
      super(Object.assign({ smoothing: opts.smoothing || 0 }, opts));
      this.size = Math.max(1, Math.round(opts.size));
      this.shape = opts.shape || 'square';
      this.pixelPerfect = !!opts.pixelPerfect && this.size === 1;
      this.placed = []; // for pixel-perfect
      this.lastCell = null;
      this.offsets = pixelShape(this.size, this.shape);
    }
    begin(x, y, p) { this.smoother.start(x, y, p); this.plotTo(x, y); }
    move(x, y, p) { const s = this.smoother.update(x, y, p); if (s) this.plotTo(s.x, s.y); }
    end(x, y, p) { if (x != null) for (const s of this.smoother.finish(x, y, p)) this.plotTo(s.x, s.y); }
    plotTo(x, y) {
      const cx = Math.floor(x), cy = Math.floor(y);
      if (!this.lastCell) { this.plot(cx, cy); this.lastCell = { x: cx, y: cy }; return; }
      let x0 = this.lastCell.x, y0 = this.lastCell.y;
      if (x0 === cx && y0 === cy) return;
      const dx = Math.abs(cx - x0), dy = -Math.abs(cy - y0), sx = x0 < cx ? 1 : -1, sy = y0 < cy ? 1 : -1;
      let err = dx + dy;
      while (!(x0 === cx && y0 === cy)) {
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
        this.plot(x0, y0);
      }
      this.lastCell = { x: cx, y: cy };
    }
    plot(x, y) {
      const ctx = this.bctx;
      if (this.pixelPerfect) {
        const P = this.placed;
        P.push({ x, y });
        const n = P.length;
        if (n >= 3) {
          const a = P[n - 3], b = P[n - 2], c = P[n - 1];
          if (Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1 && ((b.x === a.x && b.y === c.y) || (b.y === a.y && b.x === c.x))) {
            ctx.clearRect(b.x, b.y, 1, 1);
            P.splice(n - 2, 1);
          }
        }
      }
      ctx.fillStyle = this.color;
      const half = Math.floor((this.size - 1) / 2);
      for (const [ox, oy, len] of this.offsets) ctx.fillRect(x + ox - half, y + oy - half, len, 1);
      this.bbox = U.rectUnion(this.bbox, { x: x - this.size - 1, y: y - this.size - 1, w: this.size * 2 + 2, h: this.size * 2 + 2 });
      this.dirty = true;
    }
  }
  // Row runs [x, y, length] covered by a pixel brush of the given size.
  const shapeCache = new Map();
  function pixelShape(size, shape) {
    const key = size + shape;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const out = [];
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++) {
      let start = -1;
      for (let x = 0; x <= size; x++) {
        const inside = x < size && !(shape === 'circle' && size > 2 && Math.hypot(x - c, y - c) > size / 2 - 0.25);
        if (inside && start < 0) start = x;
        else if (!inside && start >= 0) { out.push([start, y, x - start]); start = -1; }
      }
    }
    shapeCache.set(key, out);
    return out;
  }

  E.Smoother = Smoother;
  E.Stroke = Stroke;
  E.PixelStroke = PixelStroke;
  E.pixelShape = pixelShape;
})(window.E);
