/* Load Flow Simulator: the network model, its saved form, validation and the
   bridge to the PSA.js power flow. No DOM here: the page, the build's
   self-test and the audit all load this same file.

   ── The saved form is frozen ──────────────────────────────────────────────
   A reader's diagram lives on in the mini cache, scenario files, Share links
   and embeds, so everything below that names a saved value is a handle, not a
   label. Never rename a key, a class name, an enum value or a preset key, and
   never change a DEFAULTS value (a key that is missing from a saved diagram
   means that default). Add new keys with a default that reproduces the old
   result, and migrate in load().

     { v:1, name:'…', next:<id>, el:[ element… ] }

   An element is { c:<PyPSA class>, id:<int>, …PyPSA attributes in PyPSA units }
   with the bus references bus (one-port devices) or bus0/bus1 (branches) as
   element ids, plus:
     name   omitted when it is the automatic "<Word> <id>"
     at     geometry, in grid units (LF.G px each):
              Bus     [x, y, w] or [x, y, w, 1] for a vertical bar
              device  [a, s] offset along its bar and side (1 = above/left),
                      or [x, y] when it is on no bus; omitted = automatic
              branch  [a0, a1, m] port offsets and the middle segment; null or
                      omitted parts are automatic
     lb     a per-element label override, a bitmask over LF.LABELS[c]
     grid   (Generator) 1 draws it as an external grid; the power flow ignores it
     style  how it is drawn, never what it computes: (Bus) 'node' draws a dot
            instead of a bar; (Generator) 'pv' a solar panel, 'wind' a wind
            turbine. '' (the default) is the bar and the round generator
   Only values that differ from DEFAULTS are written. */
