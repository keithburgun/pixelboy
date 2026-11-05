// Document model: layers × frames. Each layer holds keyframes (Flash-style); a frame without its own
// keyframe shows ("holds") the previous keyframe on that layer.
(function (E) {
  const U = E.U;
  let nextLayerId = 1;

  class Layer {
    constructor(name) {
      this.id = nextLayerId++;
      this.name = name;
      this.visible = true;
      this.opacity = 1;
      this.blend = 'source-over';
      this.lockAlpha = false;
      this.keys = []; // [{frame, canvas}] sorted by frame
    }
    keyAt(f) { // key that is displayed at frame f
      let k = null;
      for (const key of this.keys) { if (key.frame <= f) k = key; else break; }
      return k;
    }
    exactKey(f) { return this.keys.find(k => k.frame === f) || null; }
    sortKeys() { this.keys.sort((a, b) => a.frame - b.frame); }
  }

  class Doc {
    constructor(w, h, opts = {}) {
      this.width = w; this.height = h;
      this.layers = [];
      this.activeIndex = 0;
      this.frame = 0;
      this.frameCount = 1;
      this.fps = 12;
      this.name = opts.name || 'Untitled-1';
      this.path = null;       // desktop file path, if saved
      this.format = null;     // 'pixelboy' | 'psd' when saved
      this.dirty = false;
      this.selection = new E.Selection(w, h);
      this.history = new E.History(this);
      if (opts.empty) return;
      const bg = this.addLayer('Background', false);
      if (opts.background !== 'transparent') {
        const c = this.ensureCel(bg, 0).canvas.getContext('2d');
        c.fillStyle = opts.background || '#ffffff';
        c.fillRect(0, 0, w, h);
      }
      this.addLayer('Layer 1', false);
    }

    get activeLayer() { return this.layers[this.activeIndex]; }
    newCanvas() { return U.canvas(this.width, this.height); }

    nextLayerName() {
      let n = 1;
      const names = new Set(this.layers.map(l => l.name));
      while (names.has('Layer ' + n)) n++;
      return 'Layer ' + n;
    }
    addLayer(name, record = true, index = null) {
      const before = record && this.snapshot();
      const l = new Layer(name || this.nextLayerName());
      const i = index == null ? this.activeIndex + (this.layers.length ? 1 : 0) : index;
      this.layers.splice(i, 0, l);
      this.activeIndex = i;
      if (record) this.history.structural('New Layer', before, this.snapshot());
      E.emit('layers');
      return l;
    }

    // Returns the canvas to paint into at frame f; creates a keyframe if this layer has none yet.
    ensureCel(layer, f = this.frame) {
      const k = layer.keyAt(f);
      if (k) return { canvas: k.canvas, key: k, created: false };
      const key = { frame: f, canvas: this.newCanvas() };
      layer.keys.push(key); layer.sortKeys();
      return { canvas: key.canvas, key, created: true };
    }
    celCanvas(layer, f = this.frame) { const k = layer.keyAt(f); return k ? k.canvas : null; }

    // Draw the frame's composite into ctx (sized width×height). override = {layer, canvas} swaps in a live canvas.
    renderFrame(ctx, f = this.frame, override = null, opts = {}) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      for (const layer of this.layers) {
        if (!layer.visible && !opts.includeHidden) continue;
        let c = override && override.layer === layer ? override.canvas : this.celCanvas(layer, f);
        if (!c) continue;
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blend;
        ctx.drawImage(c, 0, 0);
      }
      ctx.restore();
    }
    flatten(f = this.frame, bg = null) {
      const c = this.newCanvas();
      const ctx = c.getContext('2d');
      this.renderFrame(ctx, f);
      if (bg) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = bg; ctx.fillRect(0, 0, this.width, this.height);
      }
      return c;
    }

    // ---------- structure snapshots for undo ----------
    snapshot() {
      return {
        layers: this.layers.map(l => ({
          layer: l, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, lockAlpha: l.lockAlpha,
          keys: l.keys.map(k => ({ frame: k.frame, canvas: k.canvas })),
        })),
        activeIndex: this.activeIndex, frameCount: this.frameCount, frame: this.frame,
        width: this.width, height: this.height,
      };
    }
    restore(s) {
      this.layers = s.layers.map(o => {
        const l = o.layer;
        l.name = o.name; l.visible = o.visible; l.opacity = o.opacity; l.blend = o.blend; l.lockAlpha = o.lockAlpha;
        l.keys = o.keys.map(k => ({ frame: k.frame, canvas: k.canvas }));
        return l;
      });
      this.activeIndex = U.clamp(s.activeIndex, 0, this.layers.length - 1);
      this.frameCount = s.frameCount;
      this.frame = Math.min(s.frame, this.frameCount - 1);
      if (s.width !== this.width || s.height !== this.height) {
        this.width = s.width; this.height = s.height;
        this.selection = new E.Selection(s.width, s.height);
        E.emit('docsize');
      }
      E.emit('layers'); E.emit('frames'); E.emit('render');
    }
    change(label, fn) { // run a structural change with undo
      const before = this.snapshot();
      const r = fn();
      this.history.structural(label, before, this.snapshot());
      E.emit('layers'); E.emit('frames'); E.emit('render');
      return r;
    }

    // ---------- layer operations ----------
    deleteLayer() {
      if (this.layers.length <= 1) return;
      this.change('Delete Layer', () => {
        this.layers.splice(this.activeIndex, 1);
        this.activeIndex = Math.max(0, this.activeIndex - 1);
      });
    }
    duplicateLayer() {
      this.change('Duplicate Layer', () => {
        const src = this.activeLayer;
        const l = new Layer(src.name + ' copy');
        Object.assign(l, { visible: src.visible, opacity: src.opacity, blend: src.blend, lockAlpha: src.lockAlpha });
        l.keys = src.keys.map(k => ({ frame: k.frame, canvas: U.cloneCanvas(k.canvas) }));
        this.layers.splice(this.activeIndex + 1, 0, l);
        this.activeIndex++;
      });
    }
    moveLayer(from, to) {
      to = U.clamp(to, 0, this.layers.length - 1);
      if (from === to) return;
      this.change('Move Layer', () => {
        const [l] = this.layers.splice(from, 1);
        this.layers.splice(to, 0, l);
        this.activeIndex = to;
      });
    }
    mergeDown() {
      const i = this.activeIndex;
      if (i <= 0) return;
      this.change('Merge Down', () => {
        const top = this.layers[i], bot = this.layers[i - 1];
        const frames = new Set([...top.keys, ...bot.keys].map(k => k.frame));
        const newKeys = [];
        for (const f of [...frames].sort((a, b) => a - b)) {
          const c = this.newCanvas(), ctx = c.getContext('2d');
          const bc = this.celCanvas(bot, f), tc = this.celCanvas(top, f);
          if (bc) { ctx.globalAlpha = bot.visible ? bot.opacity : 0; ctx.drawImage(bc, 0, 0); }
          if (tc && top.visible) { ctx.globalAlpha = top.opacity; ctx.globalCompositeOperation = top.blend; ctx.drawImage(tc, 0, 0); }
          newKeys.push({ frame: f, canvas: c });
        }
        bot.keys = newKeys; bot.opacity = 1; bot.visible = true;
        this.layers.splice(i, 1);
        this.activeIndex = i - 1;
      });
    }
    flattenImage() {
      this.change('Flatten Image', () => {
        const frames = new Set(); this.layers.forEach(l => l.keys.forEach(k => frames.add(k.frame)));
        const l = new Layer('Background');
        l.keys = [...frames].sort((a, b) => a - b).map(f => ({ frame: f, canvas: this.flatten(f) }));
        this.layers = [l]; this.activeIndex = 0;
      });
    }
    setLayerProps(layer, props, label = 'Layer Properties') {
      this.change(label, () => Object.assign(layer, props));
    }

    // ---------- frame operations (Flash conventions) ----------
    insertFrame() { // F5: insert a frame after the current one on every layer
      this.change('Insert Frame', () => {
        for (const l of this.layers) for (const k of l.keys) if (k.frame > this.frame) k.frame++;
        this.frameCount++;
        this.frame++;
      });
    }
    insertKeyframe(blank) { // F6 / F7
      this.change(blank ? 'Insert Blank Keyframe' : 'Insert Keyframe', () => {
        const l = this.activeLayer;
        let f = this.frame;
        if (l.exactKey(f)) { // already a keyframe here: add the new one on the next frame
          f++;
          if (l.exactKey(f)) {
            for (const layer of this.layers) for (const k of layer.keys) if (k.frame >= f) k.frame++;
            this.frameCount++;
          }
        }
        if (f >= this.frameCount) this.frameCount = f + 1;
        const src = this.celCanvas(l, f);
        const canvas = !blank && src ? U.cloneCanvas(src) : this.newCanvas();
        const existing = l.exactKey(f);
        if (existing) existing.canvas = canvas;
        else { l.keys.push({ frame: f, canvas }); l.sortKeys(); }
        this.frame = f;
      });
    }
    removeFrame() { // Shift+F5
      if (this.frameCount <= 1) return;
      this.change('Remove Frame', () => {
        const f = this.frame;
        for (const l of this.layers) {
          const k = l.exactKey(f), next = l.exactKey(f + 1);
          // If this frame is a keyframe followed by held frames, the hold keeps this drawing
          if (k && !next && f + 1 < this.frameCount) k.frame = f + 1;
          else if (k) l.keys.splice(l.keys.indexOf(k), 1);
          for (const kk of l.keys) if (kk.frame > f) kk.frame--;
        }
        this.frameCount--;
        this.frame = Math.min(this.frame, this.frameCount - 1);
      });
    }
    clearKeyframe() { // Shift+F6
      const l = this.activeLayer, k = l.exactKey(this.frame);
      if (!k) return;
      this.change('Clear Keyframe', () => l.keys.splice(l.keys.indexOf(k), 1));
    }
    setFrame(f) {
      f = U.clamp(f, 0, this.frameCount - 1);
      if (f === this.frame) return;
      this.frame = f;
      E.emit('frames'); E.emit('render'); E.emit('layers');
    }

    // ---------- image operations ----------
    allCanvases() { const s = new Set(); this.layers.forEach(l => l.keys.forEach(k => s.add(k))); return [...s]; }
    resizeImage(w, h, smooth) {
      this.change('Image Size', () => {
        for (const k of this.allCanvases()) {
          const c = U.canvas(w, h), ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = smooth; ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(k.canvas, 0, 0, w, h);
          k.canvas = c;
        }
        this.width = w; this.height = h;
        this.selection = new E.Selection(w, h);
      });
      E.emit('docsize');
    }
    resizeCanvas(w, h, ax = 0.5, ay = 0.5) {
      const dx = Math.round((w - this.width) * ax), dy = Math.round((h - this.height) * ay);
      this.change('Canvas Size', () => {
        for (const k of this.allCanvases()) {
          const c = U.canvas(w, h);
          c.getContext('2d').drawImage(k.canvas, dx, dy);
          k.canvas = c;
        }
        this.width = w; this.height = h;
        this.selection = new E.Selection(w, h);
      });
      E.emit('docsize');
    }
    transformAll(label, fn) { // fn(ctx, srcCanvas) draws transformed src; same size
      this.change(label, () => {
        for (const k of this.allCanvases()) {
          const c = this.newCanvas(), ctx = c.getContext('2d');
          fn(ctx, k.canvas);
          k.canvas = c;
        }
      });
    }
    transformCel(label, fn) { // active layer, current cel
      const k = this.activeLayer.keyAt(this.frame);
      if (!k) return;
      this.change(label, () => {
        const c = this.newCanvas();
        fn(c.getContext('2d'), k.canvas);
        k.canvas = c;
      });
    }
  }

  E.Layer = Layer;
  E.Doc = Doc;
})(window.E);
