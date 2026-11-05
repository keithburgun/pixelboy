// Event bus + undo/redo history.
(function (E) {
  const U = E.U;
  const listeners = {};
  E.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  E.emit = (ev, data) => { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

  const MAX = 80;

  class History {
    constructor(doc) { this.doc = doc; this.stack = []; this.index = 0; }
    push(entry) {
      this.stack.length = this.index;
      this.stack.push(entry);
      if (this.stack.length > MAX) this.stack.shift();
      this.index = this.stack.length;
      this.doc.dirty = true;
      E.emit('history'); E.emit('dirty');
    }
    structural(label, before, after) {
      const doc = this.doc;
      this.push({ label, undo: () => doc.restore(before), redo: () => doc.restore(after) });
    }
    // Record a pixel edit. beforeFull: full-size copy of `canvas` taken before the edit.
    pixels(label, layer, canvas, beforeFull, rect, created) {
      const doc = this.doc;
      const r = rect && U.rectClip(rect, canvas.width, canvas.height);
      if (!r && !created) return;
      const rr = r || { x: 0, y: 0, w: 1, h: 1 };
      const before = U.cropCanvas(beforeFull, rr), after = U.cropCanvas(canvas, rr);
      const frame = created ? created.frame : null;
      const put = (img) => {
        const ctx = canvas.getContext('2d');
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(rr.x, rr.y, rr.w, rr.h); ctx.drawImage(img, rr.x, rr.y); ctx.restore();
      };
      this.push({
        label,
        undo: () => {
          put(before);
          if (created) { const i = layer.keys.findIndex(k => k.canvas === canvas); if (i >= 0) layer.keys.splice(i, 1); }
          E.emit('render'); E.emit('layers'); E.emit('frames');
        },
        redo: () => {
          if (created && !layer.keys.some(k => k.canvas === canvas)) { layer.keys.push({ frame, canvas }); layer.sortKeys(); }
          put(after);
          E.emit('render'); E.emit('layers'); E.emit('frames');
        },
      });
    }
    selection(label, before, after) {
      const doc = this.doc;
      const apply = (s) => { doc.selection.restore(s); E.emit('selection'); E.emit('render'); };
      this.push({ label, undo: () => apply(before), redo: () => apply(after) });
    }
    canUndo() { return this.index > 0; }
    canRedo() { return this.index < this.stack.length; }
    undo() { if (!this.canUndo()) return; this.index--; this.stack[this.index].undo(); this.doc.dirty = true; E.emit('history'); E.emit('dirty'); }
    redo() { if (!this.canRedo()) return; this.stack[this.index].redo(); this.index++; this.doc.dirty = true; E.emit('history'); E.emit('dirty'); }
  }
  E.History = History;
})(window.E);
