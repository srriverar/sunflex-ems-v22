/* ──────────────────────────────────────────────────────────────────────────
   Dropdowns: a plain <select>'s open list, drawn in the site's own panel
   Load it on every page beside dropdown.css (tools: just before shared.js).
   No setup: it listens on the document, so a select added later is covered.

   The browser draws a select's open list itself, in its own font and
   colours, which no stylesheet can reach. So a mouse press on a select opens
   a .combo-list instead (dropdown.css), the same panel a searchable combobox
   uses (SharedDropdown.searchable, below, makes one from a select), and a
   pick goes back into the select as the user's own would: the value changes
   and `input` then `change` fire. The select stays the field
   every tool reads, so nothing that reads, sets, saves or restores it
   changes, and its width is still the browser's (sized to its longest
   option, not jumping with the pick).

   Only the mouse is taken over. Keyboard and touch keep the browser's own
   picker, which screen readers announce properly and phones show as a
   thumb-sized sheet. A select can opt out with data-native.

     SharedDropdown.place(anchor, list[, opts])
       Puts a fixed-position list under (or, short of room, over) an anchor,
       at least as wide as it, kept on screen. A combobox calls it on open,
       scroll and resize. opts: {minWidth, maxWidth, maxHeight, gap, align}.
       align: 'end' lines the list's right edge up with the anchor's, for a
       button that sits hard right (a chart's Share menu).
   ────────────────────────────────────────────────────────────────────────── */
