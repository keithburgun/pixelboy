// HSB color picker: saturation/brightness square + hue strip, with HSB/RGB/hex fields (Photoshop style).
(function (E) {
  const U = E.U;

  class ColorPicker {
    constructor(opts = {}) {
      this.onChange = opts.onChange || (() => { });
      this.hsv = { h: 0, s: 0, v: 0 };
      this.full = !!opts.full;
      const sq = this.full ? 256 : 180;
      this.sv = U.el('canvas', { class: 'cp-sv', width: sq, height: sq });
      this.hue = U.el('canvas', { class: 'cp-hue', width: 18, height: sq });
      this.svMark = U.el('div', { class: 'cp-sv-mark' });
      this.hueMark = U.el('div', { class: 'cp-hue-mark' });
      const svWrap = U.el('div', { class: 'cp-sv-wrap', style: { width: sq + 'px', height: sq + 'px' } }, this.sv, this.svMark);
      const hueWrap = U.el('div', { class: 'cp-hue-wrap', style: { height: sq + 'px' } }, this.hue, this.hueMark);
      this.el = U.el('div', { class: 'cp' + (this.full ? ' cp-full' : '') }, svWrap, hueWrap);
      this.drawHue();
      this.drag(this.sv, (x, y) => { this.hsv.s = U.clamp(x, 0, 1); this.hsv.v = U.clamp(1 - y, 0, 1); this.changed(false); });
      this.drag(this.hue, (x, y) => { this.hsv.h = U.clamp(y, 0, 0.9999) * 360; this.changed(false); });
      if (this.full) this.buildFields();
      else {
        this.hex = U.el('input', { class: 'cp-hex', spellcheck: 'false', maxlength: 7 });
        this.hex.addEventListener('change', () => { const c = U.hexToRgb(this.hex.value); if (c) { this.set(U.rgbToHex(c)); this.onChange(this.hexValue(), true); } });
        this.el.append(U.el('div', { class: 'cp-side' }, this.hex));
      }
    }
    drag(canvas, fn) {
      const handle = (e) => { const r = canvas.getBoundingClientRect(); fn((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
      canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId); handle(e);
        const mv = (ev) => handle(ev);
        const up = () => { canvas.removeEventListener('pointermove', mv); canvas.removeEventListener('pointerup', up); this.onChange(this.hexValue(), true); };
        canvas.addEventListener('pointermove', mv); canvas.addEventListener('pointerup', up);
      });
    }
    drawHue() {
      const c = this.hue.getContext('2d'), g = c.createLinearGradient(0, 0, 0, this.hue.height);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
      c.fillStyle = g; c.fillRect(0, 0, this.hue.width, this.hue.height);
    }
    drawSV() {
      const c = this.sv.getContext('2d'), w = this.sv.width, h = this.sv.height;
      c.fillStyle = `hsl(${this.hsv.h},100%,50%)`; c.fillRect(0, 0, w, h);
      let g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    hexValue() { return U.rgbToHex(U.hsvToRgb(this.hsv)); }
    set(hex) {
      const rgb = U.hexToRgb(hex); if (!rgb) return;
      const hsv = U.rgbToHsv(rgb);
      if (hsv.s === 0 || hsv.v === 0) hsv.h = this.hsv.h; // keep hue for grays
      this.hsv = hsv;
      this.update();
    }
    changed(final) { this.update(); this.onChange(this.hexValue(), final); }
    update() {
      this.drawSV();
      this.svMark.style.left = (this.hsv.s * 100) + '%';
      this.svMark.style.top = ((1 - this.hsv.v) * 100) + '%';
      this.hueMark.style.top = (this.hsv.h / 360 * 100) + '%';
      const hex = this.hexValue();
      if (this.hex && document.activeElement !== this.hex) this.hex.value = hex.slice(1).toUpperCase();
      if (this.fields) {
        const rgb = U.hsvToRgb(this.hsv);
        const vals = { H: Math.round(this.hsv.h), S: Math.round(this.hsv.s * 100), B: Math.round(this.hsv.v * 100), R: rgb.r, G: rgb.g, B2: rgb.b };
        for (const k in this.fields) if (document.activeElement !== this.fields[k]) this.fields[k].value = vals[k];
        this.newSwatch.style.background = hex;
      }
    }
    buildFields() {
      this.fields = {};
      const mk = (key, label, max, unit) => {
        const inp = U.el('input', { type: 'number', min: 0, max, class: 'cp-num' });
        inp.addEventListener('change', () => this.fromFields(key));
        this.fields[key] = inp;
        return U.el('label', { class: 'cp-field' }, U.el('span', {}, label), inp, U.el('span', { class: 'cp-unit' }, unit || ''));
      };
      this.newSwatch = U.el('div', { class: 'cp-swatch-new', title: 'new' });
      this.oldSwatch = U.el('div', { class: 'cp-swatch-old', title: 'current' });
      this.hex = U.el('input', { class: 'cp-hex', spellcheck: 'false', maxlength: 7 });
      this.hex.addEventListener('change', () => { const c = U.hexToRgb(this.hex.value); if (c) { this.set(U.rgbToHex(c)); this.onChange(this.hexValue(), true); } });
      const side = U.el('div', { class: 'cp-side' },
        U.el('div', { class: 'cp-swatches' }, U.el('div', { class: 'cp-swatch-label' }, 'new'), this.newSwatch, this.oldSwatch, U.el('div', { class: 'cp-swatch-label' }, 'current')),
        U.el('div', { class: 'cp-fields' },
          mk('H', 'H:', 360, '°'), mk('R', 'R:', 255),
          mk('S', 'S:', 100, '%'), mk('G', 'G:', 255),
          mk('B', 'B:', 100, '%'), mk('B2', 'B:', 255)),
        U.el('label', { class: 'cp-field cp-hexrow' }, U.el('span', {}, '#'), this.hex));
      this.el.append(side);
    }
    fromFields(key) {
      const f = this.fields, n = (k) => Number(f[k].value) || 0;
      if (key === 'H' || key === 'S' || key === 'B') this.hsv = { h: U.clamp(n('H'), 0, 359.99), s: U.clamp(n('S'), 0, 100) / 100, v: U.clamp(n('B'), 0, 100) / 100 };
      else this.set(U.rgbToHex({ r: U.clamp(n('R'), 0, 255), g: U.clamp(n('G'), 0, 255), b: U.clamp(n('B2'), 0, 255) }));
      this.changed(true);
    }
  }

  // Modal picker; resolves to a hex string or null on cancel.
  ColorPicker.open = function (initial, title = 'Color Picker') {
    return new Promise((resolve) => {
      let value = initial;
      const cp = new ColorPicker({ full: true, onChange: (hex) => { value = hex; } });
      cp.set(initial);
      cp.oldSwatch.style.background = initial;
      cp.oldSwatch.addEventListener('click', () => { cp.set(initial); value = initial; });
      E.ui.dialog({
        title, cls: 'cp-dialog', body: [cp.el],
        buttons: [{ label: 'Cancel', action: () => resolve(null) }, { label: 'OK', primary: true, action: () => resolve(value) }],
        onClose: () => resolve(null),
      });
    });
  };

  E.ColorPicker = ColorPicker;
})(window.E);
