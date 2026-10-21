/* Load Flow Simulator: the page.

   lf-core.js holds the model and the bridge to PSA.js, lf-draw.js draws it,
   lf-editor.js handles the pointer and the keyboard on the diagram. This file
   ties them to the page: the inspector, the Run gate, the results, the mini
   cache, Share and the exports. */
(function(){
  'use strict';
  var LF = window.LF;
  var $ = function(id){ return document.getElementById(id); };
  var EMBED = !!(window.SharedShare && window.SharedShare.embedded);
  var svg = $('sldSvg'), stage = $('sldStage');

  var app = window.LFApp = {
    model: LF.load(LF.PRESETS[LF.PRESET_DEFAULT]),
    res: null,           // the last results, kept (dimmed) while the network changes
    solvedKey: null,     // what those results were solved for
    L: null, scene: null,
    sel: new Set(),
    view: null,          // the visible part of the diagram, in diagram px
    readOnly: EMBED,
    svg: svg, stage: stage
  };

  /* ── The engine: fetched with the page, imported once ── */
  var psa = null, engineP = null;
  function engine(){
    if(!engineP){
      engineP = import('./engine/psa-pf.min.js').then(function(m){
        psa = m;
        LF.setTypes(m.stdTypes());
        renderInspector();
        return m;
      });
      engineP.catch(function(){ engineP = null; });
    }
    return engineP;
  }

  /* ── Colours come from the theme's tokens, read once per drawing ── */
  function paint(){
    var cs = getComputedStyle(document.body), cache = {};
    return function(t){ return cache[t] || (cache[t] = cs.getPropertyValue(t).trim() || '#888'); };
  }
  app.paint = paint;

  /* ── Display options: what the diagram shows ── */
  var LABEL_DEFAULTS = {
    Bus: ['name', 'vpu', 'ang'],
    Line: ['p', 'q'],
    Transformer: ['name', 'p', 'q'],
    Generator: ['name', 'p', 'q'],
    Load: ['name', 'p', 'q'],
    ShuntImpedance: ['name', 'q'],
    StorageUnit: ['name', 'p', 'q'],
    Link: ['name', 'p', 'loss']
  };
  var QTY = { name: 'Name', vpu: 'V p.u.', vkv: 'V kV', ang: 'Angle', p: 'P', q: 'Q', s: 'S', load: 'Loading', loss: 'Losses', i: 'Current', tap: 'Tap', pf: 'cos φ' };
  var CLASS_TITLE = { Bus: 'Buses', Line: 'Lines', Transformer: 'Transformers', Generator: 'Generators and grids', Load: 'Loads',
                      ShuntImpedance: 'Shunts', StorageUnit: 'Storage', Link: 'HVDC links' };
  function lbId(c, q){ return 'lb_' + c + '_' + q; }
  function buildLabelMatrix(){
    var html = '';
    LF.CLASSES.forEach(function(c){
      html += '<div class="field-group lbl-group" data-c="' + c + '"><div class="group-title">' + CLASS_TITLE[c] + '</div><div class="lbl-chips">';
      LF.LABELS[c].forEach(function(q){
        var on = LABEL_DEFAULTS[c].indexOf(q) >= 0;
        html += '<label class="lbl-chip"><input type="checkbox" id="' + lbId(c, q) + '"' + (on ? ' checked' : '') + '/>' + QTY[q] + '</label>';
      });
      html += '</div></div>';
    });
    $('labelMatrix').innerHTML = html + '<p class="note" id="lblEmpty" hidden>Add elements to the diagram to choose their labels.</p>';
  }
  // Only the kinds on the diagram are listed. A hidden group keeps its boxes, so
  // its choices still save and come back with the elements.
  function syncLabelMatrix(){
    var used = {};
    app.model.el.forEach(function(e){ used[e.c] = 1; });
    Array.prototype.forEach.call(document.querySelectorAll('#labelMatrix .lbl-group'), function(g){ g.hidden = !used[g.getAttribute('data-c')]; });
    var empty = $('lblEmpty');
    if(empty) empty.hidden = Object.keys(used).length > 0;
  }
  function num(id, d){ var v = parseFloat($(id).value); return isFinite(v) ? v : d; }
  function display(){
    var labels = {};
    LF.CLASSES.forEach(function(c){
      labels[c] = {};
      LF.LABELS[c].forEach(function(q){ var el = $(lbId(c, q)); labels[c][q] = !!(el && el.checked); });
    });
    var vmin = Math.min(Math.max(num('lfVmin', 0.95), 0.5), 1), vmax = Math.min(Math.max(num('lfVmax', 1.05), 1), 1.5);
    return { labels: labels, colourBy: $('colourBy').value, vmin: vmin, vmax: vmax,
             loadMax: Math.min(Math.max(num('lfLoadMax', 100), 10), 200), animP: $('animP').checked, animQ: $('animQ').checked };
  }
  function solveOptions(){
    return LF.solveOptions({ method: $('lfMethod').value, tol: $('lfTol').value, seed: $('lfSeed').value,
                             distSlack: $('lfDistSlack').checked, slackW: $('lfSlackW').value });
  }
  app.display = display;

  /* ── Drawing ── */
  var G = LF.G;
  function hitLayer(){
    var s = '', L = app.L;
    Object.keys(L.br).forEach(function(id){ s += '<path d="' + LF.pathD(L.br[id].pts) + '" fill="none" stroke="none" stroke-width="16" pointer-events="stroke" data-id="' + id + '"/>'; });
    Object.keys(L.bus).forEach(function(id){
      var g = L.bus[id], pad = g.node ? 9 : 7;
      s += '<rect x="' + (Math.min(g.x1, g.x2) - pad) + '" y="' + (Math.min(g.y1, g.y2) - pad) + '" width="' + (Math.abs(g.x2 - g.x1) + 2 * pad) + '" height="' + (Math.abs(g.y2 - g.y1) + 2 * pad) + '" fill="none" pointer-events="all" data-id="' + id + '"/>';
    });
    Object.keys(L.dev).forEach(function(id){
      var g = L.dev[id];
      s += '<circle cx="' + g.cx + '" cy="' + g.cy + '" r="17" fill="none" pointer-events="all" data-id="' + id + '"/>';
    });
    return s;
  }
  // A run that did not converge stopped somewhere arbitrary, so none of it is drawn.
  function shownResults(){ return app.res && app.res.report && app.res.report.ok && app.res.report.converged ? app.res : null; }
  /* The flow arrows outlive a render: a lane keeps its elements, and so its
     running arrows, while its markup is unchanged. Dragging a part rebuilds only
     the lanes it moves, not the hundreds of animated arrows around it. */
  var under = null, flow = null, over = null, laneEls = new Map();
  function syncFlow(lanes){
    var next = new Map(), add = [];
    lanes.forEach(function(l){
      var html = LF.laneSvg([l]), key = html;
      while(next.has(key)) key += '+';
      var g = laneEls.get(key);
      if(g){ laneEls.delete(key); next.set(key, g); } else add.push([key, html]);
    });
    laneEls.forEach(function(g){ g.remove(); });
    if(add.length){
      var first = flow.children.length;
      flow.insertAdjacentHTML('beforeend', add.map(function(a){ return a[1]; }).join(''));
      add.forEach(function(a, i){ next.set(a[0], flow.children[first + i]); });
    }
    laneEls = next;
  }
  function render(){
    var d = display();
    var p = paint();
    app.L = LF.layout(app.model);
    var sc = app.scene = LF.draw(app.model, app.L, shownResults(), d, p);
    var C = sc.colours;
    if(!flow){
      svg.innerHTML = '<g></g><g class="lyr-res"><g class="lyr-flow"></g></g><g></g>';
      under = svg.firstChild; flow = svg.querySelector('.lyr-flow'); over = svg.lastChild;
    }
    under.innerHTML =
      '<defs><pattern id="lfDots" width="' + G + '" height="' + G + '" patternUnits="userSpaceOnUse"><circle cx="' + G / 2 + '" cy="' + G / 2 + '" r="0.8" fill="' + C.border + '"/></pattern></defs>' +
      (app.readOnly ? '' : '<rect class="lf-grid" x="-100000" y="-100000" width="200000" height="200000" fill="url(#lfDots)" pointer-events="none"/>') +
      '<g class="lyr-base">' + sc.base + '</g>';
    syncFlow(sc.lanes);
    over.innerHTML =
      '<g class="lyr-hit">' + hitLayer() + '</g>' +
      '<g class="lyr-lbl">' + LF.labelSvg(sc.labels, C, function(l){ return !l.res; }) + '</g>' +
      '<g class="lyr-res">' + LF.labelSvg(sc.labels, C, function(l){ return l.res; }) + '</g>' +
      '<g class="lyr-ovl"></g><g class="lyr-tmp"></g>';
    svg.classList.toggle('no-p', !d.animP);
    svg.classList.toggle('no-q', !d.animQ);
    $('gifBtn').hidden = !(shownResults() && (d.animP || d.animQ));
    syncLabelMatrix();
    renderOverlay();
    applyView();
    setSig(d);
  }
  app.render = render;
  var rafPending = false;
  app.renderSoon = function(){
    if(rafPending) return;
    rafPending = true;
    requestAnimationFrame(function(){ rafPending = false; render(); });
  };

  // Selection outlines and the handles of a single selected element.
  function renderOverlay(){
    var g = svg.querySelector('.lyr-ovl');
    if(!g) return;
    if(app.readOnly){ g.innerHTML = ''; return; }
    var C = app.scene.colours, s = '', L = app.L;
    var hl = 'fill="none" stroke="' + C.accent + '" stroke-opacity=".38" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"';
    app.sel.forEach(function(id){
      if(L.bus[id]){ var b = L.bus[id]; s += '<path d="M' + b.x1 + ' ' + b.y1 + 'L' + b.x2 + ' ' + b.y2 + '" stroke-width="13" ' + hl + '/>'; }
      else if(L.br[id]) s += '<path d="' + LF.pathD(L.br[id].pts) + '" stroke-width="9" ' + hl + '/>';
      else if(L.dev[id]){ var d = L.dev[id]; s += '<circle cx="' + d.cx + '" cy="' + d.cy + '" r="17" stroke-width="5" ' + hl + '/>'; }
    });
    if(app.sel.size === 1){
      var id = app.sel.values().next().value, H = 'fill="' + C.bg + '" stroke="' + C.accent + '" stroke-width="2"';
      if(L.bus[id]){
        var b = L.bus[id];
        // A node has no length to drag.
        if(!b.node) s += '<rect data-h="end1" x="' + (b.x1 - 5) + '" y="' + (b.y1 - 5) + '" width="10" height="10" rx="2" ' + H + ' style="cursor:' + (b.v ? 'ns' : 'ew') + '-resize"/>';
        if(!b.node) s += '<rect data-h="end2" x="' + (b.x2 - 5) + '" y="' + (b.y2 - 5) + '" width="10" height="10" rx="2" ' + H + ' style="cursor:' + (b.v ? 'ns' : 'ew') + '-resize"/>';
        var kx = b.v ? b.x2 : b.x2 + 20, ky = b.v ? b.y2 + 20 : b.y2;
        s += '<g data-h="knob" style="cursor:crosshair"><title>Drag to another bus to connect</title><circle cx="' + kx + '" cy="' + ky + '" r="8" fill="' + C.accent + '"/>' +
             '<path d="M' + (kx - 4) + ' ' + ky + 'h8M' + kx + ' ' + (ky - 4) + 'v8" stroke="' + C.bg + '" stroke-width="2" stroke-linecap="round"/></g>';
      } else if(L.br[id]){
        var r = L.br[id];
        s += '<circle data-h="p0" cx="' + r.p0.x + '" cy="' + r.p0.y + '" r="5.5" ' + H + ' style="cursor:move"/>';
        s += '<circle data-h="p1" cx="' + r.p1.x + '" cy="' + r.p1.y + '" r="5.5" ' + H + ' style="cursor:move"/>';
        if(r.pts.length === 4){
          var a = r.pts[1], c = r.pts[2], mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, vert = a[0] === c[0];
          s += '<rect data-h="mid" x="' + (mx - 4.5) + '" y="' + (my - 4.5) + '" width="9" height="9" transform="rotate(45 ' + mx + ' ' + my + ')" ' + H + ' style="cursor:' + (vert ? 'ew' : 'ns') + '-resize"/>';
        }
      }
    }
    g.innerHTML = s;
  }
  app.renderOverlay = renderOverlay;

  /* ── The view: pan and zoom are the SVG's viewBox ── */
  function stageSize(){ return { w: stage.clientWidth || 800, h: stage.clientHeight || 600 }; }
  function applyView(){
    if(!app.view) fit();
    var v = app.view;
    svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
    var grid = svg.querySelector('.lf-grid');
    if(grid) grid.style.opacity = stageSize().w / v.w < 0.55 ? '0' : '1';
  }
  // The extent fit() frames. A read-only view (an embed) measures what is
  // drawn, labels included (it has no grid to measure, and the flow's arrows
  // move), and only ever grows it while the network stays put, so a label
  // changing width hour by hour does not rock the frame.
  function drawnBox(){
    var bb = app.scene ? app.scene.bbox : { x: 0, y: 0, w: 800, h: 500 };
    if(!app.readOnly || !under) return bb;
    var net = [bb.x, bb.y, bb.w, bb.h].join(), o = app.drawn && app.drawn.net === net ? app.drawn : null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    [under.querySelector('.lyr-base'), over.querySelector('.lyr-lbl'), over.querySelector('.lyr-lbl + .lyr-res')].forEach(function(g){
      var b = null;
      try { b = g && g.getBBox(); } catch(e){}
      if(!b || !(b.width > 0 && b.height > 0)) return;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
    });
    if(!isFinite(x0)) return o || bb;
    if(o){ x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h); }
    return (app.drawn = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, net: net });
  }
  function fit(){
    var bb = drawnBox();
    var s = stageSize(), pad = 28;
    var k = Math.min(s.w / (bb.w + 2 * pad), s.h / (bb.h + 2 * pad), 1.5);
    if(!isFinite(k) || k <= 0) k = 1;
    var w = s.w / k, h = s.h / k;
    app.view = { x: bb.x + bb.w / 2 - w / 2, y: bb.y + bb.h / 2 - h / 2, w: w, h: h };
  }
  // An embed's frame is as tall as the diagram is drawn at the frame's
  // width, so fit() fills it edge to edge with only its margin to spare.
  if(window.SharedShare && SharedShare.fit) SharedShare.fit('sldStage', function(width){
    var bb = drawnBox(), pad = 28;
    return (bb.h + 2 * pad) * Math.min(width / (bb.w + 2 * pad), 1.5);
  });
  // app.userView: the reader has panned or zoomed. Until then the diagram is
  // kept framed in whatever room it gets (a resized window, an embed's frame).
  app.fit = function(){ app.userView = false; fit(); applyView(); };
  app.zoomAt = function(factor, cx, cy){
    app.fitPending = false; app.userView = true;
    var v = app.view, s = stageSize();
    var k = s.w / v.w * factor;
    k = Math.min(4, Math.max(0.15, k));
    var w = s.w / k, h = s.h / k;
    if(cx === undefined){ cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
    var fx = (cx - v.x) / v.w, fy = (cy - v.y) / v.h;
    app.view = { x: cx - fx * w, y: cy - fy * h, w: w, h: h };
    applyView();
  };
  app.panBy = function(dx, dy){ app.fitPending = false; app.userView = true; app.view.x -= dx; app.view.y -= dy; applyView(); };
  app.applyView = applyView;
  if(window.ResizeObserver){
    var lastW = 0;
    new ResizeObserver(function(){
      var s = stageSize();
      if(!app.view || !lastW){ lastW = s.w; return; }
      if(!app.userView){ lastW = s.w; fit(); applyView(); return; }
      // The reader's own view keeps its scale and centre.
      var k = lastW / app.view.w;
      var cx = app.view.x + app.view.w / 2, cy = app.view.y + app.view.h / 2;
      app.view = { x: cx - s.w / k / 2, y: cy - s.h / k / 2, w: s.w / k, h: s.h / k };
      lastW = s.w;
      applyView();
    }).observe(stage);
  }

  /* ── What changed, and what it costs ──
     'geom' moves or renames: drawn again, results still valid.
     'elec' changes what the power flow sees: the results step back.
     Both are undoable and saved. */
  var history = [], hIdx = -1, lastMerge = null, lastMergeAt = 0;
  function snap(){ return JSON.stringify(LF.compact(app.model)); }
  function pushHistory(mergeKey){
    var now = Date.now();
    var s = snap();
    if(hIdx >= 0 && history[hIdx] === s) return;
    if(mergeKey && mergeKey === lastMerge && now - lastMergeAt < 900 && hIdx > 0){ history[hIdx] = s; lastMergeAt = now; return; }
    history = history.slice(0, hIdx + 1);
    history.push(s);
    if(history.length > 200) history.shift();
    hIdx = history.length - 1;
    lastMerge = mergeKey || null; lastMergeAt = now;
    syncUndo();
  }
  function restoreHistory(i){
    if(i < 0 || i >= history.length) return;
    hIdx = i;
    var keep = new Set(app.sel);
    app.model = LF.load(JSON.parse(history[i]));
    var ids = LF.byId(app.model);
    app.sel = new Set(Array.from(keep).filter(function(id){ return ids[id]; }));
    lastMerge = null;
    afterChange();
    syncUndo();
  }
  app.undo = function(){ restoreHistory(hIdx - 1); };
  app.redo = function(){ restoreHistory(hIdx + 1); };
  function syncUndo(){
    var u = $('undoBtn'), r = $('redoBtn');
    if(u) u.disabled = hIdx <= 0;
    if(r) r.disabled = hIdx >= history.length - 1;
  }
  function afterChange(){
    render();
    renderInspector();
    updateStale();
    if(persist) persist.schedule();
  }
  app.change = function(kind, mergeKey){
    pushHistory(mergeKey);
    afterChange();
  };
  // Live edits from the inspector draw without rebuilding the inspector.
  function changeFromField(mergeKey){
    pushHistory(mergeKey);
    app.renderSoon();
    updateStale();
    refreshDerived();
    if(persist) persist.schedule();
  }

  /* ── The Run gate ── */
  function solveKey(){ return LF.elecKey(app.model) + '|' + JSON.stringify(solveOptions()); }
  function isStale(){ return !app.res || solveKey() !== app.solvedKey; }
  function updateStale(){
    var stale = !running && isStale();
    document.body.classList.toggle('is-stale', stale && !!app.res);
    $('runBtn').classList.toggle('needs-run', stale);
    $('staleNote').textContent = app.res ? 'The network changed. Press Run load flow to solve it.' : 'Press Run load flow to solve the network.';
    if(!app.res) document.body.classList.toggle('is-stale', false);
    // A stale result keeps its arrows, faded and standing still.
    if(svg.pauseAnimations){ if(stale && app.res) svg.pauseAnimations(); else svg.unpauseAnimations(); }
  }
  app.updateStale = updateStale;
  var running = false;
  function run(){
    var model = app.model;
    var opts = solveOptions();
    running = true;
    $('runBtn').disabled = true;
    setSub('Solving…');
    // Checked once the engine is in, so the standard types are known.
    return engine().then(function(m){
      var v = LF.validate(model, opts);
      renderIssues(v);
      if(v.errors.length){
        app.res = { report: { ok: false, error: '', blocked: v.errors }, bus: {}, br: {}, dev: {} };
        app.solvedKey = solveKey();
        return;
      }
      // A paint first, so the press is seen even on a big network.
      return new Promise(function(r){ setTimeout(r, 0); }).then(function(){
        var t0 = performance.now();
        var res = LF.solve(m, model, opts);
        res.report.ms = performance.now() - t0;
        res.validation = v;
        app.res = res;
        app.solvedKey = solveKey();
        try { performance.mark('lf-solved'); } catch(e){}
      });
    }, function(err){
      app.res = { report: { ok: false, error: 'The load flow engine could not load. Check your connection and press Run load flow again.' }, bus: {}, br: {}, dev: {} };
      app.solvedKey = null;
      if(window.console) console.warn(err);
    }).then(function(){
      running = false;
      $('runBtn').disabled = false;
      showResults();
      render();
      // A newly opened network is framed again once its result labels are drawn.
      if(app.fitPending){ app.fitPending = false; app.fit(); }
      updateStale();
      return app.res;
    });
  }
  app.run = run;
  $('runBtn').addEventListener('click', function(){ run(); });

  /* ── Results ── */
  var F = LF.fmt;
  function setSub(t){ $('sldSub').textContent = t; }
  function esc(s){ return LF.esc(s); }
  function name(id){ var e = LF.byId(app.model)[id]; return e ? LF.nameOf(e) : '?'; }
  function showResults(){
    var res = app.res, r = res && res.report;
    var d = display();
    ['mConv', 'mLoss', 'mVolt', 'mLoad'].forEach(function(id){ $(id).classList.remove('neg'); });
    if(!r) return;
    // A run that could not solve says why in the Load flow metric.
    if(r.blocked || !r.ok){
      var why = r.blocked ? r.blocked.map(function(x){ return x.msg; }).join(' ') : (r.error || 'No result.');
      setSub(r.blocked ? 'Not solved: the network has ' + (r.blocked.length === 1 ? 'a problem' : 'problems') + ' to fix first.' : 'Not solved.');
      clearKpis();
      $('mConv').textContent = r.blocked ? 'Fix ' + (r.blocked.length === 1 ? 'one problem' : r.blocked.length + ' problems') : 'Not solved';
      $('mConv').classList.add('neg');
      $('mConvSub').textContent = why;
      renderTable(); renderAssumptions();
      return;
    }
    var t = res.totals, ac = r.method === 'ac';
    var buses = app.model.el.filter(function(e){ return e.c === 'Bus' && res.bus[e.id]; });
    var lo = null, hi = null;
    if(ac) buses.forEach(function(b){
      var v = res.bus[b.id].v;
      if(!lo || v < res.bus[lo.id].v) lo = b;
      if(!hi || v > res.bus[hi.id].v) hi = b;
    });
    var outV = ac ? buses.filter(function(b){ var v = res.bus[b.id].v; return v < d.vmin - 1e-9 || v > d.vmax + 1e-9; }) : [];
    var brs = app.model.el.filter(function(e){ return LF.BRANCH[e.c] && res.br[e.id]; });
    var top = null;
    brs.forEach(function(e){ var l = res.br[e.id].load; if(isFinite(l) && (!top || l > res.br[top.id].load)) top = e; });
    var over = brs.filter(function(e){ var l = res.br[e.id].load; return isFinite(l) && l > d.loadMax + 1e-9; });
    var bad = !r.converged;
    var ms = r.ms < 1 ? '<1 ms' : Math.round(r.ms) + ' ms';
    // The checks' warnings are part of the answer: a load left out or a mismatched
    // voltage changes what the numbers mean.
    var warns = (res.validation && res.validation.warnings) || [];
    var warnTxt = warns.length ? ' ' + (warns.length === 1 ? 'One warning' : warns.length + ' warnings') + ' in Checks.' : '';
    var linkLoss = brs.reduce(function(a, e){ return e.c === 'Link' ? a + res.br[e.id].loss : a; }, 0);
    if(bad){
      setSub('AC load flow, Newton-Raphson, did not converge. Solved by PSA.js in ' + ms + '.' + warnTxt);
      clearKpis();
      $('mConv').textContent = 'Not converged';
      $('mConv').classList.add('neg');
      $('mConvSub').textContent = 'Largest mismatch ' + (r.mismatch ? r.mismatch.toExponential(1) : '0') + ' MW';
      renderTable(); renderAssumptions();
      return;
    }
    setSub((ac ? 'AC load flow, Newton-Raphson' : 'DC load flow') + (bad ? ', did not converge' : ac ? ', converged in ' + r.iters + ' iteration' + (r.iters === 1 ? '' : 's') : '') +
           (ac && !bad ? '. Losses ' + F.p(t.loss) + ' MW.' : '.') + ' Solved by PSA.js in ' + ms + '.' + warnTxt);
    // KPIs
    $('mConv').textContent = bad ? 'Not converged' : ac ? r.iters + ' iteration' + (r.iters === 1 ? '' : 's') : 'DC, linear';
    if(bad) $('mConv').classList.add('neg');
    $('mConvSub').textContent = ac ? 'Largest mismatch ' + (r.mismatch ? r.mismatch.toExponential(1) : '0') + ' MW' + (r.islands.length > 1 ? ', ' + r.islands.length + ' islands' : '') : 'No iterations needed';
    $('mLoss').textContent = ac ? F.p(t.loss) + ' MW' : F.p(linkLoss) + ' MW';
    $('mLossSub').textContent = ac || linkLoss > 1e-9 ? (t.gen > 0 ? F.pct(100 * (ac ? t.loss : linkLoss) / t.gen) + '% of ' + F.p(t.gen) + ' MW supplied' + (ac ? '' : ', in links only') : '') : 'A DC load flow is lossless';
    if(ac && lo){
      $('mVolt').textContent = F.vl(res.bus[lo.id].v, d.vmin, d.vmax) + ' to ' + F.vl(res.bus[hi.id].v, d.vmin, d.vmax);
      $('mVoltSub').textContent = 'p.u., lowest at ' + LF.nameOf(lo) + ', highest at ' + LF.nameOf(hi);
      if(outV.length) $('mVolt').classList.add('neg');
    } else { $('mVolt').textContent = ac ? '–' : '1.000'; $('mVoltSub').textContent = ac ? '' : 'p.u. everywhere in a DC load flow'; }
    if(top){
      $('mLoad').textContent = F.pctl(res.br[top.id].load, d.loadMax) + '%';
      $('mLoadSub').textContent = LF.nameOf(top) + ', of ' + F.p(res.br[top.id].rating) + (top.c === 'Link' ? ' MW' : ' MVA');
      if(over.length) $('mLoad').classList.add('neg');
    } else { $('mLoad').textContent = '–'; $('mLoadSub').textContent = 'No branch has a rating'; }
    renderTable();
    renderAssumptions();
  }
  function clearKpis(){
    ['mConv', 'mLoss', 'mVolt', 'mLoad'].forEach(function(id){ $(id).textContent = '–'; $(id + 'Sub').textContent = ''; });
  }

  /* Tables */
  var tableKind = 'bus';
  function tableData(){
    var res = shownResults(), m = app.model, rows = [], head, units, dsp = display();
    var ac = res && res.report.method === 'ac';
    if(tableKind === 'bus'){
      head = ['Bus', 'Nominal kV', 'V p.u.', 'V kV', 'Angle °', 'P MW', 'Q MVAr', 'Type', 'Island'];
      units = 'Voltages in per unit and kV, angles in degrees. P and Q are the net power each bus takes in from its sources and loads.';
      m.el.forEach(function(e){
        if(e.c !== 'Bus') return;
        var r = res && res.bus[e.id];
        rows.push({ id: e.id, cells: [LF.nameOf(e), e.v_nom, r && ac ? F.vl(r.v, dsp.vmin, dsp.vmax) : r ? '1.000' : '–', r ? F.kv(r.vkv) : '–', r ? F.ang(r.ang) : '–',
                    r ? F.p(r.p) : '–', r && ac ? F.p(r.q) : '–', r ? r.control || '' : '', r ? +r.island + 1 : ''],
                    neg: r && ac ? (r.v < dsp.vmin - 1e-9 || r.v > dsp.vmax + 1e-9 ? [2, 3] : []) : [] });
      });
    } else if(tableKind === 'branch'){
      head = ['Branch', 'Kind', 'From', 'To', 'P from MW', 'Q from MVAr', 'P to MW', 'Q to MVAr', 'Losses MW', 'Loading %', 'Current kA'];
      units = 'Power in MW and MVAr flowing into the branch at each end, so the two ends add up to the losses.';
      m.el.forEach(function(e){
        if(!LF.BRANCH[e.c]) return;
        var r = res && res.br[e.id];
        var over = r && isFinite(r.load) && r.load > dsp.loadMax + 1e-9;
        rows.push({ id: e.id, cells: [LF.nameOf(e), LF.WORD[e.c], name(e.bus0), name(e.bus1), r ? F.p(r.p0) : '–', r && isFinite(r.q0) ? F.p(r.q0) : '–',
                    r ? F.p(r.p1) : '–', r && isFinite(r.q1) ? F.p(r.q1) : '–', r ? F.p(r.loss) : '–', r && isFinite(r.load) ? F.pctl(r.load, dsp.loadMax) : '–', r && isFinite(r.i) ? F.ka(r.i) : '–'],
                    neg: over ? [9] : [] });
      });
    } else {
      head = ['Device', 'Kind', 'Bus', 'P MW', 'Q MVAr', 'cos φ'];
      units = 'Sources and storage are positive when supplying, loads when drawing. A shunt shows the reactive power it supplies.';
      m.el.forEach(function(e){
        if(!LF.DEVICE[e.c]) return;
        var r = res && res.dev[e.id];
        var kind = e.c === 'Generator' ? (e.grid ? 'Grid, ' : 'Generator, ') + e.control : LF.WORD[e.c];
        rows.push({ id: e.id, cells: [LF.nameOf(e), kind, e.bus ? name(e.bus) : 'not on a bus', r ? F.p(r.p) : '–', r && ac ? F.p(r.q) : '–', r && ac ? F.pf(r.p, r.q) : '–'], neg: [] });
      });
    }
    return { head: head, rows: rows, units: units };
  }
  function renderTable(){
    var t = tableData();
    $('tableUnits').textContent = t.units;
    var h = '<table><thead><tr>' + t.head.map(function(x){ return '<th>' + SharedTable.head(x) + '</th>'; }).join('') + '</tr></thead><tbody>';
    t.rows.forEach(function(r){
      h += '<tr data-row="' + r.id + '"' + (app.sel.has(r.id) ? ' class="is-sel"' : '') + '>' + r.cells.map(function(c, i){
        return '<td' + (r.neg.indexOf(i) >= 0 ? ' class="neg"' : '') + '>' + esc(c) + '</td>';
      }).join('') + '</tr>';
    });
    $('tableWrap').innerHTML = h + '</tbody></table>';
  }
  $('tableTabs').addEventListener('click', function(e){
    var b = e.target.closest('.seg-btn');
    if(!b) return;
    tableKind = b.getAttribute('data-val');
    Array.prototype.forEach.call(this.querySelectorAll('.seg-btn'), function(x){ x.classList.toggle('active', x === b); });
    renderTable();
  });
  $('tableWrap').addEventListener('click', function(e){
    var tr = e.target.closest('tr[data-row]');
    if(!tr || app.readOnly) return;
    app.select([+tr.getAttribute('data-row')]);
  });
  $('csvBtn').addEventListener('click', function(){
    var t = tableData();
    // A name that a spreadsheet would read as a formula gets a leading ' (numbers are left alone).
    var q = function(s){
      s = String(s).replace(/−/g, '-');
      if(/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d,.]*(e[+-]?\d+)?$/i.test(s)) s = "'" + s;
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var csv = [t.head.map(q).join(',')].concat(t.rows.map(function(r){ return r.cells.map(q).join(','); })).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'load-flow-' + (tableKind === 'bus' ? 'buses' : tableKind === 'branch' ? 'branches' : 'devices') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  });
  if(window.SharedFold) SharedFold.attach($('tablesCard'), { key: 'loadflow-simulator', bodies: ['#tableUnits', '#tableWrap'] });

  /* What this assumes, from the reader's own network */
  function renderAssumptions(){
    var res = shownResults(), m = app.model, o = solveOptions(), d = display(), li = [];
    var has = function(c, f){ return m.el.some(function(e){ return e.c === c && (!f || f(e)); }); };
    li.push('A balanced three-phase network in steady state, one snapshot, solved by PSA.js as PyPSA solves it.');
    if(o.method === 'ac'){
      li.push('Newton-Raphson stops at a mismatch of ' + String(o.tol).replace('e-', '×10<sup>−') + (String(o.tol).indexOf('e-') >= 0 ? '</sup>' : '') + ' MW or MVAr, after at most 100 iterations, starting from ' + (o.seed === 'dc' ? 'the DC load flow.' : 'a flat 1 p.u., 0° start.'));
      li.push('Impedances are per unit on 1 MVA and each bus\'s nominal voltage; a transformer\'s own values are per unit on its rating.');
      if(has('Load')) li.push('Loads draw constant power whatever the voltage.');
      if(has('Generator', function(e){ return e.control !== 'PQ'; })) li.push('Generators have no reactive power limits: a PV unit holds its voltage whatever reactive power that takes.');
      if(has('ShuntImpedance')) li.push('Shunts are constant impedances, so their power scales with the voltage squared.');
    } else {
      li.push('The DC load flow keeps every voltage at 1 p.u., ignores resistance, and has no losses or reactive power.');
    }
    if(res && res.report.islands){
      res.report.islands.forEach(function(isl){
        if(isl.slackBus === null) return;
        var b = name(isl.slackBus);
        var many = isl.buses.length > 1 ? ' and balances its island' : '';
        if(isl.slackGen) li.push('<strong>' + esc(name(isl.slackGen)) + '</strong> at ' + esc(b) + ' is the slack' + many + '.');
        else if(isl.buses.length > 1 || m.el.some(function(e){ return LF.DEVICE[e.c] && e.bus === isl.slackBus; })) li.push(esc(b) + ' has no generator in its island, so it is held at 1 p.u. as an ideal source' + many + '.');
      });
    }
    if(o.method === 'ac' && o.distSlack) li.push('The slack is shared among each island\'s generators in proportion to their ' + (o.slackW === 'p_nom' ? 'ratings' : 'dispatch') + '.');
    if(has('Line', function(e){ return !!LF.lineType(e); }) || has('Transformer', function(e){ return !!LF.trType(e); }))
      li.push('Standard types use PyPSA\'s 50 Hz data. A typed line is rated √3 × voltage × rated current × circuits.');
    if(has('Link')) li.push('HVDC links carry a fixed active power and lose (1 − efficiency) of it. They carry no reactive power and do not join islands.');
    if(has('StorageUnit')) li.push('Storage units are fixed injections, positive when discharging.');
    if(o.method === 'ac') li.push('Limits read the result only: ' + d.vmin + ' to ' + d.vmax + ' p.u. and ' + d.loadMax + '% loading.');
    $('assumptions').innerHTML = li.map(function(x){ return '<li>' + x + '</li>'; }).join('');
  }

  /* ── The share signature: what the diagram draws, to tell when it has settled ── */
  function setSig(d){
    var res = app.res;
    var digest = !res ? '' : res.report && res.report.ok ? JSON.stringify(res.raw, function(k, v){ return typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v; }) : 'err';
    if(!res){ stage.removeAttribute('data-share-sig'); return; }
    stage.setAttribute('data-share-sig', LF.hash(JSON.stringify(LF.compact(app.model)) + JSON.stringify(d) + digest + (isStale() ? 'stale' : '')));
  }

  /* ── Hover readout ── */
  var hovered = null;
  app.hover = function(id){
    if(id === hovered) return;
    hovered = id;
    writeHover(id !== null && id !== undefined ? id : (app.sel.size === 1 ? app.sel.values().next().value : null));
  };
  function writeHover(id){
    var box = $('hoverBox');
    var e = id !== null && id !== undefined ? LF.byId(app.model)[id] : null;
    if(!e){ box.innerHTML = app.readOnly ? 'Hover or tap an element to read its values.' : 'Hover or tap an element to read its values. Drag a part from the toolbar onto the diagram to add it.'; return; }
    var res = shownResults(), ac = res && res.report.method === 'ac', parts = [], dsp = display();
    var n = '<strong>' + esc(LF.nameOf(e)) + '</strong>';
    var mono = function(s){ return '<span class="mono">' + s + '</span>'; };
    if(e.c === 'Bus'){
      parts.push(n + ', ' + e.v_nom + ' kV bus');
      var r = res && res.bus[e.id];
      if(r){
        if(ac) parts.push('V ' + mono(F.vl(r.v, dsp.vmin, dsp.vmax) + ' p.u. (' + F.kv(r.vkv) + ' kV)'));
        parts.push('angle ' + mono(F.ang(r.ang) + '°'));
        parts.push('net injection ' + mono(F.p(r.p) + ' MW' + (ac ? ', ' + F.p(r.q) + ' MVAr' : '')));
        if(r.control) parts.push(r.control + ' bus');
      }
    } else if(LF.BRANCH[e.c]){
      parts.push(n + ', ' + LF.WORD[e.c].toLowerCase() + ' from ' + esc(name(e.bus0)) + ' to ' + esc(name(e.bus1)));
      var b = res && res.br[e.id];
      if(b){
        parts.push('in at ' + esc(name(e.bus0)) + ' ' + mono(F.p(b.p0) + ' MW' + (ac && isFinite(b.q0) ? ', ' + F.p(b.q0) + ' MVAr' : '')));
        parts.push('in at ' + esc(name(e.bus1)) + ' ' + mono(F.p(b.p1) + ' MW' + (ac && isFinite(b.q1) ? ', ' + F.p(b.q1) + ' MVAr' : '')));
        if(ac || e.c === 'Link') parts.push('losses ' + mono(F.p(b.loss) + ' MW'));
        if(isFinite(b.load)) parts.push('loading ' + mono(F.pctl(b.load, dsp.loadMax) + '%') + ' of ' + mono(F.p(b.rating) + (e.c === 'Link' ? ' MW' : ' MVA')));
        if(isFinite(b.i)) parts.push(mono(F.ka(b.i) + ' kA'));
      }
    } else {
      var kind = e.c === 'Generator' ? (e.grid ? 'external grid, ' : 'generator, ') + e.control : LF.WORD[e.c].toLowerCase();
      parts.push(n + ', ' + kind + (e.bus ? ' on ' + esc(name(e.bus)) : ', not on a bus'));
      var dv = res && res.dev[e.id];
      if(dv){
        parts.push('P ' + mono(F.p(dv.p) + ' MW'));
        if(ac) parts.push('Q ' + mono(F.p(dv.q) + ' MVAr'));
        if(ac && e.c !== 'ShuntImpedance') parts.push('cos φ ' + mono(F.pf(dv.p, dv.q)));
      }
    }
    box.innerHTML = parts.join(' · ');
  }

  /* ── Selection ── */
  app.select = function(ids, add){
    if(app.readOnly) return;
    if(!add) app.sel = new Set();
    (ids || []).forEach(function(id){
      if(add && app.sel.has(id)) app.sel.delete(id); else app.sel.add(id);
    });
    renderOverlay();
    renderInspector();
    writeHover(app.sel.size === 1 ? app.sel.values().next().value : null);
    Array.prototype.forEach.call(document.querySelectorAll('#tableWrap tr[data-row]'), function(tr){ tr.classList.toggle('is-sel', app.sel.has(+tr.getAttribute('data-row'))); });
    document.body.classList.toggle('lf-sheet', app.sel.size > 0 && window.matchMedia('(max-width:1100px)').matches);
    document.body.classList.toggle('lf-has-sel', app.sel.size > 0);
    // The inspector lives in the folded control card. As a sheet or over the
    // full-screen diagram it is an overlay, held open only while something is
    // selected; beside the diagram, opening it moves the diagram, so it opens
    // once and stays open.
    if(window.SharedCtrl){
      var overlay = document.body.classList.contains('lf-sheet') || document.documentElement.classList.contains('sld-full-open');
      if(app.sel.size && !overlay && !SharedCtrl.isOpen()) SharedCtrl.open();
      SharedCtrl.hold('selection', app.sel.size > 0 && overlay);
    }
    if(app.sel.size) showTab('element');
  };

  /* ── New elements, sized to the voltage they join ── */
  var LINE_BY_KV = [[0.4, 'NAYY 4x150 SE', 0.2], [10, 'NA2XS2Y 1x240 RM/25 6/10 kV', 2], [20, 'NA2XS2Y 1x240 RM/25 12/20 kV', 3],
                    [110, '243-AL1/39-ST1A 110.0', 20], [220, 'Al/St 240/40 2-bundle 220.0', 50], [380, 'Al/St 240/40 4-bundle 380.0', 80]];
  function scaleFor(kv){ return kv <= 1 ? 0.01 : kv <= 36 ? 0.1 : kv <= 150 ? 1 : 5; }
  app.newElement = function(c, extra){
    var m = app.model, id = m.next++;
    var e = { c: LF.toolClass(c), id: id, name: c === 'Grid' ? 'Grid ' + id : '' };
    var d = LF.DEFAULTS[e.c];
    for(var k in d) e[k] = d[k];
    var nw = LF.NEW[c] || {};
    for(var k2 in nw) e[k2] = nw[k2];
    for(var k3 in extra) e[k3] = extra[k3];
    var byId = LF.byId(m);
    var kv = e.c === 'Bus' ? e.v_nom : LF.isBranch(e) ? (byId[e.bus0] ? byId[e.bus0].v_nom : 110) : (byId[e.bus] ? byId[e.bus].v_nom : 110);
    var s = scaleFor(kv);
    if(e.c === 'Line'){
      var t = LINE_BY_KV.filter(function(r){ return r[0] === kv; })[0];
      if(t && LF.types.line[t[1]]){ e.type = t[1]; e.length = t[2]; e.r = 0; e.x = 0; e.b = 0; e.s_nom = 0; }
      else { var z = kv * kv / 100; e.x = +(0.1 * z).toPrecision(3); e.r = +(0.0125 * z).toPrecision(3); e.b = 0; e.s_nom = 100 * s; }
    }
    if(e.c === 'Transformer'){ e.s_nom = kv <= 1 ? 0.63 : kv <= 36 ? 0.63 : kv <= 150 ? 40 : 250; e.x = kv <= 36 ? 0.06 : 0.12; e.r = 0.01; }
    if(e.c === 'Load'){ e.p_set = 20 * s; e.q_set = 5 * s; }
    if(e.c === 'Generator' && e.control !== 'Slack'){ e.p_set = 50 * s; e.p_nom = 100 * s; }
    if(e.c === 'StorageUnit'){ e.p_set = 10 * s; e.p_nom = 20 * s; }
    if(e.c === 'Link'){ e.p_set = 50 * s; e.p_nom = 100 * s; }
    if(e.c === 'ShuntImpedance' && kv > 0){ e.b = +(10 * s / (kv * kv)).toPrecision(4); }
    m.el.push(e);
    return e;
  };
  app.deleteSelected = function(){
    if(!app.sel.size) return;
    var gone = app.sel, m = app.model, byId = LF.byId(m), L = app.L;
    // A device on a deleted bus stays where it is drawn, on no bus.
    m.el.forEach(function(e){
      if(LF.DEVICE[e.c] && gone.has(e.bus) && !gone.has(e.id)){
        var g = L.dev[e.id];
        e.bus = null;
        e.at = g ? [Math.round(g.cx / G), Math.round(g.cy / G)] : [0, 0];
      }
    });
    m.el = m.el.filter(function(e){ return !gone.has(e.id) && !(LF.BRANCH[e.c] && (gone.has(e.bus0) || gone.has(e.bus1))); });
    void byId;
    app.sel = new Set();
    app.change('elec');
  };
  app.duplicateSelected = function(){
    if(!app.sel.size) return;
    var m = app.model, map = {}, added = [];
    var src = m.el.filter(function(e){ return app.sel.has(e.id); });
    src.forEach(function(e){
      var c = JSON.parse(JSON.stringify(e));
      c.id = m.next++;
      map[e.id] = c.id;
      if(c.name) c.name = c.name + ' copy';
      if(c.c === 'Bus') c.at = [c.at[0] + 3, c.at[1] + 3, c.at[2], c.at[3]];
      else if(LF.DEVICE[c.c] && c.bus === null && c.at) c.at = [c.at[0] + 3, c.at[1] + 3];
      else if(LF.DEVICE[c.c] && c.at) c.at = null;
      if(LF.BRANCH[c.c]) c.at = null;
      added.push(c);
    });
    added.forEach(function(c){
      if(LF.BRANCH[c.c]){ if(map[c.bus0]) c.bus0 = map[c.bus0]; if(map[c.bus1]) c.bus1 = map[c.bus1]; }
      if(LF.DEVICE[c.c] && map[c.bus]) c.bus = map[c.bus];
      m.el.push(c);
    });
    app.sel = new Set(added.map(function(c){ return c.id; }));
    app.change('elec');
  };

  /* ── The inspector ── */
  var UNIT_TIP = {
    v_nom: 'The line-to-line voltage the bus is rated at. Per-unit values are on it.',
    v_mag_pu_set: 'The voltage a slack or PV unit on this bus holds.',
    length: 'Route length. A line type gives its impedance per kilometre.',
    num_parallel: 'Identical circuits side by side: impedance divides and rating multiplies.',
    r: 'Series resistance of the whole line, not per kilometre.',
    x: 'Series reactance of the whole line, not per kilometre. Negative for a series capacitor.',
    b: 'Shunt susceptance (charging) of the whole line, split half to each end.',
    g: 'Shunt conductance (leakage) of the whole line, usually 0.',
    s_nom: 'Rated apparent power, used only to work out loading.',
    tx_x: 'Series reactance, per unit on the transformer\'s own rating.',
    tx_r: 'Series resistance, per unit on the transformer\'s own rating.',
    tap_ratio: 'Off-nominal turns ratio on the tap side: 1.05 lifts that side\'s winding by 5%.',
    phase_shift: 'Angle the transformer shifts the voltage by, such as 150° for a Dyn5 unit.',
    tap_position: 'Steps away from the neutral tap, within the type\'s range.',
    tx_g: 'Core (iron) loss, per unit on the transformer\'s own rating.',
    tx_b: 'Magnetising current, per unit on the transformer\'s own rating. Negative: the core draws reactive power.',
    tx_model: 'Where the magnetising branch sits.<ul><li><strong>T model:</strong> between two halves of the series impedance, PyPSA\'s default.</li><li><strong>π model:</strong> half at each end.</li></ul>',
    gen_p: 'A fixed output. The slack, not this unit, takes up any imbalance.',
    slack_p: 'With the slack distributed, the unit supplies this plus its share of what is left over.',
    gen_vset: 'The voltage this unit holds at its bus. Every unit on the bus holds the same one.',
    q_set: 'Reactive power, positive when supplying.',
    p_nom: 'Rated power. When the slack is shared by rating, it sets this unit\'s share.',
    link_nom: 'Rated power, used only to work out loading.',
    store_nom: 'Rated power, kept for reference. Storage is a fixed injection, so the load flow never reads it.',
    upright: 'Stands the bar on end. R does the same to every selected bus.',
    upnode: 'Devices leave the node left and right instead of above and below. R does the same to every selected bus.',
    load_p: 'Active power drawn. A negative figure feeds power in, like rooftop solar.',
    load_q: 'Reactive power drawn, positive for an inductive load.',
    shunt_q: 'Reactive power at the bus\'s nominal voltage, positive for a capacitor. Stored as a susceptance, so it scales with V².',
    shunt_p: 'Active power drawn at nominal voltage, stored as a conductance.',
    store_p: 'Active power, positive when discharging into the bus.',
    link_p: 'Active power taken from the first end. A negative figure sends it the other way.',
    eff: 'Share of the power that arrives at the far end.'
  };
  function F_(k, label, unit, o){ o = o || {}; o.k = k; o.label = label; o.unit = unit; return o; }
  var typed = function(e){ return !!LF.lineType(e); }, custom = function(e){ return !LF.lineType(e); };
  var ttyped = function(e){ return !!LF.trType(e); }, tcustom = function(e){ return !LF.trType(e); };
  var FIELDS = {
    Bus: [F_('style', 'Shape', '', { kind: 'seg', opts: [['', 'Bar'], ['node', 'Node']] }),
          F_('v_nom', 'Nominal voltage', 'kV', { min: 0.1, max: 1500, tip: UNIT_TIP.v_nom }),
          F_('v_mag_pu_set', 'Voltage set point', 'p.u.', { min: 0.5, max: 1.5, step: 0.001, tip: UNIT_TIP.v_mag_pu_set, show: function(e){ return busHoldsV(e.id); } })],
    Line: [F_('type', 'Line type', '', { kind: 'linetype' }),
           F_('length', 'Length', 'km', { min: 0, max: 5000, tip: UNIT_TIP.length, show: typed }),
           F_('num_parallel', 'Parallel circuits', '', { min: 1, max: 20, step: 1, tip: UNIT_TIP.num_parallel, show: typed }),
           F_('r', 'Resistance', 'Ω', { min: 0, max: 1e5, tip: UNIT_TIP.r, show: custom }),
           F_('x', 'Reactance', 'Ω', { min: -1e5, max: 1e5, tip: UNIT_TIP.x, show: custom }),
           F_('b', 'Susceptance', 'µS', { scale: 1e6, min: -1e6, max: 1e6, tip: UNIT_TIP.b, show: custom }),
           F_('g', 'Conductance', 'µS', { scale: 1e6, min: 0, max: 1e6, tip: UNIT_TIP.g, show: custom }),
           F_('s_nom', 'Rating', 'MVA', { min: 0, max: 1e5, tip: UNIT_TIP.s_nom, show: custom })],
    Transformer: [F_('type', 'Transformer type', '', { kind: 'trtype' }),
           F_('tap_position', 'Tap position', '', { step: 1, tip: UNIT_TIP.tap_position, show: ttyped, range: function(e){ var t = LF.trType(e); return t ? [t.tap_min, t.tap_max] : [-50, 50]; } }),
           F_('num_parallel', 'Parallel units', '', { min: 1, max: 20, step: 1, tip: UNIT_TIP.num_parallel, show: ttyped }),
           F_('s_nom', 'Rating', 'MVA', { min: 0, max: 1e5, tip: UNIT_TIP.s_nom, show: tcustom }),
           F_('x', 'Reactance', 'p.u.', { min: -10, max: 10, step: 0.0001, tip: UNIT_TIP.tx_x, show: tcustom }),
           F_('r', 'Resistance', 'p.u.', { min: 0, max: 10, step: 0.0001, tip: UNIT_TIP.tx_r, show: tcustom }),
           F_('tap_ratio', 'Tap ratio', '', { min: 0.5, max: 1.5, step: 0.0001, tip: UNIT_TIP.tap_ratio, show: tcustom }),
           // The values stay 0 and 1: saved diagrams carry them. The words match the
           // panel's own "From <bus> to <bus>" line, and the tip names the buses.
           F_('tap_side', 'Tap side', '', { kind: 'seg', opts: [[0, 'From'], [1, 'To']], show: tcustom, tip: function(e){
             var m = LF.byId(app.model), n = function(id){ return m[id] ? LF.nameOf(m[id]) : 'its bus'; };
             return 'The winding the tap ratio sits on.<ul><li><strong>From:</strong> ' + n(e.bus0) + '.</li><li><strong>To:</strong> ' + n(e.bus1) + '.</li></ul>';
           } }),
           F_('phase_shift', 'Phase shift', '°', { min: -360, max: 360, tip: UNIT_TIP.phase_shift, show: tcustom }),
           F_('g', 'Magnetising conductance', 'p.u.', { min: -1, max: 1, step: 0.0001, tip: UNIT_TIP.tx_g, show: tcustom }),
           F_('b', 'Magnetising susceptance', 'p.u.', { min: -1, max: 1, step: 0.0001, tip: UNIT_TIP.tx_b, show: tcustom }),
           F_('model', 'Equivalent circuit', '', { kind: 'seg', opts: [['t', 'T model'], ['pi', 'π model']], tip: UNIT_TIP.tx_model })],
    Generator: [F_('control', 'Control', '', { kind: 'seg', opts: [['Slack', 'Slack'], ['PV', 'PV'], ['PQ', 'PQ']] }),
           // A slack's dispatch only counts when the slack is distributed: each unit, PV
           // and PQ ones too, then supplies its dispatch plus its share of what is left over.
           F_('p_set', 'Active power', 'MW', { min: -1e5, max: 1e5, tip: function(e){ return e.control === 'Slack' || $('lfDistSlack').checked ? UNIT_TIP.slack_p : UNIT_TIP.gen_p; }, show: function(e){ return e.control !== 'Slack' || $('lfDistSlack').checked; } }),
           F_('q_set', 'Reactive power', 'MVAr', { min: -1e5, max: 1e5, tip: UNIT_TIP.q_set, show: function(e){ return e.control === 'PQ'; } }),
           F_('vset', 'Voltage set point', 'p.u.', { min: 0.5, max: 1.5, step: 0.001, tip: UNIT_TIP.gen_vset, show: function(e){ return e.control !== 'PQ' && e.bus; } }),
           F_('p_nom', 'Rating', 'MW', { min: 0, max: 1e5, tip: UNIT_TIP.p_nom }),
           // Symbol writes both grid and style, which saved diagrams keep apart.
           F_('sym', 'Symbol', '', { kind: 'seg', opts: [['', 'Generator'], ['pv', 'Solar'], ['wind', 'Wind'], ['grid', 'Grid']], wide: true })],
    Load: [F_('p_set', 'Active power', 'MW', { min: -1e5, max: 1e5, tip: UNIT_TIP.load_p }),
           F_('q_set', 'Reactive power', 'MVAr', { min: -1e5, max: 1e5, tip: UNIT_TIP.load_q })],
    ShuntImpedance: [F_('shq', 'Reactive power', 'MVAr', { min: -1e5, max: 1e5, tip: UNIT_TIP.shunt_q }),
           F_('shp', 'Active power', 'MW', { min: -1e5, max: 1e5, tip: UNIT_TIP.shunt_p })],
    StorageUnit: [F_('p_set', 'Active power', 'MW', { min: -1e5, max: 1e5, tip: UNIT_TIP.store_p }),
           F_('q_set', 'Reactive power', 'MVAr', { min: -1e5, max: 1e5, tip: UNIT_TIP.q_set }),
           F_('p_nom', 'Rating', 'MW', { min: 0, max: 1e5, tip: UNIT_TIP.store_nom })],
    Link: [F_('p_set', 'Power sent', 'MW', { min: -1e5, max: 1e5, tip: UNIT_TIP.link_p }),
           F_('eff', 'Efficiency', '%', { min: 1, max: 100, step: 0.1, tip: UNIT_TIP.eff }),
           F_('p_nom', 'Rating', 'MW', { min: 0, max: 1e5, tip: UNIT_TIP.link_nom })]
  };
  var CONTROL_TIP = {
    Slack: '<strong>Slack:</strong> holds its bus voltage and angle, and supplies whatever balances its island.',
    PV: '<strong>PV:</strong> holds its active power and its bus voltage, taking whatever reactive power that needs.',
    PQ: '<strong>PQ:</strong> supplies a fixed active and reactive power, like a rooftop inverter.'
  };
  function busHoldsV(busId){ return app.model.el.some(function(e){ return e.c === 'Generator' && e.bus === busId && e.control !== 'PQ'; }); }
  function getVal(e, f){
    var bus = e.bus ? LF.byId(app.model)[e.bus] : null;
    if(f.k === 'vset') return bus ? bus.v_mag_pu_set : NaN;
    if(f.k === 'eff') return e.efficiency * 100;
    if(f.k === 'shq') return bus ? e.b * bus.v_nom * bus.v_nom : NaN;
    if(f.k === 'shp') return bus ? e.g * bus.v_nom * bus.v_nom : NaN;
    return e[f.k] * (f.scale || 1);
  }
  function setVal(e, f, v){
    var bus = e.bus ? LF.byId(app.model)[e.bus] : null;
    if(f.k === 'vset'){ if(bus) bus.v_mag_pu_set = v; return; }
    if(f.k === 'eff'){ e.efficiency = v / 100; return; }
    if(f.k === 'shq'){ if(bus) e.b = v / (bus.v_nom * bus.v_nom); return; }
    if(f.k === 'shp'){ if(bus) e.g = v / (bus.v_nom * bus.v_nom); return; }
    e[f.k] = v / (f.scale || 1);
  }
  function fmtField(v){
    if(!isFinite(v)) return '';
    var a = Math.abs(v);
    if(a !== 0 && (a < 1e-4 || a >= 1e7)) return String(+v.toPrecision(6));
    return String(+v.toPrecision(8));
  }
  var typeKv = LF.lineTypeKv;
  function tipHtml(t, opts){ return t ? ' <i class="tip-icon"' + (opts ? ' data-tip-options' : '') + ' data-tip="' + esc(t) + '">?</i>' : ''; }
  var KIND_ICON = {
    Bus: '<path d="M3 12h18" stroke-width="3"/>',
    Line: '<path d="M3 7h5M16 17h5M8 7v10h8" />',
    Transformer: '<circle cx="9.5" cy="12" r="5"/><circle cx="14.5" cy="12" r="5"/>',
    Node: '<path d="M12 3v5.5M12 15.5V21M3 12h5.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
    Generator: '<circle cx="12" cy="12" r="8"/><path d="M8 12q2-3.5 4 0t4 0"/>',
    PV: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.3h16M4 14.7h16M12 4v16"/>',
    Wind: '<circle cx="12" cy="12" r="8"/><path d="M12 10.3V5.5M10.5 12.9l-4.2 2.4M13.5 12.9l4.2 2.4" stroke-width="2.4"/><circle cx="12" cy="12" r="1.3"/>',
    Grid: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12l8-8M4 20 20 4M12 20l8-8"/>',
    Load: '<path d="M12 3v9"/><path d="M6 12h12l-6 9z" fill="currentColor"/>',
    ShuntImpedance: '<path d="M12 2v7M5 9h14M5 13h14M12 13v4M7 17h10M9 20h6M11 23h2"/>',
    StorageUnit: '<rect x="5" y="6" width="14" height="13" rx="1.5"/><path d="M9 3v3M15 3v3M9.5 10v5M14.5 11.5v2"/>',
    Link: '<rect x="1" y="9" width="6" height="6" rx="1"/><path d="M1 15 7 9"/><rect x="17" y="9" width="6" height="6" rx="1"/><path d="M17 15 23 9"/><path d="M7 12h2.4M12 12h0M14.6 12H17" stroke-width="1.3"/>'
  };
  LF.KIND_ICON = KIND_ICON;
  function kindIcon(e){
    var k = e.c === 'Generator' && e.grid ? 'Grid' : e.c === 'Generator' && e.style === 'pv' ? 'PV' : e.c === 'Generator' && e.style === 'wind' ? 'Wind' :
            e.c === 'Bus' && e.style === 'node' ? 'Node' : e.c;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + KIND_ICON[k] + '</svg>';
  }
  function fieldHtml(e, f){
    var id = 'f_' + f.k;
    var tip = typeof f.tip === 'function' ? f.tip(e) : f.tip;
    if(f.kind === 'linetype' || f.kind === 'trtype'){
      var types = f.kind === 'linetype' ? LF.types.line : LF.types.transformer;
      var names = Object.keys(types).filter(function(n){ return f.kind === 'trtype' || types[n].f_nom > 0; });
      var kv = NaN, byId = LF.byId(app.model);
      if(byId[e.bus0]) kv = byId[e.bus0].v_nom;
      var near = names.filter(function(n){
        if(f.kind === 'trtype') return byId[e.bus0] && byId[e.bus1] && types[n].v_nom_0 === byId[e.bus0].v_nom && types[n].v_nom_1 === byId[e.bus1].v_nom;
        return typeKv(n) === kv;
      });
      var rest = names.filter(function(n){ return near.indexOf(n) < 0; });
      var opt = function(n){ return '<option value="' + esc(n) + '"' + (e.type === n ? ' selected' : '') + '>' + esc(n) + '</option>'; };
      var unknown = e.type && names.indexOf(e.type) < 0;
      var html = '<option value=""' + (!e.type || unknown ? ' selected' : '') + '>Custom: my own values</option>';
      if(!names.length) html += '<option disabled>Loading the standard types…</option>';
      if(near.length) html += '<optgroup label="' + (f.kind === 'trtype' ? 'Matching these buses' : 'At ' + kv + ' kV') + '">' + near.map(opt).join('') + '</optgroup>';
      if(rest.length) html += '<optgroup label="' + (near.length ? 'Other voltages' : 'Standard types') + '">' + rest.map(opt).join('') + '</optgroup>';
      var t = f.kind === 'linetype' ? 'PyPSA\'s standard ' + (f.kind === 'linetype' ? 'line' : 'transformer') + ' types. A type sets the impedance; Custom takes your own.' : 'PyPSA\'s standard transformer types, high-voltage side first. A type sets impedance, rating and phase shift.';
      return '<div class="field-row"><div class="field-label"><span class="tip-wrap">' + f.label + tipHtml(t) + '</span></div><select class="sel-input" id="' + id + '" data-k="' + f.k + '">' + html + '</select></div>';
    }
    if(f.kind === 'toggle'){
      return '<div class="toggle-row"><div class="toggle-label"><span class="tip-wrap">' + f.label + tipHtml(tip) + '</span></div><label class="toggle-switch"><input type="checkbox" data-k="' + f.k + '"' + (e[f.k] ? ' checked' : '') + '/><span class="toggle-track"><span class="toggle-knob"></span></span></label></div>';
    }
    if(f.kind === 'seg'){
      var cur = f.k === 'sym' ? (e.grid ? 'grid' : e.style) : e[f.k];
      var extra = f.k === 'control' ? tipHtml(CONTROL_TIP[cur], true) : tipHtml(tip);
      return '<div class="field-row' + (f.wide ? '' : ' inline') + '"><div class="field-label"><span class="tip-wrap">' + f.label + extra + '</span></div><div class="seg-group" data-k="' + f.k + '" role="group" aria-label="' + f.label + '">' +
        f.opts.map(function(o){ return '<button type="button" class="seg-btn' + (o[0] === cur ? ' active' : '') + '" data-val="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div></div>';
    }
    var range = f.range ? f.range(e) : [f.min, f.max];
    var v = getVal(e, f);
    return '<div class="field-row inline"><div class="field-label"><span class="tip-wrap">' + f.label + tipHtml(tip) + '</span></div>' +
      '<div class="affix-wrap"><input class="affix-input' + (f.unit ? ' has-suffix' : '') + '" type="text" inputmode="decimal" id="' + id + '" data-k="' + f.k + '"' +
      ' data-min="' + range[0] + '" data-max="' + range[1] + '"' + (f.step ? ' data-step="' + f.step + '"' : '') + ' value="' + fmtField(v) + '"/>' +
      (f.unit ? '<span class="suffix">' + f.unit + '</span>' : '') + '</div></div>';
  }
  function derivedHtml(e){
    var byId = LF.byId(app.model), F2 = LF.fmt;
    if(e.c === 'Line'){
      var t = LF.lineType(e);
      if(t){
        var r = t.r_per_length * e.length / e.num_parallel, x = t.x_per_length * e.length / e.num_parallel;
        var b = 2 * Math.PI * 1e-9 * t.f_nom * t.c_per_length * e.length * e.num_parallel;
        return '<p class="derived" id="derived">From the type: <b>' + F2.p(r) + ' Ω</b> + j<b>' + F2.p(x) + ' Ω</b>, <b>' + F2.p(b * 1e6) + ' µS</b>, rated <b>' + F2.p(LF.rating(e, byId[e.bus0])) + ' MVA</b> (' + F2.ka(t.i_nom * e.num_parallel) + ' kA).</p>';
      }
      var b0 = byId[e.bus0];
      if(b0 && b0.v_nom){ var z = b0.v_nom * b0.v_nom; return '<p class="derived" id="derived">Per unit on 100 MVA: <b>' + F2.v(e.r / z * 100) + '</b> + j<b>' + F2.v(e.x / z * 100) + '</b>.</p>'; }
    }
    if(e.c === 'Transformer'){
      var tt = LF.trType(e);
      if(tt){
        var ratio = 1 + (e.tap_position - tt.tap_neutral) * tt.tap_step / 100;
        return '<p class="derived" id="derived">From the type: <b>' + F2.p(tt.s_nom * e.num_parallel) + ' MVA</b>, u<sub>k</sub> <b>' + tt.vsc + '%</b>, phase shift <b>' + tt.phase_shift + '°</b>, tap ratio <b>' + F2.v(ratio) + '</b> (taps ' + tt.tap_min + ' to ' + tt.tap_max + ', ' + tt.tap_step + '% each).</p>';
      }
      return '<p class="derived" id="derived">Short-circuit voltage u<sub>k</sub> <b>' + F2.pct(100 * Math.hypot(e.r, e.x)) + '%</b>.</p>';
    }
    if(e.c === 'Load') return '<p class="derived" id="derived">cos φ <b>' + F2.pf(e.p_set, e.q_set) + '</b>' + (e.q_set < 0 ? ', capacitive' : '') + '.</p>';
    return '';
  }
  function refreshDerived(){
    var el = $('derived');
    if(!el || app.sel.size !== 1) return;
    var e = LF.byId(app.model)[app.sel.values().next().value];
    if(!e) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = derivedHtml(e);
    if(tmp.firstChild) el.innerHTML = tmp.firstChild.innerHTML;
  }
  function labelOverrideHtml(e){
    var own = typeof e.lb === 'number';
    var d = display(), list = LF.LABELS[e.c];
    var html = '<div class="field-group"><div class="group-title">Labels</div><div class="toggle-row"><div class="toggle-label"><span class="tip-wrap">Its own labels</span></div>' +
      '<label class="toggle-switch"><input type="checkbox" id="lbOwn"' + (own ? ' checked' : '') + '/><span class="toggle-track"><span class="toggle-knob"></span></span></label></div>';
    if(own){
      html += '<div class="lbl-chips">' + list.map(function(q, i){
        return '<label class="lbl-chip"><input type="checkbox" data-lbq="' + i + '"' + (e.lb & (1 << i) ? ' checked' : '') + '/>' + QTY[q] + '</label>';
      }).join('') + '</div>';
    }
    void d;
    return html + '</div>';
  }
  function renderInspector(){
    var box = $('inspector');
    if(app.readOnly){ box.innerHTML = ''; return; }
    var m = app.model, byId = LF.byId(m);
    if(app.sel.size === 1){
      var e = byId[app.sel.values().next().value];
      if(e){ box.innerHTML = elementHtml(e); SharedIcon.hydrate(box); return; }
    }
    if(app.sel.size > 1){
      box.innerHTML = '<div class="insp-head"><strong style="flex:1">' + app.sel.size + ' elements selected</strong><span class="insp-actions">' +
        SharedIcon.button('duplicate', 'Duplicate them (Ctrl+D)', 'insp-dup') + SharedIcon.button('trash', 'Delete them (Del)', 'insp-del') + SharedIcon.button('close', 'Deselect (Esc)', 'insp-close') + '</span></div>' +
        '<p class="insp-sub">Drag any of them to move them together.</p>' + doneHtml();
      return;
    }
    var v = LF.validate(m, solveOptions());
    var counts = {};
    m.el.forEach(function(x){ counts[x.c] = (counts[x.c] || 0) + 1; });
    var isl = LF.islands(m).length;
    var html = '<div class="field-row"><div class="field-label">Network name</div><input class="txt-input" type="text" id="netName" maxlength="60" value="' + esc(m.name) + '" placeholder="My network"/></div>' +
      '<p class="stat-line"><strong>' + (counts.Bus || 0) + '</strong> buses, <strong>' + ((counts.Line || 0) + (counts.Transformer || 0) + (counts.Link || 0)) + '</strong> branches, <strong>' +
      ((counts.Generator || 0) + (counts.Load || 0) + (counts.ShuntImpedance || 0) + (counts.StorageUnit || 0)) + '</strong> devices, <strong>' + isl + '</strong> island' + (isl === 1 ? '' : 's') + '.</p>';
    // Checks show only when there is something to fix or to know.
    html += '<div class="field-group" id="checksGroup"' + (v.errors.length || v.warnings.length ? '' : ' hidden') + '><div class="group-title">Checks</div><div class="fg-body"><ul class="issue-list" id="issueList">' + issuesHtml(v) + '</ul></div></div>';
    html += '<div class="field-group"><div class="group-title">Elements</div>';
    EL_GROUPS.forEach(function(gr){
      var list = m.el.filter(gr[1]);
      if(!list.length) return;
      html += '<div class="el-group"><div class="el-group-title">' + gr[0] + '</div><div class="el-list">' + list.map(function(x){
        var free = LF.DEVICE[x.c] && !x.bus;
        return '<button type="button" class="el-chip' + (free ? ' is-free' : '') + '" data-sel="' + x.id + '">' + esc(LF.nameOf(x)) + '</button>';
      }).join('') + '</div></div>';
    });
    html += '</div>';
    box.innerHTML = html;
  }
  // The element list, one group per kind, in the palette's order.
  var isC = function(c){ return function(x){ return x.c === c; }; };
  var EL_GROUPS = [['Buses', isC('Bus')], ['Lines', isC('Line')], ['Transformers', isC('Transformer')],
    ['Generators', function(x){ return x.c === 'Generator' && !x.grid; }], ['External grids', function(x){ return x.c === 'Generator' && !!x.grid; }],
    ['Loads', isC('Load')], ['Shunts', isC('ShuntImpedance')], ['Storage', isC('StorageUnit')], ['HVDC links', isC('Link')]];
  function doneHtml(){ return '<div class="insp-done"><button type="button" class="btn-primary" id="inspDone" style="width:100%;margin-top:10px">✓ Done</button></div>'; }
  function issuesHtml(v){
    var items = v.errors.map(function(x){ return '<li class="err" data-sel="' + (x.id === null ? '' : x.id) + '">' + esc(x.msg) + '</li>'; })
      .concat(v.warnings.map(function(x){ return '<li data-sel="' + (x.id === null ? '' : x.id) + '">' + esc(x.msg) + '</li>'; }));
    return items.length ? items.join('') : '<li class="none">No problems found.</li>';
  }
  function renderIssues(v){
    var el = $('issueList'), grp = $('checksGroup');
    if(el) el.innerHTML = issuesHtml(v);
    if(grp) grp.hidden = !(v.errors.length || v.warnings.length);
  }
  function elementHtml(e){
    var byId = LF.byId(app.model);
    var kind = e.c === 'Generator' && e.grid ? 'External grid' : e.c === 'Generator' ? 'Generator' : e.c === 'ShuntImpedance' ? 'Shunt impedance' : e.c === 'StorageUnit' ? 'Storage unit' : e.c === 'Link' ? 'HVDC link' : e.c;
    var where = '';
    if(LF.BRANCH[e.c]) where = 'From <strong>' + esc(LF.nameOf(byId[e.bus0])) + '</strong> to <strong>' + esc(LF.nameOf(byId[e.bus1])) + '</strong>';
    else if(LF.DEVICE[e.c]) where = e.bus ? 'On <strong>' + esc(LF.nameOf(byId[e.bus])) + '</strong>' : 'Not on a bus: drag it onto one';
    var html = '<div class="insp-head"><span class="insp-kind" title="' + kind + '">' + kindIcon(e) + '</span>' +
      '<input class="txt-input" type="text" id="elName" maxlength="40" value="' + esc(LF.nameOf(e)) + '" aria-label="Name"/>' +
      '<span class="insp-actions">' + SharedIcon.button('duplicate', 'Duplicate (Ctrl+D)', 'insp-dup') + SharedIcon.button('trash', 'Delete (Del)', 'insp-del') + SharedIcon.button('close', 'Deselect (Esc)', 'insp-close') + '</span></div>' +
      '<p class="insp-sub">' + kind + (where ? '. ' + where + '.' : '.') + '</p>';
    html += '<div class="field-group"><div class="group-title">' + (e.c === 'Bus' ? 'Bus' : 'Parameters') + '</div>';
    (FIELDS[e.c] || []).forEach(function(f){ if(!f.show || f.show(e)) html += fieldHtml(e, f); });
    if(e.c === 'ShuntImpedance' && !e.bus) html += '<p class="note">Put it on a bus to set its rating at that bus\'s voltage.</p>';
    if(e.c === 'Bus') html += '<div class="toggle-row"><div class="toggle-label"><span class="tip-wrap">' + (e.style === 'node' ? 'Devices to the sides' + tipHtml(UNIT_TIP.upnode) : 'Upright bar' + tipHtml(UNIT_TIP.upright)) + '</span></div><label class="toggle-switch"><input type="checkbox" id="busUpright"' + (e.at[3] === 1 ? ' checked' : '') + '/><span class="toggle-track"><span class="toggle-knob"></span></span></label></div>';
    html += derivedHtml(e) + '</div>';
    html += labelOverrideHtml(e);
    return html + doneHtml();
  }

  // One set of listeners for everything the inspector draws.
  var insp = $('inspector');
  function selectedEl(){ return app.sel.size === 1 ? LF.byId(app.model)[app.sel.values().next().value] : null; }
  function fieldOf(e, k){ return (FIELDS[e.c] || []).filter(function(f){ return f.k === k; })[0]; }
  insp.addEventListener('input', function(ev){
    var t = ev.target;
    if(t.id === 'netName'){ app.model.name = t.value.slice(0, 60); pushHistory('name'); if(persist) persist.schedule(); return; }
    var e = selectedEl();
    if(!e) return;
    if(t.id === 'elName'){
      var v = t.value.trim();
      e.name = v && v !== LF.autoName(e) ? v.slice(0, 40) : '';
      pushHistory('name' + e.id); app.renderSoon(); if(persist) persist.schedule();
      return;
    }
    var k = t.getAttribute('data-k');
    if(!k || t.tagName !== 'INPUT' || t.type !== 'text') return;
    var f = fieldOf(e, k), x = parseFloat(String(t.value).replace(/−/g, '-').replace(/,/g, ''));
    if(!f || !isFinite(x)) return;
    var range = f.range ? f.range(e) : [f.min, f.max];
    if(x < range[0] || x > range[1]) return; // the change event pulls it back
    if(f.step === 1) x = Math.round(x);       // a count or a tap step is whole even mid-typing
    setVal(e, f, x);
    changeFromField('f' + e.id + k);
  });
  insp.addEventListener('change', function(ev){
    var t = ev.target, e = selectedEl();
    if(t.id === 'netName' || t.id === 'elName'){ renderInspector(); return; }
    if(!e) return;
    if(t.id === 'busUpright'){ e.at = [e.at[0], e.at[1], e.at[2], t.checked ? 1 : 0]; app.change('geom'); return; }
    if(t.id === 'lbOwn'){
      if(t.checked){
        var d = display(), mask = 0;
        LF.LABELS[e.c].forEach(function(q, i){ if(d.labels[e.c][q]) mask |= 1 << i; });
        e.lb = mask;
      } else delete e.lb;
      app.change('geom');
      return;
    }
    if(t.hasAttribute('data-lbq')){
      var i = +t.getAttribute('data-lbq');
      e.lb = t.checked ? (e.lb | (1 << i)) : (e.lb & ~(1 << i));
      app.change('geom', 'lb' + e.id);
      return;
    }
    var k = t.getAttribute('data-k');
    if(!k) return;
    if(t.type === 'checkbox'){ e[k] = t.checked ? 1 : 0; app.change('geom'); return; }
    if(t.tagName === 'SELECT'){
      e.type = t.value;
      if(e.c === 'Transformer' && LF.trType(e)){ var tt = LF.trType(e); e.tap_position = Math.min(tt.tap_max, Math.max(tt.tap_min, e.tap_position)); }
      if(e.c === 'Line' && LF.lineType(e) && !(e.length > 0)) e.length = 1;
      app.change('elec');
      return;
    }
    var f = fieldOf(e, k), x = parseFloat(String(t.value).replace(/−/g, '-').replace(/,/g, ''));
    if(!f) return;
    var range = f.range ? f.range(e) : [f.min, f.max];
    if(!isFinite(x)){ t.value = fmtField(getVal(e, f)); return; }
    x = Math.min(range[1], Math.max(range[0], x));
    if(f.step === 1) x = Math.round(x);
    setVal(e, f, x);
    t.value = fmtField(getVal(e, f));
    changeFromField('f' + e.id + k);
    // Fields that show or hide with this one.
    if(k === 'v_nom' || k === 'control') renderInspector();
  });
  insp.addEventListener('click', function(ev){
    var t = ev.target;
    var chip = t.closest('[data-sel]');
    if(chip && chip.getAttribute('data-sel') !== ''){ app.select([+chip.getAttribute('data-sel')]); return; }
    if(t.closest('.insp-del')){ app.deleteSelected(); return; }
    if(t.closest('.insp-dup')){ app.duplicateSelected(); return; }
    if(t.closest('.insp-close') || t.closest('#inspDone')){ app.select([]); return; }
    var seg = t.closest('.seg-group[data-k] .seg-btn');
    if(seg){
      var e = selectedEl(), k = seg.parentElement.getAttribute('data-k'), v = seg.getAttribute('data-val');
      if(!e) return;
      // The look only: grid and style are drawn, never solved.
      if(k === 'sym'){ e.grid = v === 'grid' ? 1 : 0; e.style = v === 'grid' ? '' : v; app.change('geom'); return; }
      if(k === 'style'){ e.style = v; app.change('geom'); return; }
      e[k] = k === 'tap_side' ? +v : v;
      app.change('elec');
    }
  });

  /* ── Tabs ── */
  function showTab(name){
    Array.prototype.forEach.call(document.querySelectorAll('.ctrl-tab'), function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    Array.prototype.forEach.call(document.querySelectorAll('.ctrl-panel'), function(p){ p.classList.toggle('active', p.id === 'tab-' + name); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.ctrl-tab'), function(b){
    b.addEventListener('click', function(){ showTab(b.getAttribute('data-tab')); });
  });

  /* ── Load flow tab and display options ── */
  var METHOD_TIP = {
    ac: '<strong>AC, Newton-Raphson:</strong> the full load flow, with voltage magnitudes, reactive power and losses.',
    dc: '<strong>DC, linear:</strong> active power only, every voltage at 1 p.u. and no losses except in links. Quick, and it needs no iterations, so it solves whenever every line and transformer has a reactance.'
  };
  // A saved value outside a limit's range is shown as the value used, and a select
  // whose saved option no longer exists falls back to its default, which is what
  // solveOptions() and display() read for it anyway.
  var RANGE = { lfVmin: [0.5, 1], lfVmax: [1, 1.5], lfLoadMax: [10, 200] };
  function clampField(id){
    var el = $(id), v = parseFloat(el.value);
    if(!isFinite(v)) return;
    var c = Math.min(Math.max(v, RANGE[id][0]), RANGE[id][1]);
    if(c !== v) el.value = c;
  }
  function fixForm(){
    Object.keys(RANGE).forEach(clampField);
    ['lfMethod', 'lfTol', 'lfSeed', 'lfSlackW', 'colourBy'].forEach(function(id){
      var el = $(id);
      if(el.selectedIndex >= 0) return;
      var d = Array.prototype.filter.call(el.options, function(o){ return o.defaultSelected; })[0] || el.options[0];
      if(d) d.selected = true;
    });
  }
  function syncSolverForm(){
    fixForm();
    var ac = $('lfMethod').value === 'ac';
    $('acGroup').style.display = ac ? '' : 'none';
    $('slackWRow').style.display = $('lfDistSlack').checked ? '' : 'none';
    $('lfMethodTip').setAttribute('data-tip', METHOD_TIP[$('lfMethod').value] || '');
  }
  ['lfMethod', 'lfTol', 'lfSeed', 'lfDistSlack', 'lfSlackW'].forEach(function(id){
    $(id).addEventListener('change', function(){ syncSolverForm(); updateStale(); renderInspector(); });
  });
  // Limits and display options read the result; they never send it back to be solved.
  ['lfVmin', 'lfVmax', 'lfLoadMax', 'colourBy', 'animP', 'animQ'].forEach(function(id){
    $(id).addEventListener('change', function(){ if(RANGE[id]) clampField(id); if(id === 'colourBy') syncSolverForm(); render(); if(app.res) showResults(); });
  });
  $('labelMatrix').addEventListener('change', function(){ render(); });

  /* ── Quick Start ── */
  function resetForm(root){
    Array.prototype.forEach.call(root.querySelectorAll('input, select'), function(el){
      if(el.closest('[data-no-persist]')) return;
      if(el.type === 'checkbox') el.checked = el.defaultChecked;
      else if(el.tagName === 'SELECT') Array.prototype.forEach.call(el.options, function(o){ o.selected = o.defaultSelected; });
      else el.value = el.defaultValue;
    });
  }
  function applyPreset(key){
    var p = LF.PRESETS[key];
    if(!p) return;
    resetForm($('tab-solver')); resetForm($('tab-display')); resetForm(document.querySelector('.sld-viewbar'));
    applyMotionDefault(true);
    syncSolverForm();
    app.model = LF.load(p);
    app.sel = new Set();
    app.res = null; app.solvedKey = null;
    pushHistory();
    app.view = null;
    render();
    app.fit();
    app.fitPending = true;
    renderInspector();
    if(persist) persist.save();
    Array.prototype.forEach.call(document.querySelectorAll('.quick-start-btn'), function(b){ b.classList.toggle('active', b.getAttribute('data-preset') === key); });
    return run();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.quick-start-btn'), function(b){
    b.addEventListener('click', function(){ applyPreset(b.getAttribute('data-preset')); });
  });

  /* ── Theme ── */
  $('themeToggle').addEventListener('click', function(){
    document.body.classList.toggle('light');
    this.textContent = document.body.classList.contains('light') ? '🌙 Dark' : '☀️ Light';
    render();
  });

  /* ── Motion: flows move unless the reader asked for less motion ── */
  // Each key is a short run of the diagram's own arrows.
  ['p', 'q'].forEach(function(k){
    var run = '';
    [-8, 4, 16, 28].forEach(function(x){ run += '<path d="' + LF.GLYPH[k].d + '" transform="translate(' + x + ' 5)"/>'; });
    document.querySelector('.flow-key-' + k).innerHTML = '<g class="fk-run">' + run + '</g>';
  });
  var motionChosen = false;
  function applyMotionDefault(force){
    if(motionChosen && !force) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce){ $('animP').checked = false; $('animQ').checked = false; }
  }
  ['animP', 'animQ'].forEach(function(id){ $(id).addEventListener('change', function(){ motionChosen = true; }); });

  /* ── Exports and Share ── */
  var exportP = null;
  function exporter(){
    if(!exportP){
      exportP = new Promise(function(resolve, reject){
        var s = document.createElement('script');
        s.src = 'lf-export.js';
        s.onload = function(){ resolve(window.LFExport); };
        s.onerror = function(){ exportP = null; reject(new Error('The exporter could not load.')); };
        document.head.appendChild(s);
      });
    }
    return exportP;
  }
  app.exporter = exporter;
  function fileBase(){ return (app.model.name || 'load-flow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'load-flow'; }
  function download(blob, ext){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileBase() + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  }
  // The export's subtitle is the run summary without its timing, which changes on every run.
  function exportCtx(){ return { app: app, LF: LF, display: display(), res: shownResults(), stale: isStale(), title: app.model.name || 'Load flow', sub: $('sldSub').textContent.replace(/ Solved by PSA\.js in .*$/, '') }; }
  function busy(on, text){ setSub(on ? text : ''); if(!on && app.res) showResults(); }
  $('svgBtn').addEventListener('click', function(){ exporter().then(function(X){ download(X.svgBlob(exportCtx()), 'svg'); }); });
  $('pngBtn').addEventListener('click', function(){ exporter().then(function(X){ return X.pngBlob(exportCtx()); }).then(function(b){ download(b, 'png'); }); });
  $('gifBtn').addEventListener('click', function(){
    exporter().then(function(X){
      return X.gifBlob(exportCtx(), function(p){ busy(true, 'Making the GIF… ' + Math.round(p * 100) + '%'); });
    }).then(function(b){ busy(false); download(b, 'gif'); }, function(err){ busy(false); alert('The GIF could not be made: ' + (err && err.message || err)); });
  });
  $('copyBtn').addEventListener('click', function(){
    var btn = this, d = display();
    var animated = !!(shownResults() && (d.animP || d.animQ));
    var png = function(){ return exporter().then(function(X){ return X.pngBlob(exportCtx()); }); };
    if(!animated){ SharedShare.copyImage(png, btn); return; }
    SharedShare.copyImage(png, btn, {
      gif: function(){ return exporter().then(function(X){ return X.gifBlob(exportCtx()); }); },
      onDone: function(kind){
        setSub(kind === 'gif' ? 'Copied the animated GIF.' : 'Copied a still PNG. Apps that paste rich text, such as email and documents, get the animated GIF. For a GIF file, use Download as GIF.');
        setTimeout(function(){ if(app.res) showResults(); }, 6000);
      }
    });
  });
  $('fitBtn').addEventListener('click', function(){ app.fit(); });
  $('zoomIn').addEventListener('click', function(){ app.zoomAt(1.25); });
  $('zoomOut').addEventListener('click', function(){ app.zoomAt(0.8); });

  // ⤢ lifts the diagram card out of the page to fill the window, keeping the
  // view bar, the palette and the diagram; a second press or Esc puts it back.
  // A selected element's panel opens as a sidebar beside it (a sheet on a
  // phone). The ResizeObserver keeps the reader's scale and centre.
  var sldFull = false;
  function setSldFull(on){
    on = !!on;
    if(on === sldFull) return;
    sldFull = on;
    $('sldCard').classList.toggle('is-full', on);
    document.documentElement.classList.toggle('sld-full-open', on);
    var b = $('sldFull'), label = on ? 'Put the diagram back in the page' : 'Enlarge the diagram to fill the screen';
    b.setAttribute('aria-pressed', String(on));
    b.title = label; b.setAttribute('aria-label', label);
    if(!on) $('sldCard').scrollIntoView({ block: 'nearest' });
  }
  $('sldFull').addEventListener('click', function(){ setSldFull(!sldFull); });
  // Capture runs before the editor's own Esc, so Esc first drops a held tool or
  // the selection there and only then leaves full screen.
  document.addEventListener('keydown', function(ev){
    if(ev.key !== 'Escape' || !sldFull || ev.defaultPrevented) return;
    var t = ev.target, tag = t && t.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if(app.sel.size || document.querySelector('.pal-btn.is-armed')) return;
    setSldFull(false);
  }, true);

  /* ── Mini cache, scenario files and Share links ── */
  var persist = null, restoredAtLoad = false;
  buildLabelMatrix();
  applyMotionDefault();
  syncSolverForm();
  persist = Persist.init('loadflow-simulator', {
    extra: {
      save: function(){ return LF.compact(app.model); },
      // Something that is not a saved diagram at all leaves the one on screen.
      restore: function(d){ if(!d || typeof d !== 'object') return; app.model = LF.load(d); restoredAtLoad = !persist; }
    },
    // A scenario file or a Share link: the whole diagram is replaced and solved.
    // (The mini cache restores inside init, before persist exists; start-up below handles that.)
    onRestore: function(){ if(persist) afterRestore(); }
  });
  function afterRestore(){
    app.sel = new Set();
    app.res = null; app.solvedKey = null;
    history = []; hIdx = -1;
    pushHistory();
    syncSolverForm();
    motionChosen = true;
    app.view = null;
    render();
    app.fit();
    app.fitPending = true;
    renderInspector();
    Array.prototype.forEach.call(document.querySelectorAll('.quick-start-btn.active'), function(b){ b.classList.remove('active'); });
    run();
  }
  SharedScenario.mount('.quick-start-row', { tool: 'loadflow-simulator', persist: persist });

  /* ── Start: draw at once, solve as soon as the engine is in ── */
  if(restoredAtLoad) motionChosen = true;
  pushHistory();
  render();
  app.fit();
  app.fitPending = true;
  renderInspector();
  writeHover(null);
  try { performance.mark('lf-first-render'); } catch(e){}
  if(LF.Editor) LF.Editor(app);
  // An embed solves the scenario its link carries, once SharedShare has loaded it.
  if(!EMBED) run();
  else engine();

  // The guided tour (tour.js) points at the results, so a network that changed
  // since its last run is solved first. It never edits the diagram.
  window.__LF_TOUR = { ensureResults: function(){ if(!running && isStale()) return run(); } };
  window.__lf = { app: app, LF: LF, run: run, engine: engine, applyPreset: applyPreset, display: display, solveOptions: solveOptions };
})();
