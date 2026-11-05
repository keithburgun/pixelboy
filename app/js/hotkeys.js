// Keyboard shortcuts: action registry, rebindable keymap (saved locally), and the shortcuts editor.
(function (E) {
  const U = E.U;

  const CODE_NAMES = {
    BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'",
    Minus: '-', Equal: '=', Backquote: '`', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Backspace: 'Backspace',
    Delete: 'Delete', Tab: 'Tab', Escape: 'Esc', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert',
    NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.',
  };
  function keyName(e) {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad\d$/.test(c)) return c.slice(6);
    if (/^F\d{1,2}$/.test(c)) return c;
    if (CODE_NAMES[c]) return CODE_NAMES[c];
    if (e.key && e.key.length === 1) return e.key.toUpperCase();
    return null;
  }
  const MOD_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS']);
  function comboFromEvent(e) {
    if (MOD_KEYS.has(e.key)) return null;
    const k = keyName(e);
    if (!k) return null;
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    parts.push(k);
    return parts.join('+');
  }

  const Hotkeys = {
    actions: [],
    byId: {},
    map: {},  // id -> [combo, ...]
    register(id, label, cat, defaults, run, opts = {}) {
      const a = { id, label, cat, defaults: [].concat(defaults || []), run, repeat: !!opts.repeat };
      this.actions.push(a); this.byId[id] = a;
      if (!this.map[id]) this.map[id] = a.defaults.slice();
      return a;
    },
    load() {
      const saved = U.store.get('keymap', null);
      if (saved && typeof saved === 'object') for (const id in saved) if (this.byId[id]) this.map[id] = saved[id];
    },
    save() {
      const diff = {};
      for (const a of this.actions) {
        const cur = this.map[a.id] || [];
        if (cur.join('|') !== a.defaults.join('|')) diff[a.id] = cur;
      }
      U.store.set('keymap', diff);
      E.emit('keymap');
    },
    resetAll() { for (const a of this.actions) this.map[a.id] = a.defaults.slice(); this.save(); },
    find(combo) { for (const a of this.actions) if ((this.map[a.id] || []).includes(combo)) return a; return null; },
    label(id) { const k = this.map[id]; return k && k.length ? k[0] : ''; },
    run(id) { const a = this.byId[id]; if (a) a.run(); },
    comboFromEvent,
    // Returns true if handled
    handle(e) {
      const combo = comboFromEvent(e);
      if (!combo) return false;
      const a = this.find(combo);
      if (!a) return false;
      if (e.repeat && !a.repeat) { e.preventDefault(); return true; }
      e.preventDefault();
      a.run(e);
      return true;
    },

    openEditor() {
      const self = this;
      let draft = JSON.parse(JSON.stringify(this.map));
      let filter = '';
      const list = U.el('div', { class: 'hk-list' });
      const note = U.el('div', { class: 'hk-note' });
      const findIn = (combo, exceptId) => { for (const a of self.actions) if (a.id !== exceptId && (draft[a.id] || []).includes(combo)) return a; return null; };
      function render() {
        list.innerHTML = '';
        const cats = [...new Set(self.actions.map(a => a.cat))];
        for (const cat of cats) {
          const acts = self.actions.filter(a => a.cat === cat && (!filter || a.label.toLowerCase().includes(filter) || (draft[a.id] || []).join(' ').toLowerCase().includes(filter)));
          if (!acts.length) continue;
          list.append(U.el('div', { class: 'hk-cat' }, cat));
          for (const a of acts) {
            const row = U.el('div', { class: 'hk-row' }, U.el('div', { class: 'hk-label' }, a.label));
            const keys = draft[a.id] || [];
            for (let i = 0; i < 2; i++) row.append(keyField(a, i, keys[i]));
            list.append(row);
          }
        }
      }
      function keyField(a, i, combo) {
        const f = U.el('button', { class: 'hk-key' + (combo ? '' : ' empty') }, combo || (i === 0 ? 'None' : '+ Add'));
        const clear = U.el('span', { class: 'hk-clear', title: 'Remove shortcut' }, '×');
        if (combo) f.append(clear);
        clear.addEventListener('click', (ev) => { ev.stopPropagation(); draft[a.id] = (draft[a.id] || []).filter(k => k !== combo); render(); });
        f.addEventListener('click', () => {
          f.textContent = 'Press keys…'; f.classList.add('recording');
          note.textContent = 'Press a key combination. Esc cancels.';
          const onKey = (ev) => {
            ev.preventDefault(); ev.stopPropagation();
            if (ev.key === 'Escape' && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) { cleanup(); render(); note.textContent = ''; return; }
            const c = comboFromEvent(ev);
            if (!c) return;
            cleanup();
            const other = findIn(c, a.id);
            if (other) { draft[other.id] = draft[other.id].filter(k => k !== c); note.textContent = `${c} was removed from “${other.label}”.`; }
            else note.textContent = '';
            const arr = (draft[a.id] || []).slice();
            arr[i] = c;
            draft[a.id] = [...new Set(arr.filter(Boolean))];
            render();
          };
          const cleanup = () => window.removeEventListener('keydown', onKey, true);
          window.addEventListener('keydown', onKey, true);
        });
        return f;
      }
      const search = U.el('input', { type: 'search', placeholder: 'Search shortcuts', class: 'hk-search' });
      search.addEventListener('input', () => { filter = search.value.toLowerCase().trim(); render(); });
      render();
      E.ui.dialog({
        title: 'Keyboard Shortcuts',
        cls: 'hk-dialog',
        body: [U.el('div', { class: 'hk-top' }, search, U.el('button', { class: 'btn', onclick: () => { draft = {}; self.actions.forEach(a => draft[a.id] = a.defaults.slice()); note.textContent = 'Restored Photoshop-style defaults (not saved until you click OK).'; render(); } }, 'Reset to Defaults')),
          U.el('div', { class: 'hk-tip' }, 'Number keys set opacity (1 = 10%, 5 = 50%, 0 = 100%; type two digits quickly for exact values). Shift + numbers sets flow.'),
          list, note],
        buttons: [
          { label: 'Cancel' },
          { label: 'OK', primary: true, action: () => { self.map = draft; self.save(); } },
        ],
      });
      setTimeout(() => search.focus(), 30);
    },
  };

  E.Hotkeys = Hotkeys;
})(window.E);
