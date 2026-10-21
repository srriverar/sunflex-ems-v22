/* ED/UC Simulator: SVG, PNG and GIF exports of the diagram at the hour on
   screen, the Load Flow Simulator's exporter (loadflow-simulator/lf-export.js)
   with this tool's watermark. Loaded on the first export.

   Every export is the desktop picture whatever the screen: 940 px wide (the
   site's export width), with the diagram scaled from its own extent, so a
   phone and a wide monitor export the same file. All three are drawn from the
   scene the page draws on screen.

   PNG and GIF frames are layered: the network (an SVG image), then the flow
   arrows drawn by the canvas where they are at the frame's moment, then the
   text, which the canvas draws itself because an SVG image cannot use the
   page's fonts.

   While the hours are playing, the GIF plays them too (ctx.series), at the
   pace the page plays them (every second hour or fewer for a long run, to keep
   it to MAX_FRAMES frames), the arrows running on from one hour into the next,
   in one frame size that fits every hour. The charts the reader ticks
   (ctx.charts, stills from EDCharts.still) sit under the diagram, their hour
   marker moving with it. */
(function(){
  'use strict';
  var ED = window.ED;
  var W = (window.SharedExport && SharedExport.WIDTH) || 940;
  var FRAMES = 32, DELAY = ED.FLOW_T * 1000 / FRAMES; // one loop of the slowest arrows, 20 frames a second

  // The watermark and logo are ed-charts.js's (baked by _ref/bake-watermark.py).
  var WM_PATH = ED.WM_PATH;
  var WM_PATH_W = ED.WM_PATH_W;
  var WM_LOGO_SRC = ED.WM_LOGO_SRC;

  /* ── The page, as an export lays it out ── */
  function layout(ctx){
    var app = ctx.app, d = ctx.display;
    var res = ctx.stale ? null : ctx.res;
    var paint = app.paint();
    var scene = ED.draw(app.model, ED.layout(app.model), res, d, paint);
    var C = scene.colours;
    C.title = paint('--text');
    var bb = ctx.bb || scene.bbox, M = 22;
    var k = Math.min((W - 2 * M) / Math.max(bb.w, 1), 1.6);
    if(bb.h * k > 900) k = 900 / bb.h;
    var dw = bb.w * k, dh = bb.h * k;
    var anim = { p: !!(res && d.animP), q: false };
    var lanes = scene.lanes.filter(function(l){ return anim[l.kind]; });
    var sub = ctx.stale ? 'Results out of date: run the dispatch to see them.' : (ctx.sub || '');
    var top = 18, titleH = 26, subH = sub ? 18 : 0;
    var dy = top + titleH + subH + 10;
    var keyH = lanes.length || (ctx.series && anim.p) ? 26 : 0, wmH = 30;
    var cy = dy + dh + 12 + keyH, charts = [];
    (ctx.series && res ? ctx.charts || [] : []).forEach(function(ch){
      cy += 14;
      charts.push({ still: ch, x: Math.round((W - ch.w) / 2), y: Math.round(cy) });
      cy += ch.h;
    });
    var H = Math.round(cy + wmH);
    var P = { scene: scene, C: C, bb: bb, k: k, ox: (W - dw) / 2, oy: dy, dw: dw, dh: dh, H: H, lanes: lanes, anim: anim,
              title: ctx.title, sub: sub, keyY: dy + dh + 12, bg: paint('--panel'), charts: charts, hour: d.hour };
    P.keyLanes = keyItems(P).map(function(it){ return ED.keyLane(it.kind, it.x, it.y, 30, it.kind === 'p' ? C.p : C.q); });
    return P;
  }
  // The key: for each flow shown, a short run of its arrows (as on the page) and its name.
  function keyItems(P){
    var items = [];
    if(P.anim.p) items.push({ kind: 'p', label: 'Active power flow' });
    if(P.anim.q) items.push({ kind: 'q', label: 'Reactive power flow' });
    var kx = W / 2 - items.length * 80, ky = P.keyY + 13;
    items.forEach(function(it, i){ it.x = kx + i * 160 + 2; it.y = ky; });
    return items;
  }
  function esc(s){ return ED.esc(s); }

  /* ── SVG ── */
  function svgText(ctx){
    var P = layout(ctx), C = P.C, s = P.scene;
    var inner = '<g transform="translate(' + r2(P.ox) + ' ' + r2(P.oy) + ') scale(' + r4(P.k) + ') translate(' + r2(-P.bb.x) + ' ' + r2(-P.bb.y) + ')">' +
      s.base + ED.laneSvg(P.lanes, true) + ED.labelSvg(s.labels, C) + '</g>';
    var key = '';
    keyItems(P).forEach(function(it, i){
      key += ED.laneSvg([P.keyLanes[i]], true) +
        '<text x="' + (it.x + 38) + '" y="' + (it.y + 4) + '" font-family="\'DM Sans\',system-ui,sans-serif" font-size="11.5" font-weight="500" fill="' + C.text + '">' + it.label + '</text>';
    });
    var wmX = W - 12 - WM_PATH_W, wmY = P.H - 11;
    var wm = '<path d="' + WM_PATH + '" transform="translate(' + r2(wmX) + ' ' + wmY + ')" fill="' + C.text + '" opacity="0.22"/>' +
      '<image href="' + WM_LOGO_SRC + '" x="' + r2(wmX - 4 - 13) + '" y="' + (wmY - 13 + 2) + '" width="13" height="13" opacity="0.22"/>';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + P.H + '" viewBox="0 0 ' + W + ' ' + P.H + '">' +
      '<rect width="' + W + '" height="' + P.H + '" fill="' + P.bg + '"/>' +
      '<text x="' + W / 2 + '" y="34" text-anchor="middle" font-family="\'DM Sans\',system-ui,sans-serif" font-size="15" font-weight="700" fill="' + C.title + '">' + esc(P.title) + '</text>' +
      (P.sub ? '<text x="' + W / 2 + '" y="53" text-anchor="middle" font-family="\'DM Sans\',system-ui,sans-serif" font-size="11.5" fill="' + C.muted + '">' + esc(P.sub) + '</text>' : '') +
      inner + key + wm + '</svg>';
  }
  function r2(x){ return Math.round(x * 100) / 100; }
  function r4(x){ return Math.round(x * 10000) / 10000; }

  /* ── Raster layers ── */
  function loadImage(src){
    return new Promise(function(resolve, reject){
      var img = new Image();
      img.onload = function(){ resolve(img); };
      img.onerror = function(){ reject(new Error('The diagram could not be drawn as an image.')); };
      img.src = src;
    });
  }
  var logoP = null;
  function logo(){ return logoP || (logoP = loadImage(WM_LOGO_SRC)); }
  function fonts(){
    if(!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([document.fonts.load('700 12px "DM Sans"'), document.fonts.load('500 12px "DM Sans"'),
                        document.fonts.load('500 12px "DM Mono"'), document.fonts.load('400 12px "DM Sans"')]).catch(function(){});
  }
  // The network without its text: one SVG image.
  function underImage(P, S){
    var s = P.scene;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.ceil(P.dw * S) + '" height="' + Math.ceil(P.dh * S) + '" viewBox="' +
      P.bb.x + ' ' + P.bb.y + ' ' + P.bb.w + ' ' + P.bb.h + '">' + s.base + '</svg>';
    return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }
  function canvas(w, h){ var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function fontOf(l){ return (l.bold ? '700 ' : l.mono ? '500 ' : '400 ') + l.size + 'px ' + (l.mono ? '"DM Mono", ui-monospace, monospace' : '"DM Sans", system-ui, sans-serif'); }
  // Everything that does not move: the text, the key and the watermark.
  function overCanvas(P, S, logoImg){
    var c = canvas(Math.round(W * S), Math.round(P.H * S)), g = c.getContext('2d'), C = P.C;
    g.scale(S, S);
    g.textBaseline = 'alphabetic';
    g.fillStyle = C.title; g.textAlign = 'center';
    g.font = '700 15px "DM Sans", system-ui, sans-serif';
    g.fillText(P.title, W / 2, 34);
    if(P.sub){ g.fillStyle = C.muted; g.font = '400 11.5px "DM Sans", system-ui, sans-serif'; g.fillText(P.sub, W / 2, 53); }
    g.save();
    g.translate(P.ox, P.oy); g.scale(P.k, P.k); g.translate(-P.bb.x, -P.bb.y);
    g.lineJoin = 'round';
    P.scene.labels.forEach(function(l){
      g.font = fontOf(l);
      g.textAlign = l.anchor === 'middle' ? 'center' : l.anchor === 'end' ? 'right' : 'left';
      g.strokeStyle = C.bg; g.lineWidth = 3; g.strokeText(l.t, l.x, l.y);
      g.fillStyle = l.fill; g.fillText(l.t, l.x, l.y);
    });
    g.restore();
    g.textAlign = 'left'; g.font = '500 11.5px "DM Sans", system-ui, sans-serif';
    keyItems(P).forEach(function(it){ g.fillStyle = C.text; g.fillText(it.label, it.x + 38, it.y + 4); });
    g.save();
    g.globalAlpha = 0.22;
    var wmX = W - 12 - WM_PATH_W, wmY = P.H - 11;
    g.translate(wmX, wmY); g.fillStyle = C.text; g.fill(new Path2D(WM_PATH));
    g.restore();
    if(logoImg){ g.save(); g.globalAlpha = 0.22; g.drawImage(logoImg, wmX - 4 - 13, wmY - 13 + 2, 13, 13); g.restore(); }
    return c;
  }
  // The flow arrows at a moment t (seconds), exactly where SMIL puts them on the page.
  var glyphPath = {};
  function drawGlyphs(g, lanes, t){
    lanes.forEach(function(l){
      var gl = ED.GLYPH[l.kind], path = glyphPath[l.kind] || (glyphPath[l.kind] = new Path2D(gl.d));
      g.fillStyle = l.color; g.strokeStyle = l.color; g.lineWidth = gl.width;
      ED.laneGlyphs(l, t).forEach(function(a){
        if(a.o <= 0) return;
        g.save();
        g.globalAlpha = a.o; g.translate(a.x, a.y); g.rotate(a.a);
        if(gl.fill) g.fill(path);
        g.stroke(path);
        g.restore();
      });
    });
  }
  function drawLanes(g, P, S, t){
    g.save();
    g.scale(S, S);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.save();
    g.translate(P.ox, P.oy); g.scale(P.k, P.k); g.translate(-P.bb.x, -P.bb.y);
    drawGlyphs(g, P.lanes, t);
    g.restore();
    drawGlyphs(g, P.keyLanes, t);
    g.restore();
  }
  function layers(ctx, S){
    var P = layout(ctx);
    return Promise.all([underImage(P, S), logo().catch(function(){ return null; }), fonts()]).then(function(r){
      return { P: P, under: r[0], over: overCanvas(P, S, r[1]) };
    });
  }
  function frame(Lr, S, t, into){
    var P = Lr.P, c = into || canvas(Math.round(W * S), Math.round(P.H * S)), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = P.bg; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(Lr.under, Math.round(P.ox * S), Math.round(P.oy * S), Math.ceil(P.dw * S), Math.ceil(P.dh * S));
    drawLanes(g, P, S, t);
    g.drawImage(Lr.over, 0, 0);
    P.charts.forEach(function(ch){
      g.save();
      g.scale(S, S);
      g.drawImage(ch.still.canvas, ch.x, ch.y);
      ch.still.marker(g, ch.x, ch.y, P.hour);
      g.restore();
    });
    return c;
  }
  function toBlob(c, type){
    return new Promise(function(resolve, reject){ c.toBlob(function(b){ if(b) resolve(b); else reject(new Error('The image could not be made.')); }, type || 'image/png'); });
  }

  /* ── GIF: frames drawn here, encoded off the main thread ── */
  function encode(frames, w, h, onProgress){
    var bufs = frames.map(function(f){ return f.data.buffer; });
    function inline(){
      return import('./vendor/gifenc.js').then(function(G){ return encodeWith(G, bufs, w, h, onProgress); });
    }
    if(!window.Worker) return inline();
    return new Promise(function(resolve, reject){
      var wk;
      try { wk = new Worker('gif-worker.js', { type: 'module' }); } catch(e){ inline().then(resolve, reject); return; }
      var done = false;
      wk.onmessage = function(e){
        if(e.data && e.data.progress !== undefined){ if(onProgress) onProgress(0.5 + e.data.progress / 2); return; }
        done = true; wk.terminate();
        if(e.data && e.data.bytes) resolve(e.data.bytes); else reject(new Error(e.data && e.data.error || 'The GIF could not be encoded.'));
      };
      wk.onerror = function(){ if(done) return; done = true; wk.terminate(); inline().then(resolve, reject); };
      // The worker gets copies, so the frames are still here if it fails and the
      // page has to encode them itself.
      var copies = bufs.map(function(b){ return b.slice(0); });
      wk.postMessage({ w: w, h: h, frames: copies, delay: DELAY }, copies);
    });
  }
  function encodeWith(G, bufs, w, h, onProgress){
    var enc = G.GIFEncoder();
    var f0 = new Uint8ClampedArray(bufs[0]);
    var pal = G.quantize(f0, 255);
    while(pal.length < 255) pal.push([0, 0, 0]);
    var palette = pal.concat([[255, 0, 255]]);
    var prev = null;
    bufs.forEach(function(buf, i){
      var idx = G.applyPalette(new Uint8ClampedArray(buf), pal);
      if(i === 0) enc.writeFrame(idx, w, h, { palette: palette, delay: DELAY, repeat: 0 });
      else {
        var out = new Uint8Array(idx.length);
        for(var p = 0; p < idx.length; p++) out[p] = idx[p] === prev[p] ? 255 : idx[p];
        enc.writeFrame(out, w, h, { delay: DELAY, transparent: true, transparentIndex: 255, dispose: 1 });
      }
      prev = idx;
      if(onProgress) onProgress(0.5 + (i + 1) / bufs.length / 2);
    });
    enc.finish();
    return enc.bytes();
  }

  /* ── GIF through the hours ── */
  var MAX_FRAMES = 360;
  // How the hours become frames: per frames an hour, delay ms each, every hourStep-th hour.
  function seriesPlan(T, step, moving){
    var delay = DELAY, per = 1;
    if(moving){
      per = Math.max(1, Math.round(step / delay));
      if(T * per > MAX_FRAMES){ delay = 2 * DELAY; per = Math.max(1, Math.round(step / delay)); }
    } else delay = step;
    return { delay: delay, per: per, hourStep: Math.max(1, Math.ceil(T * per / MAX_FRAMES)) };
  }
  function atHour(ctx, h, bb){
    var d = {}, k;
    for(k in ctx.display) d[k] = ctx.display[k];
    d.hour = h;
    var c = {};
    for(k in ctx) c[k] = ctx[k];
    c.display = d; c.sub = ctx.series.sub(h); c.bb = bb;
    return c;
  }
  // One extent for every hour, so the picture holds still while its labels change.
  function seriesBox(ctx, hours){
    var app = ctx.app, L = ED.layout(app.model), paint = app.paint(), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    hours.forEach(function(h){
      var d = {}, k;
      for(k in ctx.display) d[k] = ctx.display[k];
      d.hour = h;
      var b = ED.draw(app.model, L, ctx.res, d, paint).bbox;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /* A GIF encoder fed one frame at a time: in the worker when there is one,
     with at most a few frames waiting for it, else here. */
  function streamEncoder(inWorker){
    var wk = null;
    try { if(inWorker && window.Worker) wk = new Worker('gif-worker.js', { type: 'module' }); } catch(e){ wk = null; }
    if(wk){
      var sent = 0, acked = 0, waiting = null, fail = null, done = null;
      wk.onmessage = function(e){
        var m = e.data || {};
        if(m.ack !== undefined){ acked = m.ack; if(waiting){ var w = waiting; waiting = null; w(); } return; }
        wk.terminate();
        if(m.bytes) done.resolve(m.bytes); else done.reject(new Error(m.error || 'The GIF could not be encoded.'));
      };
      wk.onerror = function(){ fail = new Error('The GIF could not be encoded.'); wk.terminate(); if(waiting){ var w = waiting; waiting = null; w(); } if(done) done.reject(fail); };
      return {
        start: function(w, h, sample){ wk.postMessage({ cmd: 'start', w: w, h: h, sample: sample.buffer }, [sample.buffer]); return Promise.resolve(); },
        add: function(img, delay){
          if(fail) return Promise.reject(fail);
          sent++;
          wk.postMessage({ cmd: 'frame', buf: img.data.buffer, delay: delay }, [img.data.buffer]);
          if(sent - acked < 4) return Promise.resolve();
          return new Promise(function(r){ waiting = r; }).then(function(){ if(fail) throw fail; });
        },
        acked: function(){ return acked; },
        end: function(){
          if(fail) return Promise.reject(fail);
          return new Promise(function(resolve, reject){ done = { resolve: resolve, reject: reject }; wk.postMessage({ cmd: 'end' }); });
        }
      };
    }
    var G = null, S = null, n = 0;
    return {
      start: function(w, h, sample){
        return import('./vendor/gifenc.js').then(function(g){
          G = g;
          var pal = G.quantize(sample, 255);
          while(pal.length < 255) pal.push([0, 0, 0]);
          S = { enc: G.GIFEncoder(), pal: pal, palette: pal.concat([[255, 0, 255]]), prev: null, w: w, h: h };
        });
      },
      add: function(img, delay){
        var idx = G.applyPalette(img.data, S.pal);
        if(!S.prev) S.enc.writeFrame(idx, S.w, S.h, { palette: S.palette, delay: delay, repeat: 0 });
        else {
          var out = new Uint8Array(idx.length);
          for(var p = 0; p < idx.length; p++) out[p] = idx[p] === S.prev[p] ? 255 : idx[p];
          S.enc.writeFrame(out, S.w, S.h, { delay: delay, transparent: true, transparentIndex: 255, dispose: 1 });
        }
        S.prev = idx; n++;
        // Let the page breathe between frames.
        return new Promise(function(r){ setTimeout(r, 0); });
      },
      acked: function(){ return n; },
      end: function(){ S.enc.finish(); return Promise.resolve(S.enc.bytes()); }
    };
  }
  function gifSeries(ctx, onProgress, inWorker){
    var T = ctx.res.T, d = ctx.display;
    var plan = seriesPlan(T, ctx.series.step, !!d.animP);
    var hours = [];
    for(var h = 0; h < T; h += plan.hourStep) hours.push(h);
    var total = hours.length * plan.per;
    var bb = seriesBox(ctx, hours);
    // The palette is taken from a few hours across the run, so a colour that only
    // shows up later (a branch at its limit) is in it.
    var picks = [], NS = Math.min(6, hours.length);
    for(var i = 0; i < NS; i++){ var ph = hours[Math.round(i * (hours.length - 1) / Math.max(1, NS - 1))]; if(picks.indexOf(ph) < 0) picks.push(ph); }
    var cache = {};
    function lay(h){
      if(cache[h]){ var r = cache[h]; delete cache[h]; return Promise.resolve(r); }
      return layers(atHour(ctx, h, bb), 1);
    }
    var enc = streamEncoder(inWorker), w = W, H = 0, k = 0, state = null, c = null;
    var progress = function(){ if(onProgress) onProgress(Math.min(1, (k + enc.acked()) / (2 * total))); };
    return Promise.all(picks.map(function(ph){ return layers(atHour(ctx, ph, bb), 1).then(function(Lr){ cache[ph] = Lr; return Lr; }); })).then(function(lrs){
      H = lrs[0].P.H;
      c = canvas(w, H);
      var g = c.getContext('2d', { willReadFrequently: true });
      var parts = lrs.map(function(Lr){ frame(Lr, 1, 0, c); return g.getImageData(0, 0, w, H).data; });
      // Every second pixel of each sampled hour.
      var px = Math.ceil(w * H / 2), sample = new Uint8ClampedArray(parts.length * px * 4);
      parts.forEach(function(a, j){
        for(var q = 0; q < px; q++){ var o = (j * px + q) * 4, src = q * 8; sample[o] = a[src]; sample[o + 1] = a[src + 1]; sample[o + 2] = a[src + 2]; sample[o + 3] = a[src + 3]; }
      });
      return enc.start(w, H, sample);
    }).then(function(){
      var chain = Promise.resolve();
      hours.forEach(function(hr){
        chain = chain.then(function(){ return lay(hr); }).then(function(Lr){
          // The arrows run on from where the last hour left them.
          state = ED.carryLanes(state, Lr.P.lanes, k * plan.delay / 1000);
          var inner = Promise.resolve();
          for(var f = 0; f < plan.per; f++){
            inner = inner.then(function(){
              frame(Lr, 1, k * plan.delay / 1000, c);
              var img = c.getContext('2d').getImageData(0, 0, w, H);
              k++;
              return enc.add(img, plan.delay).then(progress);
            });
          }
          return inner;
        });
      });
      return chain;
    }).then(function(){ return enc.end(); }).then(function(bytes){
      if(onProgress) onProgress(1);
      return new Blob([bytes], { type: 'image/gif' });
    });
  }

  window.EDExport = {
    svgText: svgText,
    svgBlob: function(ctx){ return new Blob([svgText(ctx)], { type: 'image/svg+xml' }); },
    pngBlob: function(ctx){
      return layers(ctx, 2).then(function(Lr){ return toBlob(frame(Lr, 2, 0)); });
    },
    gifBlob: function(ctx, onProgress){
      if(ctx.series && ctx.res && !ctx.stale && ctx.res.T > 1){
        // If the worker fails, the page encodes the run itself.
        return gifSeries(ctx, onProgress, true).catch(function(){ return gifSeries(ctx, onProgress, false); });
      }
      return layers(ctx, 1).then(function(Lr){
        if(!Lr.P.lanes.length){
          // Nothing moves: a single frame.
          var c0 = frame(Lr, 1, 0);
          return encode([c0.getContext('2d').getImageData(0, 0, c0.width, c0.height)], c0.width, c0.height, onProgress);
        }
        var frames = [], c = canvas(W, Lr.P.H);
        c.getContext('2d', { willReadFrequently: true });
        for(var i = 0; i < FRAMES; i++){
          frame(Lr, 1, i * ED.FLOW_T / FRAMES, c);
          frames.push(c.getContext('2d').getImageData(0, 0, c.width, c.height));
          if(onProgress) onProgress((i + 1) / FRAMES / 2);
        }
        return encode(frames, c.width, c.height, onProgress);
      }).then(function(bytes){ return new Blob([bytes], { type: 'image/gif' }); });
    },
    size: function(ctx){ var P = layout(ctx); return { w: W, h: P.H }; }
  };
})();
