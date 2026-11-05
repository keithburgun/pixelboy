// Brush presets, tip generation (procedural + imported), Photoshop .abr import.
(function (E) {
  const U = E.U;

  // ---------- procedural tip masks (white with alpha) ----------
  function maskFromFn(size, fn) {
    const c = U.canvas(size, size), ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size), d = img.data;
    const R = size / 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R;
      const a = U.clamp(fn(nx, ny, x, y), 0, 1);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  function valueNoise(seed, cells) { // smooth 2D value noise on [0,1]²
    const r = U.rng(seed), g = [];
    for (let i = 0; i < (cells + 1) * (cells + 1); i++) g.push(r());
    const at = (x, y) => g[y * (cells + 1) + x];
    const s = t => t * t * (3 - 2 * t);
    return (u, v) => {
      const x = U.clamp(u, 0, 0.9999) * cells, y = U.clamp(v, 0, 0.9999) * cells;
      const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
      return U.lerp(U.lerp(at(xi, yi), at(xi + 1, yi), xf), U.lerp(at(xi, yi + 1), at(xi + 1, yi + 1), xf), yf);
    };
  }
  function fbm(seed, octaves) {
    const ns = []; for (let o = 0; o < octaves; o++) ns.push(valueNoise(seed + o * 101, 4 << o));
    return (u, v) => { let t = 0, amp = 0.5, sum = 0; for (const n of ns) { t += n(u, v) * amp; sum += amp; amp *= 0.5; } return t / sum; };
  }
  const radial = (nx, ny) => Math.hypot(nx, ny);

  const TIP_GENERATORS = {
    pencil: () => { const r = U.rng(11); return maskFromFn(32, (nx, ny) => { const d = radial(nx, ny); return d > 1 ? 0 : (0.35 + r() * 0.65) * (r() < 0.8 ? 1 : 0.2) * U.clamp((1 - d) * 4, 0, 1); }); },
    charcoal: () => {
      const n = fbm(5, 5), r = U.rng(7);
      return maskFromFn(128, (nx, ny) => {
        const d = Math.hypot(nx * 0.8, ny * 1.25); if (d > 1) return 0;
        const v = n((nx + 1) / 2, (ny + 1) / 2) + (r() - 0.5) * 0.35;
        return U.clamp((v - 0.42) * 3, 0, 1) * U.clamp((1 - d) * 3, 0, 1);
      });
    },
    chalk: () => {
      const n = fbm(21, 4), r = U.rng(3);
      return maskFromFn(128, (nx, ny) => {
        const d = radial(nx, ny); if (d > 1) return 0;
        const edge = U.clamp((1 - d) * 5 + (n((nx + 1) / 2, (ny + 1) / 2) - 0.5) * 3, 0, 1);
        return (r() < 0.62 ? 1 : 0.15) * edge;
      });
    },
    bristle: () => { // flat brush made of uneven bristles (vertical stripes)
      const r = U.rng(42), bristles = [];
      for (let i = 0; i < 26; i++) bristles.push({ x: -0.95 + r() * 1.9, w: 0.02 + r() * 0.05, a: 0.35 + r() * 0.65, len: 0.6 + r() * 0.4 });
      return maskFromFn(128, (nx, ny) => {
        let a = 0;
        for (const b of bristles) {
          const dx = Math.abs(nx - b.x);
          if (dx < b.w && Math.abs(ny) < b.len * 0.35) a = Math.max(a, b.a * (1 - dx / b.w) * U.clamp((b.len * 0.35 - Math.abs(ny)) * 12, 0, 1));
        }
        return a;
      });
    },
    spatter: () => {
      const r = U.rng(99), dots = [];
      for (let i = 0; i < 40; i++) { const ang = r() * Math.PI * 2, rad = Math.pow(r(), 0.7) * 0.85; dots.push({ x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, s: 0.02 + Math.pow(r(), 3) * 0.13 }); }
      return maskFromFn(128, (nx, ny) => {
        let a = 0;
        for (const d of dots) { const t = Math.hypot(nx - d.x, ny - d.y) / d.s; if (t < 1) a = Math.max(a, U.clamp((1 - t) * 4, 0, 1)); }
        return a;
      });
    },
    sponge: () => {
      const n = fbm(77, 4);
      return maskFromFn(128, (nx, ny) => {
        const d = radial(nx, ny); if (d > 1) return 0;
        const v = n((nx + 1) / 2, (ny + 1) / 2);
        return U.clamp((v - 0.48) * 6, 0, 1) * U.clamp((1 - d) * 2.5, 0, 1);
      });
    },
    cloud: () => {
      const n = fbm(8, 5);
      return maskFromFn(128, (nx, ny) => {
        const d = radial(nx, ny); if (d > 1) return 0;
        const fall = 1 - d * d;
        return U.clamp(fall * (0.3 + n((nx + 1) / 2, (ny + 1) / 2) * 1.1) - 0.15, 0, 1);
      });
    },
    leaf: () => maskFromFn(96, (nx, ny) => { // pointed oval: good for foliage stamping
      const d = Math.hypot(nx * 2.2, ny * 1.05 / (1 - Math.abs(nx) * 0.15));
      return U.clamp((1 - d) * 6, 0, 1);
    }),
  };

  // ---------- presets ----------
  const BASE = {
    kind: 'round', hardness: 1, size: 20, spacing: 0.1, angle: 0, roundness: 1, followDirection: false,
    sizeJitter: 0, angleJitter: 0, scatter: 0, count: 1, pressureSize: false, pressureOpacity: false, minSize: 0.1, flow: 1,
  };
  const BUILT_IN = [
    { id: 'hard-round', name: 'Hard Round', hardness: 1, size: 12, pressureSize: true, minSize: 0.15 },
    { id: 'soft-round', name: 'Soft Round', hardness: 0, size: 80, spacing: 0.1, pressureOpacity: true },
    { id: 'airbrush', name: 'Airbrush', hardness: 0, size: 120, spacing: 0.05, flow: 0.08, pressureOpacity: true },
    { id: 'ink', name: 'Inking Pen', hardness: 0.92, size: 8, spacing: 0.05, pressureSize: true, minSize: 0.05, smoothing: 35 },
    { id: 'pencil', name: 'Graphite Pencil', kind: 'tip', tip: 'pencil', size: 5, spacing: 0.15, angleJitter: 180, pressureOpacity: true },
    { id: 'charcoal', name: 'Charcoal', kind: 'tip', tip: 'charcoal', size: 36, spacing: 0.15, angleJitter: 180, sizeJitter: 0.2, pressureOpacity: true, pressureSize: true, minSize: 0.5 },
    { id: 'chalk', name: 'Chalk', kind: 'tip', tip: 'chalk', size: 44, spacing: 0.2, angleJitter: 180, pressureSize: true, minSize: 0.4 },
    { id: 'bristle', name: 'Dry Bristle', kind: 'tip', tip: 'bristle', size: 48, spacing: 0.04, followDirection: true, angle: 90, flow: 0.35, pressureSize: true, minSize: 0.6 },
    { id: 'marker', name: 'Flat Marker', hardness: 0.8, size: 26, roundness: 0.3, angle: 45, spacing: 0.04, flow: 0.35 },
    { id: 'spatter', name: 'Spatter', kind: 'tip', tip: 'spatter', size: 70, spacing: 0.6, angleJitter: 180, sizeJitter: 0.5, scatter: 0.8 },
    { id: 'sponge', name: 'Sponge', kind: 'tip', tip: 'sponge', size: 60, spacing: 0.3, angleJitter: 180, pressureOpacity: true },
    { id: 'cloud', name: 'Soft Cloud', kind: 'tip', tip: 'cloud', size: 120, spacing: 0.15, angleJitter: 180, flow: 0.5, pressureOpacity: true },
    { id: 'leaf', name: 'Foliage', kind: 'tip', tip: 'leaf', size: 30, spacing: 0.6, angleJitter: 180, sizeJitter: 0.5, scatter: 1, followDirection: false },
  ].map(p => Object.assign({}, BASE, p, { builtIn: true }));

  const Brushes = {
    presets: BUILT_IN.slice(),
    tips: {},       // tipId -> mask canvas
    base: BASE,
    get(id) { return this.presets.find(p => p.id === id) || this.presets[0]; },
    tipMask(tipId) {
      if (!this.tips[tipId] && TIP_GENERATORS[tipId]) this.tips[tipId] = TIP_GENERATORS[tipId]();
      return this.tips[tipId] || null;
    },
  };

  // ---------- tip rendering with mip levels + color cache ----------
  const roundCache = new Map();  // `${level}|${hardness}` -> mask
  const colorCache = new Map();  // key -> colored canvas
  const mipCache = new Map();    // tipId -> [mask canvases, largest first]
  function roundMask(S, hardness) {
    const key = S + '|' + hardness.toFixed(2);
    let m = roundCache.get(key);
    if (m) return m;
    const R = S / 2, h = U.clamp(hardness, 0, 1);
    m = maskFromFn(S, (nx, ny) => {
      const r = Math.hypot(nx, ny) * R; // pixels from center
      const edge = U.clamp(R - r + 0.5, 0, 1); // anti-aliased rim
      if (h >= 0.999) return edge;
      const t = r / R;
      if (t <= h) return edge;
      const x = (t - h) / (1 - h);
      return Math.min(edge, 1 - x * x * (3 - 2 * x));
    });
    roundCache.set(key, m);
    return m;
  }
  function mips(tipId, mask) {
    let list = mipCache.get(tipId);
    if (list) return list;
    list = [mask];
    let cur = mask;
    while (Math.max(cur.width, cur.height) > 8) {
      const n = U.canvas(Math.max(1, cur.width >> 1), Math.max(1, cur.height >> 1));
      const ctx = n.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(cur, 0, 0, n.width, n.height);
      list.push(n); cur = n;
    }
    mipCache.set(tipId, list);
    return list;
  }
  function colorize(mask, color, key) {
    let c = colorCache.get(key);
    if (c) return c;
    if (colorCache.size > 96) colorCache.clear();
    c = U.canvas(mask.width, mask.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
    colorCache.set(key, c);
    return c;
  }
  // Returns {canvas, aspect} for drawing a dab of diameter d.
  Brushes.dabImage = function (brush, color, d) {
    if (brush.kind === 'round') {
      let S = 8; while (S < d && S < 2048) S *= 2;
      const hard = Math.round(brush.hardness * 20) / 20;
      const mask = roundMask(S, hard);
      return { canvas: colorize(mask, color, 'r|' + S + '|' + hard + '|' + color), aspect: 1 };
    }
    const mask = this.tipMask(brush.tip);
    if (!mask) return null;
    const list = mips(brush.tip, mask);
    let i = list.length - 1;
    while (i > 0 && Math.max(list[i].width, list[i].height) < d) i--;
    const m = list[i];
    return { canvas: colorize(m, color, 't|' + brush.tip + '|' + i + '|' + color), aspect: m.height / m.width };
  };
  Brushes.clearCaches = function (tipId) { if (tipId) mipCache.delete(tipId); colorCache.clear(); };

  // Small preview image of a brush: a dab + a short S-curve stroke
  Brushes.thumbnail = function (brush, w = 64, h = 40) {
    const c = U.canvas(w, h), ctx = c.getContext('2d');
    const size = Math.min(h * 0.6, Math.max(4, brush.size > 30 ? h * 0.55 : brush.size * 0.8 + 3));
    const dab = this.dabImage(brush, '#dcdcdc', size);
    if (!dab) return c;
    const step = Math.max(0.6, size * Math.max(brush.spacing, 0.04));
    const r = U.rng(5);
    for (let x = size / 2 + 2; x < w - size / 2 - 2; x += step) {
      const t = x / w, y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.18;
      const p = Math.sin(t * Math.PI);
      const s = size * (brush.pressureSize ? U.lerp(brush.minSize, 1, p) : 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, brush.flow * (brush.pressureOpacity ? 0.25 + p * 0.5 : 1) * (brush.kind === 'round' && brush.hardness < 0.5 ? 0.35 : 1));
      ctx.translate(x + (brush.scatter ? (r() - 0.5) * s * brush.scatter : 0), y + (brush.scatter ? (r() - 0.5) * s * brush.scatter : 0));
      ctx.rotate(((brush.angle + (brush.angleJitter ? (r() - 0.5) * 2 * brush.angleJitter : 0)) * Math.PI) / 180);
      ctx.scale(1, brush.roundness);
      ctx.drawImage(dab.canvas, -s / 2, (-s * dab.aspect) / 2, s, s * dab.aspect);
      ctx.restore();
    }
    return c;
  };

  // ---------- imported brushes (.abr and images), persisted in IndexedDB ----------
  function maskFromAlpha(alpha, w, h) {
    const c = U.canvas(w, h), ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h), d = img.data;
    for (let p = 0; p < w * h; p++) { const i = p * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = alpha[p]; }
    ctx.putImageData(img, 0, 0);
    return squareTip(c);
  }
  function squareTip(c) { // pad a tip to a square so rotation stays centered
    const s = Math.max(c.width, c.height);
    if (c.width === c.height) return c;
    const o = U.canvas(s, s);
    o.getContext('2d').drawImage(c, (s - c.width) / 2, (s - c.height) / 2);
    return o;
  }
  function limitSize(c, max = 1024) {
    const s = Math.max(c.width, c.height);
    if (s <= max) return c;
    const k = max / s, o = U.canvas(c.width * k, c.height * k);
    const ctx = o.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, o.width, o.height);
    return o;
  }
  let importCounter = 0;
  function addImported(name, mask, params, set) {
    const id = 'imp-' + Date.now().toString(36) + '-' + (importCounter++);
    const tipId = 'tip-' + id;
    Brushes.tips[tipId] = limitSize(mask);
    const preset = Object.assign({}, BASE, { spacing: 0.25, size: Math.min(300, Math.max(mask.width, mask.height)) }, params,
      { id, name, kind: 'tip', tip: tipId, imported: true, set: set || 'Imported' });
    Brushes.presets.push(preset);
    return preset;
  }
  const dyn = (d) => d && (d.control === 'pen pressure');
  Brushes.importAbr = function (bytes, fileName) {
    if (!window.agPsd || !agPsd.readAbr) throw new Error('ABR reader not available');
    const abr = agPsd.readAbr(new Uint8Array(bytes), { logMissingFeatures: false });
    const set = (fileName || 'Imported').replace(/\.abr$/i, '');
    const samples = new Map(abr.samples.map(s => [s.id, s]));
    const added = [];
    for (const b of abr.brushes) {
      const sh = b.shape || {};
      const params = {
        spacing: sh.spacingOn === false ? 0.25 : U.clamp(sh.spacing || 0.25, 0.01, 10),
        angle: sh.angle || 0,
        roundness: sh.roundness != null ? U.clamp(sh.roundness, 0.01, 1) : 1,
      };
      if (sh.size) params.size = Math.round(sh.size);
      const sd = b.shapeDynamics;
      if (sd) {
        params.pressureSize = dyn(sd.sizeDynamics);
        params.minSize = sd.minimumDiameter || 0;
        params.sizeJitter = (sd.sizeDynamics && sd.sizeDynamics.jitter) || 0;
        params.angleJitter = ((sd.angleDynamics && sd.angleDynamics.jitter) || 0) * 360;
        if (sd.angleDynamics && /direction/.test(sd.angleDynamics.control)) params.followDirection = true;
      }
      if (b.scatter) { params.scatter = (b.scatter.scatterDynamics && b.scatter.scatterDynamics.jitter) || 0; params.count = b.scatter.count || 1; }
      if (b.transfer) params.pressureOpacity = dyn(b.transfer.opacityDynamics) || dyn(b.transfer.flowDynamics);
      if (b.toolOptions && b.toolOptions.flow != null) params.flow = U.clamp(b.toolOptions.flow, 0.01, 1);
      if (sh.type === 'sampled') {
        const s = samples.get(sh.sampledData);
        if (!s || !s.bounds.w || !s.bounds.h) continue;
        added.push(addImported(b.name || 'Brush', maskFromAlpha(s.alpha, s.bounds.w, s.bounds.h), params, set));
      } else if (sh.type === 'computed') {
        const id = 'imp-' + Date.now().toString(36) + '-' + (importCounter++);
        const p = Object.assign({}, BASE, params, { id, name: b.name || 'Round', kind: 'round', hardness: sh.hardness != null ? sh.hardness : 1, imported: true, set });
        Brushes.presets.push(p); added.push(p);
      }
    }
    if (!added.length) { // some files only contain samples
      for (const s of abr.samples) if (s.bounds.w && s.bounds.h) added.push(addImported('Sample ' + (added.length + 1), maskFromAlpha(s.alpha, s.bounds.w, s.bounds.h), {}, set));
    }
    if (added.length) Brushes.save();
    return added;
  };
  // Image → tip: dark pixels paint (like defining a brush in Photoshop); transparent images use their alpha.
  Brushes.importImage = function (canvas, name) {
    const w = canvas.width, h = canvas.height;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let hasAlpha = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break; }
    const alpha = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4, lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      alpha[p] = hasAlpha ? d[i + 3] : 255 - lum;
    }
    const p = addImported(name || 'Image Brush', maskFromAlpha(alpha, w, h), {});
    Brushes.save();
    return p;
  };
  Brushes.remove = function (id) {
    const i = this.presets.findIndex(p => p.id === id && !p.builtIn);
    if (i < 0) return;
    const [p] = this.presets.splice(i, 1);
    if (p.tip) { delete this.tips[p.tip]; mipCache.delete(p.tip); }
    this.save();
  };
  Brushes.save = async function () {
    const list = this.presets.filter(p => p.imported).map(p => ({
      preset: Object.assign({}, p),
      tip: p.kind === 'tip' ? this.tips[p.tip].toDataURL('image/png') : null,
    }));
    await U.idb.set('brushes', list);
  };
  Brushes.load = async function () {
    const list = await U.idb.get('brushes');
    if (!Array.isArray(list)) return;
    for (const item of list) {
      try {
        if (item.tip) this.tips[item.preset.tip] = await U.dataUrlToCanvas(item.tip);
        this.presets.push(Object.assign({}, BASE, item.preset));
      } catch (e) { console.warn('Could not restore brush', e); }
    }
  };

  E.Brushes = Brushes;
})(window.E);
