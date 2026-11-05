// Selection mask (white = selected) with marching-ants outline, plus flood fill used by Magic Wand and Paint Bucket.
(function (E) {
  const U = E.U;

  class Selection {
    constructor(w, h) {
      this.w = w; this.h = h;
      this.mask = U.readCanvas(w, h);
      this.active = false;
      this._edges = null; this._bounds = undefined; this._data = null;
      this.lastSnapshot = null; // for Reselect
    }
    get ctx() { return this.mask.getContext('2d', { willReadFrequently: true }); }
    invalidate() { this._edges = null; this._bounds = undefined; this._data = null; }
    snapshot() { return { active: this.active, mask: this.active ? U.cloneCanvas(this.mask) : null }; }
    restore(s) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      if (s && s.active && s.mask) ctx.drawImage(s.mask, 0, 0);
      this.active = !!(s && s.active);
      this.invalidate();
    }
    clear() {
      if (this.active) this.lastSnapshot = this.snapshot();
      this.ctx.clearRect(0, 0, this.w, this.h); this.active = false; this.invalidate();
    }
    // drawFn(ctx) paints the new shape in white. mode: new | add | sub | int
    apply(drawFn, mode = 'new') {
      const tmp = U.canvas(this.w, this.h), tctx = tmp.getContext('2d');
      tctx.fillStyle = '#fff'; tctx.strokeStyle = '#fff';
      drawFn(tctx);
      const ctx = this.ctx;
      ctx.save();
      if (mode === 'new' || (!this.active && mode !== 'sub' && mode !== 'int')) { ctx.clearRect(0, 0, this.w, this.h); ctx.drawImage(tmp, 0, 0); }
      else if (mode === 'add') ctx.drawImage(tmp, 0, 0);
      else if (mode === 'sub') { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(tmp, 0, 0); }
      else if (mode === 'int') { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(tmp, 0, 0); }
      ctx.restore();
      this.invalidate();
      this.active = !!this.bounds();
    }
    selectAll() { this.apply(c => c.fillRect(0, 0, this.w, this.h), 'new'); }
    invert() {
      const tmp = U.canvas(this.w, this.h), t = tmp.getContext('2d');
      t.fillStyle = '#fff'; t.fillRect(0, 0, this.w, this.h);
      if (this.active) { t.globalCompositeOperation = 'destination-out'; t.drawImage(this.mask, 0, 0); }
      const ctx = this.ctx; ctx.clearRect(0, 0, this.w, this.h); ctx.drawImage(tmp, 0, 0);
      this.invalidate(); this.active = !!this.bounds();
    }
    translate(dx, dy) {
      const tmp = U.cloneCanvas(this.mask), ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h); ctx.drawImage(tmp, dx, dy);
      this.invalidate(); this.active = !!this.bounds();
    }
    data() {
      if (!this._data) this._data = this.ctx.getImageData(0, 0, this.w, this.h).data;
      return this._data;
    }
    bounds() {
      if (this._bounds === undefined) this._bounds = U.alphaBounds(this.mask);
      return this._bounds;
    }
    contains(x, y) {
      if (!this.active) return true;
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
      return this.data()[(y * this.w + x) * 4 + 3] >= 128;
    }
    // Outline segments [x1,y1,x2,y2,...] along pixel boundaries of the mask.
    edges() {
      if (this._edges) return this._edges;
      const w = this.w, h = this.h, d = this.data();
      const sel = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] >= 128;
      const seg = [];
      const b = this.bounds();
      if (b) {
        const x0 = Math.max(0, b.x - 1), x1 = Math.min(w, b.x + b.w + 1);
        const y0 = Math.max(0, b.y - 1), y1 = Math.min(h, b.y + b.h + 1);
        for (let y = y0; y <= y1; y++) { // horizontal edges
          let start = -1;
          for (let x = x0; x <= x1; x++) {
            const e = x < x1 && sel(x, y - 1) !== sel(x, y);
            if (e && start < 0) start = x;
            else if (!e && start >= 0) { seg.push(start, y, x, y); start = -1; }
          }
        }
        for (let x = x0; x <= x1; x++) { // vertical edges
          let start = -1;
          for (let y = y0; y <= y1; y++) {
            const e = y < y1 && sel(x - 1, y) !== sel(x, y);
            if (e && start < 0) start = y;
            else if (!e && start >= 0) { seg.push(x, start, x, y); start = -1; }
          }
        }
      }
      this._edges = seg;
      return seg;
    }
    // Clip canvas content to the selection (destination-in).
    clip(ctx) {
      if (!this.active) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(this.mask, 0, 0); ctx.restore();
    }
  }

  // Scanline flood fill. Returns Uint8Array (1 = in region).
  Selection.floodMask = function (img, sx, sy, tolerance, contiguous) {
    const { width: w, height: h, data: d } = img;
    const out = new Uint8Array(w * h);
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
    const i0 = (sy * w + sx) * 4;
    const r = d[i0], g = d[i0 + 1], b = d[i0 + 2], a = d[i0 + 3];
    const tol = tolerance;
    const match = (p) => {
      const i = p * 4;
      if (a === 0 && d[i + 3] === 0) return true; // all transparent pixels are the same "color"
      return Math.abs(d[i] - r) <= tol && Math.abs(d[i + 1] - g) <= tol && Math.abs(d[i + 2] - b) <= tol && Math.abs(d[i + 3] - a) <= tol;
    };
    if (!contiguous) {
      for (let p = 0; p < w * h; p++) if (match(p)) out[p] = 1;
      return out;
    }
    const stack = [sx, sy];
    while (stack.length) {
      const y = stack.pop(), x0 = stack.pop();
      let x = x0;
      const row = y * w;
      if (out[row + x] || !match(row + x)) continue;
      while (x > 0 && !out[row + x - 1] && match(row + x - 1)) x--;
      let spanUp = false, spanDown = false;
      for (; x < w && !out[row + x] && match(row + x); x++) {
        out[row + x] = 1;
        if (y > 0) {
          const up = row - w + x, m = !out[up] && match(up);
          if (m && !spanUp) { stack.push(x, y - 1); spanUp = true; } else if (!m) spanUp = false;
        }
        if (y < h - 1) {
          const dn = row + w + x, m = !out[dn] && match(dn);
          if (m && !spanDown) { stack.push(x, y + 1); spanDown = true; } else if (!m) spanDown = false;
        }
      }
    }
    return out;
  };
  Selection.maskToCanvas = function (mask, w, h, rgb = { r: 255, g: 255, b: 255 }) {
    const c = U.canvas(w, h), ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data;
    for (let p = 0; p < mask.length; p++) if (mask[p]) {
      const i = p * 4; d[i] = rgb.r; d[i + 1] = rgb.g; d[i + 2] = rgb.b; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };

  E.Selection = Selection;
})(window.E);
