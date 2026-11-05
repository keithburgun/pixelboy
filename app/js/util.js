// Shared helpers. Every module hangs off the global `E` namespace.
window.E = window.E || {};
(function (E) {
  const U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

  U.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  U.readCanvas = (w, h) => { // canvas we will call getImageData on often
    const c = U.canvas(w, h);
    c.getContext('2d', { willReadFrequently: true });
    return c;
  };
  U.cloneCanvas = (src) => {
    const c = U.canvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  U.cropCanvas = (src, r) => {
    const c = U.canvas(r.w, r.h);
    c.getContext('2d').drawImage(src, -r.x, -r.y);
    return c;
  };
  U.isCanvasEmpty = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  };
  U.alphaBounds = (c) => { // bounding box of non-transparent pixels, or null
    const w = c.width, h = c.height;
    const d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (d[row + x * 4 + 3]) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };

  // Rectangles {x,y,w,h}
  U.rectUnion = (a, b) => {
    if (!a) return b; if (!b) return a;
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };
  U.rectClip = (r, w, h) => {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const x2 = Math.min(w, Math.ceil(r.x + r.w)), y2 = Math.min(h, Math.ceil(r.y + r.h));
    if (x2 <= x || y2 <= y) return null;
    return { x, y, w: x2 - x, h: y2 - y };
  };

  // Deterministic random (mulberry32) so built-in brush tips look the same every launch
  U.rng = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Colors
  U.hexToRgb = (hex) => {
    hex = String(hex).replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16);
    if (isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  U.rgbToHex = ({ r, g, b }) => '#' + [r, g, b].map(v => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.rgbToHsv = ({ r, g, b }) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  };
  U.hsvToRgb = ({ h, s, v }) => {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  };

  U.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  U.el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  U.canvasToBlob = (c, type = 'image/png', q) => new Promise(res => c.toBlob(res, type, q));
  U.blobToImage = (blob) => new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    img.src = url;
  });
  U.imageToCanvas = (img) => {
    const c = U.canvas(img.naturalWidth || img.width, img.naturalHeight || img.height);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  };
  U.dataUrlToCanvas = (url) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(U.imageToCanvas(img));
    img.onerror = rej;
    img.src = url;
  });

  // Tiny IndexedDB key/value store (for imported brushes etc.)
  U.idb = {
    _db: null,
    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('pixelboy', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this._db = r.result; res(r.result); };
        r.onerror = () => rej(r.error);
      });
    },
    async get(key) {
      try {
        const db = await this.open();
        return await new Promise((res, rej) => {
          const r = db.transaction('kv').objectStore('kv').get(key);
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        });
      } catch (e) { return undefined; }
    },
    async set(key, val) {
      try {
        const db = await this.open();
        await new Promise((res, rej) => {
          const t = db.transaction('kv', 'readwrite');
          t.objectStore('kv').put(val, key);
          t.oncomplete = res; t.onerror = () => rej(t.error);
        });
      } catch (e) { console.warn('idb set failed', e); }
    },
  };
  U.store = { // localStorage with JSON + try/catch
    get(k, d) { try { const v = localStorage.getItem('pixelboy.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pixelboy.' + k, JSON.stringify(v)); } catch (e) { } },
  };

  U.BLEND_MODES = [
    ['source-over', 'Normal'], null,
    ['darken', 'Darken'], ['multiply', 'Multiply'], ['color-burn', 'Color Burn'], null,
    ['lighten', 'Lighten'], ['screen', 'Screen'], ['color-dodge', 'Color Dodge'], ['lighter', 'Linear Dodge (Add)'], null,
    ['overlay', 'Overlay'], ['soft-light', 'Soft Light'], ['hard-light', 'Hard Light'], null,
    ['difference', 'Difference'], ['exclusion', 'Exclusion'], null,
    ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'],
  ];
  // Canvas composite op <-> ag-psd blend mode names
  U.BLEND_TO_PSD = {
    'source-over': 'normal', darken: 'darken', multiply: 'multiply', 'color-burn': 'color burn',
    lighten: 'lighten', screen: 'screen', 'color-dodge': 'color dodge', lighter: 'linear dodge',
    overlay: 'overlay', 'soft-light': 'soft light', 'hard-light': 'hard light', difference: 'difference',
    exclusion: 'exclusion', hue: 'hue', saturation: 'saturation', color: 'color', luminosity: 'luminosity',
  };
  U.PSD_TO_BLEND = Object.fromEntries(Object.entries(U.BLEND_TO_PSD).map(([a, b]) => [b, a]));

  E.U = U;
})(window.E);
