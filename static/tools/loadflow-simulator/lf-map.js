/* Load Flow Simulator: the map under the diagram.

   A diagram with a map (model.map, see lf-core.js) is drawn on a web map in
   the same coordinates, so the two zoom and pan as one picture: zoom out and
   the network shrinks with the land under it. Two canvases sit under the SVG
   in the stage: the base map (its tiles toned by a CSS filter to suit the
   theme) and, over it, the power grid from Open Infrastructure Map. Both are
   redrawn in the same frame as the SVG's viewBox, so they never drift apart.

   Sources, all free to use with the credit the page shows under the diagram:
     plain, streets  OpenStreetMap's standard tiles (tile.openstreetmap.org)
     satellite       Sentinel-2 cloudless 2016 by EOX (CC BY 4.0)
     power grid      Open Infrastructure Map's vector tiles, drawn here in its
                     own voltage colours
   Tiles are fetched only while a map is shown, a few at a time, nearest the
   middle of the view first; anything off screen is never asked for.

   LFMap.attach({ base, over, scale, getState, onChange }) starts it;
   LFMap.draw() redraws from getState(): { map, view, W, H, dark }.        */
(function(root){
  'use strict';
  var LF = root.LF;
  if(!LF || !root.document) return;
  var TILE = 256;

  /* ── Sources ── */
  var SRC = {
    osm: { max: 19, par: 6, url: function(z, x, y){ return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png'; } },
    sat: { max: 14, par: 6, url: function(z, x, y){ return 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/' + z + '/' + y + '/' + x + '.jpg'; } },
    power: { min: 2, max: 14, par: 4, url: function(z, x, y){ return 'https://openinframap.org/map/power/' + z + '/' + x + '/' + y + '.pbf'; } }
  };
  var BASE_SRC = { plain: 'osm', streets: 'osm', satellite: 'sat' };
  var CREDIT = {
    osm: { html: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
           text: '© OpenStreetMap contributors' },
    sat: { html: 'Imagery: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016 and 2017)',
           text: 'Imagery: Sentinel-2 cloudless, s2maps.eu, by EOX IT Services GmbH (modified Copernicus Sentinel data 2016, 2017)' },
    power: { html: 'Power grid: <a href="https://openinframap.org" target="_blank" rel="noopener">Open Infrastructure Map</a>',
             text: 'Power grid: Open Infrastructure Map' }
  };

  /* How each map is toned under the diagram: filter steps (CSS filter
     functions, also replayed on pixels for the exports) and the share of the
     map that shows through the panel colour. The plain map is quiet grey, so
     the diagram reads on top of it in either theme. */
  var LOOK = {
    'plain-light':     { f: [['grayscale', 1], ['brightness', 1.06], ['contrast', 0.78]], a: 1 },
    'plain-dark':      { f: [['grayscale', 1], ['invert', 1], ['brightness', 0.78], ['contrast', 0.78]], a: 1 },
    'streets-light':   { f: [['saturate', 0.85]], a: 0.82 },
    'streets-dark':    { f: [['invert', 1], ['hue-rotate', 180], ['saturate', 0.7], ['brightness', 0.82], ['contrast', 0.88]], a: 1 },
    'satellite-light': { f: [['saturate', 0.75]], a: 0.62 },
    'satellite-dark':  { f: [['saturate', 0.75], ['brightness', 0.8]], a: 0.72 }
  };
  function lookOf(base, dark){ return LOOK[base + (dark ? '-dark' : '-light')] || LOOK['plain-light']; }
  function cssFilter(f){ return f.map(function(s){ return s[0] + '(' + s[1] + (s[0] === 'hue-rotate' ? 'deg' : '') + ')'; }).join(' '); }

  // Open Infrastructure Map's voltage colours (kV and up), and HVDC.
  var VCOL = [[550, '#00C1CF'], [310, '#B54EB2'], [220, '#C73030'], [132, '#B55D00'], [52, '#B59F10'], [25, '#55B555'], [10, '#6E97B8'], [0, '#7A7A85']];
  var HVDC = '#4E01B5';
  function vColour(v){ for(var i = 0; i < VCOL.length; i++) if(v >= VCOL[i][0]) return VCOL[i][1]; return VCOL[VCOL.length - 1][1]; }
  function volts(p){
    var m = NaN;
    ['voltage', 'voltage_2', 'voltage_3', 'voltage_4'].forEach(function(k){ var v = parseFloat(p[k]); if(isFinite(v) && !(v <= m)) m = v; });
    return m;
  }

  /* ── Mapbox vector tiles, decoded by hand (a few layers, a few tags) ── */
  var KEEP = { power_line: 1, power_substation: 1, power_substation_point: 1, power_plant: 1, power_plant_point: 1 };
  var TAGS = { name: 1, name_en: 1, operator: 1, ref: 1, circuits: 1, location: 1, line: 1, tunnel: 1, construction: 1, disused: 1,
               frequency: 1, voltage: 1, voltage_2: 1, voltage_3: 1, voltage_4: 1, source: 1, output: 1, substation: 1, method: 1 };
  function decodeMvt(buf){
    var b = new Uint8Array(buf), dv = new DataView(buf), td = new TextDecoder(), pos = 0;
    function varint(){ var v = 0, s = 1, c; do { c = b[pos++]; v += (c & 0x7f) * s; s *= 128; } while(c & 0x80 && pos < b.length); return v; }
    function skip(t){ if(t === 0) varint(); else if(t === 1) pos += 8; else if(t === 2){ var n = varint(); pos += n; } else if(t === 5) pos += 4; else throw new Error('mvt wire type'); }
    function str(){ var n = varint(), s = td.decode(b.subarray(pos, pos + n)); pos += n; return s; }
    function zz(n){ return n % 2 ? -(n + 1) / 2 : n / 2; }
    function value(end){
      var v = null;
      while(pos < end){
        var tag = varint(), f = tag >> 3, t = tag & 7;
        if(f === 1 && t === 2) v = str();
        else if(f === 2 && t === 5){ v = dv.getFloat32(pos, true); pos += 4; }
        else if(f === 3 && t === 1){ v = dv.getFloat64(pos, true); pos += 8; }
        else if((f === 4 || f === 5) && t === 0){ v = varint(); if(f === 4 && v >= 9223372036854775808) v -= 18446744073709551616; }
        else if(f === 6 && t === 0) v = zz(varint());
        else if(f === 7 && t === 0) v = !!varint();
        else skip(t);
      }
      return v;
    }
    function feature(end, L){
      var ft = { type: 0, p: {}, parts: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, tags = null, g = null;
      while(pos < end){
        var tag = varint(), f = tag >> 3, t = tag & 7;
        if(f === 2 && t === 2){ var n = varint(); tags = [pos, pos + n]; pos += n; }
        else if(f === 3 && t === 0) ft.type = varint();
        else if(f === 4 && t === 2){ var n2 = varint(); g = [pos, pos + n2]; pos += n2; }
        else skip(t);
      }
      if(tags){
        pos = tags[0];
        while(pos < tags[1]){ var k = L.keys[varint()], v = L.vals[varint()]; if(TAGS[k]) ft.p[k] = v; }
      }
      if(g){
        pos = g[0];
        var cmd = 0, count = 0, x = 0, y = 0, cur = null;
        while(pos < g[1]){
          if(!count){
            var ci = varint(); cmd = ci & 7; count = ci >> 3;
            if(cmd === 7){ count = 0; continue; }
            if(!count) continue;
          }
          count--;
          x += zz(varint()); y += zz(varint());
          if(cmd === 1 || !cur){ cur = [x, y]; ft.parts.push(cur); } else cur.push(x, y);
          if(x < ft.x0) ft.x0 = x; if(x > ft.x1) ft.x1 = x; if(y < ft.y0) ft.y0 = y; if(y > ft.y1) ft.y1 = y;
        }
      }
      pos = end;
      return ft;
    }
    function layer(end){
      var L = { name: '', extent: 4096, keys: [], vals: [], feats: [] }, ranges = [];
      while(pos < end){
        var tag = varint(), f = tag >> 3, t = tag & 7;
        if(f === 1 && t === 2){ L.name = str(); if(!KEEP[L.name]){ pos = end; return null; } }
        else if(f === 2 && t === 2){ var n = varint(); ranges.push([pos, pos + n]); pos += n; }
        else if(f === 3 && t === 2) L.keys.push(str());
        else if(f === 4 && t === 2){ var n4 = varint(), ve = pos + n4; L.vals.push(value(ve)); pos = ve; }
        else if(f === 5 && t === 0) L.extent = varint() || 4096;
        else skip(t);
      }
      if(!KEEP[L.name]) return null;
      ranges.forEach(function(r){ pos = r[0]; L.feats.push(feature(r[1], L)); });
      pos = end;
      delete L.keys; delete L.vals;
      return L;
    }
    var out = {};
    while(pos < b.length){
      var tag = varint(), f = tag >> 3, t = tag & 7;
      if(f === 3 && t === 2){ var n = varint(), le = pos + n, L = layer(le); if(L) out[L.name] = L; pos = le; }
      else skip(t);
    }
    return out;
  }

  /* ── Tile loaders: a few at a time, nearest the middle first ── */
  var redraw = function(){};
  function Loader(src, kind){ this.src = src; this.kind = kind; this.cache = new Map(); this.busy = 0; this.wanted = []; this.fails = 0; this.oks = 0; this.waiters = []; }
  Loader.prototype.get = function(z, x, y){ return this.cache.get(z + '/' + x + '/' + y); };
  Loader.prototype.ok = function(z, x, y){ var e = this.get(z, x, y); return e && e.state === 1 ? e : null; };
  // Ask for these tiles, in this order, instead of whatever was asked before.
  Loader.prototype.want = function(list){
    var self = this, now = Date.now();
    this.wanted = list.filter(function(t){
      var e = self.cache.get(t.k);
      return !e || (e.state === -1 && now - e.at > 20000);
    });
    this.pump();
  };
  Loader.prototype.pump = function(){
    while(this.busy < this.src.par && this.wanted.length){
      var t = this.wanted.shift();
      var e = this.cache.get(t.k);
      if(e && (e.state === 0 || e.state === 1)) continue;
      this.start(t);
    }
  };
  Loader.prototype.start = function(t){
    var self = this, e = { state: 0, at: Date.now() };
    this.cache.set(t.k, e);
    this.busy++;
    var done = function(ok){
      self.busy--;
      e.state = ok ? 1 : -1; e.at = Date.now();
      if(ok) self.oks++; else self.fails++;
      self.trim();
      self.pump();
      self.notify();
      redraw();
    };
    var url = this.src.url(t.z, t.x, t.y);
    if(this.kind === 'img'){
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      // Decoded once into a bitmap, so a redraw is a copy, not a fresh decode.
      img.onload = function(){
        if(!root.createImageBitmap){ e.img = img; done(true); return; }
        root.createImageBitmap(img).then(function(bm){ e.img = bm; done(true); }, function(){ e.img = img; done(true); });
      };
      img.onerror = function(){ done(false); };
      img.src = url;
    } else {
      fetch(url, { mode: 'cors', credentials: 'omit' }).then(function(r){
        // An empty stretch of sea is a 200 with no bytes, or a 404: nothing to draw.
        if(r.status === 404 || r.status === 204) return new ArrayBuffer(0);
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(function(buf){
        e.data = buf.byteLength ? decodeMvt(buf) : {};
        done(true);
      }).catch(function(){ done(false); });
    }
  };
  Loader.prototype.trim = function(){
    var cap = this.kind === 'img' ? 500 : 160;
    if(this.cache.size <= cap) return;
    var olds = [];
    this.cache.forEach(function(e, k){ if(e.state !== 0) olds.push([e.used || e.at || 0, k]); });
    olds.sort(function(a, b){ return a[0] - b[0]; });
    for(var i = 0; i < olds.length && this.cache.size > cap * 0.8; i++) this.cache.delete(olds[i][1]);
  };
  // Resolves once none of these keys is loading (for the exports).
  Loader.prototype.settle = function(keys){
    var self = this;
    return new Promise(function(resolve){
      var check = function(){
        var pending = keys.some(function(k){ var e = self.cache.get(k); return !e || e.state === 0; });
        if(!pending){ resolve(); return true; }
        return false;
      };
      if(!check()) self.waiters.push(check);
    });
  };
  Loader.prototype.notify = function(){ this.waiters = this.waiters.filter(function(w){ return !w(); }); };
  var loaders = { osm: new Loader(SRC.osm, 'img'), sat: new Loader(SRC.sat, 'img'), power: new Loader(SRC.power, 'mvt') };

  /* ── Geometry of a view ──
     The SVG fits its viewBox into the stage, centred (xMidYMid meet); the map
     uses the very same numbers, so a diagram px lands on the same screen px. */
  function frameOf(view, W, H){
    var s = Math.min(W / view.w, H / view.h);
    return { s: s, ox: (W - view.w * s) / 2 - view.x * s, oy: (H - view.h * s) / 2 - view.y * s, W: W, H: H };
  }
  function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }
  // The tiles at zoom tz covering the frame, nearest its middle first.
  function tilesFor(geo, fr, tz){
    var T = TILE * Math.pow(2, geo.z - tz); // a tile's size in diagram px
    var n = Math.pow(2, tz);
    var xa = geo.X0 + (0 - fr.ox) / fr.s, xb = geo.X0 + (fr.W - fr.ox) / fr.s;
    var ya = geo.Y0 + (0 - fr.oy) / fr.s, yb = geo.Y0 + (fr.H - fr.oy) / fr.s;
    var x0 = Math.floor(xa / T), x1 = Math.floor(xb / T), y0 = Math.max(0, Math.floor(ya / T)), y1 = Math.min(n - 1, Math.floor(yb / T));
    var out = [];
    if(x1 - x0 > 64 || y1 - y0 > 64) return { T: T, n: n, list: out };
    var cx = (xa + xb) / 2 / T, cy = (ya + yb) / 2 / T;
    for(var y = y0; y <= y1; y++) for(var x = x0; x <= x1; x++){
      var wx = ((x % n) + n) % n;
      out.push({ x: x, y: y, z: tz, wx: wx, k: tz + '/' + wx + '/' + y, d: (x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) });
    }
    out.sort(function(a, b){ return a.d - b.d; });
    return { T: T, n: n, list: out };
  }
  // A tile's rectangle on the canvas, in device px, with whole-pixel edges so
  // neighbours meet without a seam.
  function rectOf(geo, fr, T, x, y, dpr){
    var a = Math.round(((x * T - geo.X0) * fr.s + fr.ox) * dpr), b = Math.round((((x + 1) * T - geo.X0) * fr.s + fr.ox) * dpr);
    var c = Math.round(((y * T - geo.Y0) * fr.s + fr.oy) * dpr), d = Math.round((((y + 1) * T - geo.Y0) * fr.s + fr.oy) * dpr);
    return [a, c, b - a, d - c];
  }
  function idealZoom(geo, s){ return geo.z + Math.log(s) / Math.LN2; }

  /* Draw one layer of tiles: each from its own tile when loaded, else from a
     loaded parent (blown up) and children (shrunk), so zooming never flashes
     blank. imgOf(tz, wx, y) returns a drawable or null. */
  function paintTiles(g, geo, fr, tz, dpr, imgOf, size){
    var set = tilesFor(geo, fr, tz), late = [];
    set.list.forEach(function(t){
      var r = rectOf(geo, fr, set.T, t.x, t.y, dpr);
      var own = imgOf(tz, t.wx, t.y);
      if(own){ late.push([own, r]); return; }
      for(var d = 1; d <= Math.min(tz, 6); d++){
        var p = imgOf(tz - d, Math.floor(t.wx / Math.pow(2, d)), Math.floor(t.y / Math.pow(2, d)));
        if(!p) continue;
        var f = Math.pow(2, d), sw = size(p) / f;
        g.drawImage(p, (t.wx % f) * sw, (t.y % f) * sw, sw, sw, r[0], r[1], r[2], r[3]);
        break;
      }
      for(var i = 0; i < 4; i++){
        var ch = imgOf(tz + 1, t.wx * 2 + (i & 1), t.y * 2 + (i >> 1));
        if(!ch) continue;
        var hx = Math.round(r[2] / 2), hy = Math.round(r[3] / 2);
        g.drawImage(ch, r[0] + (i & 1 ? hx : 0), r[1] + (i >> 1 ? hy : 0), i & 1 ? r[2] - hx : hx, i >> 1 ? r[3] - hy : hy);
      }
    });
    late.forEach(function(l){ g.drawImage(l[0], l[1][0], l[1][1], l[1][2], l[1][3]); });
    return set;
  }

  /* ── The power grid, one display tile at a time ── */
  var powerTiles = new Map(), stamp = 0;
  function powerZoom(tz){ return clamp(tz, SRC.power.min, SRC.power.max); }
  function minKv(tz){ return tz < 6 ? 220 : tz < 8 ? 100 : tz < 10 ? 25 : 0; }
  function rasterPower(tz, wx, y, vt, dpr, dark){
    var vz = powerZoom(tz), sh = tz - vz;
    var c = document.createElement('canvas'), S = Math.round(TILE * dpr);
    c.width = S; c.height = S;
    var g = c.getContext('2d');
    var data = vt.data || {};
    var ext = (data.power_line || data.power_substation_point || {}).extent || 4096;
    var f = Math.pow(2, sh), k = f * TILE / ext * dpr;
    var ox = (wx - Math.floor(wx / f) * f) * TILE * dpr, oy = (y - Math.floor(y / f) * f) * TILE * dpr;
    var px = function(u){ return u * k - ox; }, py = function(v){ return v * k - oy; };
    var pad = 8 * dpr, lo = -pad, hi = S + pad;
    var inView = function(ft){ return ft.x1 * k - ox >= lo && ft.x0 * k - ox <= hi && ft.y1 * k - oy >= lo && ft.y0 * k - oy <= hi; };
    var floorKv = minKv(tz), big = tz >= 13 ? 0.5 : 0;
    var path = function(ft, close){
      g.beginPath();
      ft.parts.forEach(function(pt){
        g.moveTo(px(pt[0]), py(pt[1]));
        for(var i = 2; i < pt.length; i += 2) g.lineTo(px(pt[i]), py(pt[i + 1]));
        if(close) g.closePath();
      });
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    var casing = dark ? 'rgba(16,20,28,.72)' : 'rgba(255,255,255,.8)';
    // Substation and plant areas first, under the lines.
    ['power_plant', 'power_substation'].forEach(function(name){
      var L = data[name];
      if(!L) return;
      L.feats.forEach(function(ft){
        if(ft.type !== 3 || !inView(ft)) return;
        var v = volts(ft.p), col = name === 'power_plant' ? (dark ? '#9aa3ad' : '#6b7280') : vColour(isFinite(v) ? v : 0);
        path(ft, true);
        g.globalAlpha = 0.22; g.fillStyle = col; g.fill('evenodd');
        g.globalAlpha = 0.9; g.strokeStyle = col; g.lineWidth = 1.2 * dpr; g.stroke();
        g.globalAlpha = 1;
      });
    });
    var lines = data.power_line ? data.power_line.feats.filter(function(ft){
      if(ft.type !== 2 || !inView(ft)) return false;
      var v = volts(ft.p);
      ft.v = isFinite(v) ? v : 0;
      return ft.v >= floorKv || String(ft.p.frequency) === '0';
    }) : [];
    lines.sort(function(a, b){ return a.v - b.v; });
    // Thinner than the diagram's own branches: the grid on the map is a guide, the diagram is the subject.
    var widthOf = function(v){ return (v >= 550 ? 2 : v >= 310 ? 1.85 : v >= 220 ? 1.7 : v >= 132 ? 1.45 : v >= 52 ? 1.25 : v >= 25 ? 1.05 : 0.9) + big; };
    var under = function(ft){ var p = ft.p; return p.location === 'underground' || p.location === 'underwater' || p.line === 'cable' || p.tunnel === 1 || p.tunnel === true || p.tunnel === 'yes'; };
    lines.forEach(function(ft){ path(ft); g.strokeStyle = casing; g.lineWidth = (widthOf(ft.v) + 1.6) * dpr; g.setLineDash([]); g.stroke(); });
    lines.forEach(function(ft){
      var p = ft.p, gone = p.construction === 1 || p.construction === true || p.disused === 1 || p.disused === true;
      path(ft);
      g.strokeStyle = String(p.frequency) === '0' ? HVDC : vColour(ft.v);
      g.lineWidth = widthOf(ft.v) * dpr;
      g.setLineDash(under(ft) || gone ? [4 * dpr, 3 * dpr] : []);
      g.globalAlpha = gone ? 0.55 : 1;
      g.stroke();
      g.globalAlpha = 1;
    });
    g.setLineDash([]);
    // Substations and power stations as marks, until their outlines take over.
    if(tz <= 13){
      var pts = data.power_substation_point;
      if(pts) pts.feats.forEach(function(ft){
        if(!ft.parts.length || !inView(ft)) return;
        var v = volts(ft.p); v = isFinite(v) ? v : 0;
        if(v < (tz < 8 ? 220 : tz < 10 ? 52 : 0)) return;
        var r = (v >= 220 ? 3.2 : v >= 52 ? 2.6 : 2.1) * dpr, x = px(ft.parts[0][0]), yy = py(ft.parts[0][1]);
        g.fillStyle = dark ? '#1b2230' : '#ffffff';
        g.strokeStyle = vColour(v); g.lineWidth = 1.4 * dpr;
        g.beginPath(); g.rect(x - r, yy - r, 2 * r, 2 * r); g.fill(); g.stroke();
      });
      var pp = data.power_plant_point;
      if(pp) pp.feats.forEach(function(ft){
        if(!ft.parts.length || !inView(ft)) return;
        var mw = parseFloat(ft.p.output);
        if(tz < 10 && !(mw >= (tz < 8 ? 500 : 50))) return;
        var r = (mw >= 500 ? 3.8 : 3) * dpr, x = px(ft.parts[0][0]), yy = py(ft.parts[0][1]);
        g.fillStyle = dark ? '#c7cdd6' : '#374151';
        g.strokeStyle = dark ? '#1b2230' : '#ffffff'; g.lineWidth = 1.2 * dpr;
        g.beginPath(); g.moveTo(x, yy - r); g.lineTo(x + r, yy); g.lineTo(x, yy + r); g.lineTo(x - r, yy); g.closePath(); g.fill(); g.stroke();
      });
    }
    return c;
  }
  // A display tile's power picture, drawn once its vector tile is in. Only a
  // few are drawn per frame; the rest come on the next ones.
  var budget = 0;
  function powerImg(tz, wx, y, dpr, dark){
    var key = tz + '/' + wx + '/' + y + '/' + dpr + (dark ? 'd' : 'l');
    var c = powerTiles.get(key);
    if(c){ c.used = stamp; return c.cv; }
    var vz = powerZoom(tz), f = Math.pow(2, tz - vz);
    if(tz < SRC.power.min) return null;
    var vt = loaders.power.ok(vz, Math.floor(wx / f), Math.floor(y / f));
    if(!vt || budget <= 0) return null;
    budget--;
    var cv = rasterPower(tz, wx, y, vt, dpr, dark);
    powerTiles.set(key, { cv: cv, used: stamp });
    if(powerTiles.size > 72){
      var all = []; powerTiles.forEach(function(v, k){ all.push([v.used, k]); });
      all.sort(function(a, b){ return a[0] - b[0]; });
      for(var i = 0; i < all.length - 56; i++) powerTiles.delete(all[i][1]);
    }
    return cv;
  }

  /* ── The page's map ──
     The canvases are painted a margin wider than the stage. While the view
     only pans, or zooms a little, the painted picture is carried by a CSS
     transform worked out from the very numbers the SVG's viewBox uses, so it
     sits on the diagram's pixels in the same frame without repainting a tile.
     It is repainted when the margin runs out, when the zoom has gone too far
     for the picture to stay sharp, when a tile arrives, and once the view has
     been still for a moment. */
  var MARGIN = 128;
  var M = { els: null, frame: null, drawn: null, settleT: 0, settling: false };
  var rafPending = false;
  redraw = function(){
    if(rafPending || !M.els) return;
    rafPending = true;
    requestAnimationFrame(function(){ rafPending = false; draw(false); });
  };
  function place(cv, W, H, dpr){
    var w = Math.max(1, Math.round((W + 2 * MARGIN) * dpr)), h = Math.max(1, Math.round((H + 2 * MARGIN) * dpr));
    if(cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
    var st = cv.style, l = -MARGIN + 'px', ww = (W + 2 * MARGIN) + 'px', hh = (H + 2 * MARGIN) + 'px';
    if(st.left !== l){ st.left = l; st.top = l; }
    if(st.width !== ww) st.width = ww;
    if(st.height !== hh) st.height = hh;
    return cv.getContext('2d');
  }
  // What a painted picture depends on besides where the map sits (that the carry handles).
  function lookKey(mp){ return mp.base + ',' + mp.power; }
  // The tiles a view needs, asked for without painting them.
  function wants(geo, fr, mp){
    var L = loaders[BASE_SRC[mp.base] || 'osm'], ideal = idealZoom(geo, fr.s);
    var tz = clamp(Math.round(ideal), 0, L.src.max), set = tilesFor(geo, fr, tz);
    L.want(set.list.map(function(t){ return { z: tz, x: t.wx, y: t.y, k: t.k }; }));
    if(!mp.power) return;
    var ptz = clamp(Math.round(ideal), SRC.power.min, 19), vz = powerZoom(ptz), f = Math.pow(2, ptz - vz), want = [], seen = {};
    tilesFor(geo, fr, ptz).list.forEach(function(t){
      var vx = Math.floor(t.wx / f), vy = Math.floor(t.y / f), k = vz + '/' + vx + '/' + vy;
      if(!seen[k]){ seen[k] = 1; want.push({ z: vz, x: vx, y: vy, k: k }); }
    });
    loaders.power.want(want);
  }
  // A change of view: carried when it can be, painted when it must.
  function view(){ draw(true); }
  function draw(carry){
    if(!M.els) return;
    var st = M.els.getState(), base = M.els.base, over = M.els.over;
    var mp = st && st.map, on = !!(mp && mp.base && st.view);
    base.hidden = !on; over.hidden = !(on && mp.power);
    M.els.scale.hidden = !on;
    if(!on){ M.frame = null; M.drawn = null; return; }
    var dpr = Math.min(2, root.devicePixelRatio || 1), W = st.W, H = st.H;
    var geo = LF.geo(mp), fr = frameOf(st.view, W, H);
    M.frame = { geo: geo, fr: fr, map: mp };
    var key = lookKey(mp) + '|' + (st.dark ? 1 : 0) + '|' + W + 'x' + H + '|' + dpr, d = M.drawn;
    if(carry && d && d.key === key){
      /* A place on the map was painted at canvas px c = (Wp - X0) s + ox + MARGIN, Wp its
         world px at the painted zoom. It belongs now at stage px Wp·2^(z - z0)·s' - X0'·s' + ox'.
         So the canvas is scaled by r and moved by t (origin at its top-left, -MARGIN). */
      var k2 = Math.pow(2, geo.z - d.z), r = fr.s * k2 / d.s;
      var tx = fr.ox - geo.X0 * fr.s + MARGIN - (d.ox - d.X0 * d.s + MARGIN) * r;
      var ty = fr.oy - geo.Y0 * fr.s + MARGIN - (d.oy - d.Y0 * d.s + MARGIN) * r;
      var x0 = tx - MARGIN, y0 = ty - MARGIN, x1 = x0 + (W + 2 * MARGIN) * r, y1 = y0 + (H + 2 * MARGIN) * r;
      if(r > 0.75 && r < 1.5 && x0 <= 0.5 && y0 <= 0.5 && x1 >= W - 0.5 && y1 >= H - 0.5){
        var tf = 'translate(' + tx + 'px,' + ty + 'px)' + (Math.abs(r - 1) > 1e-12 ? ' scale(' + r + ')' : '');
        base.style.transform = tf; over.style.transform = tf;
        wants(geo, fr, mp);
        scaleBar(geo, fr, st.view);
        clearTimeout(M.settleT);
        M.settling = true;
        M.settleT = setTimeout(function(){ M.settling = false; draw(false); }, 160);
        return;
      }
    }
    clearTimeout(M.settleT);
    M.settling = false;
    stamp++;
    // Painted for the stage and its margin; drawn in canvas px, so the frame is shifted by the margin.
    var ext = { s: fr.s, ox: fr.ox + MARGIN, oy: fr.oy + MARGIN, W: W + 2 * MARGIN, H: H + 2 * MARGIN };
    base.style.transform = ''; over.style.transform = '';
    var look = lookOf(mp.base, st.dark), css = cssFilter(look.f);
    if(base.style.filter !== css) base.style.filter = css;
    base.style.opacity = String(look.a);
    var g = place(base, W, H, dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, base.width, base.height);
    var L = loaders[BASE_SRC[mp.base] || 'osm'];
    var ideal = idealZoom(geo, fr.s);
    var tz = clamp(Math.round(ideal), 0, L.src.max);
    paintTiles(g, geo, ext, tz, dpr, function(z, x, y){ if(z < 0 || z > L.src.max) return null; var e = L.ok(z, x, y); if(e){ e.used = stamp; return e.img; } return null; }, function(){ return TILE; });
    if(mp.power){
      var og = place(over, W, H, dpr);
      og.setTransform(1, 0, 0, 1, 0, 0);
      og.clearRect(0, 0, over.width, over.height);
      var ptz = clamp(Math.round(ideal), SRC.power.min, 19);
      budget = 8;
      paintTiles(og, geo, ext, ptz, dpr, function(z, x, y){
        if(z === ptz) return powerImg(z, x, y, dpr, st.dark);
        var c = powerTiles.get(z + '/' + x + '/' + y + '/' + dpr + (st.dark ? 'd' : 'l'));
        return c ? c.cv : null;
      }, function(c){ return c.width; });
      // Pictures still to draw for this view: the next frame takes them.
      if(budget <= 0) redraw();
    }
    wants(geo, ext, mp);
    M.drawn = { key: key, s: fr.s, ox: fr.ox, oy: fr.oy, X0: geo.X0, Y0: geo.Y0, z: geo.z };
    scaleBar(geo, fr, st.view);
    if(M.els.onStatus) M.els.onStatus(status(mp));
  }
  function status(mp){
    var L = loaders[BASE_SRC[mp.base] || 'osm'];
    return { baseFailed: L.fails > 0 && L.oks === 0, powerFailed: !!mp.power && loaders.power.fails > 0 && loaders.power.oks === 0 };
  }

  // A scale bar of a round length, about 90 px long, measured at the middle of the view.
  function niceLength(mpp, px){
    var m = mpp * px, p = Math.pow(10, Math.floor(Math.log(m) / Math.LN10)), n = m / p;
    var step = n >= 5 ? 5 : n >= 2 ? 2 : 1;
    var len = step * p;
    return { m: len, px: len / mpp, label: len >= 1000 ? (len / 1000).toLocaleString('en') + ' km' : len + ' m' };
  }
  function scaleBar(geo, fr, view){
    var el = M.els.scale;
    var mpp = LF.geoMetresPerPx(geo, view.y + view.h / 2) / fr.s;
    if(!isFinite(mpp) || mpp <= 0){ el.hidden = true; return; }
    var n = niceLength(mpp, 90);
    var bar = el.children[0], txt = el.children[1];
    bar.style.width = Math.round(n.px) + 'px';
    if(txt.textContent !== n.label) txt.textContent = n.label;
  }

  /* ── What is on the map under the pointer ── */
  function near2(px, py, ax, ay, bx, by){
    var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    var qx = ax + t * dx - px, qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }
  function inside(pt, x, y){
    var c = false;
    for(var i = 0, j = pt.length - 2; i < pt.length; j = i, i += 2){
      var xi = pt[i], yi = pt[i + 1], xj = pt[j], yj = pt[j + 1];
      if((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function featureAt(sx, sy){
    var F = M.frame;
    if(!F || !F.map.power) return null;
    var geo = F.geo, fr = F.fr;
    var ptz = clamp(Math.round(idealZoom(geo, fr.s)), SRC.power.min, 19), vz = powerZoom(ptz);
    var Xw = geo.X0 + (sx - fr.ox) / fr.s, Yw = geo.Y0 + (sy - fr.oy) / fr.s;
    var f = Math.pow(2, vz - geo.z), n = Math.pow(2, vz);
    var tx = Math.floor(Xw * f / TILE), ty = Math.floor(Yw * f / TILE);
    if(ty < 0 || ty >= n) return null;
    var vt = loaders.power.ok(vz, ((tx % n) + n) % n, ty);
    if(!vt || !vt.data) return null;
    var data = vt.data, ext = (data.power_line || data.power_substation_point || {}).extent || 4096;
    var u = (Xw * f / TILE - tx) * ext, v = (Yw * f / TILE - ty) * ext;
    var unit = f / fr.s * ext / TILE; // tile units per screen px
    var best = null;
    var consider = function(kind, ft, d){ if(!best || d < best.d) best = { kind: kind, p: ft.p, d: d }; };
    [['power_substation_point', 'substation'], ['power_plant_point', 'plant']].forEach(function(l){
      var L = data[l[0]];
      if(!L) return;
      L.feats.forEach(function(ft){
        if(!ft.parts.length) return;
        var d = Math.hypot(ft.parts[0][0] - u, ft.parts[0][1] - v) / unit;
        if(d <= 9) consider(l[1], ft, d);
      });
    });
    if(best) return best;
    [['power_substation', 'substation'], ['power_plant', 'plant']].forEach(function(l){
      var L = data[l[0]];
      if(!L) return;
      L.feats.forEach(function(ft){
        if(ft.type !== 3 || u < ft.x0 || u > ft.x1 || v < ft.y0 || v > ft.y1) return;
        if(ft.parts.some(function(pt){ return inside(pt, u, v); })) consider(l[1], ft, 0);
      });
    });
    if(best) return best;
    var L = data.power_line, tol = 5 * unit, floorKv = minKv(ptz);
    if(L) L.feats.forEach(function(ft){
      if(ft.type !== 2 || u < ft.x0 - tol || u > ft.x1 + tol || v < ft.y0 - tol || v > ft.y1 + tol) return;
      var kv = volts(ft.p);
      if(!(kv >= floorKv) && String(ft.p.frequency) !== '0' && floorKv) return;
      ft.parts.forEach(function(pt){
        for(var i = 2; i < pt.length; i += 2){
          var d = Math.sqrt(near2(u, v, pt[i - 2], pt[i - 1], pt[i], pt[i + 1])) / unit;
          if(d <= 5) consider('line', ft, d);
        }
      });
    });
    return best;
  }
  // The feature in words: "GITET Paiton, a 500/150 kV substation (PLN)".
  function describe(ft){
    var p = ft.p, kvs = [];
    ['voltage', 'voltage_2', 'voltage_3', 'voltage_4'].forEach(function(k){ var v = parseFloat(p[k]); if(isFinite(v) && v > 0 && kvs.indexOf(v) < 0) kvs.push(v); });
    kvs.sort(function(a, b){ return b - a; });
    var kv = kvs.length ? kvs.map(function(v){ return +v.toFixed(1); }).join('/') + ' kV ' : '';
    var name = p.name_en || p.name || p.ref || '';
    var what;
    if(ft.kind === 'substation') what = kv + 'substation';
    else if(ft.kind === 'plant'){
      var mw = parseFloat(p.output);
      what = (isFinite(mw) && mw > 0 ? (mw >= 100 ? Math.round(mw).toLocaleString('en') : +mw.toFixed(1)) + ' MW ' : '') + (p.source ? String(p.source).replace(/;/g, ', ') + ' ' : '') + 'power station';
    } else {
      var hv = String(p.frequency) === '0';
      what = kv + (hv ? 'HVDC ' : '') + (p.line === 'cable' || p.location === 'underground' || p.location === 'underwater' ? 'cable' : 'line');
      var c = parseFloat(p.circuits);
      if(c > 1) what += ', ' + c + ' circuits';
      if(p.construction === 1 || p.construction === true) what += ', under construction';
    }
    return { name: name, what: what, operator: p.operator || '' };
  }

  /* ── Exports: the map for any rectangle of the diagram ──
     rect in diagram px, drawn into pw × ph pixels at S pixels per css px. Waits
     for the tiles (up to timeout ms), then tones them as the page does, so the
     file looks like the screen. */
  var MAT = {
    grayscale: function(a){ return [0.2126 + 0.7874 * (1 - a), 0.7152 - 0.7152 * (1 - a), 0.0722 - 0.0722 * (1 - a), 0.2126 - 0.2126 * (1 - a), 0.7152 + 0.2848 * (1 - a), 0.0722 - 0.0722 * (1 - a), 0.2126 - 0.2126 * (1 - a), 0.7152 - 0.7152 * (1 - a), 0.0722 + 0.9278 * (1 - a)]; },
    saturate: function(s){ return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]; },
    'hue-rotate': function(deg){
      var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
              0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
              0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    }
  };
  function tone(g, w, h, look, bg){
    var im = g.getImageData(0, 0, w, h), d = im.data, a = look.a;
    for(var i = 0; i < d.length; i += 4){
      var r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      for(var j = 0; j < look.f.length; j++){
        var op = look.f[j][0], v = look.f[j][1], m;
        if(op === 'invert'){ r = v * (1 - r) + (1 - v) * r; gg = v * (1 - gg) + (1 - v) * gg; b = v * (1 - b) + (1 - v) * b; }
        else if(op === 'brightness'){ r *= v; gg *= v; b *= v; }
        else if(op === 'contrast'){ r = (r - 0.5) * v + 0.5; gg = (gg - 0.5) * v + 0.5; b = (b - 0.5) * v + 0.5; }
        else if(MAT[op]){ m = MAT[op](v); var R = m[0] * r + m[1] * gg + m[2] * b, Gc = m[3] * r + m[4] * gg + m[5] * b, B = m[6] * r + m[7] * gg + m[8] * b; r = R; gg = Gc; b = B; }
        r = clamp(r, 0, 1); gg = clamp(gg, 0, 1); b = clamp(b, 0, 1);
      }
      // The map shows through at its share over the panel colour.
      d[i] = Math.round((a * r + (1 - a) * bg[0] / 255) * 255);
      d[i + 1] = Math.round((a * gg + (1 - a) * bg[1] / 255) * 255);
      d[i + 2] = Math.round((a * b + (1 - a) * bg[2] / 255) * 255);
      d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }
  function render(o){
    var mp = o.map, geo = LF.geo(mp), S = o.S || 1;
    var fr = { s: o.pw / S / o.rect.w, W: o.pw / S, H: o.ph / S };
    fr.ox = -o.rect.x * fr.s; fr.oy = -o.rect.y * fr.s;
    var L = loaders[BASE_SRC[mp.base] || 'osm'];
    var ideal = idealZoom(geo, fr.s), tz = clamp(Math.round(ideal), 0, L.src.max);
    var set = tilesFor(geo, fr, tz);
    var keys = set.list.map(function(t){ return t.k; });
    L.want(set.list.map(function(t){ return { z: tz, x: t.wx, y: t.y, k: t.k }; }));
    var ptz = clamp(Math.round(ideal), SRC.power.min, 19), vz = powerZoom(ptz), f = Math.pow(2, ptz - vz);
    var pset = mp.power ? tilesFor(geo, fr, ptz) : { list: [] }, pwant = [], seen = {};
    pset.list.forEach(function(t){
      var vx = Math.floor(t.wx / f), vy = Math.floor(t.y / f), k = vz + '/' + vx + '/' + vy;
      if(!seen[k]){ seen[k] = 1; pwant.push({ z: vz, x: vx, y: vy, k: k }); }
    });
    if(pwant.length) loaders.power.want(pwant);
    var timeout = new Promise(function(r){ setTimeout(r, o.timeout || 9000); });
    var ready = Promise.all([L.settle(keys), loaders.power.settle(pwant.map(function(t){ return t.k; }))]);
    return Promise.race([ready, timeout]).then(function(){
      var c = document.createElement('canvas');
      c.width = o.pw; c.height = o.ph;
      var g = c.getContext('2d', { willReadFrequently: true });
      var bg = rgbOf(o.bg);
      g.fillStyle = 'rgb(' + bg.join(',') + ')'; g.fillRect(0, 0, o.pw, o.ph);
      paintTiles(g, geo, fr, tz, S, function(z, x, y){ var e = z === tz ? L.ok(z, x, y) : null; return e ? e.img : null; }, function(){ return TILE; });
      tone(g, o.pw, o.ph, lookOf(mp.base, o.dark), bg);
      if(mp.power){
        var pics = {};
        pset.list.forEach(function(t){
          var vt = loaders.power.ok(vz, Math.floor(t.wx / f), Math.floor(t.y / f));
          if(vt) pics[t.k] = rasterPower(ptz, t.wx, t.y, vt, S, o.dark);
        });
        paintTiles(g, geo, fr, ptz, S, function(z, x, y){ return z === ptz ? pics[z + '/' + x + '/' + y] || null : null; }, function(cv){ return cv.width; });
      }
      return c;
    });
  }
  function rgbOf(c){
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if(m){ var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    m = /rgba?\(([^)]+)\)/.exec(c);
    if(m){ var p = m[1].split(/[ ,/]+/).map(Number); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
    return [255, 255, 255];
  }

  /* ── Finding a place ──
     Typed coordinates go straight there; a name asks OpenStreetMap's
     Nominatim, at most once a second, as its usage policy asks. */
  var lastAsk = 0;
  function parseCoords(q){
    var m = /^\s*([-+]?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*([-+]?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i.exec(q);
    if(!m) return null;
    var lat = +m[1] * (/s/i.test(m[2] || '') ? -1 : 1), lon = +m[3] * (/w/i.test(m[4] || '') ? -1 : 1);
    if(!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
    return { name: lat.toFixed(5) + ', ' + lon.toFixed(5), sub: 'Coordinates', lat: lat, lon: lon, bbox: null };
  }
  function search(q){
    q = String(q || '').trim();
    if(!q) return Promise.resolve([]);
    var c = parseCoords(q);
    if(c) return Promise.resolve([c]);
    var wait = Math.max(0, lastAsk + 1100 - Date.now());
    return new Promise(function(r){ setTimeout(r, wait); }).then(function(){
      lastAsk = Date.now();
      var lang = (root.navigator && root.navigator.language) || 'en';
      return fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' + encodeURIComponent(q.slice(0, 200)) + '&accept-language=' + encodeURIComponent(lang), { credentials: 'omit' });
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function(list){
      return (Array.isArray(list) ? list : []).map(function(p){
        var lat = parseFloat(p.lat), lon = parseFloat(p.lon), bb = (p.boundingbox || []).map(parseFloat);
        if(!isFinite(lat) || !isFinite(lon)) return null;
        var parts = String(p.display_name || '').split(', ');
        return { name: String(p.name || parts[0] || '').slice(0, 80), sub: parts.slice(1).join(', ').slice(0, 120), lat: lat, lon: lon,
                 bbox: bb.length === 4 && bb.every(isFinite) ? { s: bb[0], n: bb[1], w: bb[2], e: bb[3] } : null };
      }).filter(Boolean);
    });
  }

  /* A first place for a new map: the region the reader's clock is set to,
     roughly, so the first map they see is their own part of the world. The
     third figure is how far in it opens (web zoom). */
  var TZ_PLACE = [
    [/^Australia\/Perth/, -31.95, 115.86, 7], [/^Australia\/(Darwin)/, -12.46, 130.84, 7],
    [/^Australia\/(Adelaide|Broken_Hill)/, -34.93, 138.6, 7], [/^Australia\/(Brisbane|Lindeman)/, -27.47, 153.03, 7],
    [/^Australia\//, -35.5, 147.5, 6], [/^Asia\/(Jakarta|Pontianak)/, -6.9, 109.5, 6], [/^Asia\/Makassar/, -3.5, 119.5, 6],
    [/^Asia\/Jayapura/, -3.5, 138, 6], [/^Asia\/(Singapore|Kuala_Lumpur)/, 2, 103, 7], [/^Pacific\/Auckland/, -41, 174, 5],
    [/^Europe\//, 50, 10, 4], [/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Detroit|Indiana|Kentucky|Boise)/, 39, -96, 4],
    [/^America\//, 5, -65, 3], [/^Africa\//, 3, 20, 3], [/^Asia\//, 28, 100, 3]
  ];
  function guessPlace(){
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e){}
    for(var i = 0; i < TZ_PLACE.length; i++) if(TZ_PLACE[i][0].test(tz)) return { lat: TZ_PLACE[i][1], lon: TZ_PLACE[i][2], zoom: TZ_PLACE[i][3] };
    return { lat: 20, lon: 10, zoom: 2 };
  }

  function credits(mp, html){
    if(!mp || !mp.base) return [];
    var out = [CREDIT[BASE_SRC[mp.base] || 'osm'][html ? 'html' : 'text']];
    if(mp.power){
      out.push(CREDIT.power[html ? 'html' : 'text']);
      if(mp.base === 'satellite') out.push(CREDIT.osm[html ? 'html' : 'text']);
    }
    return out;
  }

  root.LFMap = {
    attach: function(els){ M.els = els; },
    draw: function(){ draw(false); },
    view: view,
    redraw: redraw,
    featureAt: featureAt,
    describe: describe,
    render: render,
    search: search,
    guessPlace: guessPlace,
    credits: credits,
    frame: function(){ return M.frame; },
    // Nothing loading, nothing waiting to be painted: what is on screen is final.
    idle: function(){ return !rafPending && !M.settling && Object.keys(loaders).every(function(k){ return loaders[k].busy === 0 && loaders[k].wanted.length === 0; }); },
    VCOL: VCOL, HVDC: HVDC,
    decodeMvt: decodeMvt,
    _loaders: loaders
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