(function(global){
  'use strict';
  if (global.SharedDropdown) return;

  function place(anchor, list, opts){
    opts = opts || {};
    var gap = opts.gap == null ? 4 : opts.gap;
    var r = anchor.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, vh = global.innerHeight;
    var maxW = Math.min(opts.maxWidth || 420, vw - 16);
    var minW = Math.min(Math.max(r.width, opts.minWidth || 0), maxW);
    list.style.position = 'fixed';
    list.style.minWidth = minW + 'px';
    list.style.maxWidth = maxW + 'px';
    if (opts.minWidth) list.style.width = minW + 'px';
    var w = list.offsetWidth;
    var x = opts.align === 'end' ? r.right - w : r.left;
    list.style.left = Math.max(8, Math.min(x, vw - w - 8)) + 'px';
    var cap = opts.maxHeight || 280;
    var below = vh - r.bottom - gap - 8, above = r.top - gap - 8;
    if (below < Math.min(cap, 160) && above > below) {
      list.style.top = '';
      list.style.bottom = (vh - r.top + gap) + 'px';
      list.style.maxHeight = Math.min(cap, above) + 'px';
    } else {
      list.style.bottom = '';
      list.style.top = (r.bottom + gap) + 'px';
      list.style.maxHeight = Math.min(cap, Math.max(below, 120)) + 'px';
    }
  }

  var sel = null, list = null, rows = [], active = -1, pointer = '';
  var typed = '', typedAt = 0;

  function usable(s){
    return s && !s.multiple && !(s.size > 1) && !s.disabled &&
      !s.hasAttribute('data-native') && s.options.length > 0;
  }

  function row(o){
    var d = document.createElement('div');
    d.className = 'combo-opt' + (o.selected ? ' selected' : '') + (o.disabled ? ' disabled' : '');
    d.setAttribute('role', 'option');
    d.setAttribute('aria-selected', o.selected ? 'true' : 'false');
    var m = document.createElement('span');
    m.className = 'combo-main';
    m.textContent = o.label || o.text;
    d.appendChild(m);
    if (o.title) d.title = o.title;
    d._index = o.index;
    d._disabled = o.disabled;
    return d;
  }

  function build(s){
    var frag = document.createDocumentFragment();
    rows = [];
    function add(o){
      if (o.hidden) return;
      var d = row(o);
      rows.push(d);
      frag.appendChild(d);
    }
    for (var i = 0; i < s.children.length; i++) {
      var c = s.children[i];
      if (c.tagName === 'OPTGROUP') {
        if (c.hidden) continue;
        var h = document.createElement('div');
        h.className = 'combo-group';
        h.setAttribute('role', 'presentation');
        h.textContent = c.label;
        frag.appendChild(h);
        for (var j = 0; j < c.children.length; j++) if (c.children[j].tagName === 'OPTION') add(c.children[j]);
      } else if (c.tagName === 'OPTION') add(c);
    }
    return frag;
  }

  function focusRow(i, scroll){
    if (active >= 0 && rows[active]) rows[active].classList.remove('focused');
    active = i;
    if (i >= 0 && rows[i]) {
      rows[i].classList.add('focused');
      if (scroll) rows[i].scrollIntoView({ block: 'nearest' });
    }
  }
  function step(from, dir){
    for (var i = from + dir; i >= 0 && i < rows.length; i += dir) if (!rows[i]._disabled) return i;
    return from;
  }

  function open(s){
    close();
    sel = s;
    list = document.createElement('div');
    list.className = 'combo-list sel-list';
    list.setAttribute('role', 'listbox');
    list.appendChild(build(s));
    // The list takes the select's own text size, within reason, as the
    // browser's picker does: a compact select gets a compact list.
    var fs = parseFloat(getComputedStyle(s).fontSize) || 14;
    list.style.fontSize = Math.max(12.5, Math.min(fs, 15)) + 'px';
    document.body.appendChild(list);
    place(s, list, { maxHeight: 300 });
    var cur = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i]._index === s.selectedIndex) cur = i;
    if (cur >= 0) { focusRow(cur, false); rows[cur].scrollIntoView({ block: 'center' }); }
    // Pressing in the list keeps the select focused, so its blur still means
    // the reader has gone elsewhere.
    list.addEventListener('mousedown', function(e){ e.preventDefault(); });
    list.addEventListener('click', function(e){
      var d = e.target.closest('.combo-opt');
      if (d && !d._disabled) pick(d._index);
    });
    list.addEventListener('mousemove', function(e){
      var d = e.target.closest('.combo-opt');
      var i = d ? rows.indexOf(d) : -1;
      if (i >= 0 && i !== active && !d._disabled) focusRow(i, false);
    });
    s.addEventListener('blur', close);
    s.setAttribute('aria-expanded', 'true');
  }

  function close(){
    if (!list) return;
    if (sel) { sel.removeEventListener('blur', close); sel.removeAttribute('aria-expanded'); }
    list.remove();
    list = null; sel = null; rows = []; active = -1;
  }

  function pick(index){
    var s = sel;
    close();
    if (!s || s.selectedIndex === index) return;
    s.selectedIndex = index;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }

  document.addEventListener('pointerdown', function(e){ pointer = e.pointerType || 'mouse'; }, true);

  document.addEventListener('mousedown', function(e){
    if (list && list.contains(e.target)) return;
    var s = e.target.closest ? e.target.closest('select') : null;
    if (!s) { close(); return; }
    if (e.button !== 0 || (pointer && pointer !== 'mouse') || !usable(s)) { close(); return; }
    e.preventDefault();
    if (sel === s) { close(); return; }
    s.focus({ preventScroll: true });
    open(s);
  }, true);

  document.addEventListener('keydown', function(e){
    if (!list) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      focusRow(active < 0 ? step(-1, 1) : step(active, k === 'ArrowDown' ? 1 : -1), true);
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      focusRow(k === 'Home' ? step(-1, 1) : step(rows.length, -1), true);
    } else if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault();
      var i = active;
      for (var n = 0; n < 8; n++) i = step(i, k === 'PageDown' ? 1 : -1);
      focusRow(i, true);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      if (active >= 0) pick(rows[active]._index); else close();
    } else if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (k === 'Tab') {
      close();
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type to jump, as in the browser's own list.
      e.preventDefault();
      var now = Date.now();
      typed = (now - typedAt < 700 ? typed : '') + k.toLowerCase();
      typedAt = now;
      for (var t = 0; t < rows.length; t++) {
        var at = (active + (typed.length === 1 ? 1 : 0) + t) % rows.length;
        if (!rows[at]._disabled && rows[at].textContent.trim().toLowerCase().indexOf(typed) === 0) { focusRow(at, true); break; }
      }
    }
  }, true);

  // A scroll anywhere but in the list itself, or a resize, would leave the
  // list hanging away from its field, so it closes as the browser's does.
  global.addEventListener('scroll', function(e){ if (list && !list.contains(e.target)) close(); }, true);
  global.addEventListener('resize', close);
  global.addEventListener('blur', close);

  /* ── A searchable select ────────────────────────────────────────────────
     SharedDropdown.searchable(select[, opts]) puts a .combo-input in place of
     a <select> that has too many options to scroll through (every currency,
     say): typing filters the list, and a pick goes back into the select as
     the user's own would, firing `input` then `change`. As above, the select
     stays the field every tool reads, sets, saves and restores; it is only
     hidden. The field follows it: refilled options, a value set by code (call
     .refresh() after one that does not touch the options), `hidden` and
     `disabled`. Call it again on the same select to get the same handle.
       opts.placeholder   the field's placeholder ("Search…")
       opts.display(o)    the field's text for the chosen option (its label)
       opts.minWidth      the list's least width, for a narrow field (240)
       opts.chip(o)       a short tag for the row's .combo-chip (a ticker's
                          full name); the option's data-chip by default
     Every row matches on its value, its label and its chip, accents and case
     aside; options whose value starts with the search come first. With no
     search typed, an <optgroup>'s label heads its rows. */
  var fold = function(t){ return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var comboN = 0;
  function searchable(s, opts){
    if (!s || s.tagName !== 'SELECT') return null;
    if (s._combo) return s._combo;
    opts = opts || {};
    var input = document.createElement('input');
    input.type = 'text';
    input.className = (s.className ? s.className + ' ' : '') + 'combo-input';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('data-no-persist', '');
    ['aria-label', 'aria-labelledby', 'title'].forEach(function(a){ if (s.hasAttribute(a)) input.setAttribute(a, s.getAttribute(a)); });
    input.placeholder = opts.placeholder || s.getAttribute('data-placeholder') || 'Search…';
    var box = document.createElement('div');
    box.className = 'combo-list';
    box.id = 'comboList' + (++comboN);
    box.setAttribute('role', 'listbox');
    box.hidden = true;
    input.setAttribute('aria-controls', box.id);
    s.style.display = 'none';
    s.setAttribute('data-native', '');
    s.insertAdjacentElement('afterend', input);
    var focus = -1;

    function chosen(){ return s.selectedIndex >= 0 ? s.options[s.selectedIndex] : null; }
    function label(o){ return o ? (opts.display ? opts.display(o) : o.textContent) : ''; }
    function chipOf(o){ return String((opts.chip ? opts.chip(o) : o.getAttribute('data-chip')) || ''); }
    function sync(){
      input.hidden = s.hidden;
      input.disabled = s.disabled;
      if (box.hidden) {
        var o = chosen();
        input.value = label(o);
        input.classList.toggle('has-value', !!(o && o.value));
      }
    }
    function render(q){
      q = fold(q).trim();
      var hits = [], lead = [];
      for (var i = 0; i < s.options.length; i++) {
        var o = s.options[i];
        if (o.hidden || o.disabled) continue;
        var v = fold(o.value);
        if (!q) { hits.push(o); continue; }
        if (v.indexOf(q) === 0) lead.push(o);
        else if ((v + ' ' + fold(o.textContent) + ' ' + fold(chipOf(o))).indexOf(q) >= 0) hits.push(o);
      }
      hits = lead.concat(hits);
      box.textContent = '';
      var cur = chosen(), group = null;
      hits.forEach(function(o){
        var g = !q && o.parentNode && o.parentNode.tagName === 'OPTGROUP' ? o.parentNode : null;
        if (g && g !== group) {
          var h = document.createElement('div');
          h.className = 'combo-group';
          h.setAttribute('role', 'presentation');
          h.textContent = g.label;
          box.appendChild(h);
        }
        group = g;
        var d = document.createElement('div');
        d.className = 'combo-opt' + (o === cur ? ' selected' : '');
        d.setAttribute('role', 'option');
        d.setAttribute('aria-selected', o === cur ? 'true' : 'false');
        var m = document.createElement('span');
        m.className = 'combo-main';
        m.textContent = o.textContent;
        d.appendChild(m);
        var c = chipOf(o);
        if (c) {
          var t = document.createElement('span');
          t.className = 'combo-chip';
          t.textContent = c;
          t.title = c;
          d.appendChild(t);
        }
        d._opt = o;
        box.appendChild(d);
      });
      if (!hits.length) {
        var e = document.createElement('div');
        e.className = 'combo-empty';
        e.textContent = 'No match';
        box.appendChild(e);
      }
      focus = -1;
    }
    function where(){ if (!box.hidden) place(input, box, { minWidth: opts.minWidth || 240, maxHeight: 300 }); }
    function show(){
      if (box.hidden) {
        document.body.appendChild(box);
        global.addEventListener('scroll', where, { passive: true, capture: true });
        global.addEventListener('resize', where, { passive: true });
      }
      box.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      where();
      var d = box.querySelector('.combo-opt.selected');
      if (d) d.scrollIntoView({ block: 'nearest' });
    }
    // Closing puts the chosen option back, so a half-typed search never sits
    // in the field looking like the value.
    function hide(){
      box.hidden = true;
      box.remove();
      global.removeEventListener('scroll', where, { capture: true });
      global.removeEventListener('resize', where);
      input.setAttribute('aria-expanded', 'false');
      sync();
    }
    function move(i){
      var r = box.querySelectorAll('.combo-opt');
      focus = Math.max(-1, Math.min(i, r.length - 1));
      for (var k = 0; k < r.length; k++) r[k].classList.toggle('focused', k === focus);
      if (focus >= 0) r[focus].scrollIntoView({ block: 'nearest' });
    }
    function take(o){
      hide();
      if (!o || o.selected) return;
      s.value = o.value;
      sync();
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // The field shows the chosen option: open on the whole list, its text
    // selected so typing replaces it.
    input.addEventListener('focus', function(){ render(''); show(); input.select(); });
    // A click on the field when it already has the focus (after Esc) reopens.
    input.addEventListener('mousedown', function(){
      if (document.activeElement === input && box.hidden) { render(''); show(); }
    });
    input.addEventListener('input', function(){ input.classList.remove('has-value'); render(input.value); show(); });
    input.addEventListener('keydown', function(e){
      if (e.key === 'ArrowDown') { e.preventDefault(); if (box.hidden) { render(''); show(); } move(focus + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(focus - 1); }
      else if (e.key === 'Enter') {
        // Enter takes the row the arrows are on, or the only match left.
        var r = box.querySelectorAll('.combo-opt');
        var d = r[focus] || (r.length === 1 ? r[0] : null);
        if (d) { e.preventDefault(); take(d._opt); }
      }
      else if (e.key === 'Escape') { if (!box.hidden) { e.preventDefault(); e.stopPropagation(); } hide(); }
    });
    input.addEventListener('blur', hide);
    // A press anywhere in the list (a row, its scrollbar) keeps the focus.
    box.addEventListener('mousedown', function(e){
      e.preventDefault();
      var d = e.target.closest('.combo-opt');
      if (d) { take(d._opt); input.blur(); }
    });
    box.addEventListener('mousemove', function(e){
      var d = e.target.closest('.combo-opt');
      var r = box.querySelectorAll('.combo-opt');
      var i = d ? Array.prototype.indexOf.call(r, d) : -1;
      if (i >= 0 && i !== focus) move(i);
    });
    s.addEventListener('change', sync);
    if (global.MutationObserver) new MutationObserver(sync).observe(s, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
    sync();
    s._combo = { input: input, list: box, refresh: sync, close: hide };
    return s._combo;
  }

  global.SharedDropdown = { place: place, open: function(s){ if (usable(s)) { s.focus({ preventScroll: true }); open(s); } }, close: close, searchable: searchable };
})(window);
