/* Load Flow Simulator: layout and drawing of the single-line diagram.

   Pure: model + results + display options in, a scene out. The page, the
   SVG and PNG exports and every GIF frame are drawn from the same scene, so
   what is exported is what is on screen.

   A scene is
     base    SVG markup of the network (branches, devices, bus bars)
     lanes   the moving flow arrows: [{ pts, d, len, kind:'p'|'q', n, at, fadeIn, fadeOut, color, id }]
     labels  text: [{ x, y, t, anchor, mono, bold, size, fill, res }]
     bbox    the drawing's extent in diagram px                            */
(function(root){
  'use strict';
  var LF = root.LF;
  var G = LF.G;

  /* ── Formatting ── */
  function fixed(x, d){ return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function minus(s){ return String(s).replace(/^-/, '−'); }
  LF.fmt = {
    p: function(x){
      if(!isFinite(x)) return '–';
      var a = Math.abs(x);
      return minus(a >= 100 ? fixed(x, 1) : a >= 1 ? fixed(x, 2) : a >= 0.01 ? fixed(x, 3) : fixed(x, 4));
    },
    v: function(x){ return isFinite(x) ? fixed(x, 3) : '–'; },
    ang: function(x){ return isFinite(x) ? minus(fixed(x, 2)) : '–'; },
    kv: function(x){ if(!isFinite(x)) return '–'; var a = Math.abs(x); return a >= 100 ? fixed(x, 1) : a >= 10 ? fixed(x, 2) : fixed(x, 3); },
    pct: function(x){ return isFinite(x) ? (Math.abs(x) >= 10 ? fixed(x, 0) : fixed(x, 1)) : '–'; },
    ka: function(x){ if(!isFinite(x)) return '–'; return Math.abs(x) >= 1 ? fixed(x, 2) : fixed(x, 3); },
    pf: function(p, q){ var s = Math.hypot(p, q); return s > 1e-12 && isFinite(s) ? fixed(Math.abs(p) / s, 3) : '–'; }
  };
  // A value past a limit never prints as the limit: 0.9497 against 0.95 reads
  // 0.9497, not 0.950, and 100.4 % against 100 % reads 100.4, not 100.
  function past(x, d, lo, hi){
    for(var k = d; k < d + 4; k++){
      var t = +fixed(x, k);
      if(!(x < lo - 1e-9 && t >= lo) && !(x > hi + 1e-9 && t <= hi)) break;
    }
    return k;
  }
  LF.fmt.vl = function(x, lo, hi){ return isFinite(x) ? fixed(x, past(x, 3, lo, hi)) : '–'; };
  LF.fmt.pctl = function(x, max){ return isFinite(x) ? fixed(x, past(x, Math.abs(x) >= 10 ? 0 : 1, -Infinity, max)) : '–'; };
  var F = LF.fmt;

  /* ── Geometry ── */
  function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }
  // A node bus is a bar of no length: everything meets at its centre. Its saved
  // width stays, so turning it back into a bar restores the bar.
  LF.busGeom = function(b){
    var node = b.style === 'node';
    var at = b.at, cx = at[0] * G, cy = at[1] * G, hw = node ? 0 : at[2] * G / 2, v = at[3] === 1;
    return { cx: cx, cy: cy, hw: hw, units: node ? 0 : at[2], v: v, node: node,
             x1: v ? cx : cx - hw, y1: v ? cy - hw : cy, x2: v ? cx : cx + hw, y2: v ? cy + hw : cy };
  };
  var NODE_R = 5;
  LF.NODE_R = NODE_R;
  function busCentre(b){ return [b.at[0], b.at[1]]; }
  var DEV_UP = { Generator: 1, StorageUnit: 1 };

  // Which side of bus b faces point (x, y) in grid units: 1 = above/left.
  function sideToward(b, x, y){
    var c = busCentre(b);
    if(b.at[3] === 1) return x < c[0] ? 1 : 0;
    return y < c[1] ? 1 : 0;
  }
  function along(b, x, y){
    var c = busCentre(b);
    return b.at[3] === 1 ? y - c[1] : x - c[0];
  }

  // Ports on one side of one bar: explicit offsets stay, the rest are packed
  // in order of where their other end lies, two units apart (three by a device).
  function pack(reqs, half){
    var lo = -half, hi = half;
    var taken = [];
    reqs.forEach(function(r){ if(r.explicit !== null){ r.a = clamp(r.explicit, lo, hi); taken.push(r); } });
    var auto = reqs.filter(function(r){ return r.explicit === null; });
    auto.sort(function(a, b){ return a.want - b.want || a.order - b.order; });
    var gap = function(a, b){ return a.dev || b.dev ? 3 : 2; };
    var prev = null;
    auto.forEach(function(r){
      var a = Math.round(clamp(r.want, lo, hi));
      if(prev) a = Math.max(a, prev.a + gap(prev, r));
      for(var guard = 0; guard < 400 && taken.some(function(t){ return Math.abs(t.a - a) < gap(t, r); }); guard++) a++;
      r.a = a;
      taken.push(r);
      prev = r;
    });
    var over = auto.reduce(function(m, r){ return Math.max(m, r.a - hi); }, 0);
    if(over > 0) auto.forEach(function(r){ r.a = Math.max(lo, r.a - over); });
  }

  LF.layout = function(model){
    var byId = LF.byId(model);
    var L = { bus: {}, br: {}, dev: {}, byId: byId };
    var reqs = {};
    var order = 0;
    function req(busId, r){
      var key = busId + ':' + r.side;
      (reqs[key] = reqs[key] || []).push(r);
      r.order = order++;
    }
    model.el.forEach(function(e){ if(e.c === 'Bus') L.bus[e.id] = LF.busGeom(e); });
    model.el.forEach(function(e){
      if(LF.BRANCH[e.c]){
        var b0 = byId[e.bus0], b1 = byId[e.bus1];
        if(!b0 || !b1 || b0.c !== 'Bus' || b1.c !== 'Bus') return;
        var at = e.at || [];
        [0, 1].forEach(function(end){
          var me = end ? b1 : b0, other = end ? b0 : b1;
          var oc = busCentre(other);
          var same = me === other;
          var side = same ? 0 : sideToward(me, oc[0], oc[1]);
          // Two bars level with each other: both ends leave on the lower side.
          if(!same && me.at[3] !== 1 && other.at[3] !== 1 && me.at[1] === other.at[1]) side = 0;
          if(!same && me.at[3] === 1 && other.at[3] === 1 && me.at[0] === other.at[0]) side = 0;
          var want = same ? (end ? 2 : -2) : along(me, oc[0], oc[1]);
          var ex = at[end] === null || at[end] === undefined ? null : at[end];
          req(me.id, { kind: 'br', id: e.id, end: end, bus: me.id, side: side, want: want, explicit: ex, dev: false });
        });
      } else if(LF.DEVICE[e.c] && e.bus !== null && e.bus !== undefined && byId[e.bus] && byId[e.bus].c === 'Bus'){
        var side = e.at ? e.at[1] : (DEV_UP[e.c] ? 1 : 0);
        req(e.bus, { kind: 'dev', id: e.id, bus: e.bus, side: side, want: 0, explicit: e.at ? e.at[0] : null, dev: true });
      }
    });
    var ports = {};
    Object.keys(reqs).forEach(function(key){
      var busId = +key.split(':')[0];
      var b = byId[busId];
      var g = L.bus[busId];
      var half = g.node ? 0 : Math.max(0, Math.floor(b.at[2] / 2));
      pack(reqs[key], half);
      reqs[key].forEach(function(r){
        var px = g.v ? g.cx : g.cx + r.a * G, py = g.v ? g.cy + r.a * G : g.cy;
        var d = g.v ? [r.side ? -1 : 1, 0] : [0, r.side ? -1 : 1];
        ports[r.kind + r.id + ':' + (r.end || 0)] = { x: px, y: py, d: d, a: r.a, side: r.side, bus: busId };
      });
    });
    nodePorts(model, L, ports);
    L.ports = ports;

    // Branch routes, and parallel branches between the same pair spread apart.
    var pairs = {};
    model.el.forEach(function(e){
      if(!LF.BRANCH[e.c] || !ports['br' + e.id + ':0']) return;
      var k = Math.min(e.bus0, e.bus1) + '-' + Math.max(e.bus0, e.bus1);
      (pairs[k] = pairs[k] || []).push(e.id);
    });
    model.el.forEach(function(e){
      var p0 = ports['br' + e.id + ':0'], p1 = ports['br' + e.id + ':1'];
      if(!p0 || !p1) return;
      var k = Math.min(e.bus0, e.bus1) + '-' + Math.max(e.bus0, e.bus1);
      var grp = pairs[k], idx = grp.indexOf(e.id);
      var spread = (idx - (grp.length - 1) / 2) * G;
      var m = e.at && e.at[2] !== null && e.at[2] !== undefined ? e.at[2] * G : null;
      var pts = route(p0, p1, m, spread);
      L.br[e.id] = mid(pts);
      L.br[e.id].pts = pts;
      L.br[e.id].p0 = p0; L.br[e.id].p1 = p1;
    });

    // Devices: a stub off the bar, the symbol at its end.
    model.el.forEach(function(e){
      if(!LF.DEVICE[e.c]) return;
      var p = ports['dev' + e.id + ':0'];
      if(p){
        var S = 22, R = 11;
        L.dev[e.id] = { px: p.x, py: p.y, d: p.d, sx: p.x + p.d[0] * S, sy: p.y + p.d[1] * S,
                        cx: p.x + p.d[0] * (S + R), cy: p.y + p.d[1] * (S + R), free: false };
      } else if(e.at && e.at.length === 2){
        var x = e.at[0] * G, y = e.at[1] * G;
        L.dev[e.id] = { px: x, py: y - 22, d: [0, 1], sx: x, sy: y - 11, cx: x, cy: y, free: true };
      }
    });
    return L;
  };

  /* A node has four ways out instead of two sides. A branch leaves it toward its
     other end, along whichever axis that end lies further along (or the other
     axis, when that way is taken and the other leads there too). A device takes
     the side it was put on, or the next free way round when another device or a
     branch is already there, so devices on one node never sit on top of each other. */
  function nodePorts(model, L, ports){
    var used = {};
    function key(busId, d){ return busId + ':' + d[0] + ',' + d[1]; }
    model.el.forEach(function(e){
      if(!LF.BRANCH[e.c]) return;
      [0, 1].forEach(function(end){
        var p = ports['br' + e.id + ':' + end];
        if(!p || !L.bus[p.bus].node) return;
        var me = L.bus[p.bus], other = L.bus[end ? e.bus0 : e.bus1];
        if(!other || other === me) return;
        var dx = other.cx - me.cx, dy = other.cy - me.cy;
        // Toward the nearest point of the other bar, not its centre, so a node
        // beside a long bar leaves straight for it.
        if(!other.node){
          if(other.v){ dy = clamp(me.cy, other.y1, other.y2) - me.cy; }
          else { dx = clamp(me.cx, other.x1, other.x2) - me.cx; }
        }
        if(dx === 0 && dy === 0) return;
        var hx = [dx > 0 ? 1 : -1, 0], vy = [0, dy > 0 ? 1 : -1];
        var ways = Math.abs(dx) > Math.abs(dy) ? [hx, vy] : [vy, hx];
        // A way another branch already takes, while the other axis also leads
        // toward this end: take that, so the two do not run on top of each other.
        if(used[key(p.bus, ways[0])] && (ways[1][0] ? dx : dy) && !used[key(p.bus, ways[1])]) ways.shift();
        p.d = ways[0];
        used[key(p.bus, p.d)] = 1;
      });
    });
    var dev = {};
    model.el.forEach(function(e){
      var p = LF.DEVICE[e.c] ? ports['dev' + e.id + ':0'] : null;
      if(!p || !L.bus[p.bus].node) return;
      var pref = p.d, perp = [[pref[1], pref[0]], [-pref[1], -pref[0]]], opp = [-pref[0], -pref[1]];
      var order = [pref, perp[0], perp[1], opp];
      // First a way nothing uses, then one only branches use, then the preferred one.
      var pick = order.filter(function(d){ return !dev[key(p.bus, d)] && !used[key(p.bus, d)]; })[0] ||
                 order.filter(function(d){ return !dev[key(p.bus, d)]; })[0] || pref;
      p.d = pick;
      dev[key(p.bus, pick)] = 1;
    });
  }

  // An orthogonal route from port p0 to port p1 (each leaving its bar along d).
  function route(p0, p1, m, spread){
    var A = [p0.x, p0.y], B = [p1.x, p1.y];
    var v0 = p0.d[0] === 0, v1 = p1.d[0] === 0; // leaves vertically
    var S = 15;
    if(v0 && v1){
      var facing = p0.d[1] * (B[1] - A[1]) > 0 && p1.d[1] * (A[1] - B[1]) > 0;
      var ym;
      if(facing){
        if(A[0] === B[0] && m === null && !spread) return [A, B];
        ym = m !== null ? m : (A[1] + B[1]) / 2 + spread;
      } else {
        ym = m !== null ? m : (p0.d[1] > 0 ? Math.max(A[1], B[1]) + 2.5 * G : Math.min(A[1], B[1]) - 2.5 * G) + spread;
      }
      return [A, [A[0], ym], [B[0], ym], B];
    }
    if(!v0 && !v1){
      var facingH = p0.d[0] * (B[0] - A[0]) > 0 && p1.d[0] * (A[0] - B[0]) > 0;
      var xm;
      if(facingH){
        if(A[1] === B[1] && m === null && !spread) return [A, B];
        xm = m !== null ? m : (A[0] + B[0]) / 2 + spread;
      } else {
        xm = m !== null ? m : (p0.d[0] > 0 ? Math.max(A[0], B[0]) + 2.5 * G : Math.min(A[0], B[0]) - 2.5 * G) + spread;
      }
      return [A, [xm, A[1]], [xm, B[1]], B];
    }
    // One vertical bar and one horizontal: an L if its corner is ahead of both ports.
    var V = v0 ? p0 : p1, H = v0 ? p1 : p0;
    var c = [V.x, H.y];
    var ok = (c[1] - V.y) * V.d[1] > 0 && (c[0] - H.x) * H.d[0] > 0;
    var pts;
    if(ok) pts = [[V.x, V.y], c, [H.x, H.y]];
    else {
      var sv = [V.x, V.y + V.d[1] * S], sh = [H.x + H.d[0] * S, H.y];
      pts = [[V.x, V.y], sv, [sh[0], sv[1]], sh, [H.x, H.y]];
    }
    return v0 ? pts : pts.reverse();
  }

  // The point halfway along a route, and the direction there.
  function mid(pts){
    var segs = [], total = 0;
    for(var i = 1; i < pts.length; i++){
      var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      segs.push(l); total += l;
    }
    var half = total / 2, acc = 0;
    for(var j = 0; j < segs.length; j++){
      if(acc + segs[j] >= half || j === segs.length - 1){
        var t = segs[j] ? (half - acc) / segs[j] : 0;
        var a = pts[j], b = pts[j + 1];
        var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        return { mx: a[0] + dx * t, my: a[1] + dy * t, ux: dx / l, uy: dy / l, seg: j, len: total };
      }
      acc += segs[j];
    }
    return { mx: pts[0][0], my: pts[0][1], ux: 1, uy: 0, seg: 0, len: 0 };
  }

  // Split a route at its midpoint: [first half, second half], both running from end 0 to end 1.
  // Length of a route, the point s along it (with the way it runs there) and its piece from s0 to s1.
  function routeLen(pts){
    var l = 0;
    for(var i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return l;
  }
  function pointAt(pts, s){
    for(var i = 1; i < pts.length; i++){
      var a = pts[i - 1], b = pts[i], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if(!sl && i < pts.length - 1) continue;
      if(s <= sl || i === pts.length - 1){
        var f = sl ? clamp(s / sl, 0, 1) : 0;
        return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ux: sl ? (b[0] - a[0]) / sl : 1, uy: sl ? (b[1] - a[1]) / sl : 0 };
      }
      s -= sl;
    }
    return { x: pts[0][0], y: pts[0][1], ux: 1, uy: 0 };
  }
  function cut(pts, s0, s1){
    var a = pointAt(pts, s0), b = pointAt(pts, s1), out = [[a.x, a.y]], acc = 0;
    for(var i = 1; i < pts.length - 1; i++){
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if(acc > s0 && acc < s1) out.push(pts[i]);
    }
    out.push([b.x, b.y]);
    return out;
  }
  /* An HVDC converter: a square split by a diagonal, ~ in the half facing its bus
     (the AC side) and = in the half facing the DC line. (ix, iy) points from the
     bus into the link. */
  var CONV_S = 8, CONV_D = 22;
  function converter(x, y, ix, iy, col, bg){
    var s = CONV_S, ul = ix + iy > 0;
    var ax = ul ? x - 6 : x + 0.5, ay = ul ? y - 3.5 : y + 4.5;
    var dx = ul ? x + 0.5 : x - 6, dy = ul ? y + 3 : y - 5.5;
    return '<rect x="' + r1(x - s) + '" y="' + r1(y - s) + '" width="' + 2 * s + '" height="' + 2 * s + '" rx="2" fill="' + bg + '" stroke="' + col + '" stroke-width="1.8"/>' +
      '<path d="M' + r1(x - s) + ' ' + r1(y + s) + 'L' + r1(x + s) + ' ' + r1(y - s) + '" stroke="' + col + '" stroke-width="1.4"/>' +
      '<path d="M' + r1(ax) + ' ' + r1(ay) + 'q1.5 -2.4 3 0t3 0" fill="none" stroke="' + col + '" stroke-width="1.2"/>' +
      '<path d="M' + r1(dx) + ' ' + r1(dy) + 'h5.5M' + r1(dx) + ' ' + r1(dy + 2.5) + 'h5.5" stroke="' + col + '" stroke-width="1.2"/>';
  }
  function halves(pts, md){
    var a = pts.slice(0, md.seg + 1).concat([[md.mx, md.my]]);
    var b = [[md.mx, md.my]].concat(pts.slice(md.seg + 1));
    return [a, b];
  }
  // Shift an orthogonal polyline sideways by delta (left of travel is +).
  function offset(pts, delta){
    var n = function(a, b){ var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; };
    var out = [];
    for(var i = 0; i < pts.length; i++){
      var n1 = i > 0 ? n(pts[i - 1], pts[i]) : null, n2 = i < pts.length - 1 ? n(pts[i], pts[i + 1]) : null;
      var sx, sy;
      if(n1 && n2){
        var dot = n1[0] * n2[0] + n1[1] * n2[1];
        if(Math.abs(dot) > 0.99){ sx = n1[0]; sy = n1[1]; } else { sx = n1[0] + n2[0]; sy = n1[1] + n2[1]; }
      } else { var nn = n1 || n2; sx = nn[0]; sy = nn[1]; }
      out.push([pts[i][0] + sx * delta, pts[i][1] + sy * delta]);
    }
    return out;
  }
  function pathD(pts){
    var s = '';
    for(var i = 0; i < pts.length; i++) s += (i ? 'L' : 'M') + r1(pts[i][0]) + ' ' + r1(pts[i][1]);
    return s;
  }
  function r1(x){ return Math.round(x * 10) / 10; }
  LF.pathD = pathD;

  /* ── Colour ── */
  function rgb(c){
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if(m){
      var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /rgba?\(([^)]+)\)/.exec(c);
    if(m){ var p = m[1].split(/[ ,/]+/).map(Number); return [p[0], p[1], p[2]]; }
    return [128, 128, 128];
  }
  function mix(a, b, t){
    var x = rgb(a), y = rgb(b);
    t = clamp(t, 0, 1);
    return 'rgb(' + [0, 1, 2].map(function(i){ return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')';
  }
  LF.mix = mix;

  function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  LF.esc = esc;

  /* ── What each label shows ── */
  // display.labels[c][q] is the page-wide choice; e.lb overrides it per element.
  function shows(e, display, q){
    var list = LF.LABELS[e.c], i = list.indexOf(q);
    if(i < 0) return false;
    if(typeof e.lb === 'number') return !!(e.lb & (1 << i));
    var cls = display.labels && display.labels[e.c];
    return !!(cls && cls[q]);
  }
  LF.shows = shows;

  /* ── The scene ── */
  LF.draw = function(model, L, res, display, paint){
    display = display || {};
    var ok = !!(res && res.report && res.report.ok);
    var ac = ok && res.report.method === 'ac';
    var C = {
      text: paint('--text'), muted: paint('--muted'), bg: paint('--panel'), border: paint('--border'),
      p: paint('--line-a'), q: paint('--gold'), neg: paint('--negative'), ok: paint('--accent2'), warn: paint('--gold'),
      accent: paint('--accent')
    };
    var by = display.colourBy || 'none';
    var vmin = display.vmin || 0.95, vmax = display.vmax || 1.05, lmax = display.loadMax || 100;
    var base = '', lanes = [], labels = [];
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(x, y){ if(x < minX) minX = x; if(x > maxX) maxX = x; if(y < minY) minY = y; if(y > maxY) maxY = y; }
    function label(x, y, t, o){
      o = o || {};
      var size = o.size || 10.5;
      labels.push({ x: x, y: y, t: t, anchor: o.anchor || 'start', mono: !!o.mono, bold: !!o.bold, size: size,
                    fill: o.fill || C.text, res: !!o.res, id: o.id });
      var w = t.length * size * (o.mono ? 0.61 : 0.56);
      var x0 = o.anchor === 'middle' ? x - w / 2 : o.anchor === 'end' ? x - w : x;
      grow(x0, y - size); grow(x0 + w, y + 3);
    }
    /* Labels are placed last. Each block offers a few positions in order of
       preference; the one that covers the fewest other labels, symbols and
       lines wins. Obstacles are rectangles with a weight. */
    var queue = [], obst = [];
    function ob(x, y, w, h, k){ obst.push({ x: x, y: y, w: w, h: h, k: k }); }
    function segOb(a, b, half, k){ ob(Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.abs(b[0] - a[0]) + 2 * half, Math.abs(b[1] - a[1]) + 2 * half, k); }
    function want(lines, cands, id, pri){ if(lines.length) queue.push({ lines: lines, cands: cands, id: id, pri: pri, n: queue.length }); }
    function textW(ln){ var size = ln.size || 10.5; return ln.t.length * size * (ln.mono ? 0.6 : ln.bold ? 0.6 : 0.55); }
    function area(a, b){
      var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? w * h : 0;
    }
    // A coarse grid finds the rectangles near a candidate, so a big network places its
    // labels in near-linear time. Only rectangles that overlap add to a score, and the
    // ones found are summed in their original order, so the result is the same as
    // checking every rectangle.
    function Bins(list){
      var S = 96, cells = {}, big = [], stamp = 0, seen = [];
      function each(r, f){
        if(!isFinite(r.x + r.y + r.w + r.h)) return;
        for(var i = Math.floor(r.x / S), i1 = Math.floor((r.x + r.w) / S); i <= i1; i++)
          for(var j = Math.floor(r.y / S), j1 = Math.floor((r.y + r.h) / S); j <= j1; j++) f(i + ',' + j);
      }
      function add(n){
        var r = list[n];
        // A huge rectangle (a long line) goes in a list every query reads.
        if(!(r.w * r.h <= 400 * S * S) || !isFinite(r.x + r.y)){ big.push(n); return; }
        each(r, function(k){ (cells[k] || (cells[k] = [])).push(n); });
      }
      for(var n = 0; n < list.length; n++) add(n);
      return {
        push: function(r){ list.push(r); add(list.length - 1); },
        near: function(r){
          stamp++;
          var out = [];
          var take = function(m){ if(seen[m] !== stamp){ seen[m] = stamp; out.push(m); } };
          big.forEach(take);
          each(r, function(k){ var c = cells[k]; if(c) for(var t = 0; t < c.length; t++) take(c[t]); });
          return out.sort(function(x, y){ return x - y; });
        }
      };
    }
    function placeLabels(){
      queue.sort(function(a, b){ return a.pri - b.pri || a.n - b.n; });
      var placed = [], pBins = Bins(placed), oBins = Bins(obst);
      queue.forEach(function(q){
        var w = q.lines.reduce(function(m, ln){ return Math.max(m, textW(ln)); }, 0), h = q.lines.length * 13 - 2;
        var best = null;
        q.cands.forEach(function(c, i){
          var x0 = c.ax === 'start' ? c.x : c.ax === 'middle' ? c.x - w / 2 : c.x - w;
          var y0 = c.ay === 'top' ? c.y : c.ay === 'middle' ? c.y - h / 2 : c.y - h;
          var r = { x: x0 - 2, y: y0 - 1, w: w + 4, h: h + 2 };
          var sc = i * 20;
          pBins.near(r).forEach(function(n){ sc += 12 * area(r, placed[n]); });
          oBins.near(r).forEach(function(n){ sc += obst[n].k * area(r, obst[n]); });
          if(!best || sc < best.s) best = { s: sc, r: r, x0: x0, y0: y0, c: c };
        });
        pBins.push(best.r);
        var tx = best.c.ax === 'start' ? best.x0 : best.c.ax === 'middle' ? best.x0 + w / 2 : best.x0 + w;
        q.lines.forEach(function(ln, i){
          label(tx, best.y0 + 10 + i * 13, ln.t, { anchor: best.c.ax, mono: ln.mono, bold: ln.bold, fill: ln.fill, res: ln.res, id: q.id, size: ln.size });
        });
      });
    }
    // Calm by default: a bus or branch takes colour only as it nears a limit,
    // and red only past one.
    function vColour(v){
      if(!isFinite(v)) return C.text;
      if(v < vmin - 1e-9 || v > vmax + 1e-9) return C.neg;
      var dev = Math.abs(v - 1) / Math.max(1e-6, v < 1 ? 1 - vmin : vmax - 1);
      return mix(C.text, C.warn, clamp((dev - 0.6) / 0.4, 0, 1));
    }
    function lColour(load){
      if(!isFinite(load)) return C.text;
      if(load > lmax + 1e-9) return C.neg;
      return mix(C.text, C.warn, clamp((load / lmax - 0.6) / 0.4, 0, 1));
    }
    var limitMark = function(over){ return over ? (over > 0 ? ' ▲' : ' ▼') : ''; };

    // Flow lanes: each half of a branch carries its own end's direction.
    var maxP = 1e-9, maxQ = 1e-9;
    if(ok){
      Object.keys(res.br).forEach(function(id){
        var r = res.br[id];
        maxP = Math.max(maxP, Math.abs(r.p0) || 0, Math.abs(r.p1) || 0);
        if(ac) maxQ = Math.max(maxQ, Math.abs(r.q0) || 0, Math.abs(r.q1) || 0);
      });
      Object.keys(res.dev).forEach(function(id){
        var r = res.dev[id];
        maxP = Math.max(maxP, Math.abs(r.p) || 0);
        if(ac) maxQ = Math.max(maxQ, Math.abs(r.q) || 0);
      });
    }
    function speed(f, max){
      var a = Math.abs(f);
      if(!isFinite(a) || a < Math.max(1e-6, max * 0.005)) return 0;
      return clamp(Math.ceil(6 * a / max), 1, 6);
    }
    // A lane runs the way its flow goes, P on one side of the route and Q on the other.
    function addLane(pts, kind, f, forward, max, id){
      var n = speed(f, max);
      if(!n || pts.length < 2) return null;
      var ofs = offset(pts, kind === 'p' ? -LANE_OFS : LANE_OFS);
      var lane = laneOf(forward ? ofs : ofs.slice().reverse(), kind, n, kind === 'p' ? C.p : C.q, id);
      if(lane.len < 1) return null;
      lanes.push(lane);
      return lane;
    }
    /* Where both halves of a branch carry a flow the same way at the same speed,
       the arrows run on from one half into the other instead of fading out at
       the middle and in again. */
    function joinHalves(a, b, forward){
      if(!a || !b || a.n !== b.n) return;
      var up = forward ? a : b, down = forward ? b : a;
      up.fadeOut = false; down.fadeIn = false; down.at = up.len;
    }

    /* Branches */
    model.el.forEach(function(e){
      if(!LF.BRANCH[e.c] || !L.br[e.id]) return;
      var g = L.br[e.id], r = ok ? res.br[e.id] : null;
      var d = pathD(g.pts);
      g.pts.forEach(function(p){ grow(p[0], p[1]); });
      var col = C.text, w = 2;
      if(r && (by === 'loading' || by === 'both') && e.c !== 'Link'){
        col = lColour(r.load);
        w = 1.6 + 3.4 * clamp((isFinite(r.load) ? r.load : 0) / Math.max(lmax, 1), 0, 1.5) / 1.5;
      }
      if(e.c === 'Link'){
        // AC/DC converter, dash-dot DC line, DC/AC converter: each converter sits a
        // short AC tail from its bus, so a link never reads as an AC line.
        var len = routeLen(g.pts), cd = Math.min(CONV_D, len / 4);
        var c0 = pointAt(g.pts, cd), c1 = pointAt(g.pts, len - cd);
        var lnk = ' fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round"';
        base += '<g data-id="' + e.id + '">' +
                '<path d="' + pathD(cut(g.pts, 0, cd)) + '"' + lnk + '/>' +
                '<path d="' + pathD(cut(g.pts, len - cd, len)) + '"' + lnk + '/>' +
                '<path d="' + pathD(cut(g.pts, cd, len - cd)) + '"' + lnk + ' stroke-dasharray="10 3 2 3"/>' +
                converter(c0.x, c0.y, c0.ux, c0.uy, col, C.bg) + converter(c1.x, c1.y, -c1.ux, -c1.uy, col, C.bg) + '</g>';
        [c0, c1].forEach(function(c){ grow(c.x - CONV_S, c.y - CONV_S); grow(c.x + CONV_S, c.y + CONV_S); });
      } else {
        base += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + r1(w) + '" stroke-linejoin="round" stroke-linecap="round" data-id="' + e.id + '"/>';
      }
      if(e.c === 'Transformer'){
        // Two overlapping windings: both discs hide the line, then both rings.
        var o = 5.5, tw = '';
        [-1, 1].forEach(function(k){ tw += '<circle cx="' + r1(g.mx + k * o * g.ux) + '" cy="' + r1(g.my + k * o * g.uy) + '" r="8.5" fill="' + C.bg + '"/>'; });
        [-1, 1].forEach(function(k){ tw += '<circle cx="' + r1(g.mx + k * o * g.ux) + '" cy="' + r1(g.my + k * o * g.uy) + '" r="8.5" fill="none" stroke="' + col + '" stroke-width="1.8"/>'; });
        base += '<g data-id="' + e.id + '">' + tw + '</g>';
      }
      // Results along it.
      if(r){
        var hv = halves(g.pts, g);
        // A link's arrows run on its DC line only, clear of the converters.
        if(e.c === 'Link' && cd + CONV_S + 2 < len / 2) hv = [cut(g.pts, cd + CONV_S + 2, len / 2), cut(g.pts, len / 2, len - cd - CONV_S - 2)];
        var halfLanes = function(kind, f0, f1, max){
          var a = addLane(hv[0], kind, f0, f0 > 0, max, e.id), b = addLane(hv[1], kind, f1, f1 < 0, max, e.id);
          if((f0 > 0) === (f1 < 0)) joinHalves(a, b, f0 > 0);
        };
        halfLanes('p', r.p0, r.p1, maxP);
        if(ac && e.c !== 'Link') halfLanes('q', r.q0, r.q1, maxQ);
      }
      // Labels beside the middle of the route.
      var lines = [];
      if(shows(e, display, 'name')) lines.push({ t: LF.nameOf(e), bold: true });
      if(r){
        var send = r.p0 >= 0 ? 0 : 1;
        var P = send ? r.p1 : r.p0, Q = send ? r.q1 : r.q0;
        var over = isFinite(r.load) && r.load > lmax + 1e-9;
        if(shows(e, display, 'p')) lines.push({ t: F.p(Math.abs(P)) + ' MW', mono: true, res: true });
        if(ac && shows(e, display, 'q') && isFinite(Q)) lines.push({ t: F.p(Q) + ' MVAr', mono: true, res: true });
        if(shows(e, display, 's') && isFinite(r.s)) lines.push({ t: F.p(r.s) + ' MVA', mono: true, res: true });
        if(shows(e, display, 'load') && isFinite(r.load)) lines.push({ t: F.pctl(r.load, lmax) + '%' + (over ? ' ▲' : ''), mono: true, res: true, fill: over ? C.neg : null });
        if(shows(e, display, 'loss') && isFinite(r.loss)) lines.push({ t: 'loss ' + F.p(r.loss) + ' MW', mono: true, res: true });
        if(shows(e, display, 'i') && isFinite(r.i)) lines.push({ t: F.ka(r.i) + ' kA', mono: true, res: true });
        if(shows(e, display, 'tap') && isFinite(r.tap)) lines.push({ t: 'tap ' + F.v(r.tap), mono: true, res: true });
      }
      var horiz = Math.abs(g.ux) > Math.abs(g.uy);
      var off = e.c === 'Transformer' ? 17 : 8;
      want(lines, horiz ? [
        { x: g.mx, y: g.my - off, ax: 'middle', ay: 'bottom' }, { x: g.mx, y: g.my + off, ax: 'middle', ay: 'top' },
        { x: g.mx + 34, y: g.my - off, ax: 'middle', ay: 'bottom' }, { x: g.mx - 34, y: g.my - off, ax: 'middle', ay: 'bottom' },
        { x: g.mx + 34, y: g.my + off, ax: 'middle', ay: 'top' }, { x: g.mx - 34, y: g.my + off, ax: 'middle', ay: 'top' }
      ] : [
        { x: g.mx + off, y: g.my, ax: 'start', ay: 'middle' }, { x: g.mx - off, y: g.my, ax: 'end', ay: 'middle' },
        { x: g.mx + off, y: g.my - 28, ax: 'start', ay: 'middle' }, { x: g.mx + off, y: g.my + 28, ax: 'start', ay: 'middle' },
        { x: g.mx - off, y: g.my - 28, ax: 'end', ay: 'middle' }, { x: g.mx - off, y: g.my + 28, ax: 'end', ay: 'middle' }
      ], e.id, 2);
      for(var si = 1; si < g.pts.length; si++) segOb(g.pts[si - 1], g.pts[si], 5, 1.5);
      if(e.c === 'Transformer') ob(g.mx - 15, g.my - 15, 30, 30, 6);
      if(e.c === 'Link') [c0, c1].forEach(function(c){ ob(c.x - 12, c.y - 12, 24, 24, 6); });
    });

    /* Devices */
    model.el.forEach(function(e){
      if(!LF.DEVICE[e.c] || !L.dev[e.id]) return;
      var g = L.dev[e.id], r = ok ? res.dev[e.id] : null;
      var col = g.free ? C.muted : C.text;
      var dash = g.free ? ' stroke-dasharray="3 3"' : '';
      var ux = g.d[0], uy = g.d[1], vx = -uy, vy = ux;
      var P = function(u, v){ return r1(g.px + ux * u + vx * v) + ' ' + r1(g.py + uy * u + vy * v); };
      // One stroke-width per element: SVG files are strict XML.
      var strokeW = function(w){ return ' fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + dash; };
      var stroke = strokeW(1.8);
      var s = '';
      if(!g.free) s += '<path d="M' + P(0, 0) + 'L' + P(22, 0) + '"' + stroke + '/>';
      if(e.c === 'Generator' && e.grid === 1){
        // An external grid: a hatched square.
        s += '<rect x="' + r1(g.cx - 11) + '" y="' + r1(g.cy - 11) + '" width="22" height="22" rx="1.5" fill="' + C.bg + '" stroke="' + col + '" stroke-width="1.8"' + dash + '/>' +
             '<path d="M' + r1(g.cx - 11) + ' ' + r1(g.cy + 3) + 'l8 -8M' + r1(g.cx - 11) + ' ' + r1(g.cy + 11) + 'l22 -22M' + r1(g.cx - 3) + ' ' + r1(g.cy + 11) + 'l14 -14M' + r1(g.cx + 5) + ' ' + r1(g.cy + 11) + 'l6 -6M' + r1(g.cx - 11) + ' ' + r1(g.cy - 5) + 'l6 -6"' + strokeW(1.1) + '/>';
      } else if(e.c === 'Generator' && e.style === 'pv'){
        // A solar panel: a square of cells.
        s += '<rect x="' + r1(g.cx - 11) + '" y="' + r1(g.cy - 11) + '" width="22" height="22" rx="1.5" fill="' + C.bg + '" stroke="' + col + '" stroke-width="1.8"' + dash + '/>' +
             '<path d="M' + r1(g.cx - 11) + ' ' + r1(g.cy - 3.7) + 'h22M' + r1(g.cx - 11) + ' ' + r1(g.cy + 3.7) + 'h22M' + r1(g.cx) + ' ' + r1(g.cy - 11) + 'v22"' + strokeW(1.1) + '/>';
      } else if(e.c === 'Generator' && e.style === 'wind'){
        // A wind turbine: a three-bladed rotor in the generator's circle.
        var blades = '';
        [-90, 30, 150].forEach(function(deg){
          var a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
          // Each blade a slim leaf from the hub, wider near its root.
          var tip = [g.cx + 8.5 * c, g.cy + 8.5 * sn], root = [g.cx + 1.8 * c, g.cy + 1.8 * sn];
          var w = [-sn * 1.9, c * 1.9], mid = [g.cx + 4 * c, g.cy + 4 * sn];
          blades += 'M' + r1(root[0]) + ' ' + r1(root[1]) + 'L' + r1(mid[0] + w[0]) + ' ' + r1(mid[1] + w[1]) + 'L' + r1(tip[0]) + ' ' + r1(tip[1]) + 'L' + r1(mid[0] - w[0] * 0.4) + ' ' + r1(mid[1] - w[1] * 0.4) + 'Z';
        });
        s += '<circle cx="' + r1(g.cx) + '" cy="' + r1(g.cy) + '" r="11" fill="' + C.bg + '" stroke="' + col + '" stroke-width="1.8"' + dash + '/>' +
             '<path d="' + blades + '" fill="' + col + '" stroke="' + col + '" stroke-width="0.8" stroke-linejoin="round"/>' +
             '<circle cx="' + r1(g.cx) + '" cy="' + r1(g.cy) + '" r="1.7" fill="' + C.bg + '" stroke="' + col + '" stroke-width="1.2"/>';
      } else if(e.c === 'Generator'){
        s += '<circle cx="' + r1(g.cx) + '" cy="' + r1(g.cy) + '" r="11" fill="' + C.bg + '" stroke="' + col + '" stroke-width="1.8"' + dash + '/>' +
             '<path d="M' + r1(g.cx - 6.5) + ' ' + r1(g.cy) + 'q3.25 -6.5 6.5 0t6.5 0"' + strokeW(1.6) + '/>';
      } else if(e.c === 'Load'){
        s += '<path d="M' + P(22, 0) + 'L' + P(26, 0) + '"' + stroke + '/>' +
             '<path d="M' + P(36, 0) + 'L' + P(24, -7) + 'L' + P(24, 7) + 'Z" fill="' + col + '" stroke="' + col + '" stroke-width="1.2" stroke-linejoin="round"/>';
      } else if(e.c === 'ShuntImpedance'){
        s += '<path d="M' + P(22, -9) + 'L' + P(22, 9) + 'M' + P(27, -9) + 'L' + P(27, 9) + 'M' + P(27, 0) + 'L' + P(33, 0) +
             'M' + P(33, -7) + 'L' + P(33, 7) + 'M' + P(36, -4.5) + 'L' + P(36, 4.5) + 'M' + P(39, -2) + 'L' + P(39, 2) + '"' + stroke + '/>';
      } else if(e.c === 'StorageUnit'){
        s += '<path d="M' + P(22, -11) + 'L' + P(38, -11) + 'L' + P(38, 11) + 'L' + P(22, 11) + 'Z" fill="' + C.bg + '" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round"' + dash + '/>' +
             '<path d="M' + P(27, -7) + 'L' + P(27, 7) + 'M' + P(32, -3.5) + 'L' + P(32, 3.5) + '"' + strokeW(2.4) + '/>';
      }
      base += '<g data-id="' + e.id + '">' + s + '</g>';
      var far = e.c === 'Load' ? 36 : e.c === 'ShuntImpedance' ? 39 : e.c === 'StorageUnit' ? 38 : 33;
      grow(g.px, g.py); grow(g.px + ux * far + vx * 12, g.py + uy * far + vy * 12); grow(g.px + ux * far - vx * 12, g.py + uy * far - vy * 12);
      if(r && !g.free){
        // Along the stub: + is power into the bus for a source, out of it for a load or shunt draw.
        var pin = e.c === 'Load' ? -r.p : e.c === 'ShuntImpedance' ? -r.p : r.p;
        var qin = e.c === 'Load' ? -r.q : r.q;
        var stub = [[g.sx, g.sy], [g.px, g.py]];
        addLane(stub, 'p', pin, pin > 0, maxP, e.id);
        if(ac) addLane(stub, 'q', qin, qin > 0, maxQ, e.id);
      }
      var lines = [];
      if(shows(e, display, 'name')) lines.push({ t: LF.nameOf(e), bold: true });
      if(r){
        if(shows(e, display, 'p') && !(e.c === 'ShuntImpedance' && Math.abs(r.p) < 1e-12)) lines.push({ t: F.p(r.p) + ' MW', mono: true, res: true });
        if(ac && shows(e, display, 'q')) lines.push({ t: F.p(r.q) + ' MVAr', mono: true, res: true });
        if(ac && shows(e, display, 'pf')) lines.push({ t: 'cos φ ' + F.pf(r.p, r.q), mono: true, res: true });
      }
      var cx = g.free ? g.cx : g.px + ux * (22 + 11), cy = g.free ? g.cy : g.py + uy * (22 + 11);
      var reach = far - 22;
      ob(cx - 13, cy - 13, 26, 26, 6);
      if(!g.free) segOb([g.px, g.py], [g.sx, g.sy], 4, 2);
      want(lines, uy !== 0 || g.free ? [
        { x: cx + 16, y: cy, ax: 'start', ay: 'middle' }, { x: cx - 16, y: cy, ax: 'end', ay: 'middle' },
        { x: cx, y: cy + uy * (reach + 4), ax: 'middle', ay: uy > 0 ? 'top' : 'bottom' }
      ] : [
        { x: cx, y: cy + 16, ax: 'middle', ay: 'top' }, { x: cx, y: cy - 16, ax: 'middle', ay: 'bottom' },
        { x: cx + ux * (reach + 4), y: cy, ax: ux > 0 ? 'start' : 'end', ay: 'middle' }
      ], e.id, 1);
    });

    /* Bus bars, drawn last so branches meet them cleanly */
    model.el.forEach(function(e){
      if(e.c !== 'Bus') return;
      var g = L.bus[e.id], r = ok ? res.bus[e.id] : null;
      var col = C.text;
      if(r && (by === 'voltage' || by === 'both')) col = vColour(r.v);
      if(g.node) base += '<circle cx="' + r1(g.cx) + '" cy="' + r1(g.cy) + '" r="' + NODE_R + '" fill="' + col + '" data-id="' + e.id + '"/>';
      else base += '<path d="M' + r1(g.x1) + ' ' + r1(g.y1) + 'L' + r1(g.x2) + ' ' + r1(g.y2) + '" stroke="' + col + '" stroke-width="5" stroke-linecap="round" data-id="' + e.id + '"/>';
      var gr = g.node ? NODE_R : 3;
      grow(g.x1 - gr, g.y1 - gr); grow(g.x2 + gr, g.y2 + gr);
      var lines = [];
      if(shows(e, display, 'name')) lines.push({ t: LF.nameOf(e), bold: true });
      if(r){
        var outV = ac && (r.v < vmin - 1e-9 ? -1 : r.v > vmax + 1e-9 ? 1 : 0);
        var vparts = [];
        if(ac && shows(e, display, 'vpu')) vparts.push(F.vl(r.v, vmin, vmax) + ' pu');
        if(ac && shows(e, display, 'vkv')) vparts.push(F.kv(r.vkv) + ' kV');
        if(vparts.length) lines.push({ t: vparts.join('  ') + limitMark(outV), mono: true, res: true, fill: outV ? C.neg : null });
        if(shows(e, display, 'ang')) lines.push({ t: '∠ ' + F.ang(r.ang) + '°', mono: true, res: true });
        if(shows(e, display, 'p') && isFinite(r.p)) lines.push({ t: 'P ' + F.p(r.p) + ' MW', mono: true, res: true });
        if(ac && shows(e, display, 'q') && isFinite(r.q)) lines.push({ t: 'Q ' + F.p(r.q) + ' MVAr', mono: true, res: true });
      } else if(!ok && shows(e, display, 'vkv')){
        lines.push({ t: e.v_nom + ' kV', mono: true, fill: C.muted });
      }
      ob(Math.min(g.x1, g.x2) - 5, Math.min(g.y1, g.y2) - 5, Math.abs(g.x2 - g.x1) + 10, Math.abs(g.y2 - g.y1) + 10, 6);
      want(lines, g.v ? [
        { x: g.x1, y: g.y2 + 10, ax: 'middle', ay: 'top' }, { x: g.x1, y: g.y1 - 10, ax: 'middle', ay: 'bottom' },
        { x: g.x1 + 9, y: g.y2, ax: 'start', ay: 'bottom' }, { x: g.x1 - 9, y: g.y2, ax: 'end', ay: 'bottom' },
        { x: g.x1 + 9, y: g.y1, ax: 'start', ay: 'top' }, { x: g.x1 - 9, y: g.y1, ax: 'end', ay: 'top' }
      ] : [
        { x: g.x2 + 10, y: g.y1 - 9, ax: 'start', ay: 'top' }, { x: g.x1 - 10, y: g.y1 - 9, ax: 'end', ay: 'top' },
        { x: g.x2, y: g.y1 - 8, ax: 'end', ay: 'bottom' }, { x: g.x2, y: g.y1 + 8, ax: 'end', ay: 'top' },
        { x: g.x1, y: g.y1 - 8, ax: 'start', ay: 'bottom' }, { x: g.x1, y: g.y1 + 8, ax: 'start', ay: 'top' }
      ], e.id, 0);
    });

    placeLabels();
    if(!isFinite(minX)){ minX = 0; minY = 0; maxX = 400; maxY = 200; }
    return { base: base, lanes: lanes, labels: labels, bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, colours: C };
  };

  /* ── SVG text for a list of labels ── */
  LF.labelSvg = function(labels, C, filter){
    var s = '';
    labels.forEach(function(l){
      if(filter && !filter(l)) return;
      s += '<text x="' + r1(l.x) + '" y="' + r1(l.y) + '"' + (l.anchor !== 'start' ? ' text-anchor="' + l.anchor + '"' : '') +
        ' font-family="' + (l.mono ? "'DM Mono',ui-monospace,monospace" : "'DM Sans',system-ui,sans-serif") + '"' +
        ' font-size="' + l.size + '"' + (l.bold ? ' font-weight="700"' : (l.mono ? ' font-weight="500"' : '')) +
        ' fill="' + l.fill + '" stroke="' + C.bg + '" stroke-width="3" stroke-linejoin="round" paint-order="stroke"' +
        (l.id !== undefined ? ' data-id="' + l.id + '"' : '') + '>' + esc(l.t) + '</text>';
    });
    return s;
  };
  /* ── Flow lanes: a stream of arrows ──
     Every mark on a lane is an arrow pointing the way its power flows, so a
     still picture reads as well as the moving one: a solid arrow for active
     power, an open chevron for reactive. The arrows sit one period (12 px)
     apart and move one period per FLOW_T / n seconds; each rides the lane with
     SMIL, turning its corners, and fades in where the lane starts and out where
     it ends (except where it runs on into the next half of its branch). The
     PNG and GIF exports place them with laneGlyphs, from the same clock. */
  var GAP = 12, FADE = 5, LANE_OFS = 4.2;
  LF.FLOW_T = 1.6; // seconds for the slowest lane to move one period
  // Each arrow points along +x around its own middle.
  LF.GLYPH = {
    p: { d: 'M3.9 0L-0.2 -3.1L-0.2 -1L-4 -1L-4 1L-0.2 1L-0.2 3.1Z', fill: true, width: 0.6 },
    q: { d: 'M-1.6 -2.8L1.6 0L-1.6 2.8', fill: false, width: 1.8 }
  };
  LF.glyphPaint = function(kind, col){
    var gl = LF.GLYPH[kind];
    return (gl.fill ? 'fill="' + col + '"' : 'fill="none"') + ' stroke="' + col + '" stroke-width="' + gl.width + '" stroke-linecap="round" stroke-linejoin="round"';
  };
  // A lane along pts (in the order the flow goes), moving at speed step n (1–6).
  function laneOf(pts, kind, n, color, id){
    pts = pts.map(function(p){ return [r1(p[0]), r1(p[1])]; });
    var len = 0;
    for(var i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    // at: how far the stream has come before this lane, so it runs on from the lane before.
    return { pts: pts, d: pathD(pts), len: len, kind: kind, n: n, at: 0, fadeIn: true, fadeOut: true, color: color, id: id };
  }
  // The key's lane: a short run of arrows from x to x + w.
  LF.keyLane = function(kind, x, y, w, color){ return laneOf([[x, y], [x + w, y]], kind, 2, color); };
  function mod(a, b){ return ((a % b) + b) % b; }
  function r6(x){ return Math.round(x * 1e6) / 1e6; }
  function fadeOf(l, s){
    var F = Math.min(FADE, l.len / 2), o = 1;
    if(l.fadeIn) o = Math.min(o, s / F);
    if(l.fadeOut) o = Math.min(o, (l.len - s) / F);
    return Math.max(0, Math.min(1, o));
  }
  // Where an arrow s along a lane is, and which way it points (a, radians).
  function laneAt(l, s){
    var s0 = 0;
    for(var k = 0; ; k++){
      var a = l.pts[k], b = l.pts[k + 1], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if(s <= s0 + sl || k >= l.pts.length - 2){
        var f = sl ? (s - s0) / sl : 0;
        return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
      }
      s0 += sl;
    }
  }
  // The arrows on a lane at a moment t (seconds): where each one is, which way it points and how faded.
  LF.laneGlyphs = function(l, t){
    var out = [], v = GAP * l.n / LF.FLOW_T;
    for(var s = mod(v * t - l.at, GAP); s <= l.len; s += GAP){
      var g = laneAt(l, s);
      g.o = fadeOf(l, s);
      out.push(g);
    }
    return out;
  };
  /* An arrow's opacity over its cycle, as keyTimes and values: it is visible
     while it travels the lane (fading at the ends that fade) and hidden for the
     rest of the cycle, while the arrows behind it close the gap. Null when it is
     never hidden or faded. */
  function fadeKeys(l, W){
    var F = Math.min(FADE, l.len / 2), end = l.len / W, full = end > 0.9999, k = [];
    if(full && !l.fadeIn && !l.fadeOut) return null;
    var r5 = function(t){ return Math.min(1, Math.round(t * 1e5) / 1e5); };
    var add = function(t, o){
      var last = k[k.length - 1];
      t = r5(t);
      if(last && t <= last[0]){ if(o === last[1]) return; t = r5(last[0] + 1e-5); }
      k.push([t, o]);
    };
    if(l.fadeIn){ add(0, 0); add(F / W, 1); } else add(0, 1);
    if(l.fadeOut){ add((l.len - F) / W, 1); add(end, 0); }
    else if(!full){ add(end, 1); add(end + 1e-4, 0); }
    add(1, k[k.length - 1][1]);
    return { times: k.map(function(p){ return p[0]; }).join(';'), values: k.map(function(p){ return p[1]; }).join(';') };
  }
  /* One group per lane, painted once; its arrows inside. With still, each arrow
     also stands where it is at time 0, for an exported file opened somewhere
     that does not play SMIL; where SMIL plays, the motion takes its place. */
  LF.laneSvg = function(lanes, still){
    var s = '';
    lanes.forEach(function(l){
      var N = Math.max(1, Math.ceil(l.len / GAP - 1e-6)), W = N * GAP;
      var tp = LF.FLOW_T / l.n, D = N * tp, v = GAP / tp, end = l.len / W;
      var motion = end < 0.9999 ? ' keyPoints="0;1;1" keyTimes="0;' + Math.round(end * 1e5) / 1e5 + ';1"' : ' keyPoints="0;1" keyTimes="0;1"';
      var op = fadeKeys(l, W);
      s += '<g class="fl fl-' + l.kind + '" ' + LF.glyphPaint(l.kind, l.color) + (l.id !== undefined ? ' data-id="' + l.id + '"' : '') + '>';
      for(var j = 0; j < N; j++){
        // Arrow j starts its cycle where the stream puts it at time 0.
        var timing = ' dur="' + r6(D) + 's" begin="' + r6(mod((l.at - GAP * j) / v, D) - D) + 's" repeatCount="indefinite"';
        var base = '', hold = '';
        if(still){
          var s0 = mod(GAP * j - l.at, W), g = laneAt(l, Math.min(s0, l.len)), o = s0 <= l.len ? fadeOf(l, s0) : 0;
          base = ' transform="translate(' + r1(g.x) + ' ' + r1(g.y) + ') rotate(' + r1(g.a * 180 / Math.PI) + ')"' + (o < 1 ? ' opacity="' + Math.round(o * 100) / 100 + '"' : '');
          hold = '<animateTransform attributeName="transform" type="translate" from="0 0" to="0 0" dur="1s" fill="freeze"/>';
        }
        s += '<path d="' + LF.GLYPH[l.kind].d + '"' + base + '>' + hold + '<animateMotion path="' + l.d + '" rotate="auto" calcMode="linear"' + motion + timing + '/>' +
          (op ? '<animate attributeName="opacity" calcMode="linear" values="' + op.values + '" keyTimes="' + op.times + '"' + timing + '/>' : '') + '</path>';
      }
      s += '</g>';
    });
    return s;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
