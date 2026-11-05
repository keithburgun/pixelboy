// PixelBoy — main application: state, input routing, actions & default shortcuts, menus, dialogs, files, updates.
(function (E) {
  const U = E.U, el = U.el, H = E.Hotkeys, F = E.FileIO;

  const presetParams = (id) => { const p = E.Brushes.get(id); const c = Object.assign({}, p); c.flow = 1; return c; };
  function defaultSettings() {
    return {
      brush: { presetId: 'hard-round', params: presetParams('hard-round'), opacity: 1, flow: 1, smoothing: 10, catchUp: true },
      eraser: { presetId: 'soft-round', params: Object.assign(presetParams('soft-round'), { size: 40, pressureOpacity: false }), opacity: 1, flow: 1, smoothing: 0, catchUp: true, mode: 'brush', pixelSize: 1 },
      pixel: { size: 1, shape: 'square', opacity: 1, pixelPerfect: true, smoothing: 0 },
      selection: { mode: 'new' },
      wand: { tolerance: 32, contiguous: true, allLayers: false },
      bucket: { tolerance: 32, contiguous: true, allLayers: false, opacity: 1 },
      eyedropper: { size: 1, allLayers: true },
    };
  }

  const app = E.app = {
    doc: null, view: null, toolId: 'brush', tempTool: null, activeTool: null,
    fg: '#000000', bg: '#ffffff', recentColors: [],
    settings: null, groupTool: {}, playing: false, loop: true, timelineVisible: false,
    clipboard: null, updateState: null,

    get tool() { return this.tempTool || E.Tools.TOOLS[this.toolId]; },

    async init() {
      // settings
      const def = defaultSettings();
      const saved = U.store.get('settings', null);
      this.settings = def;
      if (saved) for (const k in def) if (saved[k]) this.settings[k] = Object.assign({}, def[k], saved[k], saved[k].params ? { params: Object.assign({}, E.Brushes.base, saved[k].params) } : {});
      const ui = U.store.get('ui', {});
      this.fg = ui.fg || '#000000'; this.bg = ui.bg || '#ffffff';
      this.recentColors = ui.recent || ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#000000', '#ffffff', '#9a2257', '#e04040', '#f0a030', '#3080e0'];
      this.theme = ui.theme || 'night';
      document.documentElement.dataset.theme = this.theme;
      for (const g of E.Tools.GROUPS) this.groupTool[g.id] = (ui.groupTool && ui.groupTool[g.id] && g.tools.includes(ui.groupTool[g.id])) ? ui.groupTool[g.id] : g.tools[0];
      this.toolId = ui.toolId && E.Tools.TOOLS[ui.toolId] ? ui.toolId : 'brush';

      registerActions();
      H.load();

      // layout
      this.view = new E.View(document.getElementById('viewport'));
      if (ui.onion) Object.assign(this.view.onion, ui.onion);
      if (ui.pixelGrid === false) this.view.pixelGrid = false;
      this.timeline = new E.Timeline(document.getElementById('timeline'), this);
      E.ui.buildMenuBar(document.getElementById('menubar'), buildMenus());
      E.ui.buildToolbar(document.getElementById('toolbar'), this);
      const dock = document.getElementById('dock');
      dock.append(E.ui.buildColorPanel(this), E.ui.buildBrushPanel(this));
      this.setDoc(new E.Doc(1920, 1080, { name: 'Untitled-1' }));
      dock.append(E.ui.buildLayersPanel(this));
      this.buildStatusBar();
      this.refreshOptions(true);
      this.bindInput();
      this.bindEvents();
      if (ui.timeline) this.toggleTimeline(true);
      this.setupDesktop();
      await E.Brushes.load();
      E.emit('brushes');
    },

    // ---------- document ----------
    setDoc(doc) {
      if (this.playing) this.stop();
      this.doc = doc;
      this.view.fit();
      this.view.invalidate();
      E.emit('doc'); E.emit('layers'); E.emit('frames'); E.emit('selection');
      this.updateTitle();
    },
    async confirmDiscard() {
      if (!this.doc || !this.doc.dirty) return true;
      return E.ui.confirm('Unsaved changes', `Discard changes to “${this.doc.name}”?`, 'Discard');
    },
    updateTitle() {
      const d = this.doc; if (!d) return;
      const t = `${d.name}${d.dirty ? '*' : ''} @ ${Math.round(this.view.zoom * 100)}% (${d.activeLayer ? d.activeLayer.name : ''}) — PixelBoy`;
      document.title = t;
      if (window.pixelboyDesktop) window.pixelboyDesktop.setTitle(t);
      const tab = document.getElementById('doctab');
      if (tab) tab.textContent = `${d.name}${d.dirty ? '*' : ''} @ ${Math.round(this.view.zoom * 100)}%`;
      window.onbeforeunload = d.dirty ? () => 'You have unsaved changes.' : null;
    },

    // ---------- tools & colors ----------
    selectTool(id) {
      if (!E.Tools.TOOLS[id]) return;
      const cur = E.Tools.TOOLS[this.toolId];
      if (cur.cancel && id !== this.toolId) cur.cancel();
      this.toolId = id;
      const g = E.Tools.GROUPS.find(g => g.tools.includes(id));
      if (g) this.groupTool[g.id] = id;
      this.refreshOptions(true); this.updateCursor(); this.saveUi();
      E.emit('tool');
      this.view.needsOverlay = true;
    },
    setFg(c, transient) {
      this.fg = c;
      E.emit('color', transient ? 'panel' : undefined);
      if (!transient) { this.addRecent(c); this.saveUi(); }
    },
    setBg(c) { this.bg = c; E.emit('color'); this.saveUi(); },
    addRecent(c) {
      this.recentColors = [c, ...this.recentColors.filter(x => x !== c)].slice(0, 16);
      E.emit('recent');
    },
    selectPreset(toolId, presetId) {
      const ts = this.settings[toolId], p = E.Brushes.get(presetId);
      ts.presetId = p.id;
      ts.params = Object.assign({}, p, { flow: 1 });
      ts.flow = p.flow;
      if (p.smoothing != null && toolId === 'brush') ts.smoothing = p.smoothing;
      this.saveSettings(); this.refreshOptions(true);
      E.emit('preset');
    },
    async saveAsPreset(toolId) {
      const ts = this.settings[toolId];
      const name = await prompt1('New Brush Preset', 'Name:', (ts.params.name || 'Brush') + ' copy');
      if (!name) return;
      const id = 'custom-' + Date.now().toString(36);
      const p = Object.assign({}, ts.params, { id, name, builtIn: false, imported: true, set: 'Custom', flow: ts.flow });
      E.Brushes.presets.push(p);
      await E.Brushes.save();
      ts.presetId = id;
      E.emit('brushes');
    },
    refreshOptions(rebuild) {
      if (rebuild) { E.ui.buildOptions(document.getElementById('optionsbar'), this); return; }
      const ts = this.settings[this.toolId === 'eraser' ? 'eraser' : 'brush'];
      if (this._sizeField && document.body.contains(this._sizeField) && ts.params) this._sizeField.set(ts.params.size);
      if (this._hardField && document.body.contains(this._hardField) && ts.params) this._hardField.set(Math.round(ts.params.hardness * 100));
      if (this._rotField && document.body.contains(this._rotField)) this._rotField.set(Math.round(this.view.rot));
      const pk = document.querySelector('.brush-pick-size'); if (pk && ts.params) pk.textContent = Math.round(ts.params.size);
      if (['pixel'].includes(this.toolId) || (this.toolId === 'eraser' && ts.mode === 'pixel')) E.ui.buildOptions(document.getElementById('optionsbar'), this);
    },
    saveSettings: U.debounce(function () { U.store.set('settings', app.settings); }, 300),
    saveUi() {
      U.store.set('ui', { fg: this.fg, bg: this.bg, recent: this.recentColors, groupTool: this.groupTool, toolId: this.toolId, theme: this.theme, onion: this.view && this.view.onion, timeline: this.timelineVisible, pixelGrid: this.view ? this.view.pixelGrid : true });
    },
    toast(m) { E.ui.toast(m); },
    liveOverride() { const t = this.activeTool || this.tool; return t && t.live ? t.live() : null; },
    updateCursor() {
      const t = this.tool;
      this.view.overlay.style.cursor = (typeof t.cursor === 'function' ? t.cursor() : t.cursor) || 'default';
    },

    // ---------- input ----------
    bindInput() {
      const host = this.view.overlay, v = this.view;
      const pt = (e, base) => {
        const r = host.getBoundingClientRect();
        const sx = e.clientX - r.left, sy = e.clientY - r.top;
        const d = v.toDoc(sx, sy);
        const pen = e.pointerType === 'pen';
        return { sx, sy, x: d.x, y: d.y, p: pen ? Math.max(0.02, e.pressure || 0) : 1, button: e.button, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, pointerType: e.pointerType, ...(base || {}) };
      };
      host.addEventListener('contextmenu', (e) => e.preventDefault());
      host.addEventListener('pointerdown', (e) => {
        if (this.activeTool) return;
        document.activeElement && document.activeElement.blur && document.activeElement.blur();
        E.ui.closePopups();
        const base = E.Tools.TOOLS[this.toolId];
        let tool = this.tool;
        if (e.button === 1) tool = E.Tools.TOOLS.hand;
        else if (e.button === 2 && e.altKey && (base.paint && base.bracket)) tool = base; // Alt+right-drag resizes the brush
        else if ((e.ctrlKey || e.metaKey) && !e.altKey && !this.tempTool && E.Tools.PAINT_TOOLS.has(this.toolId)) tool = E.Tools.TOOLS.move; // Ctrl = temporary Move
        else if (e.button === 2 && !tool.selection) return;
        if (this.playing) this.stop();
        host.setPointerCapture(e.pointerId);
        this.activeTool = tool; this.pointerId = e.pointerId;
        const p = pt(e);
        v.mouse = { x: p.sx, y: p.sy };
        tool.down(p);
        v.needsOverlay = true;
      });
      host.addEventListener('pointermove', (e) => {
        const p = pt(e);
        v.mouse = { x: p.sx, y: p.sy };
        this.cursorPos = p;
        this.updateStatusPos();
        if (this.activeTool && e.pointerId === this.pointerId) {
          const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
          if (co.length > 1) p.coalesced = co.map(c => pt(c));
          this.activeTool.move(p);
        }
        v.needsOverlay = true;
      });
      const end = (e) => {
        if (!this.activeTool || e.pointerId !== this.pointerId) return;
        const t = this.activeTool; this.activeTool = null;
        t.up(pt(e));
        v.needsOverlay = true;
        if (this.pendingTempRelease) { this.pendingTempRelease = false; this.tempTool = null; this.updateCursor(); }
      };
      host.addEventListener('pointerup', end);
      host.addEventListener('pointercancel', end);
      host.addEventListener('pointerleave', () => { if (!this.activeTool) { v.mouse = null; v.needsOverlay = true; } });
      host.addEventListener('dblclick', (e) => { const t = this.tool; if (t.dblclick) t.dblclick(pt(e)); });
      host.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = host.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        if (e.ctrlKey || e.altKey || e.metaKey) v.setZoom(v.zoom * Math.pow(1.0015, -e.deltaY * (e.deltaMode ? 30 : 1)), sx, sy);
        else if (e.shiftKey) { v.panX -= e.deltaY || e.deltaX; v.changed(); }
        else { v.panX -= e.deltaX; v.panY -= e.deltaY; v.changed(); }
      }, { passive: false });

      // keyboard
      let digit = { d: '', t: 0 };
      const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) && t.type !== 'checkbox' && t.type !== 'range'; };
      window.addEventListener('keydown', (e) => {
        if (document.querySelector('.modal-back')) return;
        if (typing(e)) return;
        // temporary tools (held keys)
        if (e.code === 'Space' && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          if (!e.repeat && !this.activeTool) { this.tempTool = E.Tools.TOOLS.hand; this.updateCursor(); }
          return;
        }
        if (e.key === 'Alt') {
          e.preventDefault();
          const base = this.toolId;
          if (!e.repeat && !this.activeTool && ['brush', 'pixel', 'bucket'].includes(base)) { this.tempTool = E.Tools.TOOLS.eyedropper; this.updateCursor(); this.view.needsOverlay = true; }
          return;
        }
        const t = this.tool;
        if (t.keydown && t.keydown(e)) { e.preventDefault(); return; }
        // number keys → opacity (Shift → flow), Photoshop style
        const m = /^Digit(\d)$|^Numpad(\d)$/.exec(e.code);
        if (m && !e.ctrlKey && !e.altKey && !e.metaKey) {
          const combo = H.comboFromEvent(e);
          if (!H.find(combo)) {
            e.preventDefault();
            const n = m[1] || m[2], now = performance.now();
            let val;
            if (now - digit.t < 500 && digit.d.length === 1) { val = parseInt(digit.d + n, 10) / 100; digit = { d: '', t: 0 }; }
            else { val = n === '0' ? 1 : parseInt(n, 10) / 10; digit = { d: n, t: now }; }
            this.setOpacityFromKeys(val, e.shiftKey);
            return;
          }
        }
        H.handle(e);
      });
      window.addEventListener('keyup', (e) => {
        if ((e.code === 'Space' && this.tempTool === E.Tools.TOOLS.hand) || (e.key === 'Alt' && this.tempTool === E.Tools.TOOLS.eyedropper)) {
          if (this.activeTool) this.pendingTempRelease = true;
          else { this.tempTool = null; this.updateCursor(); this.view.needsOverlay = true; }
        }
        if (e.key === 'Alt') e.preventDefault();
      });
      window.addEventListener('blur', () => { if (!this.activeTool) { this.tempTool = null; this.updateCursor(); } });
      // paste from the system clipboard (Ctrl+V lets the browser fire this event)
      window.addEventListener('paste', (e) => {
        if (typing(e) || document.querySelector('.modal-back')) return;
        e.preventDefault();
        const item = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
        if (item) U.blobToImage(item.getAsFile()).then(img => this.pasteCanvas(U.imageToCanvas(img), false));
        else this.pasteInternal();
      });
      // drag & drop files
      window.addEventListener('dragover', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
      window.addEventListener('drop', async (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault();
        for (const f of e.dataTransfer.files) await this.openDropped({ name: f.name, data: await f.arrayBuffer(), path: f.path || null });
      });
    },
    setOpacityFromKeys(val, shift) {
      const id = this.toolId;
      let label;
      if (['brush', 'eraser', 'pixel', 'bucket'].includes(id)) {
        const s = this.settings[id];
        if (shift && s.flow != null && !(id === 'eraser' && s.mode === 'pixel')) { s.flow = Math.max(0.01, val); label = `Flow: ${Math.round(s.flow * 100)}%`; }
        else { s.opacity = val; label = `Opacity: ${Math.round(val * 100)}%`; }
        this.saveSettings(); this.refreshOptions(true);
      } else {
        const L = this.doc.activeLayer;
        this.doc.setLayerProps(L, { opacity: val }, 'Opacity Change');
        label = `Layer opacity: ${Math.round(val * 100)}%`;
      }
      this.hud(label);
    },
    hud(text) {
      let h = document.getElementById('hud');
      if (!h) { h = el('div', { id: 'hud' }); document.getElementById('viewport').append(h); }
      h.textContent = text; h.classList.add('show');
      clearTimeout(this._hudT); this._hudT = setTimeout(() => h.classList.remove('show'), 900);
    },
    bindEvents() {
      E.on('render', () => this.view.invalidate());
      E.on('selection', () => { this.view.needsOverlay = true; });
      E.on('docsize', () => { this.view.fit(); this.updateStatus(); });
      E.on('dirty', () => this.updateTitle());
      E.on('layers', () => this.updateTitle());
      E.on('view', () => { this.updateTitle(); this.updateStatus(); this.refreshOptions(); });
      E.on('frames', () => { this.view.invalidate(); this.updateStatus(); });
      E.on('keymap', () => this.refreshOptions(true));
      window.addEventListener('resize', () => E.ui.closePopups());
    },

    // ---------- status bar ----------
    buildStatusBar() {
      const sb = document.getElementById('statusbar');
      this.zoomInput = el('input', { class: 'zoom-input', spellcheck: 'false' });
      this.zoomInput.addEventListener('change', () => { const z = parseFloat(this.zoomInput.value); if (z > 0) this.view.setZoom(z / 100); this.zoomInput.blur(); });
      this.zoomInput.addEventListener('keydown', (e) => e.stopPropagation());
      this.statusInfo = el('span', { class: 'status-info' });
      this.statusPos = el('span', { class: 'status-pos' });
      this.statusUpdate = el('span', { class: 'status-update' });
      sb.append(this.zoomInput, this.statusInfo, this.statusPos, el('div', { class: 'tl-spacer' }), this.statusUpdate);
      this.updateStatus();
    },
    updateStatus() {
      if (!this.zoomInput || !this.doc) return;
      if (document.activeElement !== this.zoomInput) this.zoomInput.value = (Math.round(this.view.zoom * 1000) / 10) + '%';
      const d = this.doc;
      this.statusInfo.textContent = `${d.width} × ${d.height} px` + (d.frameCount > 1 ? ` · frame ${d.frame + 1}/${d.frameCount}` : '');
    },
    updateStatusPos() {
      const p = this.cursorPos; if (!p || !this.statusPos) return;
      this.statusPos.textContent = `${Math.floor(p.x)}, ${Math.floor(p.y)}`;
    },

    // ---------- animation ----------
    toggleTimeline(show) {
      const tl = document.getElementById('timeline');
      this.timelineVisible = show == null ? !this.timelineVisible : show;
      tl.hidden = !this.timelineVisible;
      if (!this.timelineVisible && this.playing) this.stop();
      this.timeline.refresh();
      this.view.invalidate(); this.saveUi();
    },
    togglePlay() { if (this.playing) this.stop(); else this.play(); },
    play() {
      const d = this.doc;
      if (d.frameCount < 2) return;
      this.playing = true;
      const tick = () => {
        let f = d.frame + 1;
        if (f >= d.frameCount) { if (!this.loop) { this.stop(); return; } f = 0; }
        d.setFrame(f);
      };
      this._playT = setInterval(tick, 1000 / d.fps);
      E.emit('play');
    },
    stop() { clearInterval(this._playT); this.playing = false; this.view.invalidate(); E.emit('play'); },
    frameAction(fn) { if (!this.timelineVisible) this.toggleTimeline(true); if (this.playing) this.stop(); fn(); },

    // ---------- clipboard ----------
    selectionCanvas(merged) {
      const d = this.doc, sel = d.selection;
      const src = merged ? d.flatten() : d.celCanvas(d.activeLayer, d.frame);
      if (!src) return null;
      const c = U.cloneCanvas(src);
      sel.clip(c.getContext('2d'));
      const b = sel.active ? sel.bounds() : U.alphaBounds(c);
      if (!b) return null;
      return { canvas: U.cropCanvas(c, b), x: b.x, y: b.y };
    },
    async copy(merged) {
      const clip = this.selectionCanvas(merged);
      if (!clip) { this.toast('Nothing to copy — the selected area is empty.'); return false; }
      this.clipboard = clip;
      try {
        const blob = await U.canvasToBlob(clip.canvas);
        if (navigator.clipboard && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.clipboard.sysW = clip.canvas.width; this.clipboard.sysH = clip.canvas.height;
      } catch (e) { /* system clipboard unavailable; internal clipboard still works */ }
      return true;
    },
    async cut() { if (await this.copy(false)) this.clearSelection('Cut'); },
    async pasteFromMenu() {
      try {
        if (navigator.clipboard && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          for (const it of items) {
            const type = it.types.find(t => t.startsWith('image/'));
            if (type) { const img = await U.blobToImage(await it.getType(type)); return this.pasteCanvas(U.imageToCanvas(img), false); }
          }
        }
      } catch (e) { /* permission denied or unsupported */ }
      this.pasteInternal();
    },
    pasteInternal() {
      if (!this.clipboard) { this.toast('The clipboard is empty.'); return; }
      this.pasteCanvas(this.clipboard.canvas, true);
    },
    pasteCanvas(canvas, internal) {
      const d = this.doc;
      let x, y;
      const cb = this.clipboard;
      if (cb && (internal || (cb.sysW === canvas.width && cb.sysH === canvas.height))) { x = cb.x; y = cb.y; canvas = internal ? canvas : cb.canvas; }
      else { x = Math.round((d.width - canvas.width) / 2); y = Math.round((d.height - canvas.height) / 2); }
      d.change('Paste', () => {
        const l = new E.Layer(d.nextLayerName());
        const c = d.newCanvas(); c.getContext('2d').drawImage(canvas, x, y);
        l.keys.push({ frame: d.frame, canvas: c });
        d.layers.splice(d.activeIndex + 1, 0, l);
        d.activeIndex++;
      });
    },
    clearSelection(label = 'Clear') {
      const d = this.doc, L = d.activeLayer, c = d.celCanvas(L, d.frame);
      if (!c) return;
      const before = U.cloneCanvas(c), ctx = c.getContext('2d');
      if (d.selection.active) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(d.selection.mask, 0, 0); ctx.restore(); }
      else ctx.clearRect(0, 0, d.width, d.height);
      d.history.pixels(label, L, c, before, { x: 0, y: 0, w: d.width, h: d.height }, null);
      this.view.invalidate(); E.emit('layers'); E.emit('frames');
    },
    fill(color) {
      const d = this.doc, L = d.activeLayer;
      if (!L.visible) { this.toast('Could not fill because the target layer is hidden.'); return; }
      const cel = d.ensureCel(L, d.frame), before = U.cloneCanvas(cel.canvas);
      const f = d.newCanvas(), fc = f.getContext('2d');
      fc.fillStyle = color; fc.fillRect(0, 0, d.width, d.height);
      d.selection.clip(fc);
      const ctx = cel.canvas.getContext('2d');
      ctx.save(); ctx.globalCompositeOperation = L.lockAlpha ? 'source-atop' : 'source-over'; ctx.drawImage(f, 0, 0); ctx.restore();
      d.history.pixels('Fill', L, cel.canvas, before, { x: 0, y: 0, w: d.width, h: d.height }, cel.created ? cel.key : null);
      this.view.invalidate(); E.emit('layers'); E.emit('frames');
    },
    layerViaCopy() {
      const d = this.doc;
      if (!d.selection.active) return d.duplicateLayer();
      const clip = this.selectionCanvas(false);
      if (!clip) { this.toast('The selected area is empty.'); return; }
      d.change('Layer Via Copy', () => {
        const l = new E.Layer(d.nextLayerName());
        const c = d.newCanvas(); c.getContext('2d').drawImage(clip.canvas, clip.x, clip.y);
        l.keys.push({ frame: d.frame, canvas: c });
        d.layers.splice(d.activeIndex + 1, 0, l); d.activeIndex++;
      });
    },
    selectionOp(label, fn) {
      const s = this.doc.selection, before = s.snapshot();
      fn(s);
      this.doc.history.selection(label, before, s.snapshot());
      E.emit('selection');
    },

    // ---------- files ----------
    async newDocument() {
      if (!(await this.confirmDiscard())) return;
      const presets = [
        ['1920x1080', 'HD 1920 × 1080'], ['3840x2160', '4K 3840 × 2160'], ['2048x2048', 'Square 2048'], ['1080x1080', 'Square 1080'],
        ['2480x3508', 'A4 @ 300 ppi'], ['1080x1920', 'Phone 1080 × 1920'], null,
        ['160x144', 'PixelBoy Screen 160 × 144'], ['16x16', 'Pixel 16 × 16'], ['32x32', 'Pixel 32 × 32'], ['64x64', 'Pixel 64 × 64'], ['128x128', 'Pixel 128 × 128'], ['320x180', 'Pixel 320 × 180'],
      ];
      const last = U.store.get('newdoc', { w: 1920, h: 1080, bg: 'white' });
      const name = el('input', { value: 'Untitled-' + (++this._untitled || (this._untitled = 2)) });
      const w = el('input', { type: 'number', min: 1, max: 16384, value: last.w });
      const h = el('input', { type: 'number', min: 1, max: 16384, value: last.h });
      const preset = E.ui.select({ options: [['', 'Custom'], ...presets], value: '', onChange: v => { if (v) { const [a, b] = v.split('x'); w.value = a; h.value = b; } } });
      const bg = E.ui.select({ options: [['white', 'White'], ['bgcolor', 'Background Color'], ['transparent', 'Transparent']], value: last.bg, onChange: () => { } });
      E.ui.dialog({
        title: 'New Document',
        body: el('div', { class: 'form' }, row('Name', name), row('Preset', preset), row('Width', w, 'px'), row('Height', h, 'px'), row('Background', bg)),
        buttons: [{ label: 'Cancel' }, {
          label: 'Create', primary: true, action: () => {
            const W = U.clamp(parseInt(w.value, 10) || 1, 1, 16384), Hh = U.clamp(parseInt(h.value, 10) || 1, 1, 16384);
            U.store.set('newdoc', { w: W, h: Hh, bg: bg.value });
            const background = bg.value === 'transparent' ? 'transparent' : bg.value === 'bgcolor' ? this.bg : '#ffffff';
            this.setDoc(new E.Doc(W, Hh, { name: name.value || 'Untitled', background }));
            if (W <= 256 && Hh <= 256) this.selectTool('pixel');
          },
        }],
      });
    },
    async openDialog() {
      if (!(await this.confirmDiscard())) return;
      const f = await F.Platform.open(F.FILTERS.open);
      if (f) await this.loadFile(f);
    },
    async loadFile(f) {
      try {
        const doc = await F.openFile(f);
        doc.path = f.path; doc.dirty = false;
        if (!/\.(pixelboy|psd)$/i.test(f.name)) { doc.path = null; doc.format = null; }
        this.setDoc(doc);
        if (doc.frameCount > 1 && !this.timelineVisible) this.toggleTimeline(true);
      } catch (e) { console.error(e); this.toast('Could not open ' + f.name + ': ' + e.message); }
    },
    async openDropped(f) {
      const x = F.ext(f.name);
      if (x === 'abr') return this.importAbrData(f.data, f.name);
      if (x === 'pixelboy' || x === 'psd') { if (await this.confirmDiscard()) await this.loadFile(f); return; }
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(x)) return this.placeImage(f);
    },
    async placeImage(f) {
      try {
        const c = await F.decodeImage(f.data);
        const d = this.doc;
        d.change('Place', () => {
          const l = new E.Layer(F.baseName(f.name));
          const canvas = d.newCanvas();
          const k = Math.min(1, d.width / c.width, d.height / c.height);
          const w = c.width * k, h = c.height * k;
          const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(c, (d.width - w) / 2, (d.height - h) / 2, w, h);
          l.keys.push({ frame: d.frame, canvas });
          d.layers.splice(d.activeIndex + 1, 0, l); d.activeIndex++;
        });
      } catch (e) { this.toast('Could not place ' + f.name); }
    },
    async save(as) {
      const d = this.doc;
      const fmt = d.format === 'psd' && !as ? 'psd' : 'pixelboy';
      if (fmt === 'psd' && d.frameCount > 1) this.toast('PSD files hold one frame — saved the current frame. Use Save As for the full animation.');
      const data = fmt === 'psd' ? F.writePsd(d) : F.writeProject(d);
      const name = F.baseName(d.name) + '.' + fmt;
      const r = await F.Platform.save({ data, name, filters: F.FILTERS[fmt], path: as ? null : d.path });
      if (!r) return;
      d.path = r.path; d.name = r.name; d.format = fmt; d.dirty = false;
      this.updateTitle();
      if (!F.Platform.desktop) this.toast('Saved ' + r.name + ' to your downloads.');
    },
    async savePsd() {
      const d = this.doc;
      if (d.frameCount > 1) this.toast('PSD files hold one frame — saving the current frame.');
      await F.Platform.save({ data: F.writePsd(d), name: F.baseName(d.name) + '.psd', filters: F.FILTERS.psd });
    },
    exportAs() {
      const fmt = E.ui.select({ options: [['png', 'PNG'], ['jpg', 'JPG']], value: U.store.get('exportFmt', 'png'), onChange: () => { } });
      const scale = E.ui.select({ options: [[0.25, '25%'], [0.5, '50%'], [1, '100%'], [2, '200%'], [4, '400%'], [8, '800%']], value: 1, onChange: () => { } });
      const q = el('input', { type: 'number', min: 1, max: 100, value: 90 });
      E.ui.dialog({
        title: 'Export As', body: el('div', { class: 'form' }, row('Format', fmt), row('Scale', scale), row('JPG Quality', q, '%'),
          el('p', { class: 'hint' }, 'Exports the current frame, flattened. 200%+ uses nearest-neighbor for small (pixel art) images.')),
        buttons: [{ label: 'Cancel' }, {
          label: 'Export', primary: true, action: async () => {
            U.store.set('exportFmt', fmt.value);
            const type = fmt.value === 'jpg' ? 'image/jpeg' : 'image/png';
            const blob = await F.exportImage(this.doc, type, U.clamp(q.value / 100, 0.01, 1), Number(scale.value));
            await F.Platform.save({ data: blob, name: F.baseName(this.doc.name) + '.' + fmt.value, filters: F.FILTERS[fmt.value] });
          },
        }],
      });
    },
    exportGif() {
      const scale = E.ui.select({ options: [[0.5, '50%'], [1, '100%'], [2, '200%'], [4, '400%'], [8, '800%']], value: 1, onChange: () => { } });
      const bg = E.ui.select({ options: [['transparent', 'Transparent'], ['white', 'White'], ['bgcolor', 'Background Color']], value: 'transparent', onChange: () => { } });
      const loop = E.ui.check({ label: 'Loop forever', value: true, onChange: () => { } });
      const d = this.doc;
      E.ui.dialog({
        title: 'Export Animated GIF', body: el('div', { class: 'form' }, row('Scale', scale), row('Background', bg), row('', loop),
          el('p', { class: 'hint' }, `${d.frameCount} frame${d.frameCount > 1 ? 's' : ''} at ${d.fps} fps.`)),
        buttons: [{ label: 'Cancel' }, {
          label: 'Export', primary: true, action: async () => {
            const bytes = F.exportGif(d, { scale: Number(scale.value), bg: bg.value === 'transparent' ? null : bg.value === 'white' ? '#ffffff' : this.bg, loop: loop.querySelector('input').checked });
            await F.Platform.save({ data: bytes, name: F.baseName(d.name) + '.gif', filters: F.FILTERS.gif });
          },
        }],
      });
    },
    exportSheet() {
      const d = this.doc;
      const cols = el('input', { type: 'number', min: 1, max: 999, value: Math.min(d.frameCount, 8) });
      const pad = el('input', { type: 'number', min: 0, max: 100, value: 0 });
      const scale = E.ui.select({ options: [[1, '100%'], [2, '200%'], [4, '400%']], value: 1, onChange: () => { } });
      E.ui.dialog({
        title: 'Export Sprite Sheet', body: el('div', { class: 'form' }, row('Columns', cols), row('Padding', pad, 'px'), row('Scale', scale),
          el('p', { class: 'hint' }, `${d.frameCount} frames, each ${d.width} × ${d.height} px, left to right then top to bottom.`)),
        buttons: [{ label: 'Cancel' }, {
          label: 'Export', primary: true, action: async () => {
            const blob = await F.exportSpriteSheet(d, { columns: parseInt(cols.value, 10), padding: parseInt(pad.value, 10) || 0, scale: Number(scale.value) });
            await F.Platform.save({ data: blob, name: F.baseName(d.name) + '-sheet.png', filters: F.FILTERS.png });
          },
        }],
      });
    },
    async importAbr() {
      const f = await F.Platform.open(F.FILTERS.abr);
      if (f) this.importAbrData(f.data, f.name);
    },
    importAbrData(data, name) {
      try {
        const added = E.Brushes.importAbr(data, name);
        E.emit('brushes');
        this.toast(added.length ? `Imported ${added.length} brush${added.length > 1 ? 'es' : ''} from ${name}.` : `No usable brushes found in ${name}.`);
        if (added.length) this.selectPreset(this.toolId === 'eraser' ? 'eraser' : 'brush', added[0].id);
      } catch (e) { console.error(e); this.toast('Could not read ' + name + ': ' + e.message); }
    },
    async importBrushImage() {
      const f = await F.Platform.open(F.FILTERS.image);
      if (!f) return;
      const c = await F.decodeImage(f.data);
      const p = E.Brushes.importImage(c, F.baseName(f.name));
      E.emit('brushes');
      this.selectPreset('brush', p.id);
      this.toast('Created brush “' + p.name + '”.');
    },
    imageSize() {
      const d = this.doc;
      const w = el('input', { type: 'number', min: 1, max: 16384, value: d.width });
      const h = el('input', { type: 'number', min: 1, max: 16384, value: d.height });
      const lock = E.ui.check({ label: 'Constrain proportions', value: true, onChange: () => { } });
      const ratio = d.width / d.height;
      w.addEventListener('input', () => { if (lock.querySelector('input').checked) h.value = Math.max(1, Math.round(w.value / ratio)); });
      h.addEventListener('input', () => { if (lock.querySelector('input').checked) w.value = Math.max(1, Math.round(h.value * ratio)); });
      const rs = E.ui.select({ options: [['smooth', 'Bicubic (smooth)'], ['nearest', 'Nearest Neighbor (hard edges)']], value: d.width <= 256 ? 'nearest' : 'smooth', onChange: () => { } });
      E.ui.dialog({
        title: 'Image Size', body: el('div', { class: 'form' }, row('Width', w, 'px'), row('Height', h, 'px'), row('', lock), row('Resample', rs)),
        buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: () => d.resizeImage(U.clamp(+w.value | 0, 1, 16384), U.clamp(+h.value | 0, 1, 16384), rs.value === 'smooth') }],
      });
    },
    canvasSize() {
      const d = this.doc;
      const w = el('input', { type: 'number', min: 1, max: 16384, value: d.width });
      const h = el('input', { type: 'number', min: 1, max: 16384, value: d.height });
      let anchor = [0.5, 0.5];
      const grid = el('div', { class: 'anchor-grid' });
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        const c = el('button', { class: 'anchor' + (x === 1 && y === 1 ? ' on' : '') });
        c.addEventListener('click', (e) => { e.preventDefault(); grid.querySelectorAll('.anchor').forEach(a => a.classList.remove('on')); c.classList.add('on'); anchor = [x / 2, y / 2]; });
        grid.append(c);
      }
      E.ui.dialog({
        title: 'Canvas Size', body: el('div', { class: 'form' }, row('Width', w, 'px'), row('Height', h, 'px'), row('Anchor', grid)),
        buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, action: () => d.resizeCanvas(U.clamp(+w.value | 0, 1, 16384), U.clamp(+h.value | 0, 1, 16384), anchor[0], anchor[1]) }],
      });
    },
    about() {
      E.ui.dialog({
        title: 'About PixelBoy', body: el('div', { class: 'about' },
          el('div', { class: 'about-logo' }),
          el('p', {}, el('b', {}, 'PixelBoy '), 'version ' + (this.version || window.PIXELBOY_VERSION)),
          el('p', {}, 'A pocket-sized painting and animation program with Photoshop-style tools and shortcuts and a Flash-style timeline.'),
          el('p', { class: 'hint' }, 'Includes ag-psd (MIT) for PSD/ABR files and gifenc (MIT) for GIF export.')),
      });
    },

    // ---------- desktop integration & updates ----------
    async setupDesktop() {
      const dk = window.pixelboyDesktop;
      if (!dk) { this.version = window.PIXELBOY_VERSION; return; }
      this.version = await dk.version();
      dk.onUpdateStatus((s) => this.onUpdate(s));
      dk.onOpenPath(async (p) => { if (await this.confirmDiscard()) { const f = await F.Platform.readPath(p); if (f) this.loadFile(f); } });
      const pending = await dk.pendingOpenPath();
      if (pending) { const f = await F.Platform.readPath(pending); if (f) this.loadFile(f); }
    },
    onUpdate(s) {
      this.updateState = s;
      const st = this.statusUpdate; st.innerHTML = ''; st.className = 'status-update';
      if (s.state === 'checking') st.textContent = 'Checking for updates…';
      else if (s.state === 'available') st.textContent = `Downloading update ${s.version}…`;
      else if (s.state === 'downloading') st.textContent = `Downloading update… ${s.percent}%`;
      else if (s.state === 'downloaded') {
        st.classList.add('ready');
        st.append(`Update ${s.version} is ready. `, el('button', { class: 'btn small primary', onclick: () => this.installUpdate() }, 'Restart to Update'));
      } else if (s.state === 'none') { st.textContent = ''; if (this._manualCheck) this.toast(`You're up to date (version ${this.version}).`); }
      else if (s.state === 'error') { st.textContent = ''; if (this._manualCheck) this.toast('Update check failed: ' + s.message); }
      if (s.state !== 'checking') this._manualCheck = false;
    },
    async installUpdate() {
      if (this.doc.dirty && !(await E.ui.confirm('Restart to update', 'You have unsaved changes. Restart anyway?', 'Restart'))) return;
      window.onbeforeunload = null;
      window.pixelboyDesktop.installUpdate();
    },
    async checkUpdates() {
      const dk = window.pixelboyDesktop;
      if (!dk) { this.toast('The web version updates automatically when a new version is uploaded.'); return; }
      this._manualCheck = true;
      const r = await dk.checkForUpdates();
      if (r && r.state === 'dev') { this._manualCheck = false; this.toast(r.message); }
      if (r && r.state === 'error') { this._manualCheck = false; this.toast('Update check failed: ' + r.message); }
    },
  };

  // small form helpers
  function row(label, input, unit) { return el('label', { class: 'form-row' }, el('span', { class: 'form-label' }, label), input, unit ? el('span', { class: 'form-unit' }, unit) : null); }
  function prompt1(title, label, value) {
    return new Promise(res => {
      const inp = el('input', { value });
      E.ui.dialog({ title, body: el('div', { class: 'form' }, row(label, inp)), onClose: () => res(null), buttons: [{ label: 'Cancel', action: () => res(null) }, { label: 'OK', primary: true, action: () => res(inp.value.trim()) }] });
    });
  }

  // ---------- actions & default shortcuts (Photoshop / Flash conventions) ----------
  function registerActions() {
    const R = (id, label, cat, keys, run, opts) => H.register(id, label, cat, keys, run, opts);
    const d = () => app.doc;
    // File
    R('file.new', 'New…', 'File', 'Ctrl+N', () => app.newDocument());
    R('file.open', 'Open…', 'File', 'Ctrl+O', () => app.openDialog());
    R('file.save', 'Save', 'File', 'Ctrl+S', () => app.save(false));
    R('file.saveAs', 'Save As…', 'File', 'Ctrl+Shift+S', () => app.save(true));
    R('file.savePsd', 'Save a Copy as PSD…', 'File', 'Ctrl+Alt+S', () => app.savePsd());
    R('file.place', 'Place Image as Layer…', 'File', [], async () => { const f = await F.Platform.open(F.FILTERS.image); if (f) app.placeImage(f); });
    R('file.exportAs', 'Export As (PNG / JPG)…', 'File', 'Ctrl+Alt+Shift+W', () => app.exportAs());
    R('file.exportGif', 'Export Animated GIF…', 'File', 'Ctrl+Alt+Shift+S', () => app.exportGif());
    R('file.exportSheet', 'Export Sprite Sheet…', 'File', [], () => app.exportSheet());
    R('file.importAbr', 'Import Brushes (.abr)…', 'File', [], () => app.importAbr());
    R('file.importBrushImage', 'New Brush Tip from Image…', 'File', [], () => app.importBrushImage());
    // Edit
    R('edit.undo', 'Undo', 'Edit', 'Ctrl+Z', () => { cancelTool(); d().history.undo(); }, { repeat: true });
    R('edit.redo', 'Redo', 'Edit', ['Ctrl+Shift+Z', 'Ctrl+Y'], () => d().history.redo(), { repeat: true });
    R('edit.stepBack', 'Step Backward', 'Edit', 'Ctrl+Alt+Z', () => { cancelTool(); d().history.undo(); }, { repeat: true });
    R('edit.cut', 'Cut', 'Edit', 'Ctrl+X', () => app.cut());
    R('edit.copy', 'Copy', 'Edit', 'Ctrl+C', () => app.copy(false));
    R('edit.copyMerged', 'Copy Merged', 'Edit', 'Ctrl+Shift+C', () => app.copy(true));
    H.register('edit.paste', 'Paste', 'Edit', 'Ctrl+V', () => app.pasteFromMenu()).nativePaste = true;
    R('edit.clear', 'Clear', 'Edit', ['Delete', 'Backspace'], () => app.clearSelection());
    R('edit.fillFg', 'Fill with Foreground Color', 'Edit', 'Alt+Backspace', () => app.fill(app.fg));
    R('edit.fillBg', 'Fill with Background Color', 'Edit', 'Ctrl+Backspace', () => app.fill(app.bg));
    R('edit.flipLayerH', 'Flip Layer Horizontal', 'Edit', [], () => d().transformCel('Flip Horizontal', (c, s) => { c.translate(d().width, 0); c.scale(-1, 1); c.drawImage(s, 0, 0); }));
    R('edit.flipLayerV', 'Flip Layer Vertical', 'Edit', [], () => d().transformCel('Flip Vertical', (c, s) => { c.translate(0, d().height); c.scale(1, -1); c.drawImage(s, 0, 0); }));
    R('edit.shortcuts', 'Keyboard Shortcuts…', 'Edit', 'Ctrl+Alt+Shift+K', () => H.openEditor());
    // Image
    R('image.size', 'Image Size…', 'Image', 'Ctrl+Alt+I', () => app.imageSize());
    R('image.canvasSize', 'Canvas Size…', 'Image', 'Ctrl+Alt+C', () => app.canvasSize());
    R('image.flipH', 'Flip Canvas Horizontal', 'Image', [], () => d().transformAll('Flip Canvas Horizontal', (c, s) => { c.translate(d().width, 0); c.scale(-1, 1); c.drawImage(s, 0, 0); }));
    R('image.flipV', 'Flip Canvas Vertical', 'Image', [], () => d().transformAll('Flip Canvas Vertical', (c, s) => { c.translate(0, d().height); c.scale(1, -1); c.drawImage(s, 0, 0); }));
    R('image.rotate180', 'Rotate Canvas 180°', 'Image', [], () => d().transformAll('Rotate 180°', (c, s) => { c.translate(d().width, d().height); c.rotate(Math.PI); c.drawImage(s, 0, 0); }));
    // Layer
    R('layer.new', 'New Layer', 'Layer', ['Ctrl+Shift+N', 'Ctrl+Alt+Shift+N'], () => d().addLayer());
    R('layer.duplicate', 'Layer Via Copy / Duplicate Layer', 'Layer', 'Ctrl+J', () => app.layerViaCopy());
    R('layer.delete', 'Delete Layer', 'Layer', [], () => d().deleteLayer());
    R('layer.mergeDown', 'Merge Down', 'Layer', 'Ctrl+E', () => d().mergeDown());
    R('layer.flatten', 'Flatten Image', 'Layer', [], () => d().flattenImage());
    R('layer.up', 'Bring Forward', 'Layer', 'Ctrl+]', () => d().moveLayer(d().activeIndex, d().activeIndex + 1));
    R('layer.down', 'Send Backward', 'Layer', 'Ctrl+[', () => d().moveLayer(d().activeIndex, d().activeIndex - 1));
    R('layer.selectAbove', 'Select Layer Above', 'Layer', 'Alt+]', () => { d().activeIndex = Math.min(d().layers.length - 1, d().activeIndex + 1); E.emit('layers'); E.emit('frames'); });
    R('layer.selectBelow', 'Select Layer Below', 'Layer', 'Alt+[', () => { d().activeIndex = Math.max(0, d().activeIndex - 1); E.emit('layers'); E.emit('frames'); });
    R('layer.lockAlpha', 'Lock Transparent Pixels', 'Layer', '/', () => { const L = d().activeLayer; d().setLayerProps(L, { lockAlpha: !L.lockAlpha }, 'Lock Transparency'); });
    R('layer.toggleVisible', 'Show / Hide Layer', 'Layer', [], () => { const L = d().activeLayer; d().setLayerProps(L, { visible: !L.visible }, 'Toggle Visibility'); });
    // Select
    R('select.all', 'All', 'Select', 'Ctrl+A', () => app.selectionOp('Select All', s => s.selectAll()));
    R('select.deselect', 'Deselect', 'Select', 'Ctrl+D', () => { if (d().selection.active) app.selectionOp('Deselect', s => s.clear()); });
    R('select.reselect', 'Reselect', 'Select', 'Ctrl+Shift+D', () => { const s = d().selection; if (s.lastSnapshot) app.selectionOp('Reselect', s2 => s2.restore(s.lastSnapshot)); });
    R('select.inverse', 'Inverse', 'Select', 'Ctrl+Shift+I', () => app.selectionOp('Inverse', s => s.invert()));
    // View
    R('view.zoomIn', 'Zoom In', 'View', ['Ctrl+=', 'Ctrl++', 'Ctrl+Shift+='], () => app.view.zoomStep(1), { repeat: true });
    R('view.zoomOut', 'Zoom Out', 'View', 'Ctrl+-', () => app.view.zoomStep(-1), { repeat: true });
    R('view.fit', 'Fit on Screen', 'View', 'Ctrl+0', () => app.view.fit());
    R('view.actual', '100%', 'View', 'Ctrl+1', () => app.view.actualPixels());
    R('view.flip', 'Flip View Horizontal', 'View', [], () => app.view.flipView());
    R('view.resetRotation', 'Reset Rotation', 'View', [], () => app.view.rotateBy(-app.view.rot));
    R('view.pixelGrid', 'Pixel Grid', 'View', "Ctrl+'", () => { app.view.pixelGrid = !app.view.pixelGrid; app.view.changed(); app.saveUi(); });
    R('view.theme', 'Classic Light Theme', 'View', [], () => { app.theme = app.theme === 'classic' ? 'night' : 'classic'; document.documentElement.dataset.theme = app.theme; app.saveUi(); app.view.changed(); app.timeline.draw(); });
    R('view.panels', 'Show / Hide Panels', 'View', 'Tab', () => document.getElementById('app').classList.toggle('panels-hidden'));
    // Window / Animation (Flash conventions)
    R('window.timeline', 'Timeline', 'Window', 'Ctrl+Alt+T', () => app.toggleTimeline());
    R('window.onion', 'Onion Skin', 'Animation', 'Alt+Shift+O', () => { const o = app.view.onion; o.enabled = !o.enabled; app.saveUi(); app.view.invalidate(); app.timeline.onionBtn.classList.toggle('on', o.enabled); app.timeline.draw(); });
    R('anim.play', 'Play / Stop', 'Animation', 'Enter', () => { if (app.timelineVisible) app.togglePlay(); });
    R('anim.prev', 'Previous Frame', 'Animation', ',', () => { if (app.playing) app.stop(); d().setFrame(d().frame - 1); }, { repeat: true });
    R('anim.next', 'Next Frame', 'Animation', '.', () => { if (app.playing) app.stop(); d().setFrame(d().frame + 1); }, { repeat: true });
    R('anim.first', 'First Frame', 'Animation', 'Home', () => d().setFrame(0));
    R('anim.last', 'Last Frame', 'Animation', 'End', () => d().setFrame(d().frameCount - 1));
    R('anim.insertFrame', 'Insert Frame', 'Animation', 'F5', () => app.frameAction(() => d().insertFrame()));
    R('anim.removeFrame', 'Remove Frame', 'Animation', 'Shift+F5', () => app.frameAction(() => d().removeFrame()));
    R('anim.keyframe', 'Insert Keyframe', 'Animation', 'F6', () => app.frameAction(() => d().insertKeyframe(false)));
    R('anim.blankKeyframe', 'Insert Blank Keyframe', 'Animation', 'F7', () => app.frameAction(() => d().insertKeyframe(true)));
    R('anim.clearKeyframe', 'Clear Keyframe', 'Animation', 'Shift+F6', () => app.frameAction(() => d().clearKeyframe()));
    // Tools
    const { GROUPS, TOOLS } = E.Tools;
    for (const g of GROUPS) {
      const names = g.tools.map(t => TOOLS[t].name.replace(' Tool', '')).join(' / ');
      R('tool.' + g.id, names, 'Tools', g.key, () => app.selectTool(app.groupTool[g.id]));
      if (g.tools.length > 1) R('tool.cycle.' + g.id, 'Cycle ' + names, 'Tools', 'Shift+' + g.key, () => {
        const i = g.tools.indexOf(app.groupTool[g.id]);
        app.selectTool(g.tools.includes(app.toolId) ? g.tools[(i + 1) % g.tools.length] : app.groupTool[g.id]);
      });
    }
    for (const id in TOOLS) R('tool.select.' + id, TOOLS[id].name + ' (direct)', 'Tools', [], () => app.selectTool(id));
    // Brush & color
    const brushTool = () => { const t = E.Tools.TOOLS[app.toolId]; return t.bracket ? t : null; };
    R('brush.smaller', 'Decrease Brush Size', 'Brush', '[', () => { const t = brushTool(); if (t) t.bracket(-1, false); }, { repeat: true });
    R('brush.bigger', 'Increase Brush Size', 'Brush', ']', () => { const t = brushTool(); if (t) t.bracket(1, false); }, { repeat: true });
    R('brush.softer', 'Decrease Brush Hardness', 'Brush', 'Shift+[', () => { const t = brushTool(); if (t) t.bracket(-1, true); }, { repeat: true });
    R('brush.harder', 'Increase Brush Hardness', 'Brush', 'Shift+]', () => { const t = brushTool(); if (t) t.bracket(1, true); }, { repeat: true });
    R('color.swap', 'Switch Foreground/Background Colors', 'Brush', 'X', () => { const f = app.fg; app.fg = app.bg; app.bg = f; E.emit('color'); app.saveUi(); });
    R('color.default', 'Default Foreground/Background Colors', 'Brush', 'D', () => { app.fg = '#000000'; app.bg = '#ffffff'; E.emit('color'); app.saveUi(); });
    R('color.picker', 'Foreground Color Picker…', 'Brush', [], async () => { const c = await E.ColorPicker.open(app.fg); if (c) app.setFg(c); });
    // Nudge (Move tool moves pixels; selection tools move the outline)
    const nudge = (dx, dy) => () => {
      const t = E.Tools.TOOLS[app.toolId];
      if (app.toolId === 'move') t.nudge(dx, dy);
      else if (t.selection && d().selection.active) app.selectionOp('Nudge Selection', s => s.translate(dx, dy));
    };
    R('nudge.left', 'Nudge Left', 'Move', 'Left', nudge(-1, 0), { repeat: true });
    R('nudge.right', 'Nudge Right', 'Move', 'Right', nudge(1, 0), { repeat: true });
    R('nudge.up', 'Nudge Up', 'Move', 'Up', nudge(0, -1), { repeat: true });
    R('nudge.down', 'Nudge Down', 'Move', 'Down', nudge(0, 1), { repeat: true });
    R('nudge.left10', 'Nudge Left 10px', 'Move', 'Shift+Left', nudge(-10, 0), { repeat: true });
    R('nudge.right10', 'Nudge Right 10px', 'Move', 'Shift+Right', nudge(10, 0), { repeat: true });
    R('nudge.up10', 'Nudge Up 10px', 'Move', 'Shift+Up', nudge(0, -10), { repeat: true });
    R('nudge.down10', 'Nudge Down 10px', 'Move', 'Shift+Down', nudge(0, 10), { repeat: true });
    // Help
    R('help.updates', 'Check for Updates…', 'Help', [], () => app.checkUpdates());
    R('help.about', 'About PixelBoy', 'Help', [], () => app.about());
    R('help.website', 'PixelBoy on GitHub (Downloads)…', 'Help', [], () => window.open('https://github.com/keithburgun/pixelboy/releases/latest', '_blank'));
  }
  function cancelTool() { const t = app.activeTool; if (t && t.cancel) { t.cancel(); app.activeTool = null; } }

  function buildMenus() {
    const d = () => app.doc;
    const a = (action, label) => ({ action, label: label || H.byId[action].label });
    return [
      { label: 'File', items: () => [a('file.new'), a('file.open'), a('file.place'), null, a('file.save'), a('file.saveAs'), a('file.savePsd'), null, a('file.exportAs'), a('file.exportGif'), a('file.exportSheet'), null, a('file.importAbr'), a('file.importBrushImage')] },
      {
        label: 'Edit', items: () => [
          Object.assign(a('edit.undo', 'Undo' + (d().history.canUndo() ? ' ' + d().history.stack[d().history.index - 1].label : '')), { enabled: () => d().history.canUndo() }),
          Object.assign(a('edit.redo', 'Redo' + (d().history.canRedo() ? ' ' + d().history.stack[d().history.index].label : '')), { enabled: () => d().history.canRedo() }),
          a('edit.stepBack'), null, a('edit.cut'), a('edit.copy'), a('edit.copyMerged'), a('edit.paste'), a('edit.clear'), null,
          a('edit.fillFg'), a('edit.fillBg'), null, a('edit.flipLayerH'), a('edit.flipLayerV'), null, a('edit.shortcuts')],
      },
      { label: 'Image', items: () => [a('image.size'), a('image.canvasSize'), null, a('image.rotate180'), a('image.flipH'), a('image.flipV')] },
      {
        label: 'Layer', items: () => [a('layer.new'), a('layer.duplicate'), a('layer.delete'), null,
          Object.assign(a('layer.lockAlpha'), { checked: () => d().activeLayer.lockAlpha }), a('layer.toggleVisible'), null,
          a('layer.up'), a('layer.down'), a('layer.selectAbove'), a('layer.selectBelow'), null, a('layer.mergeDown'), a('layer.flatten')],
      },
      { label: 'Select', items: () => [a('select.all'), a('select.deselect'), a('select.reselect'), a('select.inverse')] },
      {
        label: 'View', items: () => [a('view.zoomIn'), a('view.zoomOut'), a('view.fit'), a('view.actual'), null,
          Object.assign(a('view.flip'), { checked: () => app.view.flip }), a('view.resetRotation'), null,
          Object.assign(a('view.pixelGrid'), { checked: () => app.view.pixelGrid }), a('view.panels'), null,
          Object.assign(a('view.theme'), { checked: () => app.theme === 'classic' })],
      },
      {
        label: 'Animation', items: () => [Object.assign(a('window.timeline', 'Show Timeline'), { checked: () => app.timelineVisible }), Object.assign(a('window.onion'), { checked: () => app.view.onion.enabled }), null,
          a('anim.play'), a('anim.prev'), a('anim.next'), null, a('anim.insertFrame'), a('anim.removeFrame'), a('anim.keyframe'), a('anim.blankKeyframe'), a('anim.clearKeyframe')],
      },
      { label: 'Help', items: () => [a('help.updates'), a('help.website'), a('edit.shortcuts'), null, a('help.about')] },
    ];
  }

  window.addEventListener('DOMContentLoaded', () => app.init().catch(e => { console.error(e); alert('PixelBoy failed to start: ' + e.message); }));
})(window.E);
