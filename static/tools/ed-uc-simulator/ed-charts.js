/* ED/UC Simulator: the charts under the diagram (Chart.js), and their exports.

   Dispatch     each unit's output stacked in merit order (cheapest at the
                bottom), storage charging below zero, any shortfall (load
                shed) hatched in the demand's colour, and the demand line
                over them; under it, on the same hours, a pane of the power
                units had and did not use (curtailed), hatched in each
                unit's colour, while there is any.
   Nodal prices one line per bus, or one system price when every bus has the
                same price all the time.
   Commitment   which committable unit runs in which hour (a relaxed run's
                fractions shade the hour), and where each one starts.
   Storage      a store's energy, against the price at its bus (one store at a
                time, picked in the card's head, when there are several).

   Every chart marks the hour on the diagram and moves it on a click. The
   exports follow the site's: a 3x PNG and an SVG around it, each with its
   title, its key and the watermark, drawn at the desktop size whatever the
   screen (SharedExport). */
(function(root){
  'use strict';
  var ED = root.ED;
  var $ = function(id){ return document.getElementById(id); };
  function cssVar(n){ return getComputedStyle(document.body).getPropertyValue(n).trim(); }

  var charts = {};       // canvas id -> Chart
  var ctx = null;        // the last render: { res, model, display, onHour }
  var CANVAS = { disp: 'dispCanvas', price: 'priceCanvas', commit: 'commitCanvas', store: 'storeCanvas' };
  // What the Dispatch chart draws: its own pane, the curtailment pane under it.
  // An embed that picked only one of them draws only that one.
  var parts = { disp: true, curt: true };

  // A colour for the i-th series: the neutral sequence, paler on each lap round it.
  function seriesColour(i){
    var list = SharedPalette.neutral();
    var base = list[i % list.length], lap = Math.floor(i / list.length);
    return lap ? ED.mix(base, cssVar('--panel'), Math.min(0.6, 0.32 * lap)) : base;
  }
  function alpha(c, a){
    var m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(String(c).replace(/\s/g, ''));
    if(m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')';
    var h = /^#([0-9a-f]{6})$/i.exec(String(c).trim());
    if(h) return 'rgba(' + parseInt(h[1].slice(0, 2), 16) + ',' + parseInt(h[1].slice(2, 4), 16) + ',' + parseInt(h[1].slice(4, 6), 16) + ',' + a + ')';
    return c;
  }

  /* ── The hour marker, and a click that moves it ── */
  var noMarker = false;  // while a GIF takes a still, which draws the marker itself
  /* Where hour h sits on a chart, or null when it is off the axis. Every chart
     puts hour t at x = t (the commitment's bars are centred on it), so one
     hour is at one place on all of them. */
  function hourPx(chart, h){
    var x = chart.scales.x, area = chart.chartArea;
    if(!x || !area) return null;
    var px = x.getPixelForValue(h);
    return isFinite(px) && px >= area.left - 0.5 && px <= area.right + 0.5 ? px : null;
  }
  var HOUR_PLUGIN = {
    id: 'edHour',
    afterDatasetsDraw: function(chart){
      if(!ctx || noMarker || chart.config.options.plugins.edHour === false) return;
      var area = chart.chartArea, px = hourPx(chart, ctx.display.hour);
      if(px == null) return;
      var g = chart.ctx;
      g.save();
      g.strokeStyle = cssVar('--accent');
      g.globalAlpha = 0.75;
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(px, area.top); g.lineTo(px, area.bottom); g.stroke();
      g.restore();
    }
  };
  function clickHour(evt, els, chart){
    if(!ctx || !ctx.onHour) return;
    var x = chart.scales.x, v = x.getValueForPixel(evt.x);
    if(!isFinite(v)) return;
    ctx.onHour(Math.max(0, Math.min(ctx.res.T - 1, Math.round(v))));
  }

  // An axis tick: whole prices without the cents.
  function tickPrice(v, cur){ return Math.abs(v - Math.round(v)) < 1e-9 ? ED.fmt.money(v, cur) : ED.fmt.price(v, cur); }
  // The hours are dated from the start the result was solved for.
  function startOf(){ return ctx && ctx.res && ctx.res.report && ctx.res.report.opts ? ctx.res.report.opts.start : undefined; }
  function hourLabels(H){ var a = [], st = startOf(); for(var t = 0; t < H; t++) a.push(ED.hourLabel(t, H, st)); return a; }
  function baseOptions(o){
    var grid = cssVar('--chart-grid'), muted = cssVar('--chart-text'), text = cssVar('--text');
    var H = o.H;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: o.mode || 'index', intersect: false },
      onClick: clickHour,
      plugins: {
        legend: { display: false },
        tooltip: SharedChartTip.options({
          backgroundColor: cssVar('--panel'), titleColor: text, bodyColor: muted,
          borderColor: grid, borderWidth: 1, padding: 10,
          filter: o.filter,
          callbacks: o.callbacks
        }),
        zoom: SharedZoom.options(o.zoom || { min: 0, max: Math.max(1, H - 1), points: H }),
        // A y axis of names (the commitment chart's units) keeps its own range.
        sharedYFit: o.fit === false ? { auto: { axes: ['y'], fixed: ['y'] } } : { auto: { axes: o.fitAxes || ['y'], includeZero: true, skip: o.skip } }
      },
      scales: o.scales(grid, muted)
    };
  }
  /* Past a day, the time axis ticks on whole hours or whole days of the clock,
     as many as fit its width and the part of the horizon in view, so the
     labels never run into each other on a phone or over 30 days. */
  var STEPS = [1, 2, 3, 6, 12, 24, 48, 72, 168, 336];
  function clockTicks(H){
    return function(scale){
      if(H <= 24) return;
      var lo = Math.max(0, Math.ceil(scale.min)), hi = Math.min(H, Math.floor(scale.max));
      var room = Math.max(2, Math.floor((scale.width || 600) / 84)), step = STEPS[STEPS.length - 1];
      for(var i = 0; i < STEPS.length; i++) if((hi - lo) / STEPS[i] <= room){ step = STEPS[i]; break; }
      var h0 = ED.cal(startOf()).h0, ticks = [];
      for(var v = lo; v <= hi; v++){
        var abs = h0 + v;
        if(step < 24 ? abs % step === 0 : abs % 24 === 0 && (abs / 24) % (step / 24) === 0) ticks.push({ value: v });
      }
      if(ticks.length) scale.ticks = ticks;
      scale.edStep = step;
    };
  }
  // A tick on a day boundary, with the axis ticking by days, needs only its date.
  function tickText(scale, v, H){
    var t = ED.tickLabel(v, H, startOf());
    return H > 24 && scale && scale.edStep >= 24 ? t.slice(0, 5) : t;
  }
  function xAxis(H, grid, muted, extra){
    var x = {
      title: { display: true, text: H > 24 ? 'Date and time' : 'Time of day', color: muted, font: { size: 11 } },
      ticks: { color: muted, maxTicksLimit: H > 24 ? 8 : 12, autoSkip: true, maxRotation: 0, font: { size: 11 },
               callback: function(v){ return tickText(this, v, H); } },
      afterBuildTicks: clockTicks(H),
      grid: { color: grid }
    };
    for(var k in extra) x[k] = extra[k];
    return x;
  }
  /* The key. Entries that name a group are grouped: a row a group, led by its
     name, the groups in the order they first come (the Capacity Expansion
     Planner's). An entry's own text stays its label alone, as a Share link
     names it. A series with pairOf is keyed inside the entry of the series
     whose pair it names, under its pairLabel: a unit's curtailment inside the
     unit's, "Solar farm (▨ Curtailed)", the shortfall inside the demand's,
     "Demand (▨ Shortfall)", so the two wrap as one; a click on either shows
     or hides that one series, and chart.$edPanes re-lays the panes. A pair
     whose series have no entry of their own to lead them is led by pairName
     alone: a store's charging and discharging, "Battery (▦ Charging
     ▦ Discharging)", where a click on the name shows or hides both. */
  function renderLegend(legendId, chart, datasets){
    var el = $(legendId);
    if(!el) return;
    el.innerHTML = '';
    var hosts = {}, subs = [];
    var paren = function(s){ var p = document.createElement('span'); p.className = 'legend-paren'; p.textContent = s; return p; };
    var subsOf = function(host){ return host.parentNode ? Array.prototype.slice.call(host.parentNode.querySelectorAll('.legend-sub')) : []; };
    var hiddenAll = function(items){ return items.every(function(it){ return it.classList.contains('hidden'); }); };
    // A name leading a pair dims as its entries do, when they are all hidden.
    var dim = function(host){ if(host && host.classList.contains('legend-host')) host.classList.toggle('hidden', hiddenAll(subsOf(host))); };
    var nameHost = function(name, key){
      var h = document.createElement('span');
      h.className = 'legend-host';
      h.textContent = name;
      h.setAttribute('data-pair', key);
      h.addEventListener('click', function(){
        var items = subsOf(h), show = hiddenAll(items);
        items.forEach(function(it){ if(it.classList.contains('hidden') === show) it.click(); });
      });
      return h;
    };
    var grouped = datasets.some(function(ds){ return !ds.noLegend && ds.group; }), rows = {}, order = [];
    el.classList.toggle('legend-grouped', grouped);
    // A group's entries wrap in a box of their own, so a second line of them
    // starts under the first entry rather than under the group's name.
    var rowOf = function(name){
      if(!grouped) return el;
      if(!rows[name]){
        var row = document.createElement('div'), box = document.createElement('div');
        row.className = 'legend-group';
        if(name){
          var head = document.createElement('span');
          head.className = 'legend-group-label';
          head.textContent = name + ':';
          row.appendChild(head);
        }
        box.className = 'legend-group-items';
        row.appendChild(box);
        rows[name] = box;
        order.push(row);
      }
      return rows[name];
    };
    datasets.forEach(function(ds, idx){
      if(ds.noLegend) return;
      var item = document.createElement('div');
      item.className = 'legend-item';
      if(ds.kind) item.setAttribute('data-kind', ds.kind);
      if(ds.hidden) item.classList.add('hidden');
      item.addEventListener('click', function(){
        var hidden = !item.classList.contains('hidden');
        item.classList.toggle('hidden', hidden);
        chart.setDatasetVisibility(idx, !hidden);
        dim(item.$host);
        if(chart.$edPanes) chart.$edPanes();
        chart.update();
      });
      if(ds.pairOf != null){
        // A name leads its pair where the pair's first series comes.
        if(ds.pairName != null && !hosts[ds.pairOf]) rowOf(ds.group || '').appendChild(hosts[ds.pairOf] = nameHost(ds.pairName, ds.pairOf));
        // Its host may come later (the demand comes after the shortfall), so it is keyed once all are in.
        subs.push({ item: item, ds: ds });
        return;
      }
      SharedLegend.attach(item, SharedLegend.specOf(ds), ds.label);
      if(ds.pair != null){ hosts[ds.pair] = item; item.setAttribute('data-pair', ds.pair); }
      rowOf(ds.group || '').appendChild(item);
    });
    var inHost = {}, keys = [];
    subs.forEach(function(s){
      var item = s.item, ds = s.ds, host = hosts[ds.pairOf];
      SharedLegend.attach(item, SharedLegend.specOf(ds), host ? ds.pairLabel : ds.label);
      if(!host){ rowOf(ds.group || '').appendChild(item); return; }
      // The exports read data-of to key it the same way, and data-full when its host is not keyed.
      // A Share link names it by its whole label, which tells two stores' "Charging" apart.
      item.classList.add('legend-sub');
      item.setAttribute('data-of', ds.pairOf);
      item.setAttribute('data-full', ds.label);
      item.setAttribute('data-legend-key', ds.label);
      item.title = ds.label;
      item.$host = host;
      if(!inHost[ds.pairOf]){ inHost[ds.pairOf] = []; keys.push(ds.pairOf); }
      inHost[ds.pairOf].push(item);
    });
    // The host, then its entries inside one pair of brackets.
    keys.forEach(function(key){
      var host = hosts[key], items = inHost[key], pair = document.createElement('span');
      pair.className = 'legend-pair';
      host.parentNode.insertBefore(pair, host);
      pair.appendChild(host);
      items[0].insertBefore(paren('('), items[0].firstChild);
      items[items.length - 1].appendChild(paren(')'));
      items.forEach(function(it){ pair.appendChild(it); });
      dim(host);
    });
    order.forEach(function(row){ el.appendChild(row); });
  }
  function make(key, cfg, legendId){
    var id = CANVAS[key];
    if(charts[id]) charts[id].destroy();
    // SharedPane keeps each pane's axis text inside it, on Dispatch with its curtailment pane.
    cfg.plugins = [SharedZoom.plugin, HOUR_PLUGIN, SharedPane.plugin];
    var ch = charts[id] = new Chart($(id), cfg);
    if(legendId) renderLegend(legendId, ch, cfg.data.datasets);
    return ch;
  }
  function hover(id, txt){ var el = $(id); if(el) el.textContent = txt; }

  /* ── Who generates what, in merit order ── */
  function units(model, res){
    var gens = model.el.filter(function(e){ return e.c === 'Generator' && res.dev[e.id]; });
    gens.sort(function(a, b){ return ED.meritCost(a) - ED.meritCost(b) || a.id - b.id; });
    return gens;
  }

  /* A dotted fill: dots of the colour over a pale wash of it, so storage
     never reads as one more generator. The tile is drawn at the screen's
     pixel ratio, so the dots stay round and sharp. */
  function dotFill(fill, dot){
    var n = 5, k = Math.max(1, Math.ceil(window.devicePixelRatio || 1)), cv = document.createElement('canvas'), g = cv.getContext('2d');
    cv.width = cv.height = n * k;
    g.scale(k, k);
    g.fillStyle = fill; g.fillRect(0, 0, n, n);
    g.fillStyle = dot;
    [[1.25, 1.25], [3.75, 3.75]].forEach(function(p){ g.beginPath(); g.arc(p[0], p[1], 0.95, 0, Math.PI * 2); g.fill(); });
    var pat = g.createPattern(cv, 'repeat');
    if(pat && pat.setTransform && root.DOMMatrix) pat.setTransform(new DOMMatrix().scale(1 / k));
    return pat;
  }
  /* A hatched fill: 45° lines of the colour over a pale wash of it, for the
     power a unit had and did not use and the demand it could not meet, so
     neither reads as output (dots are storage's). Drawn at the screen's pixel
     ratio, like the dots. */
  function hatchFill(fill, line){
    var n = 6, k = Math.max(1, Math.ceil(window.devicePixelRatio || 1)), cv = document.createElement('canvas'), g = cv.getContext('2d');
    cv.width = cv.height = n * k;
    g.scale(k, k);
    g.fillStyle = fill; g.fillRect(0, 0, n, n);
    g.strokeStyle = line; g.lineWidth = 1;
    g.beginPath();
    [-n, 0, n].forEach(function(o){ g.moveTo(o, n); g.lineTo(o + n, 0); });
    g.stroke();
    var pat = g.createPattern(cv, 'repeat');
    if(pat && pat.setTransform && root.DOMMatrix) pat.setTransform(new DOMMatrix().scale(1 / k));
    return pat;
  }

  /* The class the Dispatch chart's box takes for the panes it draws: taller
     with the curtailment pane under the dispatch, shorter with that pane alone. */
  function paneClass(want){ return want.disp && want.curt ? 'has-curt' : want.curt ? 'curt-only' : ''; }
  /* The curtailment pane sits under the dispatch, on the same hours, while any
     unit's curtailment is showing in the key; hide every one and the dispatch
     has the whole chart back. want ({ disp, curt }) is what to draw instead
     of parts, for a GIF of one pane. The caller updates the chart. */
  function panes(chart, want){
    var sc = chart.options.scales, wrap = chart.canvas && chart.canvas.parentElement;
    var curt = !!sc.yCurt && chart.data.datasets.some(function(d, i){ return d.kind === 'curt' && chart.isDatasetVisible(i); });
    var disp = !curt || (want || parts).disp;
    if(sc.yCurt){
      sc.y.stack = sc.yCurt.stack = sc.yCurtGap.stack = disp && curt ? 'edDisp' : undefined;
      // Chart.js scales an axis by its weight in a stack or out of one, so it only has one in it.
      sc.y.stackWeight = disp && curt ? 3 : 1;
      sc.y.display = disp;
      sc.yCurt.display = curt;
    }
    if(chart.$edSub) $('dispSub').textContent = !disp ? 'The power units had available and did not use (curtailed), stacked in merit order.'
      : chart.$edSub + (curt ? ' Under them, the power units had available and did not use (curtailed).' : '');
    var cls = paneClass({ disp: disp, curt: curt });
    if(wrap && (wrap.classList.contains('has-curt') !== (cls === 'has-curt') || wrap.classList.contains('curt-only') !== (cls === 'curt-only'))){
      wrap.classList.toggle('has-curt', cls === 'has-curt');
      wrap.classList.toggle('curt-only', cls === 'curt-only');
      chart.resize();
    }
  }
  /* fn() with the Dispatch chart drawing only the panes in want, then the
     chart as it was, its key's choices and all: a GIF that picked one pane. */
  function asParts(key, want, fn){
    var chart = charts[CANVAS[key]];
    if(key !== 'disp' || !want || !chart || !chart.options.scales.yCurt) return fn();
    var ds = chart.data.datasets, vis = ds.map(function(d, i){ return chart.isDatasetVisible(i); });
    ds.forEach(function(d, i){ if(d.kind === 'curt' ? !want.curt : !want.disp) chart.setDatasetVisibility(i, false); });
    panes(chart, want);
    chart.update('none');
    try { return fn(); }
    finally {
      vis.forEach(function(v, i){ chart.setDatasetVisibility(i, v); });
      panes(chart);
      chart.update('none');
    }
  }
  function dispatchChart(res, model, d){
    var H = res.T, F = ED.fmt, cur = d.cur;
    var labels = hourLabels(H), ds = [];
    var gens = units(model, res);
    var stores = model.el.filter(function(e){ return e.c === 'StorageUnit' && res.dev[e.id]; });
    var pts = H <= 1 ? 4 : 0;
    gens.forEach(function(e, i){
      var c = seriesColour(i);
      ds.push({ label: ED.nameOf(e), data: res.dev[e.id].p.map(function(v){ return Math.max(0, v); }), borderColor: c, backgroundColor: alpha(c, 0.55),
                borderWidth: 1.2, pointRadius: pts, pointHoverRadius: 4, tension: 0, fill: 'origin', stack: 'gen', order: 2, kind: 'gen', id: e.id, group: 'Generator', pair: e.id });
    });
    stores.forEach(function(e, j){
      var c = seriesColour(gens.length + j);
      // Keyed under the store's name, "Battery (▦ Charging ▦ Discharging)", charging first.
      ds.push({ label: ED.nameOf(e) + ' charging', data: res.dev[e.id].p.map(function(v){ return Math.min(0, v); }), borderColor: c, backgroundColor: dotFill(alpha(c, 0.12), alpha(c, 0.6)),
                borderWidth: 1.2, borderDash: [4, 3], pointRadius: pts, pointHoverRadius: 4, tension: 0, fill: 'origin', stack: 'store', order: 2, kind: 'chg', id: e.id, group: 'Storage',
                pairOf: 'store' + e.id, pairName: ED.nameOf(e), pairLabel: 'Charging', dots: { fill: alpha(c, 0.12), dot: alpha(c, 0.6) } });
      ds.push({ label: ED.nameOf(e) + ' discharging', data: res.dev[e.id].p.map(function(v){ return Math.max(0, v); }), borderColor: c, backgroundColor: dotFill(alpha(c, 0.3), c),
                borderWidth: 1.2, pointRadius: pts, pointHoverRadius: 4, tension: 0, fill: 'origin', stack: 'gen', order: 2, kind: 'dis', id: e.id, group: 'Storage',
                pairOf: 'store' + e.id, pairName: ED.nameOf(e), pairLabel: 'Discharging', dots: { fill: alpha(c, 0.3), dot: c } });
    });
    /* The demand the units could not meet, on top of them up to the demand
       line: hatched in the line's own colour, with no edge of its own, so it
       reads as part of the demand and never as one more unit. */
    var ink = cssVar('--text');
    if(res.totals.shedEnergy > 1e-6){
      var inkWash = alpha(ink, 0.2);
      ds.push({ label: 'Shortfall (load shed)', data: res.totals.shed.slice(), borderColor: ink, backgroundColor: hatchFill(inkWash, ink),
                borderWidth: 0, pointRadius: pts, tension: 0, fill: 'origin', stack: 'gen', order: 2, kind: 'shed', group: 'Demand',
                pairOf: 'load', pairLabel: 'Shortfall', hatch: { fill: inkWash, line: ink } });
    }
    /* What each unit had available and did not use, the way the totals count
       it (units with a shape only), stacked in merit order in the pane under
       the dispatch, in the unit's own colour, hatched. Only units that were
       curtailed at all, and none when the embed did not pick it. */
    var curts = 0;
    if(parts.curt) gens.forEach(function(e, i){
      var r = res.dev[e.id], sum = 0;
      if(!ED.hasShape(e) || !r.avail) return;
      var data = r.avail.map(function(a, t){ var v = a - r.p[t]; return v > 1e-6 ? v : 0; });
      data.forEach(function(v){ sum += v; });
      if(sum <= 1e-6) return;
      var c = seriesColour(i), wash = alpha(c, 0.25);
      ds.push({ label: ED.nameOf(e) + ' curtailed', data: data, borderColor: c, backgroundColor: hatchFill(wash, c),
                borderWidth: 1.2, pointRadius: pts, pointHoverRadius: 4, tension: 0, fill: 'origin', stack: 'curt', yAxisID: 'yCurt', order: 2, kind: 'curt', id: e.id, group: 'Generator',
                pairOf: e.id, pairLabel: 'Curtailed', hatch: { fill: wash, line: c } });
      curts++;
    });
    // Each layer fills down to the layer under it in its own stack (Chart.js's
    // 'stack' fill can reach past an empty layer to the wrong one).
    var lastIn = {};
    ds.forEach(function(d, i){
      d.fill = lastIn[d.stack] === undefined ? 'origin' : lastIn[d.stack];
      lastIn[d.stack] = i;
      // The key and the hover show it filled, whatever it fills down to, and
      // a dotted or hatched fill as one (a pattern is no colour a swatch can read).
      var shown = {}; for(var k in d) shown[k] = d[k];
      shown.fill = 'origin';
      var over = d.dots ? { fill: d.dots.fill, dots: d.dots.dot } : d.hatch ? { fill: d.hatch.fill, hatch: d.hatch.line } : null;
      // The shortfall has no edge of its own: its key draws the demand line it runs up to over its hatch.
      if(d.kind === 'shed'){ over.dash = [6, 4]; over.width = 2; }
      d.legendSpec = SharedLegend.fromDataset(shown, over);
    });
    ds.push({ label: 'Demand', data: res.totals.load.slice(), borderColor: ink, backgroundColor: 'transparent',
              borderWidth: 2, borderDash: [6, 4], pointRadius: pts, pointHoverRadius: 4, tension: 0, fill: false, stack: 'load', order: 1, kind: 'load', group: 'Demand', pair: 'load' });
    // Named, because Chart.js puts a series that names no axis on the first one
    // defined, which is the curtailment's. An embed of the curtailment alone
    // keeps the dispatch out of the chart and its key.
    ds.forEach(function(d){
      if(d.kind === 'curt') return;
      d.yAxisID = 'y';
      if(curts && !parts.disp){ d.hidden = true; d.noLegend = true; }
    });
    // The chart opens on its panes (panes() keeps them after), its box already the height they take.
    var both = curts > 0 && parts.disp, wrap = $(CANVAS.disp).parentElement, cls = paneClass({ disp: !curts || parts.disp, curt: curts > 0 });
    wrap.classList.toggle('has-curt', cls === 'has-curt');
    wrap.classList.toggle('curt-only', cls === 'curt-only');
    var ch = make('disp', {
      type: 'line', data: { labels: labels, datasets: ds },
      options: baseOptions({ H: H,
        callbacks: {
          title: function(items){ return items.length ? labels[items[0].dataIndex] : ''; },
          label: function(c){ return '  ' + c.dataset.label + ': ' + F.mw(c.parsed.y) + ' MW'; },
          afterBody: function(items){
            if(!items.length) return;
            var t = items[0].dataIndex, T = res.totals;
            hover('dispHover', labels[t] + '  |  demand ' + F.mw(T.load[t]) + ' MW, generation ' + F.mw(T.gen[t]) + ' MW' +
              (Math.abs(T.store[t]) > 1e-6 ? ', storage ' + F.mw(T.store[t]) + ' MW' : '') +
              (T.shed[t] > 1e-6 ? ', shed ' + F.mw(T.shed[t]) + ' MW' : '') +
              (T.curtail[t] > 1e-6 ? ', curtailed ' + F.mw(T.curtail[t]) + ' MW' : ''));
          }
        },
        filter: function(item){ return Math.abs(item.parsed.y) > 1e-9 || item.dataset.kind === 'load'; },
        // The stack's top meets the demand line (plus any charging), so the line is not added to it.
        skip: function(ds){ return ds.kind === 'load'; },
        fitAxes: ['y', 'yCurt'],
        scales: function(grid, muted){
          var s = { x: xAxis(H, grid, muted) };
          /* The curtailment pane stacks under the dispatch on one canvas, the
             way Financial Freedom's balance sits under its flows: Chart.js
             stacks a group's axes in the order they are defined, the bottom
             one first, then a spacer so the two read as two pictures. panes()
             puts them in the stack only while there is curtailment to show. */
          if(curts){
            s.yCurt = { position: 'left', stack: both ? 'edDisp' : undefined, stacked: true, stackWeight: 1, title: { display: true, text: 'Curtailed (MW)', color: muted, font: { size: 11 } },
                        // Few ticks, and no label on the top one (the axis rounds its top to a
                        // tick), so its labels never meet the dispatch's across the join on a phone.
                        ticks: { color: muted, font: { size: 11 }, maxTicksLimit: 4, includeBounds: false,
                                 callback: function(v, i, all){ return i === all.length - 1 && all.length > 2 ? '' : F.mwr(v); } }, grid: { color: grid } };
            s.yCurtGap = { position: 'left', stack: both ? 'edDisp' : undefined, stackWeight: 0.12, min: 0, max: 1, display: false,
                           ticks: { display: false }, grid: { display: false, drawTicks: false }, border: { display: false } };
          }
          s.y = { stack: both ? 'edDisp' : undefined, display: !curts || parts.disp, stacked: true, stackWeight: both ? 3 : 1, title: { display: true, text: 'Power (MW)', color: muted, font: { size: 11 } },
                  ticks: { color: muted, font: { size: 11 }, callback: function(v){ return F.mwr(v); } }, grid: { color: grid } };
          return s;
        } })
    }, 'dispLegend');
    // The demand line is not stacked with the units.
    ch.options.scales.y.stacked = true;
    ch.$edSub = 'Units stacked in merit order, cheapest at the bottom' + (stores.length ? ', with storage charging below zero' : '') + '.';
    ch.$edPanes = function(){ panes(ch); };
    panes(ch);
    return ch;
  }

  function priceChart(res, model, d){
    var H = res.T, F = ED.fmt, cur = d.cur;
    var labels = hourLabels(H), ds = [];
    var buses = model.el.filter(function(e){ return e.c === 'Bus' && res.bus[e.id]; });
    var pts = H <= 1 ? 4 : 0;
    var noPrice = res.report.pricing === 'none';
    // One price everywhere (no congestion, no lossy link between them): one line.
    var uniform = buses.length > 1 && buses.every(function(b){
      var a = res.bus[b.id].price, r = res.bus[buses[0].id].price;
      for(var t = 0; t < H; t++) if(Math.abs(a[t] - r[t]) > 1e-4) return false;
      return true;
    });
    var list = uniform ? [buses[0]] : buses;
    list.forEach(function(b, i){
      var c = seriesColour(i);
      ds.push({ label: uniform ? 'System price, every bus' : ED.nameOf(b), data: res.bus[b.id].price.map(function(v){ return isFinite(v) ? v : null; }),
                borderColor: c, backgroundColor: alpha(c, 0.12), borderWidth: 2.2, pointRadius: pts, pointHoverRadius: 4, stepped: 'middle', fill: false });
    });
    var ch = make('price', {
      type: 'line', data: { labels: labels, datasets: ds },
      options: baseOptions({ H: H,
        callbacks: {
          title: function(items){ return items.length ? labels[items[0].dataIndex] : ''; },
          label: function(c){ return '  ' + c.dataset.label + ': ' + F.price(c.parsed.y, cur) + '/MWh'; },
          afterBody: function(items){
            if(!items.length) return;
            var t = items[0].dataIndex;
            hover('priceHover', labels[t] + '  |  ' + items.map(function(it){ return it.dataset.label + ' ' + F.price(it.parsed.y, cur); }).join(', ') + ' per MWh');
          }
        },
        scales: function(grid, muted){
          return { x: xAxis(H, grid, muted),
                   y: { title: { display: true, text: 'Price (' + (cur || '') + '/MWh)', color: muted, font: { size: 11 } },
                        ticks: { color: muted, font: { size: 11 }, callback: function(v){ return tickPrice(v, cur); } }, grid: { color: grid } } };
        } })
    }, 'priceLegend');
    var sub = noPrice ? 'No prices: the run with the commitment fixed could not be solved.'
      : res.report.pricing === 'lp' ? 'The cost of one more MW at each bus, the dual of its power balance.'
      : 'The cost of one more MW at each bus with the commitment held as found, the way markets price a unit commitment.';
    if(uniform) sub += ' Every bus has the same price: no branch limit binds.';
    $('priceSub').textContent = sub;
    return ch;
  }

  /* A unit's name on the commitment chart's axis: two lines rather than one
     long one, so a long name does not narrow the chart, or one shortened line
     when the rows are too close for two. The hover keeps the whole name. */
  var NAME_LINE = 14;
  function axisName(s, twoFit){
    s = String(s);
    if(s.length <= NAME_LINE) return s;
    if(!twoFit) return s.slice(0, NAME_LINE + 3) + '…';
    var words = s.split(' '), a = '', i = 0;
    while(i < words.length && (a ? a.length + 1 : 0) + words[i].length <= NAME_LINE){ a += (a ? ' ' : '') + words[i]; i++; }
    var rest = words.slice(i).join(' ');
    if(!a){ a = s.slice(0, NAME_LINE - 1) + '-'; rest = s.slice(NAME_LINE - 1); }
    return [a, rest.length > NAME_LINE ? rest.slice(0, NAME_LINE - 1) + '…' : rest];
  }

  function commitChart(res, model, d){
    var H = res.T, F = ED.fmt;
    // Hour t's bar runs from t - 0.5 to t + 0.5, so its middle is where the
    // line charts put hour t, and the axis runs from the first hour's to the last's.
    var x0 = H > 1 ? 0 : -0.5, x1 = H > 1 ? H - 1 : 0.5;
    var gens = units(model, res).filter(function(e){ return res.dev[e.id].status; });
    var names = gens.map(function(e){ return ED.nameOf(e); });
    var on = [], onColour = [], starts = [];
    gens.forEach(function(e, i){
      var r = res.dev[e.id], c = seriesColour(units(model, res).indexOf(e));
      for(var t = 0; t < H; t++){
        var s = r.status[t];
        if(s > 1e-3){ on.push({ x: [t - 0.5, t + 0.5], y: names[i], t: t, id: e.id, s: s }); onColour.push(alpha(c, 0.25 + 0.6 * Math.min(1, s))); }
        if(r.su[t] > 0.5) starts.push({ x: Math.max(x0, t - 0.5), y: names[i], t: t, id: e.id });
      }
    });
    var accent = cssVar('--text');
    var ds = [
      { type: 'bar', label: 'Running', data: on, backgroundColor: onColour, borderWidth: 0, borderSkipped: false, barPercentage: 0.7, categoryPercentage: 1, grouped: false,
        legendSpec: { type: 'area', fill: alpha(seriesColour(0), 0.7) } },
      { type: 'scatter', label: 'Starts', data: starts, pointStyle: 'triangle', pointRadius: 5, pointHoverRadius: 7, backgroundColor: accent, borderColor: accent, rotation: 90,
        legendSpec: { type: 'point', point: { shape: 'triangle', fill: accent, stroke: accent, radius: 4 } } }
    ];
    var ch = make('commit', {
      type: 'bar', data: { labels: names, datasets: ds },
      options: (function(){
        var o = baseOptions({ H: H, mode: 'nearest', fit: false, zoom: { min: x0, max: x1, points: H },
          callbacks: {
            title: function(items){ return items.length ? items[0].raw.y + ', ' + ED.hourLabel(items[0].raw.t, H, startOf()) : ''; },
            label: function(c){
              var r = res.dev[c.raw.id], t = c.raw.t;
              return c.dataset.type === 'scatter' ? '  Starts' : '  ' + (r.status[t] > 0.999 ? 'Running' : 'Running ' + Math.round(r.status[t] * 100) + '%') + ', ' + F.mw(r.p[t]) + ' MW';
            },
            afterBody: function(items){
              if(!items.length) return;
              var raw = items[0].raw, r = res.dev[raw.id];
              hover('commitHover', raw.y + ' at ' + ED.hourLabel(raw.t, H, startOf()) + '  |  ' + (r.status[raw.t] > 0.999 ? 'running' : r.status[raw.t] < 0.001 ? 'off' : 'running ' + Math.round(r.status[raw.t] * 100) + '%') + ', ' + F.mw(r.p[raw.t]) + ' MW');
            }
          },
          scales: function(grid, muted){
            return {
              x: xAxis(H, grid, muted, { type: 'linear', min: x0, max: x1,
                   ticks: { color: muted, maxTicksLimit: H > 24 ? 8 : 12, font: { size: 11 }, stepSize: 3, includeBounds: false,
                            callback: function(v){ return Math.abs(v - Math.round(v)) > 1e-9 ? '' : tickText(this, Math.round(v), H); } },
                   afterBuildTicks: clockTicks(H) }),
              y: { type: 'category', title: { display: true, text: 'Unit', color: muted, font: { size: 11 } },
                   ticks: { color: muted, font: { size: 11 },
                            callback: function(v){ return axisName(this.getLabelForValue(v), (this.height || 300) / Math.max(1, names.length) >= 30); } },
                   grid: { color: grid, offset: true } }
            };
          } });
        o.indexAxis = 'y';
        return o;
      })()
    }, 'commitLegend');
    var su = res.totals.starts;
    $('commitSub').textContent = (res.report.milp ? 'Each committable unit’s hours on' : 'Each committable unit’s share of the hour it is on, from the relaxation') +
      ', and its ' + (Math.round(su * 10) / 10) + ' start' + (Math.abs(su - 1) < 1e-9 ? '' : 's') + ' over the horizon.';
    return ch;
  }

  /* With more than one store the chart shows one at a time, the one picked
     in its head, against the price at that store's own bus. */
  var storePick = null;  // the picked store's id; the first store when unset or gone
  function storePicker(stores, shown){
    var wrap = $('storePickWrap'), sel = $('storePick');
    if(!wrap || !sel) return;
    wrap.hidden = stores.length < 2;
    sel.innerHTML = '';
    stores.forEach(function(e){
      var o = document.createElement('option');
      o.value = e.id; o.textContent = ED.nameOf(e);
      sel.appendChild(o);
    });
    if(shown) sel.value = shown.id;
    if(!sel.__wired){
      sel.__wired = true;
      sel.addEventListener('change', function(){
        storePick = sel.value;
        if(ctx && ctx.res) storeChart(ctx.res, ctx.model, ctx.display);
      });
    }
  }
  function storeChart(res, model, d){
    var H = res.T, F = ED.fmt, cur = d.cur;
    var labels = hourLabels(H), ds = [];
    var all = model.el.filter(function(e){ return e.c === 'StorageUnit' && res.dev[e.id]; });
    var nGen = units(model, res).length;
    var first = all.filter(function(e){ return String(e.id) === storePick; })[0] || all[0];
    var stores = first ? [first] : [];
    storePicker(all, first);
    var pts = H <= 1 ? 4 : 0;
    stores.forEach(function(e){
      var c = seriesColour(nGen + all.indexOf(e));
      ds.push({ label: ED.nameOf(e) + ' energy', data: res.dev[e.id].soc.slice(), borderColor: c, backgroundColor: alpha(c, 0.25),
                borderWidth: 2.2, pointRadius: pts, pointHoverRadius: 4, tension: 0, fill: 'origin', yAxisID: 'y' });
    });
    var bus = first ? res.bus[first.bus] : null;
    if(bus){
      var pc = cssVar('--muted');
      ds.push({ label: 'Price at ' + ED.nameOf(ED.byId(model)[first.bus]), data: bus.price.map(function(v){ return isFinite(v) ? v : null; }), borderColor: pc,
                backgroundColor: 'transparent', borderWidth: 1.6, borderDash: [5, 4], pointRadius: pts, stepped: 'middle', fill: false, yAxisID: 'y2' });
    }
    var ch = make('store', {
      type: 'line', data: { labels: labels, datasets: ds },
      options: baseOptions({ H: H, fitAxes: ['y', 'y2'],
        callbacks: {
          title: function(items){ return items.length ? labels[items[0].dataIndex] : ''; },
          label: function(c){ return '  ' + c.dataset.label + ': ' + (c.dataset.yAxisID === 'y2' ? F.price(c.parsed.y, cur) + '/MWh' : F.mwh(c.parsed.y) + ' MWh'); },
          afterBody: function(items){
            if(!items.length) return;
            var t = items[0].dataIndex;
            hover('storeHover', labels[t] + '  |  ' + stores.map(function(e){
              var r = res.dev[e.id];
              return ED.nameOf(e) + ' ' + F.mwh(r.soc[t]) + ' MWh, ' + (r.p[t] > 1e-6 ? 'discharging ' + F.mw(r.p[t]) + ' MW' : r.p[t] < -1e-6 ? 'charging ' + F.mw(-r.p[t]) + ' MW' : 'idle');
            }).join('; '));
          }
        },
        scales: function(grid, muted){
          return { x: xAxis(H, grid, muted),
                   y: { position: 'left', title: { display: true, text: 'Energy stored (MWh)', color: muted, font: { size: 11 } },
                        ticks: { color: muted, font: { size: 11 }, callback: function(v){ return ED.fmt.mwr(v); } }, grid: { color: grid } },
                   y2: { position: 'right', title: { display: true, text: 'Price (' + (cur || '') + '/MWh)', color: muted, font: { size: 11 } },
                         ticks: { color: muted, font: { size: 11 }, callback: function(v){ return tickPrice(v, cur); } }, grid: { drawOnChartArea: false } } };
        } })
    }, 'storeLegend');
    $('storeSub').textContent = 'Energy held at the end of each hour, against the price at the bus where ' + (all.length > 1 ? 'the picked store' : 'it') + ' sits: it charges when power is cheap and discharges when it is dear.';
    return ch;
  }

  /* ── Public ── */
  var EDCharts = root.EDCharts = {
    ok: function(){ return typeof root.Chart !== 'undefined'; },
    /* Draw every chart the result has. Returns which cards are shown. */
    render: function(res, model, display, onHour){
      ctx = { res: res, model: model, display: display, onHour: onHour };
      var show = { disp: false, price: false, commit: false, store: false };
      if(!res || !res.report || !res.report.ok){ EDCharts.clear(); return show; }
      if(!EDCharts.ok()){
        hover('dispHover', 'The chart library could not be loaded, so the charts are unavailable. Every number on this page is still correct.');
        show.disp = true;
        return show;
      }
      show.disp = true; dispatchChart(res, model, display);
      show.price = true; priceChart(res, model, display);
      var hasCom = Object.keys(res.dev).some(function(id){ return res.dev[id].status; });
      if(hasCom){ show.commit = true; commitChart(res, model, display); } else destroy(CANVAS.commit);
      var hasStore = model.el.some(function(e){ return e.c === 'StorageUnit' && res.dev[e.id]; });
      if(hasStore){ show.store = true; storeChart(res, model, display); } else destroy(CANVAS.store);
      return show;
    },
    // The hour moved: only the markers redraw.
    hour: function(h){
      if(!ctx) return;
      ctx.display.hour = h;
      Object.keys(charts).forEach(function(id){ if(charts[id]) charts[id].draw(); });
    },
    clear: function(){ Object.keys(charts).forEach(destroy); },
    get: function(key){ return charts[CANVAS[key]] || null; },
    // Whether Dispatch shows its curtailment pane: there is some, and the key has not hidden it all.
    curtShown: function(){
      var ch = charts[CANVAS.disp];
      return !!(ch && ch.options.scales.yCurt && ch.data.datasets.some(function(d, i){ return d.kind === 'curt' && ch.isDatasetVisible(i); }));
    },
    // The panes Dispatch draws from the next render on ({ disp, curt }), as an embed picked them.
    parts: function(p){ parts = { disp: p.disp !== false, curt: p.curt !== false }; },
    paneClass: paneClass,
    resetZoom: function(key){ var c = charts[CANVAS[key]]; if(c) c.resetZoom(); },
    png: chartPng,
    svg: chartSvg,
    still: chartStill,
    stillEdges: stillEdges
  };
  function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }

  /* ── Exports ── */
  // The watermark, "Made using tool.adjiebrotots.com/ed-uc-simulator" baked to DM Sans 500
  // glyph outlines by _ref/bake-watermark.py. Edit there and re-run, not here.
  ED.WM_PATH = "M0.82 0V-7.7H2.12L4.66 -2.48L7.19 -7.7H8.49V0H7.39V-5.76L5.08 -1.04H4.24L1.92 -5.74V0ZM11.9 0.13Q11.24 0.13 10.79 -0.11Q10.35 -0.35 10.13 -0.75Q9.91 -1.15 9.91 -1.62Q9.91 -2.17 10.19 -2.56Q10.47 -2.96 11 -3.17Q11.53 -3.38 12.26 -3.38H13.68Q13.68 -3.89 13.55 -4.23Q13.43 -4.57 13.15 -4.74Q12.87 -4.9 12.42 -4.9Q11.94 -4.9 11.61 -4.68Q11.27 -4.45 11.19 -4H10.09Q10.15 -4.58 10.48 -4.98Q10.8 -5.39 11.31 -5.6Q11.82 -5.82 12.42 -5.82Q13.2 -5.82 13.73 -5.54Q14.25 -5.27 14.52 -4.77Q14.78 -4.27 14.78 -3.58V0H13.82L13.73 -0.94Q13.62 -0.72 13.45 -0.52Q13.28 -0.33 13.05 -0.18Q12.83 -0.03 12.54 0.05Q12.25 0.13 11.9 0.13ZM12.11 -0.76Q12.45 -0.76 12.73 -0.91Q13.01 -1.05 13.22 -1.31Q13.42 -1.56 13.54 -1.87Q13.65 -2.19 13.66 -2.54V-2.6H12.37Q11.9 -2.6 11.61 -2.49Q11.32 -2.37 11.19 -2.16Q11.06 -1.95 11.06 -1.69Q11.06 -1.4 11.19 -1.2Q11.31 -0.99 11.55 -0.88Q11.78 -0.76 12.11 -0.76ZM18.67 0.13Q17.9 0.13 17.3 -0.25Q16.71 -0.64 16.38 -1.31Q16.05 -1.99 16.05 -2.84Q16.05 -3.71 16.38 -4.38Q16.72 -5.05 17.32 -5.43Q17.92 -5.82 18.71 -5.82Q19.35 -5.82 19.83 -5.56Q20.31 -5.31 20.59 -4.84V-7.92H21.69V0H20.7L20.6 -0.87Q20.43 -0.61 20.17 -0.38Q19.91 -0.15 19.54 -0.01Q19.17 0.13 18.67 0.13ZM18.87 -0.82Q19.39 -0.82 19.77 -1.07Q20.16 -1.32 20.37 -1.78Q20.58 -2.23 20.58 -2.84Q20.58 -3.46 20.37 -3.91Q20.16 -4.37 19.77 -4.61Q19.39 -4.86 18.87 -4.86Q18.38 -4.86 18 -4.61Q17.61 -4.37 17.39 -3.91Q17.17 -3.46 17.17 -2.85Q17.17 -2.23 17.39 -1.78Q17.61 -1.32 18 -1.07Q18.38 -0.82 18.87 -0.82ZM25.7 0.13Q24.91 0.13 24.3 -0.24Q23.69 -0.61 23.35 -1.27Q23 -1.94 23 -2.83Q23 -3.72 23.34 -4.4Q23.68 -5.07 24.3 -5.44Q24.91 -5.82 25.71 -5.82Q26.55 -5.82 27.12 -5.45Q27.7 -5.08 28.01 -4.46Q28.31 -3.84 28.31 -3.09Q28.31 -2.98 28.31 -2.86Q28.31 -2.74 28.3 -2.59H23.81V-3.36H27.22Q27.2 -4.1 26.77 -4.5Q26.34 -4.91 25.7 -4.91Q25.26 -4.91 24.89 -4.7Q24.53 -4.49 24.3 -4.08Q24.08 -3.67 24.08 -3.05V-2.74Q24.08 -2.11 24.3 -1.67Q24.52 -1.23 24.88 -1.01Q25.25 -0.78 25.69 -0.78Q26.24 -0.78 26.57 -1Q26.9 -1.22 27.05 -1.61H28.16Q28.01 -1.11 27.68 -0.72Q27.34 -0.32 26.84 -0.1Q26.34 0.13 25.7 0.13ZM34.49 0.13Q33.84 0.13 33.36 -0.12Q32.89 -0.37 32.63 -0.88Q32.37 -1.4 32.37 -2.16V-5.69H33.47V-2.29Q33.47 -1.54 33.81 -1.17Q34.16 -0.8 34.78 -0.8Q35.2 -0.8 35.54 -1Q35.87 -1.19 36.07 -1.56Q36.27 -1.94 36.27 -2.48V-5.69H37.37V0H36.39L36.31 -0.92Q36.08 -0.43 35.6 -0.15Q35.12 0.13 34.49 0.13ZM41.04 0.13Q40.28 0.13 39.75 -0.11Q39.22 -0.34 38.94 -0.77Q38.66 -1.19 38.6 -1.75H39.72Q39.76 -1.48 39.92 -1.26Q40.07 -1.03 40.35 -0.9Q40.63 -0.76 41.04 -0.76Q41.4 -0.76 41.64 -0.87Q41.88 -0.97 42 -1.16Q42.12 -1.34 42.12 -1.58Q42.12 -1.9 41.97 -2.07Q41.82 -2.25 41.53 -2.35Q41.24 -2.44 40.82 -2.5Q40.37 -2.58 40 -2.69Q39.63 -2.81 39.36 -3Q39.08 -3.19 38.94 -3.48Q38.79 -3.77 38.79 -4.17Q38.79 -4.65 39.04 -5.02Q39.3 -5.4 39.78 -5.61Q40.26 -5.82 40.91 -5.82Q41.87 -5.82 42.42 -5.38Q42.98 -4.95 43.08 -4.16H42.02Q41.96 -4.52 41.67 -4.72Q41.38 -4.92 40.9 -4.92Q40.4 -4.92 40.14 -4.74Q39.88 -4.55 39.88 -4.24Q39.88 -4.02 40.01 -3.85Q40.14 -3.68 40.42 -3.56Q40.71 -3.44 41.17 -3.37Q41.82 -3.27 42.28 -3.1Q42.74 -2.93 42.99 -2.59Q43.25 -2.26 43.24 -1.66Q43.24 -1.1 42.97 -0.7Q42.69 -0.3 42.2 -0.08Q41.71 0.13 41.04 0.13ZM44.65 0V-5.69H45.75V0ZM45.2 -6.69Q44.89 -6.69 44.68 -6.89Q44.48 -7.09 44.48 -7.39Q44.48 -7.69 44.68 -7.88Q44.89 -8.07 45.2 -8.07Q45.51 -8.07 45.72 -7.88Q45.93 -7.69 45.93 -7.39Q45.93 -7.09 45.72 -6.89Q45.51 -6.69 45.2 -6.69ZM47.35 0V-5.69H48.33L48.4 -4.77Q48.65 -5.26 49.13 -5.54Q49.61 -5.82 50.24 -5.82Q50.89 -5.82 51.37 -5.56Q51.84 -5.31 52.1 -4.79Q52.36 -4.28 52.36 -3.51V0H51.26V-3.4Q51.26 -4.13 50.91 -4.51Q50.57 -4.88 49.94 -4.88Q49.53 -4.88 49.19 -4.69Q48.85 -4.49 48.65 -4.12Q48.45 -3.74 48.45 -3.2V0ZM56.14 2.55Q55.35 2.55 54.77 2.36Q54.18 2.17 53.85 1.77Q53.53 1.38 53.53 0.8Q53.53 0.49 53.66 0.18Q53.8 -0.13 54.09 -0.41Q54.39 -0.68 54.89 -0.9L55.55 -0.41Q54.96 -0.19 54.77 0.1Q54.57 0.4 54.57 0.69Q54.57 1.02 54.77 1.24Q54.97 1.46 55.32 1.57Q55.67 1.68 56.13 1.68Q56.58 1.68 56.91 1.56Q57.23 1.45 57.41 1.23Q57.59 1.01 57.59 0.72Q57.59 0.32 57.32 0.08Q57.06 -0.15 56.27 -0.19Q55.64 -0.24 55.19 -0.32Q54.75 -0.4 54.45 -0.5Q54.14 -0.61 53.94 -0.75Q53.73 -0.88 53.58 -1.02V-1.28L54.7 -2.39L55.62 -2.09L54.38 -0.99L54.61 -1.5Q54.73 -1.42 54.84 -1.35Q54.96 -1.28 55.15 -1.22Q55.33 -1.16 55.66 -1.11Q55.99 -1.06 56.52 -1.02Q57.29 -0.96 57.75 -0.76Q58.22 -0.55 58.43 -0.19Q58.64 0.17 58.64 0.68Q58.64 1.16 58.38 1.58Q58.12 2.01 57.56 2.28Q57.01 2.55 56.14 2.55ZM56.13 -1.75Q55.43 -1.75 54.94 -2.01Q54.45 -2.28 54.19 -2.75Q53.93 -3.21 53.93 -3.78Q53.93 -4.36 54.19 -4.81Q54.45 -5.27 54.94 -5.55Q55.44 -5.82 56.13 -5.82Q56.84 -5.82 57.33 -5.55Q57.82 -5.27 58.08 -4.81Q58.33 -4.36 58.33 -3.78Q58.33 -3.21 58.08 -2.75Q57.82 -2.28 57.33 -2.01Q56.84 -1.75 56.13 -1.75ZM56.13 -2.62Q56.69 -2.62 57 -2.91Q57.32 -3.2 57.32 -3.78Q57.32 -4.35 57 -4.64Q56.69 -4.93 56.13 -4.93Q55.6 -4.93 55.26 -4.64Q54.93 -4.35 54.93 -3.78Q54.93 -3.2 55.25 -2.91Q55.58 -2.62 56.13 -2.62ZM57.08 -4.82 56.81 -5.69H59.08V-4.94ZM65.36 0Q64.84 0 64.45 -0.16Q64.06 -0.33 63.85 -0.71Q63.65 -1.1 63.65 -1.76V-4.76H62.66V-5.69H63.65L63.78 -7.14H64.75V-5.69H66.33V-4.76H64.75V-1.75Q64.75 -1.28 64.94 -1.11Q65.14 -0.94 65.62 -0.94H66.3V0ZM70.12 0.13Q69.32 0.13 68.7 -0.24Q68.08 -0.61 67.73 -1.28Q67.38 -1.95 67.38 -2.84Q67.38 -3.74 67.73 -4.41Q68.08 -5.08 68.71 -5.45Q69.34 -5.82 70.13 -5.82Q70.94 -5.82 71.56 -5.45Q72.18 -5.08 72.53 -4.41Q72.88 -3.74 72.88 -2.84Q72.88 -1.95 72.53 -1.28Q72.17 -0.61 71.55 -0.24Q70.93 0.13 70.12 0.13ZM70.12 -0.81Q70.58 -0.81 70.95 -1.04Q71.32 -1.27 71.54 -1.72Q71.76 -2.17 71.76 -2.84Q71.76 -3.52 71.54 -3.97Q71.33 -4.42 70.96 -4.65Q70.59 -4.87 70.14 -4.87Q69.69 -4.87 69.31 -4.65Q68.94 -4.42 68.72 -3.97Q68.5 -3.52 68.5 -2.84Q68.5 -2.17 68.72 -1.72Q68.94 -1.27 69.3 -1.04Q69.67 -0.81 70.12 -0.81ZM76.73 0.13Q75.93 0.13 75.31 -0.24Q74.69 -0.61 74.34 -1.28Q73.99 -1.95 73.99 -2.84Q73.99 -3.74 74.34 -4.41Q74.7 -5.08 75.32 -5.45Q75.95 -5.82 76.75 -5.82Q77.55 -5.82 78.17 -5.45Q78.79 -5.08 79.14 -4.41Q79.49 -3.74 79.49 -2.84Q79.49 -1.95 79.14 -1.28Q78.78 -0.61 78.16 -0.24Q77.54 0.13 76.73 0.13ZM76.73 -0.81Q77.19 -0.81 77.56 -1.04Q77.93 -1.27 78.15 -1.72Q78.37 -2.17 78.37 -2.84Q78.37 -3.52 78.15 -3.97Q77.94 -4.42 77.57 -4.65Q77.21 -4.87 76.75 -4.87Q76.3 -4.87 75.93 -4.65Q75.55 -4.42 75.33 -3.97Q75.11 -3.52 75.11 -2.84Q75.11 -2.17 75.33 -1.72Q75.55 -1.27 75.91 -1.04Q76.28 -0.81 76.73 -0.81ZM80.81 0V-7.92H81.91V0ZM83.9 0.05Q83.59 0.05 83.39 -0.15Q83.18 -0.35 83.18 -0.64Q83.18 -0.94 83.39 -1.14Q83.59 -1.34 83.9 -1.34Q84.22 -1.34 84.42 -1.14Q84.62 -0.94 84.62 -0.64Q84.62 -0.35 84.42 -0.15Q84.22 0.05 83.9 0.05ZM87.71 0.13Q87.04 0.13 86.59 -0.11Q86.15 -0.35 85.93 -0.75Q85.71 -1.15 85.71 -1.62Q85.71 -2.17 85.99 -2.56Q86.27 -2.96 86.8 -3.17Q87.33 -3.38 88.06 -3.38H89.48Q89.48 -3.89 89.35 -4.23Q89.23 -4.57 88.95 -4.74Q88.67 -4.9 88.22 -4.9Q87.74 -4.9 87.41 -4.68Q87.07 -4.45 86.99 -4H85.89Q85.95 -4.58 86.28 -4.98Q86.6 -5.39 87.11 -5.6Q87.62 -5.82 88.22 -5.82Q89 -5.82 89.53 -5.54Q90.05 -5.27 90.32 -4.77Q90.58 -4.27 90.58 -3.58V0H89.62L89.53 -0.94Q89.42 -0.72 89.25 -0.52Q89.08 -0.33 88.85 -0.18Q88.63 -0.03 88.34 0.05Q88.05 0.13 87.71 0.13ZM87.91 -0.76Q88.25 -0.76 88.53 -0.91Q88.81 -1.05 89.02 -1.31Q89.23 -1.56 89.34 -1.87Q89.45 -2.19 89.46 -2.54V-2.6H88.17Q87.7 -2.6 87.41 -2.49Q87.12 -2.37 86.99 -2.16Q86.87 -1.95 86.87 -1.69Q86.87 -1.4 86.99 -1.2Q87.11 -0.99 87.35 -0.88Q87.58 -0.76 87.91 -0.76ZM94.47 0.13Q93.7 0.13 93.1 -0.25Q92.51 -0.64 92.18 -1.31Q91.85 -1.99 91.85 -2.84Q91.85 -3.71 92.18 -4.38Q92.52 -5.05 93.12 -5.43Q93.72 -5.82 94.51 -5.82Q95.15 -5.82 95.63 -5.56Q96.11 -5.31 96.39 -4.84V-7.92H97.49V0H96.5L96.4 -0.87Q96.23 -0.61 95.97 -0.38Q95.71 -0.15 95.34 -0.01Q94.97 0.13 94.47 0.13ZM94.67 -0.82Q95.19 -0.82 95.57 -1.07Q95.96 -1.32 96.17 -1.78Q96.38 -2.23 96.38 -2.84Q96.38 -3.46 96.17 -3.91Q95.96 -4.37 95.57 -4.61Q95.19 -4.86 94.67 -4.86Q94.18 -4.86 93.8 -4.61Q93.41 -4.37 93.19 -3.91Q92.97 -3.46 92.97 -2.85Q92.97 -2.23 93.19 -1.78Q93.41 -1.32 93.8 -1.07Q94.18 -0.82 94.67 -0.82ZM97.96 2.42V1.48H98.39Q98.79 1.48 98.96 1.32Q99.12 1.16 99.12 0.77V-5.69H100.22V0.79Q100.22 1.37 100.03 1.73Q99.83 2.08 99.46 2.25Q99.09 2.42 98.56 2.42ZM99.68 -6.69Q99.37 -6.69 99.16 -6.89Q98.96 -7.09 98.96 -7.39Q98.96 -7.69 99.16 -7.88Q99.37 -8.07 99.68 -8.07Q99.99 -8.07 100.2 -7.88Q100.4 -7.69 100.4 -7.39Q100.4 -7.09 100.2 -6.89Q99.99 -6.69 99.68 -6.69ZM101.88 0V-5.69H102.98V0ZM102.44 -6.69Q102.12 -6.69 101.92 -6.89Q101.71 -7.09 101.71 -7.39Q101.71 -7.69 101.92 -7.88Q102.12 -8.07 102.44 -8.07Q102.74 -8.07 102.95 -7.88Q103.16 -7.69 103.16 -7.39Q103.16 -7.09 102.95 -6.89Q102.74 -6.69 102.44 -6.69ZM107.06 0.13Q106.27 0.13 105.66 -0.24Q105.06 -0.61 104.71 -1.27Q104.37 -1.94 104.37 -2.83Q104.37 -3.72 104.71 -4.4Q105.05 -5.07 105.66 -5.44Q106.28 -5.82 107.08 -5.82Q107.91 -5.82 108.49 -5.45Q109.07 -5.08 109.37 -4.46Q109.68 -3.84 109.68 -3.09Q109.68 -2.98 109.68 -2.86Q109.68 -2.74 109.66 -2.59H105.18V-3.36H108.59Q108.56 -4.1 108.13 -4.5Q107.71 -4.91 107.07 -4.91Q106.63 -4.91 106.26 -4.7Q105.89 -4.49 105.67 -4.08Q105.45 -3.67 105.45 -3.05V-2.74Q105.45 -2.11 105.67 -1.67Q105.89 -1.23 106.25 -1.01Q106.62 -0.78 107.06 -0.78Q107.61 -0.78 107.94 -1Q108.26 -1.22 108.42 -1.61H109.52Q109.38 -1.11 109.05 -0.72Q108.71 -0.32 108.21 -0.1Q107.71 0.13 107.06 0.13ZM113.95 0.13Q113.46 0.13 113.09 -0.01Q112.73 -0.15 112.47 -0.37Q112.2 -0.6 112.04 -0.84L111.93 0H110.94V-7.92H112.04V-4.82Q112.31 -5.29 112.8 -5.55Q113.29 -5.82 113.93 -5.82Q114.72 -5.82 115.32 -5.44Q115.92 -5.05 116.25 -4.39Q116.58 -3.72 116.58 -2.86Q116.58 -2 116.25 -1.32Q115.92 -0.64 115.33 -0.26Q114.74 0.13 113.95 0.13ZM113.76 -0.82Q114.25 -0.82 114.63 -1.07Q115.02 -1.32 115.24 -1.77Q115.46 -2.23 115.46 -2.84Q115.46 -3.46 115.24 -3.91Q115.02 -4.37 114.63 -4.61Q114.25 -4.86 113.76 -4.86Q113.25 -4.86 112.86 -4.61Q112.47 -4.37 112.26 -3.91Q112.05 -3.46 112.05 -2.84Q112.05 -2.23 112.26 -1.77Q112.47 -1.32 112.86 -1.07Q113.25 -0.82 113.76 -0.82ZM117.9 0V-5.69H118.89L118.98 -4.65Q119.18 -5.03 119.49 -5.29Q119.8 -5.55 120.24 -5.68Q120.67 -5.82 121.2 -5.82V-4.66H120.66Q120.33 -4.66 120.03 -4.58Q119.74 -4.5 119.5 -4.3Q119.27 -4.11 119.14 -3.79Q119 -3.46 119 -2.96V0ZM124.78 0.13Q123.98 0.13 123.36 -0.24Q122.73 -0.61 122.38 -1.28Q122.03 -1.95 122.03 -2.84Q122.03 -3.74 122.39 -4.41Q122.74 -5.08 123.37 -5.45Q124 -5.82 124.79 -5.82Q125.6 -5.82 126.22 -5.45Q126.84 -5.08 127.19 -4.41Q127.54 -3.74 127.54 -2.84Q127.54 -1.95 127.18 -1.28Q126.83 -0.61 126.21 -0.24Q125.58 0.13 124.78 0.13ZM124.78 -0.81Q125.24 -0.81 125.61 -1.04Q125.98 -1.27 126.2 -1.72Q126.41 -2.17 126.41 -2.84Q126.41 -3.52 126.2 -3.97Q125.99 -4.42 125.62 -4.65Q125.25 -4.87 124.79 -4.87Q124.35 -4.87 123.97 -4.65Q123.6 -4.42 123.38 -3.97Q123.16 -3.52 123.16 -2.84Q123.16 -2.17 123.38 -1.72Q123.59 -1.27 123.96 -1.04Q124.33 -0.81 124.78 -0.81ZM131.18 0Q130.66 0 130.27 -0.16Q129.89 -0.33 129.68 -0.71Q129.47 -1.1 129.47 -1.76V-4.76H128.48V-5.69H129.47L129.61 -7.14H130.57V-5.69H132.15V-4.76H130.57V-1.75Q130.57 -1.28 130.77 -1.11Q130.96 -0.94 131.45 -0.94H132.13V0ZM135.94 0.13Q135.14 0.13 134.52 -0.24Q133.9 -0.61 133.55 -1.28Q133.2 -1.95 133.2 -2.84Q133.2 -3.74 133.55 -4.41Q133.91 -5.08 134.53 -5.45Q135.16 -5.82 135.96 -5.82Q136.77 -5.82 137.39 -5.45Q138 -5.08 138.35 -4.41Q138.7 -3.74 138.7 -2.84Q138.7 -1.95 138.35 -1.28Q137.99 -0.61 137.37 -0.24Q136.75 0.13 135.94 0.13ZM135.94 -0.81Q136.4 -0.81 136.77 -1.04Q137.14 -1.27 137.36 -1.72Q137.58 -2.17 137.58 -2.84Q137.58 -3.52 137.37 -3.97Q137.15 -4.42 136.79 -4.65Q136.42 -4.87 135.96 -4.87Q135.51 -4.87 135.14 -4.65Q134.77 -4.42 134.54 -3.97Q134.32 -3.52 134.32 -2.84Q134.32 -2.17 134.54 -1.72Q134.76 -1.27 135.13 -1.04Q135.49 -0.81 135.94 -0.81ZM142.35 0Q141.82 0 141.44 -0.16Q141.05 -0.33 140.84 -0.71Q140.64 -1.1 140.64 -1.76V-4.76H139.65V-5.69H140.64L140.77 -7.14H141.74V-5.69H143.32V-4.76H141.74V-1.75Q141.74 -1.28 141.93 -1.11Q142.13 -0.94 142.61 -0.94H143.29V0ZM146.72 0.13Q145.95 0.13 145.43 -0.11Q144.9 -0.34 144.62 -0.77Q144.34 -1.19 144.28 -1.75H145.39Q145.44 -1.48 145.59 -1.26Q145.75 -1.03 146.03 -0.9Q146.31 -0.76 146.72 -0.76Q147.07 -0.76 147.31 -0.87Q147.55 -0.97 147.68 -1.16Q147.8 -1.34 147.8 -1.58Q147.8 -1.9 147.65 -2.07Q147.5 -2.25 147.21 -2.35Q146.92 -2.44 146.5 -2.5Q146.05 -2.58 145.68 -2.69Q145.31 -2.81 145.03 -3Q144.76 -3.19 144.61 -3.48Q144.46 -3.77 144.46 -4.17Q144.46 -4.65 144.72 -5.02Q144.98 -5.4 145.46 -5.61Q145.93 -5.82 146.59 -5.82Q147.54 -5.82 148.1 -5.38Q148.66 -4.95 148.76 -4.16H147.7Q147.64 -4.52 147.35 -4.72Q147.06 -4.92 146.58 -4.92Q146.08 -4.92 145.82 -4.74Q145.56 -4.55 145.56 -4.24Q145.56 -4.02 145.68 -3.85Q145.81 -3.68 146.1 -3.56Q146.39 -3.44 146.85 -3.37Q147.49 -3.27 147.96 -3.1Q148.42 -2.93 148.67 -2.59Q148.92 -2.26 148.92 -1.66Q148.92 -1.1 148.64 -0.7Q148.37 -0.3 147.88 -0.08Q147.39 0.13 146.72 0.13ZM150.72 0.05Q150.4 0.05 150.2 -0.15Q150 -0.35 150 -0.64Q150 -0.94 150.2 -1.14Q150.4 -1.34 150.72 -1.34Q151.04 -1.34 151.23 -1.14Q151.43 -0.94 151.43 -0.64Q151.43 -0.35 151.23 -0.15Q151.04 0.05 150.72 0.05ZM155.25 0.13Q154.45 0.13 153.82 -0.24Q153.19 -0.62 152.84 -1.29Q152.48 -1.95 152.48 -2.83Q152.48 -3.73 152.84 -4.4Q153.19 -5.07 153.82 -5.44Q154.45 -5.82 155.25 -5.82Q156.27 -5.82 156.95 -5.28Q157.63 -4.75 157.82 -3.83H156.68Q156.57 -4.33 156.17 -4.6Q155.78 -4.88 155.24 -4.88Q154.78 -4.88 154.4 -4.64Q154.03 -4.41 153.82 -3.96Q153.61 -3.51 153.61 -2.84Q153.61 -2.35 153.73 -1.97Q153.85 -1.58 154.07 -1.32Q154.29 -1.07 154.59 -0.93Q154.89 -0.8 155.24 -0.8Q155.6 -0.8 155.9 -0.92Q156.19 -1.05 156.4 -1.29Q156.61 -1.53 156.68 -1.86H157.82Q157.64 -0.96 156.95 -0.41Q156.26 0.13 155.25 0.13ZM161.67 0.13Q160.87 0.13 160.25 -0.24Q159.63 -0.61 159.28 -1.28Q158.93 -1.95 158.93 -2.84Q158.93 -3.74 159.28 -4.41Q159.64 -5.08 160.26 -5.45Q160.89 -5.82 161.69 -5.82Q162.5 -5.82 163.11 -5.45Q163.73 -5.08 164.08 -4.41Q164.43 -3.74 164.43 -2.84Q164.43 -1.95 164.08 -1.28Q163.72 -0.61 163.1 -0.24Q162.48 0.13 161.67 0.13ZM161.67 -0.81Q162.13 -0.81 162.5 -1.04Q162.87 -1.27 163.09 -1.72Q163.31 -2.17 163.31 -2.84Q163.31 -3.52 163.1 -3.97Q162.88 -4.42 162.52 -4.65Q162.15 -4.87 161.69 -4.87Q161.24 -4.87 160.87 -4.65Q160.49 -4.42 160.27 -3.97Q160.05 -3.52 160.05 -2.84Q160.05 -2.17 160.27 -1.72Q160.49 -1.27 160.86 -1.04Q161.22 -0.81 161.67 -0.81ZM165.75 0V-5.69H166.74L166.81 -4.91Q167.07 -5.33 167.52 -5.58Q167.96 -5.82 168.49 -5.82Q168.9 -5.82 169.24 -5.71Q169.57 -5.59 169.83 -5.37Q170.08 -5.14 170.24 -4.8Q170.54 -5.29 171.03 -5.55Q171.52 -5.82 172.08 -5.82Q172.74 -5.82 173.21 -5.56Q173.68 -5.3 173.92 -4.78Q174.17 -4.27 174.17 -3.5V0H173.08V-3.39Q173.08 -4.13 172.77 -4.51Q172.45 -4.88 171.88 -4.88Q171.49 -4.88 171.18 -4.68Q170.87 -4.49 170.69 -4.1Q170.51 -3.72 170.51 -3.17V0H169.42V-3.39Q169.42 -4.13 169.1 -4.51Q168.78 -4.88 168.21 -4.88Q167.84 -4.88 167.53 -4.68Q167.22 -4.49 167.04 -4.1Q166.85 -3.72 166.85 -3.17V0ZM175.19 1.11 177.95 -8.46H179.02L176.27 1.11ZM182.58 0.13Q181.79 0.13 181.18 -0.24Q180.57 -0.61 180.23 -1.27Q179.88 -1.94 179.88 -2.83Q179.88 -3.72 180.22 -4.4Q180.57 -5.07 181.18 -5.44Q181.79 -5.82 182.6 -5.82Q183.43 -5.82 184.01 -5.45Q184.58 -5.08 184.89 -4.46Q185.19 -3.84 185.19 -3.09Q185.19 -2.98 185.19 -2.86Q185.19 -2.74 185.18 -2.59H180.69V-3.36H184.1Q184.08 -4.1 183.65 -4.5Q183.22 -4.91 182.58 -4.91Q182.14 -4.91 181.78 -4.7Q181.41 -4.49 181.18 -4.08Q180.96 -3.67 180.96 -3.05V-2.74Q180.96 -2.11 181.18 -1.67Q181.4 -1.23 181.77 -1.01Q182.13 -0.78 182.58 -0.78Q183.13 -0.78 183.45 -1Q183.78 -1.22 183.94 -1.61H185.04Q184.9 -1.11 184.56 -0.72Q184.22 -0.32 183.72 -0.1Q183.22 0.13 182.58 0.13ZM188.86 0.13Q188.09 0.13 187.5 -0.25Q186.9 -0.64 186.57 -1.31Q186.24 -1.99 186.24 -2.84Q186.24 -3.71 186.57 -4.38Q186.91 -5.05 187.51 -5.43Q188.11 -5.82 188.9 -5.82Q189.55 -5.82 190.03 -5.56Q190.51 -5.31 190.78 -4.84V-7.92H191.88V0H190.89L190.79 -0.87Q190.62 -0.61 190.36 -0.38Q190.1 -0.15 189.73 -0.01Q189.36 0.13 188.86 0.13ZM189.06 -0.82Q189.58 -0.82 189.96 -1.07Q190.35 -1.32 190.56 -1.78Q190.77 -2.23 190.77 -2.84Q190.77 -3.46 190.56 -3.91Q190.35 -4.37 189.96 -4.61Q189.58 -4.86 189.06 -4.86Q188.57 -4.86 188.19 -4.61Q187.8 -4.37 187.58 -3.91Q187.36 -3.46 187.36 -2.85Q187.36 -2.23 187.58 -1.78Q187.8 -1.32 188.19 -1.07Q188.57 -0.82 189.06 -0.82ZM193.45 -2.88V-3.81H197.89V-2.88ZM201.53 0.13Q200.88 0.13 200.41 -0.12Q199.93 -0.37 199.67 -0.88Q199.41 -1.4 199.41 -2.16V-5.69H200.51V-2.29Q200.51 -1.54 200.86 -1.17Q201.21 -0.8 201.83 -0.8Q202.25 -0.8 202.58 -1Q202.92 -1.19 203.12 -1.56Q203.32 -1.94 203.32 -2.48V-5.69H204.42V0H203.43L203.36 -0.92Q203.12 -0.43 202.64 -0.15Q202.17 0.13 201.53 0.13ZM208.5 0.13Q207.7 0.13 207.07 -0.24Q206.45 -0.62 206.09 -1.29Q205.73 -1.95 205.73 -2.83Q205.73 -3.73 206.09 -4.4Q206.45 -5.07 207.07 -5.44Q207.7 -5.82 208.5 -5.82Q209.52 -5.82 210.2 -5.28Q210.88 -4.75 211.07 -3.83H209.93Q209.82 -4.33 209.42 -4.6Q209.03 -4.88 208.49 -4.88Q208.03 -4.88 207.66 -4.64Q207.28 -4.41 207.07 -3.96Q206.86 -3.51 206.86 -2.84Q206.86 -2.35 206.98 -1.97Q207.1 -1.58 207.32 -1.32Q207.54 -1.07 207.84 -0.93Q208.14 -0.8 208.49 -0.8Q208.86 -0.8 209.15 -0.92Q209.45 -1.05 209.65 -1.29Q209.86 -1.53 209.93 -1.86H211.07Q210.89 -0.96 210.2 -0.41Q209.51 0.13 208.5 0.13ZM212.43 -2.88V-3.81H216.88V-2.88ZM220.58 0.13Q219.82 0.13 219.29 -0.11Q218.77 -0.34 218.48 -0.77Q218.2 -1.19 218.15 -1.75H219.26Q219.31 -1.48 219.46 -1.26Q219.61 -1.03 219.89 -0.9Q220.17 -0.76 220.59 -0.76Q220.94 -0.76 221.18 -0.87Q221.42 -0.97 221.54 -1.16Q221.66 -1.34 221.66 -1.58Q221.66 -1.9 221.51 -2.07Q221.36 -2.25 221.07 -2.35Q220.78 -2.44 220.36 -2.5Q219.92 -2.58 219.54 -2.69Q219.17 -2.81 218.9 -3Q218.63 -3.19 218.48 -3.48Q218.33 -3.77 218.33 -4.17Q218.33 -4.65 218.59 -5.02Q218.84 -5.4 219.32 -5.61Q219.8 -5.82 220.45 -5.82Q221.41 -5.82 221.97 -5.38Q222.53 -4.95 222.63 -4.16H221.56Q221.5 -4.52 221.21 -4.72Q220.92 -4.92 220.44 -4.92Q219.94 -4.92 219.68 -4.74Q219.42 -4.55 219.42 -4.24Q219.42 -4.02 219.55 -3.85Q219.68 -3.68 219.96 -3.56Q220.25 -3.44 220.71 -3.37Q221.36 -3.27 221.82 -3.1Q222.28 -2.93 222.54 -2.59Q222.79 -2.26 222.78 -1.66Q222.78 -1.1 222.51 -0.7Q222.24 -0.3 221.74 -0.08Q221.25 0.13 220.58 0.13ZM224.19 0V-5.69H225.29V0ZM224.75 -6.69Q224.43 -6.69 224.22 -6.89Q224.02 -7.09 224.02 -7.39Q224.02 -7.69 224.22 -7.88Q224.43 -8.07 224.75 -8.07Q225.05 -8.07 225.26 -7.88Q225.47 -7.69 225.47 -7.39Q225.47 -7.09 225.26 -6.89Q225.05 -6.69 224.75 -6.69ZM226.89 0V-5.69H227.88L227.95 -4.91Q228.21 -5.33 228.66 -5.58Q229.1 -5.82 229.62 -5.82Q230.04 -5.82 230.38 -5.71Q230.71 -5.59 230.97 -5.37Q231.22 -5.14 231.38 -4.8Q231.67 -5.29 232.17 -5.55Q232.66 -5.82 233.21 -5.82Q233.88 -5.82 234.35 -5.56Q234.81 -5.3 235.06 -4.78Q235.31 -4.27 235.31 -3.5V0H234.22V-3.39Q234.22 -4.13 233.9 -4.51Q233.59 -4.88 233.02 -4.88Q232.63 -4.88 232.32 -4.68Q232.01 -4.49 231.83 -4.1Q231.65 -3.72 231.65 -3.17V0H230.55V-3.39Q230.55 -4.13 230.24 -4.51Q229.92 -4.88 229.35 -4.88Q228.97 -4.88 228.67 -4.68Q228.36 -4.49 228.18 -4.1Q227.99 -3.72 227.99 -3.17V0ZM238.87 0.13Q238.22 0.13 237.74 -0.12Q237.27 -0.37 237.01 -0.88Q236.75 -1.4 236.75 -2.16V-5.69H237.85V-2.29Q237.85 -1.54 238.19 -1.17Q238.54 -0.8 239.16 -0.8Q239.58 -0.8 239.92 -1Q240.25 -1.19 240.45 -1.56Q240.65 -1.94 240.65 -2.48V-5.69H241.75V0H240.77L240.69 -0.92Q240.46 -0.43 239.98 -0.15Q239.5 0.13 238.87 0.13ZM243.28 0V-7.92H244.38V0ZM247.73 0.13Q247.06 0.13 246.62 -0.11Q246.18 -0.35 245.96 -0.75Q245.74 -1.15 245.74 -1.62Q245.74 -2.17 246.02 -2.56Q246.3 -2.96 246.83 -3.17Q247.36 -3.38 248.09 -3.38H249.51Q249.51 -3.89 249.38 -4.23Q249.26 -4.57 248.98 -4.74Q248.7 -4.9 248.25 -4.9Q247.77 -4.9 247.44 -4.68Q247.1 -4.45 247.02 -4H245.92Q245.98 -4.58 246.31 -4.98Q246.63 -5.39 247.14 -5.6Q247.65 -5.82 248.25 -5.82Q249.03 -5.82 249.55 -5.54Q250.08 -5.27 250.34 -4.77Q250.61 -4.27 250.61 -3.58V0H249.65L249.56 -0.94Q249.45 -0.72 249.28 -0.52Q249.11 -0.33 248.88 -0.18Q248.66 -0.03 248.37 0.05Q248.08 0.13 247.73 0.13ZM247.94 -0.76Q248.28 -0.76 248.56 -0.91Q248.84 -1.05 249.05 -1.31Q249.25 -1.56 249.37 -1.87Q249.48 -2.19 249.49 -2.54V-2.6H248.19Q247.73 -2.6 247.44 -2.49Q247.15 -2.37 247.02 -2.16Q246.89 -1.95 246.89 -1.69Q246.89 -1.4 247.02 -1.2Q247.14 -0.99 247.37 -0.88Q247.61 -0.76 247.94 -0.76ZM254.41 0Q253.89 0 253.51 -0.16Q253.12 -0.33 252.91 -0.71Q252.7 -1.1 252.7 -1.76V-4.76H251.72V-5.69H252.7L252.84 -7.14H253.8V-5.69H255.39V-4.76H253.8V-1.75Q253.8 -1.28 254 -1.11Q254.19 -0.94 254.68 -0.94H255.36V0ZM259.17 0.13Q258.38 0.13 257.75 -0.24Q257.13 -0.61 256.78 -1.28Q256.43 -1.95 256.43 -2.84Q256.43 -3.74 256.79 -4.41Q257.14 -5.08 257.77 -5.45Q258.39 -5.82 259.19 -5.82Q260 -5.82 260.62 -5.45Q261.24 -5.08 261.59 -4.41Q261.94 -3.74 261.94 -2.84Q261.94 -1.95 261.58 -1.28Q261.23 -0.61 260.61 -0.24Q259.98 0.13 259.17 0.13ZM259.18 -0.81Q259.64 -0.81 260.01 -1.04Q260.38 -1.27 260.59 -1.72Q260.81 -2.17 260.81 -2.84Q260.81 -3.52 260.6 -3.97Q260.39 -4.42 260.02 -4.65Q259.65 -4.87 259.19 -4.87Q258.74 -4.87 258.37 -4.65Q258 -4.42 257.78 -3.97Q257.56 -3.52 257.56 -2.84Q257.56 -2.17 257.77 -1.72Q257.99 -1.27 258.36 -1.04Q258.73 -0.81 259.18 -0.81ZM263.26 0V-5.69H264.25L264.34 -4.65Q264.54 -5.03 264.85 -5.29Q265.16 -5.55 265.59 -5.68Q266.02 -5.82 266.56 -5.82V-4.66H266.02Q265.69 -4.66 265.39 -4.58Q265.09 -4.5 264.86 -4.3Q264.62 -4.11 264.49 -3.79Q264.36 -3.46 264.36 -2.96V0Z";
  ED.WM_PATH_W = 266.84;
  ED.WM_LOGO_SRC = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 680 680"><circle cx="340" cy="340" r="300" fill="#0052cc"/><g fill="none" stroke="#fff" stroke-width="46"><path d="M242 570A250 250 0 0 1 234 113"/><path d="M234 113A250 250 0 0 1 446 113"/><path d="M446 113A250 250 0 0 1 438 570"/></g><line x1="113" y1="354" x2="567" y2="354" stroke="#fff" stroke-width="42" stroke-linecap="round"/></svg>');
  var wmLogoImg = new Image();
  wmLogoImg.src = ED.WM_LOGO_SRC;
  function exportTokens(){
    var light = document.body.classList.contains('light');
    return { bg: light ? '#ffffff' : '#0F1728', fg: light ? '#2D3436' : '#EAF1FF' };
  }
  function saveBlob(blob, filename){
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }
  /* The exported key, packed into rows. A grouped key exports the way it
     reads on the page: each group starts a row of its own, led by its name,
     with only the entries still showing. A row carries head (the name, or
     null where it continues a group) and headW, which is inside its width;
     grouped rows share one left edge, so the names line up. measure(s, head)
     measures a name in its own weight. want ({ disp, curt }) keeps only the
     Dispatch entries of the panes a GIF picked. */
  function legendRows(legendId, measure, maxW, markW, gap, pad, want){
    var el = $(legendId), out = [];
    if(!el) return out;
    var groups = el.querySelectorAll('.legend-group');
    if(!groups.length){
      var items = keyItems(el, want);
      return items.length ? packKey(items, measure, maxW, markW, gap, pad) : [];
    }
    var headOf = function(g){ var lab = g.querySelector('.legend-group-label'); return lab ? lab.textContent.trim() : ''; };
    var kept = Array.prototype.map.call(groups, function(g){ return { head: headOf(g), items: keyItems(g, want) }; })
      .filter(function(g){ return g.items.length; });
    if(!kept.length) return out;
    // One column for the names, as wide as the widest, so every row's entries start in line.
    var headW = Math.max.apply(null, kept.map(function(g){ return g.head ? measure(g.head, true) + pad / 2 : 0; }));
    kept.forEach(function(g){
      packKey(g.items, measure, maxW - headW, markW, gap, pad).forEach(function(row, i){
        out.push({ items: row.items, head: i === 0 ? g.head : null, headW: headW, width: row.width + headW });
      });
    });
    var widest = Math.max.apply(null, out.map(function(r){ return r.width; }));
    out.forEach(function(r){ r.width = widest; });
    return out;
  }
  /* A key's visible entries, with the mark each draws. An entry keyed inside
     another's (a unit's curtailment, the shortfall, a store's charging and
     discharging) rides in it among subs, so it exports as it reads on the
     page, "Solar farm (▨ Curtailed)"; with its host not exported it is an
     entry of its own under its whole name. A store's name leads its entries
     with no mark of its own, and goes when they are all hidden. */
  function keyItems(box, want){
    var out = [];
    Array.prototype.forEach.call(box.querySelectorAll('.legend-item:not(.hidden), .legend-host'), function(el){
      var kind = el.getAttribute('data-kind'), lab = el.querySelector('.legend-label'), spec = null;
      if(want && (kind === 'curt' ? !want.curt : !want.disp)) return;
      var label = (lab ? lab.textContent : el.textContent).trim(), prev = out[out.length - 1], of = el.getAttribute('data-of');
      if(el.classList.contains('legend-host')){ if(label) out.push({ label: label, swatch: null, pair: el.getAttribute('data-pair'), subs: [] }); return; }
      try { spec = JSON.parse(el.getAttribute('data-swatch')); } catch(e){ spec = null; }
      if(!spec || !label) return;
      if(of != null && prev && prev.pair === of){ prev.subs.push({ swatch: spec, label: label }); return; }
      out.push({ label: el.getAttribute('data-full') || label, swatch: spec, pair: el.getAttribute('data-pair'), subs: [] });
    });
    return out.filter(function(it){ return it.swatch || it.subs.length; });
  }
  /* One exported entry from x: its swatch and label, and the entries keyed
     inside it after them in one pair of brackets, " (▨ Curtailed)".
     swatch(spec, x) and text(s, x) draw it; without them it is only
     measured. Returns its width. */
  function keyEntry(item, x, measure, markW, gap, swatch, text){
    var x0 = x, subs = item.subs || [], lab = subs.length ? item.label + ' (' : item.label;
    if(item.swatch){
      if(swatch) swatch(item.swatch, x);
      x += markW + gap;
    }
    if(text) text(lab, x);
    x += measure(lab);
    subs.forEach(function(sub, i){
      var t = sub.label + (i === subs.length - 1 ? ')' : '');
      x += i ? gap : gap / 2;
      if(swatch) swatch(sub.swatch, x);
      x += markW + gap;
      if(text) text(t, x);
      x += measure(t);
    });
    return x - x0;
  }
  // SharedLegend.layout for these entries: as many centred rows as they need.
  function packKey(items, measure, maxW, markW, gap, pad){
    var rows = [], row = [], w = 0;
    items.forEach(function(it){
      var iw = keyEntry(it, 0, measure, markW, gap);
      if(row.length && w + pad + iw > maxW){ rows.push({ items: row, width: w }); row = []; w = 0; }
      w += (row.length ? pad : 0) + iw;
      row.push(it);
    });
    if(row.length) rows.push({ items: row, width: w });
    return rows;
  }
  // A 3x PNG of the chart at its desktop size, with its title, key and watermark.
  function chartPng(canvasId, chartTitle, legendId){
    return SharedExport.atDesktopSize(canvasId, function(){
      var src = $(canvasId);
      var dpr = window.devicePixelRatio || 1, OUT = 3;
      var chartW = Math.round(src.width / dpr * OUT), chartH = Math.round(src.height / dpr * OUT);
      var tone = exportTokens(), FONT = '"DM Sans", sans-serif';
      var titleH = Math.round(40 * OUT), markW = SharedLegend.W * OUT, gap = Math.round(7 * OUT), pad = Math.round(20 * OUT);
      var margin = Math.round(16 * OUT), rowH = Math.round(22 * OUT), wmH = Math.round(26 * OUT);
      var mc = document.createElement('canvas').getContext('2d');
      var keyFont = '500 ' + Math.round(11 * OUT) + 'px ' + FONT, headFont = '600 ' + Math.round(11 * OUT) + 'px ' + FONT;
      var measure = function(s, head){ mc.font = head ? headFont : keyFont; return mc.measureText(s).width; };
      var rows = legendRows(legendId, measure, chartW - margin * 2, markW, gap, pad);
      var legendH = rows.length ? rows.length * rowH + Math.round(8 * OUT) : 0;
      var c = document.createElement('canvas');
      c.width = chartW; c.height = chartH + titleH + legendH + wmH;
      var g = c.getContext('2d');
      g.fillStyle = tone.bg; g.fillRect(0, 0, c.width, c.height);
      g.font = '700 ' + Math.round(14 * OUT) + 'px ' + FONT; g.fillStyle = tone.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(chartTitle, c.width / 2, titleH / 2);
      g.drawImage(src, 0, titleH, chartW, chartH);
      g.font = keyFont;
      rows.forEach(function(row, ri){
        var x = Math.max(margin, (c.width - row.width) / 2), cy = titleH + chartH + Math.round(4 * OUT) + rowH * ri + rowH / 2;
        if(row.head){ g.font = headFont; g.fillStyle = tone.fg; g.textAlign = 'left'; g.fillText(row.head, x, cy); g.font = keyFont; }
        x += row.headW || 0;
        row.items.forEach(function(item){
          x += keyEntry(item, x, measure, markW, gap, function(spec, at){ SharedLegend.paint(g, spec, at, cy, OUT); },
                        function(t, at){ g.fillStyle = tone.fg; g.textAlign = 'left'; g.fillText(t, at, cy); }) + pad;
        });
      });
      g.save();
      g.globalAlpha = 0.22;
      var wmX = c.width - Math.round(12 * OUT) - ED.WM_PATH_W * OUT, wmY = c.height - Math.round(12 * OUT);
      g.translate(wmX, wmY); g.scale(OUT, OUT); g.fillStyle = '#1a1a1a'; g.fill(new Path2D(ED.WM_PATH));
      g.restore();
      if(wmLogoImg.complete && wmLogoImg.naturalWidth){
        g.save(); g.globalAlpha = 0.22;
        var ls = Math.round(13 * OUT);
        g.drawImage(wmLogoImg, wmX - Math.round(4 * OUT) - ls, wmY - ls + Math.round(2 * OUT), ls, ls);
        g.restore();
      }
      return new Promise(function(resolve, reject){ c.toBlob(function(b){ if(b) resolve(b); else reject(new Error('The image could not be made.')); }, 'image/png'); });
    });
  }
  // fn(chart, canvas) with the chart laid out as an export draws it: at the desktop size, unfolded.
  function atExportSize(key, fn){
    var canvasId = CANVAS[key], chart = charts[canvasId];
    if(!chart) return null;
    var card = $(canvasId).closest('.chart-card'), folded = !!(card && card.classList.contains('is-folded'));
    if(folded) card.classList.remove('is-folded');
    try { return SharedExport.atDesktopSize(canvasId, function(){ return fn(chart, $(canvasId)); }); }
    finally { if(folded) card.classList.add('is-folded'); }
  }
  /* A GIF's charts sit one above another with one hour marker moving down
     them all, so their plot areas share both edges: the widest axes on each
     side among them (stillEdges), every chart padded out to those (padTo). */
  function stillEdges(keys, want){
    var e = { left: 0, right: 0 };
    keys.forEach(function(k){
      asParts(k, want, function(){
        atExportSize(k, function(chart){
          e.left = Math.max(e.left, chart.chartArea.left);
          e.right = Math.max(e.right, chart.width - chart.chartArea.right);
        });
      });
    });
    return e;
  }
  // Pads a chart until its plot area runs from edge.left to edge.right short of
  // its right side. Returns the padding to put back.
  function padTo(chart, edge){
    var lay = chart.options.layout, was = lay.padding, pl = 0, pr = 0;
    for(var i = 0; i < 4; i++){
      var dl = edge.left - chart.chartArea.left, dr = edge.right - (chart.width - chart.chartArea.right);
      if(Math.abs(dl) < 0.5 && Math.abs(dr) < 0.5) break;
      pl = Math.max(0, pl + dl); pr = Math.max(0, pr + dr);
      lay.padding = { left: pl, right: pr, top: 0, bottom: 0 };
      chart.update('none');
      lay = chart.options.layout;
    }
    return was;
  }
  /* A chart for a GIF of the hours: drawn once at the desktop size, 1x, on bg,
     without the hour marker, which marker(g, x, y, h) draws on each frame.
     With edge (from stillEdges), its plot area spans exactly that. want
     ({ disp, curt }) draws Dispatch with only the panes the GIF picked. */
  function chartStill(key, chartTitle, bg, fg, edge, want){
    if(!charts[CANVAS[key]] || !ctx || !ctx.res) return null;
    return asParts(key, want, function(){ return stillOf(key, chartTitle, bg, fg, edge, want); });
  }
  function stillOf(key, chartTitle, bg, fg, edge, want){
    var padded = false, was;
    try {
      return atExportSize(key, function(chart, src){
        if(edge){ was = padTo(chart, edge); padded = true; }
        var dpr = window.devicePixelRatio || 1, FONT = '"DM Sans", sans-serif';
        noMarker = true;
        chart.draw();
        var chartW = Math.round(src.width / dpr), chartH = Math.round(src.height / dpr);
        var titleH = 40, markW = SharedLegend.W, gap = 7, pad = 20, margin = 16, rowH = 22;
        var mc = document.createElement('canvas').getContext('2d');
        var measure = function(s, head){ mc.font = (head ? '600' : '500') + ' 11px ' + FONT; return mc.measureText(s).width; };
        var rows = legendRows(legendIdOf(key), measure, chartW - margin * 2, markW, gap, pad, want);
        var legendH = rows.length ? rows.length * rowH + 8 : 0;
        var c = document.createElement('canvas');
        c.width = chartW; c.height = titleH + chartH + legendH;
        var g = c.getContext('2d');
        g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
        g.font = '700 14px ' + FONT; g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(chartTitle, c.width / 2, titleH / 2);
        g.drawImage(src, 0, titleH, chartW, chartH);
        g.font = '500 11px ' + FONT;
        rows.forEach(function(row, ri){
          var x = Math.max(margin, (c.width - row.width) / 2), cy = titleH + chartH + 4 + rowH * ri + rowH / 2;
          if(row.head){ g.font = '600 11px ' + FONT; g.fillStyle = fg; g.textAlign = 'left'; g.fillText(row.head, x, cy); g.font = '500 11px ' + FONT; }
          x += row.headW || 0;
          row.items.forEach(function(item){
            x += keyEntry(item, x, measure, markW, gap, function(spec, at){ SharedLegend.paint(g, spec, at, cy, 1); },
                          function(t, at){ g.fillStyle = fg; g.textAlign = 'left'; g.fillText(t, at, cy); }) + pad;
          });
        });
        var xs = [];
        for(var h = 0; h < ctx.res.T; h++) xs.push(hourPx(chart, h));
        var top = titleH + chart.chartArea.top, bottom = titleH + chart.chartArea.bottom, accent = cssVar('--accent');
        noMarker = false;
        if(padded){ chart.options.layout.padding = was; padded = false; chart.update('none'); }
        else chart.draw();
        return {
          canvas: c, w: c.width, h: c.height,
          marker: function(g2, x0, y0, hr){
            var px = xs[hr];
            if(px == null) return;
            g2.save();
            g2.strokeStyle = accent; g2.globalAlpha = 0.75; g2.lineWidth = 1.5; g2.setLineDash([4, 3]);
            g2.beginPath(); g2.moveTo(x0 + px, y0 + top); g2.lineTo(x0 + px, y0 + bottom); g2.stroke();
            g2.restore();
          }
        };
      });
    } finally {
      noMarker = false;
      if(padded){ var ch = charts[CANVAS[key]]; ch.options.layout.padding = was; ch.update('none'); }
    }
  }
  function legendIdOf(key){ return key + 'Legend'; }
  // An SVG around the chart's bitmap, with live text for the title and key.
  function chartSvg(canvasId, chartTitle, legendId){
    return SharedExport.atDesktopSize(canvasId, function(){
      var src = $(canvasId);
      var dpr = window.devicePixelRatio || 1;
      var chartW = Math.round(src.width / dpr), chartH = Math.round(src.height / dpr);
      var tone = exportTokens(), FONT = 'DM Sans, sans-serif';
      var titleH = 40, markW = SharedLegend.W, gap = 7, pad = 20, margin = 16, rowH = 22, wmH = 26;
      var mc = document.createElement('canvas').getContext('2d');
      var measure = function(s, head){ mc.font = (head ? '600' : '500') + ' 11px DM Sans, sans-serif'; return mc.measureText(s).width; };
      var rows = legendRows(legendId, measure, chartW - margin * 2, markW, gap, pad);
      var legendH = rows.length ? rows.length * rowH + 8 : 0;
      var W = chartW, Hh = chartH + titleH + legendH + wmH;
      var NS = 'http://www.w3.org/2000/svg', xl = 'http://www.w3.org/1999/xlink';
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('xmlns', NS); svg.setAttribute('xmlns:xlink', xl);
      svg.setAttribute('width', W); svg.setAttribute('height', Hh); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh);
      var bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', W); bg.setAttribute('height', Hh); bg.setAttribute('fill', tone.bg); svg.appendChild(bg);
      var text = function(str, x, y, o){
        var t = document.createElementNS(NS, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('dominant-baseline', 'middle'); t.setAttribute('font-family', FONT);
        t.setAttribute('font-size', o.size); t.setAttribute('font-weight', o.weight); t.setAttribute('fill', tone.fg);
        if(o.anchor) t.setAttribute('text-anchor', o.anchor);
        t.textContent = str; svg.appendChild(t);
      };
      text(chartTitle, W / 2, titleH / 2, { size: '14', weight: '700', anchor: 'middle' });
      var img = document.createElementNS(NS, 'image');
      img.setAttribute('x', 0); img.setAttribute('y', titleH); img.setAttribute('width', chartW); img.setAttribute('height', chartH);
      var href = src.toDataURL('image/png');
      img.setAttribute('href', href); img.setAttributeNS(xl, 'href', href);
      svg.appendChild(img);
      rows.forEach(function(row, ri){
        var x = Math.max(margin, (W - row.width) / 2), cy = titleH + chartH + 4 + rowH * ri + rowH / 2;
        if(row.head) text(row.head, x, cy, { size: '11', weight: '600' });
        x += row.headW || 0;
        row.items.forEach(function(item){
          x += keyEntry(item, x, measure, markW, gap, function(spec, at){ svg.appendChild(SharedLegend.svgNode(spec, at, cy, 1)); },
                        function(t, at){ text(t, at, cy, { size: '11', weight: '500' }); }) + pad;
        });
      });
      var wm = document.createElementNS(NS, 'path');
      wm.setAttribute('d', ED.WM_PATH);
      wm.setAttribute('transform', 'translate(' + (W - 12 - ED.WM_PATH_W) + ',' + (Hh - 12) + ')');
      wm.setAttribute('fill', '#1a1a1a'); wm.setAttribute('opacity', '0.22');
      svg.appendChild(wm);
      var logo = document.createElementNS(NS, 'image');
      logo.setAttribute('href', ED.WM_LOGO_SRC); logo.setAttributeNS(xl, 'href', ED.WM_LOGO_SRC);
      logo.setAttribute('width', 13); logo.setAttribute('height', 13);
      logo.setAttribute('x', W - 12 - ED.WM_PATH_W - 4 - 13); logo.setAttribute('y', Hh - 12 - 13 + 2); logo.setAttribute('opacity', '0.22');
      svg.appendChild(logo);
      return new Blob(['<?xml version="1.0" encoding="utf-8"?>\n' + new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    });
  }
  EDCharts.save = saveBlob;
})(typeof globalThis !== 'undefined' ? globalThis : this);