(function(root){
  'use strict';
  var LF = root.LF = root.LF || {};

  LF.VERSION = 1;
  LF.G = 10;

  var CLASSES = ['Bus', 'Line', 'Transformer', 'Generator', 'Load', 'ShuntImpedance', 'StorageUnit', 'Link'];
  var BRANCH = { Line: 1, Transformer: 1, Link: 1 };
  var PASSIVE = { Line: 1, Transformer: 1 };
  var DEVICE = { Generator: 1, Load: 1, ShuntImpedance: 1, StorageUnit: 1 };
  var WORD = { Bus: 'Bus', Line: 'Line', Transformer: 'Transformer', Generator: 'Generator', Load: 'Load',
               ShuntImpedance: 'Shunt', StorageUnit: 'Storage', Link: 'Link' };
  LF.CLASSES = CLASSES; LF.BRANCH = BRANCH; LF.PASSIVE = PASSIVE; LF.DEVICE = DEVICE; LF.WORD = WORD;

  // PyPSA's own defaults, except p_set: PyPSA leaves it NaN, and a power flow
  // then returns NaN for a slack or storage unit, so the tool always sends 0.
  var DEFAULTS = {
    Bus:            { v_nom: 1, v_mag_pu_set: 1, style: '' },
    Line:           { type: '', length: 0, num_parallel: 1, r: 0, x: 0, b: 0, g: 0, s_nom: 0 },
    Transformer:    { type: '', tap_position: 0, num_parallel: 1, s_nom: 0, x: 0, r: 0, g: 0, b: 0,
                      tap_ratio: 1, tap_side: 0, phase_shift: 0, model: 't' },
    Generator:      { control: 'PQ', p_set: 0, q_set: 0, p_nom: 0, grid: 0, style: '' },
    Load:           { p_set: 0, q_set: 0 },
    ShuntImpedance: { g: 0, b: 0 },
    StorageUnit:    { p_set: 0, q_set: 0, p_nom: 0 },
    Link:           { p_set: 0, efficiency: 1, p_nom: 0 }
  };
  LF.DEFAULTS = DEFAULTS;

  // How each saved value is read back: [kind, min, max] or ['e', options].
  var BIG = 1e5;
  var SPEC = {
    Bus:            { v_nom: ['n', 0.1, 1500], v_mag_pu_set: ['n', 0.5, 1.5], style: ['e', ['', 'node']] },
    Line:           { type: ['s'], length: ['n', 0, 5000], num_parallel: ['i', 1, 20], r: ['n', 0, BIG], x: ['n', -BIG, BIG],
                      b: ['n', -1, 1], g: ['n', 0, 1], s_nom: ['n', 0, BIG] },
    Transformer:    { type: ['s'], tap_position: ['i', -50, 50], num_parallel: ['i', 1, 20], s_nom: ['n', 0, BIG],
                      x: ['n', -10, 10], r: ['n', 0, 10], g: ['n', -1, 1], b: ['n', -1, 1], tap_ratio: ['n', 0.5, 1.5],
                      tap_side: ['e', [0, 1]], phase_shift: ['n', -360, 360], model: ['e', ['t', 'pi']] },
    Generator:      { control: ['e', ['PQ', 'PV', 'Slack']], p_set: ['n', -BIG, BIG], q_set: ['n', -BIG, BIG], p_nom: ['n', 0, BIG], grid: ['e', [0, 1]], style: ['e', ['', 'pv', 'wind']] },
    Load:           { p_set: ['n', -BIG, BIG], q_set: ['n', -BIG, BIG] },
    ShuntImpedance: { g: ['n', -10, 10], b: ['n', -10, 10] },
    StorageUnit:    { p_set: ['n', -BIG, BIG], q_set: ['n', -BIG, BIG], p_nom: ['n', 0, BIG] },
    Link:           { p_set: ['n', -BIG, BIG], efficiency: ['n', 0.01, 1], p_nom: ['n', 0, BIG] }
  };
  LF.SPEC = SPEC;

  // What a new element from the palette starts with (written out in full, so
  // this table may change without changing any saved diagram).
  LF.NEW = {
    Bus:            { v_nom: 110 },
    Node:           { v_nom: 110, style: 'node' },
    Line:           { r: 2, x: 12, b: 3e-5, s_nom: 100 },
    Transformer:    { s_nom: 100, x: 0.1, r: 0.005 },
    Generator:      { control: 'PV', p_set: 50, p_nom: 100 },
    PV:             { control: 'PV', p_set: 50, p_nom: 100, style: 'pv' },
    Wind:           { control: 'PV', p_set: 50, p_nom: 100, style: 'wind' },
    Grid:           { control: 'Slack', p_nom: 0, grid: 1 },
    Load:           { p_set: 20, q_set: 5 },
    ShuntImpedance: { b: 0 },
    StorageUnit:    { p_set: 10, p_nom: 20 },
    Link:           { p_set: 50, efficiency: 0.97, p_nom: 100 }
  };

  // Toolbar parts that are another class drawn another way: the class they make.
  LF.TOOL_CLASS = { Node: 'Bus', Grid: 'Generator', PV: 'Generator', Wind: 'Generator' };
  LF.toolClass = function(tool){ return LF.TOOL_CLASS[tool] || tool; };

  // The quantities a label can show, per class. Frozen order: lb is a bitmask over it.
  LF.LABELS = {
    Bus:            ['name', 'vpu', 'vkv', 'ang', 'p', 'q'],
    Line:           ['name', 'p', 'q', 's', 'load', 'loss', 'i'],
    Transformer:    ['name', 'p', 'q', 's', 'load', 'loss', 'i', 'tap'],
    Generator:      ['name', 'p', 'q', 'pf'],
    Load:           ['name', 'p', 'q', 'pf'],
    ShuntImpedance: ['name', 'p', 'q'],
    StorageUnit:    ['name', 'p', 'q'],
    Link:           ['name', 'p', 'loss']
  };

  /* ── Small helpers ── */
  function num(v){ var x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof x === 'number' && isFinite(x) ? x : NaN; }
  function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }
  function str(v, max){ return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max || 60) : ''; }
  function toInt(v){ var x = num(v); return isNaN(x) ? NaN : Math.round(x); }
  function has(o, k){ return Object.prototype.hasOwnProperty.call(o, k); }
  LF.num = num;

  function readValue(spec, v, dflt){
    var k = spec[0];
    if(k === 's') return typeof v === 'string' ? str(v, 80) : dflt;
    if(k === 'e'){
      var opts = spec[1];
      if(opts.indexOf(v) >= 0) return v;
      if(typeof opts[0] === 'number'){
        var x = num(v);
        if(isNaN(x)) return dflt;
        // A value that is gone maps to its nearest option.
        return opts.reduce(function(b, o){ return Math.abs(o - x) < Math.abs(b - x) ? o : b; }, opts[0]);
      }
      if(typeof v === 'string'){
        var low = v.toLowerCase();
        for(var i = 0; i < opts.length; i++) if(String(opts[i]).toLowerCase() === low) return opts[i];
      }
      return dflt;
    }
    var n = k === 'i' ? toInt(v) : num(v);
    if(isNaN(n)) return dflt;
    return clamp(n, spec[1], spec[2]);
  }

  LF.autoName = function(e){ return WORD[e.c] + ' ' + e.id; };
  LF.nameOf = function(e){ return e.name || LF.autoName(e); };
  LF.isBranch = function(e){ return !!BRANCH[e.c]; };
  LF.isDevice = function(e){ return !!DEVICE[e.c]; };

  /* ── Reading a saved diagram: never throws ── */
  function migrate(raw){
    // v1 is the first saved form. A later version converts older ones here.
    return raw;
  }

  function readAt(c, at, attached){
    if(!Array.isArray(at)) return null;
    var a = at.map(function(v){ return v === null ? null : num(v); });
    if(c === 'Bus'){
      if(isNaN(a[0]) || isNaN(a[1])) return null;
      return [clamp(Math.round(a[0]), -5000, 5000), clamp(Math.round(a[1]), -5000, 5000),
              isNaN(a[2]) ? 8 : clamp(Math.round(a[2]), 2, 400), a[3] === 1 ? 1 : 0];
    }
    if(DEVICE[c]){
      if(attached){
        if(isNaN(a[0])) return null;
        return [clamp(Math.round(a[0]), -200, 200), a[1] === 1 ? 1 : 0];
      }
      if(isNaN(a[0]) || isNaN(a[1])) return null;
      return [clamp(Math.round(a[0]), -5000, 5000), clamp(Math.round(a[1]), -5000, 5000)];
    }
    // branch
    var out = [0, 1, 2].map(function(i){ var v = a[i]; return v === null || v === undefined || isNaN(v) ? null : clamp(Math.round(v), -5000, 5000); });
    return out[0] === null && out[1] === null && out[2] === null ? null : out;
  }

  LF.load = function(raw){
    var m = { name: '', next: 1, el: [] };
    try {
      if(!raw || typeof raw !== 'object') return m;
      raw = migrate(raw);
      m.name = str(raw.name, 60);
      var list = Array.isArray(raw.el) ? raw.el.slice(0, 5000) : [];
      var used = {}, pending = [];
      list.forEach(function(r){
        if(!r || typeof r !== 'object' || !has(DEFAULTS, r.c)) return;
        var e = { c: r.c, id: toInt(r.id) };
        var d = DEFAULTS[r.c], sp = SPEC[r.c];
        for(var k in d) e[k] = has(r, k) ? readValue(sp[k], r[k], d[k]) : d[k];
        e.name = str(r.name, 40).trim();
        if(BRANCH[r.c]){ e.bus0 = toInt(r.bus0); e.bus1 = toInt(r.bus1); }
        if(DEVICE[r.c]) e.bus = toInt(r.bus);
        e._at = r.at;
        var lb = toInt(r.lb);
        if(!isNaN(lb) && lb >= 0 && lb < (1 << LF.LABELS[r.c].length)) e.lb = lb;
        if(!(e.id > 0) || e.id > 1e6 || used[e.id]) pending.push(e);
        else used[e.id] = 1;
        m.el.push(e);
      });
      // Duplicate or missing ids get fresh ones.
      var next = 1;
      m.el.forEach(function(e){ if(used[e.id] && pending.indexOf(e) < 0 && e.id >= next) next = e.id + 1; });
      pending.forEach(function(e){ e.id = next++; });
      var buses = {};
      m.el.forEach(function(e){ if(e.c === 'Bus') buses[e.id] = e; });
      m.el = m.el.filter(function(e){
        if(BRANCH[e.c]){
          // A branch needs both its ends.
          if(!buses[e.bus0] || !buses[e.bus1]) return false;
        }
        if(DEVICE[e.c] && !buses[e.bus]) e.bus = null;
        var at = readAt(e.c, e._at, DEVICE[e.c] ? e.bus !== null : true);
        delete e._at;
        if(e.c === 'Bus' && !at) at = [10 + (e.id % 10) * 12, 10 + Math.floor(e.id / 10) * 16, 8, 0];
        if(DEVICE[e.c] && e.bus === null && (!at || at.length !== 2)) at = [0, 0];
        e.at = at;
        return true;
      });
      var maxId = 0;
      m.el.forEach(function(e){ if(e.id > maxId) maxId = e.id; });
      var savedNext = toInt(raw.next);
      m.next = Math.max(maxId + 1, isNaN(savedNext) ? 1 : clamp(savedNext, 1, 1e6));
      if(m.el.length !== new Set(m.el.map(function(e){ return e.id; })).size) throw new Error('ids');
    } catch(err){
      if(root.console) root.console.warn('Load flow: could not read that diagram', err);
      return { name: '', next: 1, el: [] };
    }
    return m;
  };

  /* ── Writing it back, only what differs from the defaults ── */
  LF.compact = function(model){
    var out = { v: LF.VERSION };
    if(model.name) out.name = model.name;
    out.next = model.next;
    out.el = model.el.map(function(e){
      var o = { c: e.c, id: e.id };
      if(e.name && e.name !== LF.autoName(e)) o.name = e.name;
      if(BRANCH[e.c]){ o.bus0 = e.bus0; o.bus1 = e.bus1; }
      if(DEVICE[e.c] && e.bus !== null && e.bus !== undefined) o.bus = e.bus;
      if(e.at){
        var at = e.at.slice();
        if(e.c === 'Bus' && at[3] !== 1) at.length = 3;
        if(BRANCH[e.c]){ while(at.length && at[at.length - 1] === null) at.pop(); }
        if(at.length) o.at = at;
      }
      var d = DEFAULTS[e.c];
      for(var k in d) if(e[k] !== d[k]) o[k] = e[k];
      if(typeof e.lb === 'number') o.lb = e.lb;
      return o;
    });
    return out;
  };

  /* ── What the power flow sees, to tell when a result is out of date ── */
  LF.hash = function(s){
    var h = 0x811c9dc5;
    for(var i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  };
  LF.elecKey = function(model){
    return JSON.stringify(model.el.map(function(e){
      var o = [e.c, e.id];
      if(BRANCH[e.c]) o.push(e.bus0, e.bus1);
      if(DEVICE[e.c]) o.push(e.bus === null || e.bus === undefined ? null : e.bus);
      var d = DEFAULTS[e.c];
      for(var k in d) if(!DRAW_ONLY[k]) o.push(e[k]);
      return o;
    }));
  };
  var DRAW_ONLY = { grid: 1, style: 1 };

  /* ── Model queries ── */
  LF.byId = function(model){
    var map = {};
    model.el.forEach(function(e){ map[e.id] = e; });
    return map;
  };

  // Islands joined by lines and transformers (links do not join them, as in PyPSA).
  LF.islands = function(model){
    var parent = {};
    function find(a){ while(parent[a] !== a){ parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    var buses = model.el.filter(function(e){ return e.c === 'Bus'; });
    buses.forEach(function(b){ parent[b.id] = b.id; });
    model.el.forEach(function(e){
      if(PASSIVE[e.c] && has(parent, e.bus0) && has(parent, e.bus1) && e.bus0 !== e.bus1){
        var a = find(e.bus0), b = find(e.bus1);
        if(a !== b) parent[b] = a;
      }
    });
    var groups = {}, order = [];
    buses.forEach(function(b){
      var r = find(b.id);
      if(!groups[r]){ groups[r] = { buses: [], gens: [] }; order.push(r); }
      groups[r].buses.push(b.id);
    });
    model.el.forEach(function(e){
      if(e.c === 'Generator' && has(parent, e.bus)) groups[find(e.bus)].gens.push(e.id);
    });
    return order.map(function(r){ return groups[r]; });
  };

  /* ── Standard types (from the engine; empty until it has loaded) ── */
  LF.types = { line: {}, transformer: {} };
  LF.setTypes = function(t){ if(t && t.line && t.transformer) LF.types = t; };
  // Own keys only, so a name such as "toString" is an unknown type, not a prototype method.
  var own = Object.prototype.hasOwnProperty;
  LF.lineType = function(e){ var t = e.type && own.call(LF.types.line, e.type) ? LF.types.line[e.type] : null; return t && t.f_nom > 0 ? t : null; };
  LF.trType = function(e){ return e.type && own.call(LF.types.transformer, e.type) ? LF.types.transformer[e.type] || null : null; };

  // The voltage a standard line type is made for, read from its name (NaN when it says none).
  LF.lineTypeKv = function(name){
    var m = / (\d+(?:\.\d+)?)$/.exec(name) || /\/(\d+(?:\.\d+)?) kV$/.exec(name);
    if(m) return +m[1];
    return /^NAYY/.test(name) ? 0.4 : NaN;
  };

  // A branch's rating in MVA as the power flow sees it.
  LF.rating = function(e, bus0){
    if(e.c === 'Line'){
      var t = LF.lineType(e);
      if(t) return Math.sqrt(3) * (bus0 ? bus0.v_nom : 0) * t.i_nom * e.num_parallel;
      return e.s_nom;
    }
    if(e.c === 'Transformer'){
      var tt = LF.trType(e);
      // A typed transformer gets one unit's rating; num_parallel units share the flow.
      if(tt) return tt.s_nom * e.num_parallel;
      return e.s_nom;
    }
    if(e.c === 'Link') return e.p_nom;
    return 0;
  };

  /* ── Validation: errors stop a run, warnings explain what the run will do ── */
  LF.validate = function(model, opts){
    opts = opts || {};
    var errors = [], warnings = [];
    var byId = LF.byId(model);
    var buses = model.el.filter(function(e){ return e.c === 'Bus'; });
    var nm = function(id){ return byId[id] ? LF.nameOf(byId[id]) : '?'; };
    // Before the engine has loaded the standard types, a named type is taken on trust.
    var lineTyped = function(e){ return Object.keys(LF.types.line).length ? !!LF.lineType(e) : !!e.type; };
    var trTyped = function(e){ return Object.keys(LF.types.transformer).length ? !!LF.trType(e) : !!e.type; };
    // A DC load flow, and the DC seed of an AC one, sends power through reactance alone.
    var dcPart = opts.method === 'dc' ? 'a DC load flow' : opts.seed === 'flat' ? '' : 'the DC load flow seed';
    if(!buses.length) errors.push({ id: null, msg: 'Add at least one bus.' });
    if(buses.length > 1000) errors.push({ id: null, msg: 'This tool solves up to 1,000 buses.' });
    model.el.forEach(function(e){
      var n = LF.nameOf(e);
      if(BRANCH[e.c]){
        if(e.bus0 === e.bus1) errors.push({ id: e.id, msg: n + ' starts and ends on the same bus.' });
        var b0 = byId[e.bus0], b1 = byId[e.bus1];
        if(e.c === 'Line'){
          if(e.type && !LF.lineType(e) && Object.keys(LF.types.line).length) warnings.push({ id: e.id, msg: n + ': type "' + e.type + '" is unknown, so its own values are used.' });
          if(lineTyped(e)){ if(!(e.length > 0)) errors.push({ id: e.id, msg: n + ' has a line type but no length.' }); }
          else if(e.r === 0 && e.x === 0) errors.push({ id: e.id, msg: n + ' has no impedance. Give it a resistance or reactance.' });
          else if(e.x === 0 && dcPart) errors.push({ id: e.id, msg: n + ' has no reactance, which ' + dcPart + ' cannot carry power through. Give it a reactance' + (opts.method === 'dc' ? '.' : ', or use a flat start.') });
          var tkv = LF.lineType(e) ? LF.lineTypeKv(e.type) : NaN;
          if(isFinite(tkv) && b0 && Math.abs(tkv - b0.v_nom) > 1e-9) warnings.push({ id: e.id, msg: n + ' is a ' + tkv + ' kV line type on a ' + b0.v_nom + ' kV bus. Pick a type made for ' + b0.v_nom + ' kV.' });
          if(b0 && b1 && b0.v_nom !== b1.v_nom) warnings.push({ id: e.id, msg: n + ' joins ' + b0.v_nom + ' kV and ' + b1.v_nom + ' kV buses. A line takes the voltage of its first end; use a transformer between voltages.' });
        }
        if(e.c === 'Transformer'){
          var tt = LF.trType(e);
          if(e.type && !tt && Object.keys(LF.types.transformer).length) warnings.push({ id: e.id, msg: n + ': type "' + e.type + '" is unknown, so its own values are used.' });
          if(!trTyped(e)){
            if(!(e.s_nom > 0)) errors.push({ id: e.id, msg: n + ' needs a rating above 0 MVA: its impedance is per unit on that rating.' });
            if(e.r === 0 && e.x === 0) errors.push({ id: e.id, msg: n + ' has no impedance. Give it a reactance.' });
            else if(e.x === 0 && dcPart) errors.push({ id: e.id, msg: n + ' has no reactance, which ' + dcPart + ' cannot carry power through. Give it a reactance' + (opts.method === 'dc' ? '.' : ', or use a flat start.') });
          } else if(tt && b0 && b1 && (Math.abs(tt.v_nom_0 - b0.v_nom) > 1e-9 || Math.abs(tt.v_nom_1 - b1.v_nom) > 1e-9)){
            warnings.push({ id: e.id, msg: n + ' is a ' + tt.v_nom_0 + '/' + tt.v_nom_1 + ' kV type on ' + (b0 ? b0.v_nom : '?') + ' and ' + (b1 ? b1.v_nom : '?') + ' kV buses (high-voltage side first).' });
          }
        }
      }
      if(DEVICE[e.c] && (e.bus === null || e.bus === undefined)) warnings.push({ id: e.id, msg: n + ' is not on a bus, so it is left out.' });
    });
    LF.islands(model).forEach(function(isl){
      var gens = isl.gens.map(function(id){ return byId[id]; });
      var first = nm(isl.buses[0]);
      var where = isl.buses.length > 1 ? 'The island with ' + first : first;
      if(!gens.length){
        var loads = model.el.some(function(e){ return (e.c === 'Load' || e.c === 'StorageUnit' || e.c === 'ShuntImpedance') && isl.buses.indexOf(e.bus) >= 0; });
        if(loads || isl.buses.length > 1) warnings.push({ id: isl.buses[0], msg: where + ' has no generator, so ' + first + ' is held at 1 p.u. and balances it, as an ideal source.' });
        return;
      }
      var slacks = gens.filter(function(g){ return g.control === 'Slack'; });
      if(!slacks.length) warnings.push({ id: gens[0].id, msg: where + ' has no slack, so ' + LF.nameOf(gens[0]) + ' takes it on.' });
      if(slacks.length > 1) warnings.push({ id: slacks[1].id, msg: where + ' has ' + slacks.length + ' slack units. ' + LF.nameOf(slacks[0]) + ' is the slack and the others hold voltage as PV units.' });
      if(opts.distSlack && opts.slackW === 'p_set' && gens.every(function(g){ return g.p_set === 0; }))
        errors.push({ id: gens[0].id, msg: where + ': distributing the slack by dispatch needs a dispatch above 0 MW on at least one generator.' });
      if(opts.distSlack && opts.slackW === 'p_nom' && gens.every(function(g){ return !(g.p_nom > 0); }))
        errors.push({ id: gens[0].id, msg: where + ': distributing the slack by rating needs a rating above 0 MW on at least one generator.' });
    });
    if(opts.method !== 'dc' && opts.seed === 'flat' && model.el.some(function(e){
      return e.c === 'Transformer' && ((LF.trType(e) && LF.trType(e).phase_shift) || (!LF.trType(e) && e.phase_shift));
    })) warnings.push({ id: null, msg: 'A flat start with phase-shifting transformers may not converge. A DC load flow seed is safer.' });
    return { errors: errors, warnings: warnings };
  };

  /* ── The power flow ── */
  function addAll(n, cls, rows, keys){
    if(!rows.length) return;
    var names = rows.map(function(r){ return r.name; });
    var kw = {};
    keys.forEach(function(k){
      kw[k] = rows.length === 1 ? rows[0][k] : rows.map(function(r){ return r[k]; });
    });
    n.add(cls, rows.length === 1 ? names[0] : names, kw);
  }
  function pyName(id){ return 'e' + id; }
  function first(df, col){
    if(!df || !df.columns || !df.columns.has || !df.columns.has(col)) return NaN;
    var v = df.col(col)[0];
    return typeof v === 'number' ? v : (v === true ? 1 : v === false ? 0 : NaN);
  }

  LF.solveOptions = function(o){
    o = o || {};
    return {
      method: o.method === 'dc' ? 'dc' : 'ac',
      tol: [1e-4, 1e-6, 1e-8, 1e-10].indexOf(num(o.tol)) >= 0 ? num(o.tol) : 1e-6,
      seed: o.seed === 'flat' ? 'flat' : 'dc',
      distSlack: !!o.distSlack,
      slackW: o.slackW === 'p_nom' ? 'p_nom' : 'p_set'
    };
  };

  /* Solve a model with a PSA.js module ({Network, logger, stdTypes}). Returns
     plain numbers keyed by element id, the run report, and raw (everything,
     in a fixed order, for the build's bundle-against-source check). */
  LF.solve = function(psa, model, options){
    var o = LF.solveOptions(options);
    var t0 = Date.now();
    var report = { ok: false, method: o.method, opts: o, warnings: [], error: '', converged: false, iters: 0, mismatch: 0, islands: [] };
    var oldHandler = psa.logger.handler;
    psa.logger.handler = function(level, msg){ if(level >= 30) report.warnings.push(String(msg)); };
    try {
      if(psa.stdTypes && !Object.keys(LF.types.line).length) LF.setTypes(psa.stdTypes());
      var byId = LF.byId(model);
      var buses = model.el.filter(function(e){ return e.c === 'Bus'; });
      var on = function(e){ return e.bus !== null && e.bus !== undefined && byId[e.bus] && byId[e.bus].c === 'Bus'; };
      var ends = function(e){ return byId[e.bus0] && byId[e.bus1] && byId[e.bus0].c === 'Bus' && byId[e.bus1].c === 'Bus' && e.bus0 !== e.bus1; };
      var n = new psa.Network();
      addAll(n, 'Bus', buses.map(function(b){ return { name: pyName(b.id), v_nom: b.v_nom, v_mag_pu_set: b.v_mag_pu_set }; }), ['v_nom', 'v_mag_pu_set']);
      var lines = model.el.filter(function(e){ return e.c === 'Line' && ends(e); });
      addAll(n, 'Line', lines.map(function(e){
        var t = LF.lineType(e);
        return { name: pyName(e.id), bus0: pyName(e.bus0), bus1: pyName(e.bus1), type: t ? e.type : '',
                 length: e.length, num_parallel: e.num_parallel,
                 r: t ? 0 : e.r, x: t ? 0 : e.x, b: t ? 0 : e.b, g: e.g, s_nom: LF.rating(e, byId[e.bus0]) };
      }), ['bus0', 'bus1', 'type', 'length', 'num_parallel', 'r', 'x', 'b', 'g', 's_nom']);
      var trs = model.el.filter(function(e){ return e.c === 'Transformer' && ends(e); });
      addAll(n, 'Transformer', trs.map(function(e){
        var t = LF.trType(e);
        return t
          ? { name: pyName(e.id), bus0: pyName(e.bus0), bus1: pyName(e.bus1), type: e.type, tap_position: e.tap_position,
              num_parallel: e.num_parallel, s_nom: 0, x: 0, r: 0, g: 0, b: 0, tap_ratio: 1, tap_side: 0, phase_shift: 0, model: e.model }
          : { name: pyName(e.id), bus0: pyName(e.bus0), bus1: pyName(e.bus1), type: '', tap_position: 0,
              num_parallel: e.num_parallel, s_nom: e.s_nom, x: e.x, r: e.r, g: e.g, b: e.b, tap_ratio: e.tap_ratio,
              tap_side: e.tap_side, phase_shift: e.phase_shift, model: e.model };
      }), ['bus0', 'bus1', 'type', 'tap_position', 'num_parallel', 's_nom', 'x', 'r', 'g', 'b', 'tap_ratio', 'tap_side', 'phase_shift', 'model']);
      var gens = model.el.filter(function(e){ return e.c === 'Generator' && on(e); });
      addAll(n, 'Generator', gens.map(function(e){
        return { name: pyName(e.id), bus: pyName(e.bus), control: e.control, p_set: e.p_set, q_set: e.q_set, p_nom: e.p_nom };
      }), ['bus', 'control', 'p_set', 'q_set', 'p_nom']);
      var loads = model.el.filter(function(e){ return e.c === 'Load' && on(e); });
      addAll(n, 'Load', loads.map(function(e){ return { name: pyName(e.id), bus: pyName(e.bus), p_set: e.p_set, q_set: e.q_set }; }), ['bus', 'p_set', 'q_set']);
      var shunts = model.el.filter(function(e){ return e.c === 'ShuntImpedance' && on(e); });
      addAll(n, 'ShuntImpedance', shunts.map(function(e){ return { name: pyName(e.id), bus: pyName(e.bus), g: e.g, b: e.b }; }), ['bus', 'g', 'b']);
      var stores = model.el.filter(function(e){ return e.c === 'StorageUnit' && on(e); });
      addAll(n, 'StorageUnit', stores.map(function(e){ return { name: pyName(e.id), bus: pyName(e.bus), p_set: e.p_set, q_set: e.q_set, p_nom: e.p_nom }; }), ['bus', 'p_set', 'q_set', 'p_nom']);
      var links = model.el.filter(function(e){ return e.c === 'Link' && ends(e); });
      // A negative set point sends power from bus1 to bus0. PyPSA would apply the
      // efficiency the wrong way round and create energy, so the link is handed over
      // turned round, and its results are turned back below.
      var rev = function(e){ return e.p_set < 0; };
      addAll(n, 'Link', links.map(function(e){
        var r = rev(e);
        return { name: pyName(e.id), bus0: pyName(r ? e.bus1 : e.bus0), bus1: pyName(r ? e.bus0 : e.bus1), p_set: Math.abs(e.p_set), efficiency: e.efficiency, p_nom: e.p_nom };
      }), ['bus0', 'bus1', 'p_set', 'efficiency', 'p_nom']);

      var ret = null;
      if(o.method === 'dc') n.lpf();
      else {
        var pfo = { x_tol: o.tol, distribute_slack: o.distSlack, slack_weights: o.slackW };
        if(o.seed === 'dc'){ n.lpf(); pfo.use_seed = true; }
        // Positional, so the options are read the same from any realm (PSA.js
        // recognises an options-only call by its prototype).
        ret = n.pf(null, pfo);
      }
      var ac = o.method === 'ac';
      var res = { bus: {}, br: {}, dev: {}, totals: {} };
      var bt = n.buses_t, bst = n.c.buses.static;
      buses.forEach(function(b){
        var nm = pyName(b.id);
        var v = ac ? first(bt.v_mag_pu, nm) : 1;
        res.bus[b.id] = {
          v: v, ang: first(bt.v_ang, nm) * 180 / Math.PI, vkv: v * b.v_nom,
          p: first(bt.p, nm), q: ac ? first(bt.q, nm) : NaN,
          control: String(bst.at(nm, 'control') || ''), island: String(bst.at(nm, 'sub_network') || '')
        };
      });
      function branch(list, frames){
        list.forEach(function(e){
          var nm = pyName(e.id);
          var p0 = first(frames.p0, nm), p1 = first(frames.p1, nm);
          var q0 = ac ? first(frames.q0, nm) : NaN, q1 = ac ? first(frames.q1, nm) : NaN;
          var b0 = res.bus[e.bus0], b1 = res.bus[e.bus1];
          var s0 = ac ? Math.hypot(p0, q0) : Math.abs(p0), s1 = ac ? Math.hypot(p1, q1) : Math.abs(p1);
          var i0 = s0 / (Math.sqrt(3) * b0.vkv), i1 = s1 / (Math.sqrt(3) * b1.vkv);
          var rating = LF.rating(e, byId[e.bus0]);
          var s = Math.max(s0, s1);
          res.br[e.id] = { p0: p0, p1: p1, q0: q0, q1: q1, loss: p0 + p1, qloss: ac ? q0 + q1 : NaN,
                           s0: s0, s1: s1, s: s, i: Math.max(i0, i1), rating: rating, load: rating > 0 ? 100 * s / rating : NaN };
          if(e.c === 'Transformer'){
            var t = LF.trType(e);
            res.br[e.id].tap = t ? 1 + (e.tap_position - t.tap_neutral) * t.tap_step / 100 : e.tap_ratio;
          }
        });
      }
      branch(lines, n.lines_t);
      branch(trs, n.transformers_t);
      links.forEach(function(e){
        var nm = pyName(e.id), a = first(n.links_t.p0, nm), b = first(n.links_t.p1, nm);
        var sent = Math.abs(a), p0 = rev(e) ? b : a, p1 = rev(e) ? a : b;
        res.br[e.id] = { p0: p0, p1: p1, q0: NaN, q1: NaN, loss: p0 + p1, qloss: NaN, s0: Math.abs(p0), s1: Math.abs(p1),
                         s: sent, i: NaN, rating: e.p_nom, load: e.p_nom > 0 ? 100 * sent / e.p_nom : NaN };
      });
      var gctl = n.c.generators.static;
      gens.forEach(function(e){
        var nm = pyName(e.id);
        res.dev[e.id] = { p: first(n.generators_t.p, nm), q: ac ? first(n.generators_t.q, nm) : NaN, control: String(gctl.at(nm, 'control')) };
      });
      loads.forEach(function(e){ var nm = pyName(e.id); res.dev[e.id] = { p: first(n.loads_t.p, nm), q: ac ? first(n.loads_t.q, nm) : NaN }; });
      // A shunt's q is what it supplies (capacitive b > 0); its p is what it draws.
      shunts.forEach(function(e){ var nm = pyName(e.id); res.dev[e.id] = { p: first(n.shunt_impedances_t.p, nm), q: ac ? first(n.shunt_impedances_t.q, nm) : NaN }; });
      stores.forEach(function(e){ var nm = pyName(e.id); res.dev[e.id] = { p: first(n.storage_units_t.p, nm), q: ac ? first(n.storage_units_t.q, nm) : NaN }; });

      // Islands as PSA.js found them, with their slack.
      var subs = n.c.sub_networks.static;
      subs.index.values.forEach(function(sn){
        var slack = String(subs.at(sn, 'slack_bus') || '');
        var isl = { name: String(sn), slackBus: slack ? +slack.slice(1) : null, converged: true, iters: 0, mismatch: 0, buses: [] };
        if(ret){
          isl.converged = !!first(ret.converged, sn);
          isl.iters = first(ret.n_iter, sn);
          isl.mismatch = first(ret.error, sn);
        }
        report.islands.push(isl);
      });
      buses.forEach(function(b){
        var isl = report.islands.filter(function(i){ return i.name === res.bus[b.id].island; })[0];
        if(isl) isl.buses.push(b.id);
      });
      report.islands.forEach(function(isl){
        if(isl.slackBus === null) return;
        var g = gens.filter(function(e){ return e.bus === isl.slackBus && res.dev[e.id].control === 'Slack'; })[0];
        isl.slackGen = g ? g.id : null;
      });
      report.converged = report.islands.every(function(i){ return i.converged; });
      report.iters = report.islands.reduce(function(a, i){ return Math.max(a, i.iters || 0); }, 0);
      report.mismatch = report.islands.reduce(function(a, i){ return Math.max(a, isNaN(i.mismatch) ? 0 : i.mismatch); }, 0);

      // Totals: what the sources supply, what is served, and what is lost.
      var t = { gen: 0, genQ: 0, load: 0, loadQ: 0, loss: 0, implicit: 0 };
      gens.forEach(function(e){ t.gen += res.dev[e.id].p; t.genQ += res.dev[e.id].q || 0; });
      stores.forEach(function(e){ var p = res.dev[e.id].p; if(p >= 0) t.gen += p; else t.load -= p; });
      loads.forEach(function(e){ t.load += res.dev[e.id].p; t.loadQ += res.dev[e.id].q || 0; });
      shunts.forEach(function(e){ t.load += res.dev[e.id].p; });
      Object.keys(res.br).forEach(function(id){ t.loss += res.br[id].loss; });
      report.islands.forEach(function(isl){
        if(isl.slackBus !== null && !isl.slackGen && res.bus[isl.slackBus]){
          // An island with no generator: its slack bus is an ideal source.
          t.implicit += res.bus[isl.slackBus].p;
        }
      });
      t.gen += t.implicit;
      res.totals = t;
      report.ok = Object.keys(res.bus).every(function(id){ return isFinite(res.bus[id].v) && isFinite(res.bus[id].ang); });
      if(!report.ok && !report.error) report.error = 'The load flow returned no valid voltages. Check for an island with no path to its slack or a branch with no impedance.';
      report.ms = Date.now() - t0;
      res.report = report;
      res.raw = [report.converged, report.iters, report.mismatch, res.bus, res.br, res.dev];
      return res;
    } catch(err){
      report.error = plainError(err);
      report.ms = Date.now() - t0;
      return { bus: {}, br: {}, dev: {}, totals: {}, report: report, raw: ['error', String(err && err.message)] };
    } finally {
      psa.logger.handler = oldHandler;
    }
  };

  function plainError(err){
    var m = String(err && err.message || err);
    if(/singular|pivot|NaN/i.test(m)) return 'The network matrix could not be solved. Check for a branch with no impedance or an island with no path to its slack.';
    return 'The load flow stopped: ' + m;
  }

  /* ── Quick Start networks (keys are frozen; contents may be improved) ──
     Built in the saved form and read through LF.load, like any saved diagram. */
  function wscc9(){
    // Anderson and Fouad, Power System Control and Stability, the WSCC 9-bus
    // system, converted from per unit on 100 MVA and 230 kV to PyPSA units.
    var Z = 230 * 230 / 100;
    var line = function(id, a, b, r, x, B, name){ return { c: 'Line', id: id, name: name, bus0: a, bus1: b, r: r * Z, x: x * Z, b: B / Z, s_nom: 250 }; };
    // Transformer reactance moved onto each unit's own rating (x_own = x_100 × S / 100).
    var tr = function(id, a, b, x100, s, name){ return { c: 'Transformer', id: id, name: name, bus0: a, bus1: b, x: x100 * s / 100, s_nom: s }; };
    return { v: 1, name: 'WSCC 9-bus', el: [
      { c: 'Bus', id: 1, v_nom: 16.5, v_mag_pu_set: 1.04, at: [45, 64, 8] },
      { c: 'Bus', id: 2, v_nom: 18, v_mag_pu_set: 1.025, at: [10, 10, 8] },
      { c: 'Bus', id: 3, v_nom: 13.8, v_mag_pu_set: 1.025, at: [80, 10, 8] },
      { c: 'Bus', id: 4, v_nom: 230, at: [45, 52, 12] },
      { c: 'Bus', id: 5, v_nom: 230, at: [24, 40, 10] },
      { c: 'Bus', id: 6, v_nom: 230, at: [66, 40, 10] },
      { c: 'Bus', id: 7, v_nom: 230, at: [18, 25, 12] },
      { c: 'Bus', id: 8, v_nom: 230, at: [45, 12, 12] },
      { c: 'Bus', id: 9, v_nom: 230, at: [72, 25, 12] },
      tr(10, 4, 1, 0.0576, 247.5, 'T1'),
      tr(11, 7, 2, 0.0625, 192, 'T2'),
      tr(12, 9, 3, 0.0586, 128, 'T3'),
      line(13, 4, 5, 0.010, 0.085, 0.176, 'Line 4-5'),
      line(14, 4, 6, 0.017, 0.092, 0.158, 'Line 4-6'),
      line(15, 5, 7, 0.032, 0.161, 0.306, 'Line 5-7'),
      line(16, 6, 9, 0.039, 0.170, 0.358, 'Line 6-9'),
      line(17, 7, 8, 0.0085, 0.072, 0.149, 'Line 7-8'),
      line(18, 8, 9, 0.0119, 0.1008, 0.209, 'Line 8-9'),
      { c: 'Generator', id: 19, name: 'G1', bus: 1, control: 'Slack', p_set: 0, p_nom: 247.5, at: [0, 0] },
      { c: 'Generator', id: 20, name: 'G2', bus: 2, control: 'PV', p_set: 163, p_nom: 192 },
      { c: 'Generator', id: 21, name: 'G3', bus: 3, control: 'PV', p_set: 85, p_nom: 128 },
      { c: 'Load', id: 22, name: 'Load A', bus: 5, p_set: 125, q_set: 50 },
      { c: 'Load', id: 23, name: 'Load B', bus: 6, p_set: 90, q_set: 30 },
      { c: 'Load', id: 24, name: 'Load C', bus: 8, p_set: 100, q_set: 35, at: [0, 1] }
    ] };
  }
  function threeBus(){
    var T = '243-AL1/39-ST1A 110.0';
    return { v: 1, name: '3-bus meshed 110 kV', el: [
      { c: 'Bus', id: 1, v_nom: 110, at: [14, 12, 10] },
      { c: 'Bus', id: 2, v_nom: 110, v_mag_pu_set: 1.02, at: [62, 12, 10] },
      { c: 'Bus', id: 3, v_nom: 110, at: [38, 34, 10] },
      { c: 'Line', id: 4, bus0: 1, bus1: 2, type: T, length: 40 },
      { c: 'Line', id: 5, bus0: 1, bus1: 3, type: T, length: 30 },
      { c: 'Line', id: 6, bus0: 2, bus1: 3, type: T, length: 25 },
      { c: 'Generator', id: 7, name: 'Grid', bus: 1, control: 'Slack', grid: 1 },
      { c: 'Generator', id: 8, name: 'Power station', bus: 2, control: 'PV', p_set: 60, p_nom: 100 },
      { c: 'Load', id: 9, name: 'Town', bus: 3, p_set: 100, q_set: 30 }
    ] };
  }
  function feeder(){
    var C = 'NAYY 4x150 SE';
    return { v: 1, name: '20/0.4 kV feeder', el: [
      { c: 'Bus', id: 1, name: 'MV 20 kV', v_nom: 20, at: [12, 10, 8] },
      { c: 'Bus', id: 2, name: 'LV board', v_nom: 0.4, at: [12, 32, 10, 1] },
      { c: 'Bus', id: 3, name: 'Pillar 1', v_nom: 0.4, at: [34, 32, 8, 1] },
      { c: 'Bus', id: 4, name: 'Pillar 2', v_nom: 0.4, at: [56, 32, 8, 1] },
      { c: 'Bus', id: 5, name: 'Pillar 3', v_nom: 0.4, at: [78, 32, 8, 1] },
      { c: 'Transformer', id: 6, name: 'Substation', bus0: 1, bus1: 2, type: '0.63 MVA 20/0.4 kV' },
      { c: 'Line', id: 7, bus0: 2, bus1: 3, type: C, length: 0.15 },
      { c: 'Line', id: 8, bus0: 3, bus1: 4, type: C, length: 0.12 },
      { c: 'Line', id: 9, bus0: 4, bus1: 5, type: C, length: 0.12 },
      { c: 'Generator', id: 10, name: 'Grid', bus: 1, control: 'Slack', grid: 1 },
      { c: 'Load', id: 11, name: 'Homes 1', bus: 3, p_set: 0.06, q_set: 0.015 },
      { c: 'Load', id: 12, name: 'Homes 2', bus: 4, p_set: 0.06, q_set: 0.015 },
      { c: 'Load', id: 13, name: 'Homes 3', bus: 5, p_set: 0.05, q_set: 0.012, at: [-3, 0] },
      { c: 'Generator', id: 14, name: 'Rooftop solar', bus: 5, control: 'PQ', p_set: 0.04, p_nom: 0.05, at: [3, 0] },
      { c: 'ShuntImpedance', id: 15, name: 'Capacitor', bus: 2, b: 0.02 / (0.4 * 0.4) }
    ] };
  }
  function hvdc(){
    var T = 'Al/St 240/40 2-bundle 220.0';
    return { v: 1, name: 'Two areas and an HVDC link', el: [
      { c: 'Bus', id: 1, name: 'Area A', v_nom: 220, at: [12, 26, 12, 1] },
      { c: 'Bus', id: 2, name: 'Converter A', v_nom: 220, at: [36, 26, 10, 1] },
      { c: 'Bus', id: 3, name: 'Converter B', v_nom: 220, at: [64, 26, 10, 1] },
      { c: 'Bus', id: 4, name: 'Area B', v_nom: 220, v_mag_pu_set: 1.01, at: [88, 26, 12, 1] },
      { c: 'Line', id: 5, bus0: 1, bus1: 2, type: T, length: 80, num_parallel: 2 },
      { c: 'Line', id: 6, bus0: 3, bus1: 4, type: T, length: 120, num_parallel: 2 },
      { c: 'Link', id: 7, name: 'HVDC link', bus0: 2, bus1: 3, p_set: 150, efficiency: 0.97, p_nom: 200 },
      { c: 'Generator', id: 8, name: 'Grid A', bus: 1, control: 'Slack', grid: 1 },
      { c: 'Load', id: 9, name: 'City A', bus: 2, p_set: 50, q_set: 15 },
      { c: 'Generator', id: 10, name: 'Grid B', bus: 4, control: 'Slack', grid: 1 },
      { c: 'Load', id: 11, name: 'City B', bus: 4, p_set: 260, q_set: 60 }
    ] };
  }
  LF.PRESETS = { wscc9: wscc9(), '3bus': threeBus(), feeder: feeder(), hvdc: hvdc() };
  LF.PRESET_DEFAULT = 'wscc9';
})(typeof globalThis !== 'undefined' ? globalThis : this);
