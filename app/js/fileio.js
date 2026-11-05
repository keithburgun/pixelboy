// File I/O for desktop (Electron) and web: PixelBoy projects, PSD, PNG/JPG, GIF, sprite sheets, ABR.
(function (E) {
  const U = E.U;
  const desk = window.pixelboyDesktop || null;

  const Platform = {
    desktop: !!desk,
    // filters: [{name, extensions:[...]}]
    async open(filters) {
      if (desk) {
        const r = await desk.openFile(filters);
        if (!r) return null;
        return { name: r.name, path: r.path, data: toArrayBuffer(r.data) };
      }
      return new Promise((resolve) => {
        const input = U.el('input', { type: 'file', accept: filters.flatMap(f => f.extensions.map(x => '.' + x)).join(',') });
        input.addEventListener('change', async () => {
          const f = input.files[0];
          if (!f) return resolve(null);
          resolve({ name: f.name, path: null, data: await f.arrayBuffer() });
        });
        input.click();
      });
    },
    async readPath(p) { if (!desk) return null; const r = await desk.readFile(p); return r && { name: r.name, path: r.path, data: toArrayBuffer(r.data) }; },
    // data: Uint8Array | ArrayBuffer | Blob
    async save({ data, name, filters, path }) {
      if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
      if (data instanceof ArrayBuffer) data = new Uint8Array(data);
      if (desk) return await desk.saveFile({ path, defaultName: name, filters, data });
      const a = U.el('a', { download: name, href: URL.createObjectURL(new Blob([data])) });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      return { name, path: null };
    },
  };
  function toArrayBuffer(d) {
    if (d instanceof ArrayBuffer) return d;
    if (ArrayBuffer.isView(d)) return d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
    return new Uint8Array(d).buffer;
  }
  const baseName = (n) => (n || 'Untitled').replace(/\.[^.]+$/, '');
  const ext = (n) => (/\.([^.]+)$/.exec(n || '') || [])[1]?.toLowerCase() || '';

  const F = {
    Platform,
    FILTERS: {
      open: [{ name: 'All supported', extensions: ['pixelboy', 'psd', 'png', 'jpg', 'jpeg', 'gif', 'webp'] }, { name: 'PixelBoy Project', extensions: ['pixelboy'] }, { name: 'Photoshop', extensions: ['psd'] }, { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      pixelboy: [{ name: 'PixelBoy Project', extensions: ['pixelboy'] }],
      psd: [{ name: 'Photoshop', extensions: ['psd'] }],
      png: [{ name: 'PNG', extensions: ['png'] }],
      jpg: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }],
      gif: [{ name: 'GIF', extensions: ['gif'] }],
      abr: [{ name: 'Photoshop Brushes', extensions: ['abr'] }],
      image: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    },

    // ---------- open ----------
    async openFile(file) {
      const e = ext(file.name);
      if (e === 'pixelboy') return this.readProject(file.data, file.name);
      if (e === 'psd') return this.readPsd(file.data, file.name);
      const canvas = await this.decodeImage(file.data);
      const doc = new E.Doc(canvas.width, canvas.height, { empty: true, name: file.name });
      const l = doc.addLayer('Background', false);
      doc.ensureCel(l, 0).canvas.getContext('2d').drawImage(canvas, 0, 0);
      return doc;
    },
    async decodeImage(data) {
      const img = await U.blobToImage(new Blob([data]));
      return U.imageToCanvas(img);
    },

    // ---------- PixelBoy project (.pixelboy = JSON with PNG layers) ----------
    writeProject(doc) {
      const out = {
        format: 'pixelboy', version: 1, app: window.PIXELBOY_VERSION,
        width: doc.width, height: doc.height, fps: doc.fps, frameCount: doc.frameCount, activeIndex: doc.activeIndex,
        layers: doc.layers.map(l => ({
          name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, lockAlpha: l.lockAlpha,
          keys: l.keys.map(k => ({ frame: k.frame, png: U.isCanvasEmpty(k.canvas) ? null : k.canvas.toDataURL('image/png') })),
        })),
      };
      return new TextEncoder().encode(JSON.stringify(out));
    },
    async readProject(data, name) {
      const j = JSON.parse(new TextDecoder().decode(data));
      if (j.format !== 'pixelboy') throw new Error('Not an PixelBoy project');
      const doc = new E.Doc(j.width, j.height, { empty: true, name });
      doc.fps = j.fps || 12; doc.frameCount = j.frameCount || 1;
      for (const lj of j.layers) {
        const l = doc.addLayer(lj.name, false, doc.layers.length);
        Object.assign(l, { visible: lj.visible !== false, opacity: lj.opacity ?? 1, blend: lj.blend || 'source-over', lockAlpha: !!lj.lockAlpha });
        for (const k of lj.keys) {
          const canvas = doc.newCanvas();
          if (k.png) canvas.getContext('2d').drawImage(await U.dataUrlToCanvas(k.png), 0, 0);
          l.keys.push({ frame: k.frame, canvas });
        }
        l.sortKeys();
      }
      doc.activeIndex = U.clamp(j.activeIndex || 0, 0, doc.layers.length - 1);
      doc.format = 'pixelboy';
      return doc;
    },

    // ---------- PSD ----------
    readPsd(data, name) {
      const psd = agPsd.readPsd(new Uint8Array(data), { skipThumbnail: true });
      const doc = new E.Doc(psd.width, psd.height, { empty: true, name });
      const add = (children) => {
        for (const ch of children || []) {
          if (ch.children) { add(ch.children); continue; } // groups are flattened into plain layers
          const l = doc.addLayer(ch.name || 'Layer', false, doc.layers.length);
          l.visible = !ch.hidden;
          l.opacity = ch.opacity ?? 1;
          l.blend = U.PSD_TO_BLEND[ch.blendMode] || 'source-over';
          l.lockAlpha = !!(ch.protected && ch.protected.transparency);
          const cel = doc.ensureCel(l, 0).canvas;
          if (ch.canvas) cel.getContext('2d').drawImage(ch.canvas, ch.left || 0, ch.top || 0);
        }
      };
      add(psd.children);
      if (!doc.layers.length) {
        const l = doc.addLayer('Background', false);
        if (psd.canvas) doc.ensureCel(l, 0).canvas.getContext('2d').drawImage(psd.canvas, 0, 0);
      }
      doc.activeIndex = doc.layers.length - 1;
      doc.format = 'psd';
      return doc;
    },
    writePsd(doc) {
      const children = doc.layers.map(l => {
        const c = doc.celCanvas(l, doc.frame);
        const b = c && U.alphaBounds(c);
        return {
          name: l.name, hidden: !l.visible, opacity: l.opacity, blendMode: U.BLEND_TO_PSD[l.blend] || 'normal',
          protected: l.lockAlpha ? { transparency: true } : undefined,
          left: b ? b.x : 0, top: b ? b.y : 0,
          canvas: b ? U.cropCanvas(c, b) : undefined,
        };
      });
      const psd = { width: doc.width, height: doc.height, children, canvas: doc.flatten() };
      return new Uint8Array(agPsd.writePsd(psd, { generateThumbnail: true }));
    },

    // ---------- export ----------
    async exportImage(doc, type, quality = 0.92, scale = 1) {
      let c = doc.flatten(doc.frame, type === 'image/jpeg' ? '#ffffff' : null);
      if (scale !== 1) c = scaleCanvas(c, scale, scale >= 1 && doc.width <= 512);
      return U.canvasToBlob(c, type, quality);
    },
    frames(doc, scale, bg) {
      const out = [];
      for (let f = 0; f < doc.frameCount; f++) {
        let c = doc.flatten(f, bg);
        if (scale !== 1) c = scaleCanvas(c, scale, scale >= 1);
        out.push(c);
      }
      return out;
    },
    exportGif(doc, { scale = 1, bg = null, loop = true } = {}) {
      const { GIFEncoder, quantize, applyPalette } = window.gifenc;
      const frames = this.frames(doc, scale, bg);
      const w = frames[0].width, h = frames[0].height;
      const gif = GIFEncoder();
      const delay = Math.round(1000 / doc.fps);
      for (const c of frames) {
        const data = c.getContext('2d').getImageData(0, 0, w, h).data;
        const palette = quantize(data, 256, { format: 'rgba4444', oneBitAlpha: true, clearAlpha: true, clearAlphaThreshold: 127 });
        const index = applyPalette(data, palette, 'rgba4444');
        const ti = palette.findIndex(p => p[3] === 0);
        gif.writeFrame(index, w, h, { palette, delay, transparent: ti >= 0, transparentIndex: Math.max(0, ti), repeat: loop ? 0 : -1, dispose: 2 });
      }
      gif.finish();
      return gif.bytes();
    },
    async exportSpriteSheet(doc, { columns, padding = 0, scale = 1 }) {
      const frames = this.frames(doc, scale, null);
      const n = frames.length, cols = Math.max(1, Math.min(columns || n, n)), rows = Math.ceil(n / cols);
      const fw = frames[0].width, fh = frames[0].height;
      const sheet = U.canvas(cols * fw + (cols - 1) * padding, rows * fh + (rows - 1) * padding);
      const ctx = sheet.getContext('2d');
      frames.forEach((c, i) => ctx.drawImage(c, (i % cols) * (fw + padding), Math.floor(i / cols) * (fh + padding)));
      return U.canvasToBlob(sheet, 'image/png');
    },
    baseName, ext,
  };
  function scaleCanvas(c, s, nearest) {
    const o = U.canvas(c.width * s, c.height * s), ctx = o.getContext('2d');
    ctx.imageSmoothingEnabled = !nearest; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c, 0, 0, o.width, o.height);
    return o;
  }

  E.FileIO = F;
})(window.E);
