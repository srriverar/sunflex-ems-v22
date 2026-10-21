/* ED/UC Simulator: hourly profiles from a file, and the template to fill in.

   No DOM here. The page loads this file the first time a template or a file
   is asked for, and the audit loads it in Node. A spreadsheet arrives as rows
   of cells (CSV text through ED.csvRows, an Excel sheet through ED.sheetRows,
   which takes SheetJS), and ED.readProfiles matches the rows to the network:

   - one column holds the date and time of each row, so a row lands on the
     hour of the horizon it names, whatever order the file is in;
   - rows outside the horizon are left out (the file can hold a whole year);
   - a file that misses any hour of the horizon is turned away, naming it;
   - every other column is a load or a generator, by its name as the
     template writes it ("Load B [p.u.]"), per unit of the peak demand or
     the rating, or in MW or % when its header says so;
   - a column with values gives its element every hour of the horizon (it
     becomes Custom); a blank cell takes that hour from the element's shape,
     and a column left out or left empty leaves the element as it is.

   What it gives back is a list of changes to make. Nothing is changed when
   anything is wrong, so a file is applied whole or not at all. */
(function(root){
  'use strict';
  var ED = root.ED;
  var HOUR = 3600000;
  function two(n){ return (n < 10 ? '0' : '') + n; }
  function r6(x){ return Math.round(x * 1e6) / 1e6; }
  function r4(x){ return Math.round(x * 1e4) / 1e4; }
  function fmt(x){ return (Math.round(x * 10) / 10).toLocaleString('en-AU'); }
  // A date and time as the template writes it, and as Excel reads it back.
  function isoSpace(ms){ var d = new Date(ms); return d.getUTCFullYear() + '-' + two(d.getUTCMonth() + 1) + '-' + two(d.getUTCDate()) + ' ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()); }
  ED.ROW_LIMIT = 200000;

  /* ── CSV text into rows of cells ──
     The delimiter is whichever of comma, semicolon and tab the header row
     uses most; a file that uses a semicolon or a tab may write 0,85 for 0.85. */
  ED.csvRows = function(text){
    text = String(text || '').replace(/^﻿/, '');
    var first = '', i0 = 0;
    while(i0 < text.length && !first.trim()){ var nl = text.indexOf('\n', i0); if(nl < 0) nl = text.length; first = text.slice(i0, nl); i0 = nl + 1; }
    var bare = first.replace(/"[^"]*"/g, '');
    var count = function(c){ return bare.split(c).length - 1; };
    var delim = ',', best = count(',');
    if(count(';') > best){ delim = ';'; best = count(';'); }
    if(count('\t') > best){ delim = '\t'; }
    var rows = [];
    if(text.indexOf('"') < 0){
      // The quick path: nothing quoted.
      var lines = text.split(/\r\n|\n|\r/);
      for(var k = 0; k < lines.length && rows.length <= ED.ROW_LIMIT; k++) rows.push(lines[k].split(delim));
    } else {
      var row = [], cell = '', q = false, n = text.length;
      for(var i = 0; i < n; i++){
        var c = text[i];
        if(q){
          if(c === '"'){ if(text[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
          else cell += c;
        } else if(c === '"') q = true;
        else if(c === delim){ row.push(cell); cell = ''; }
        else if(c === '\n' || c === '\r'){
          if(c === '\r' && text[i + 1] === '\n') i++;
          row.push(cell); rows.push(row); row = []; cell = '';
          if(rows.length > ED.ROW_LIMIT) break;
        } else cell += c;
      }
      if(cell !== '' || row.length) { row.push(cell); rows.push(row); }
    }
    return { rows: rows, decimalComma: delim !== ',' };
  };

  /* ── An Excel workbook into rows of cells, through SheetJS ──
     A cell formatted as a date comes back as its date and time, read from the
     serial number itself, so no time zone or daylight saving can move it.
     The sheet named for profiles is read if there is one, else the first. */
  ED.sheetRows = function(XLSX, data){
    var wb = XLSX.read(data, { type: 'array', cellNF: true, cellDates: false, cellText: false });
    var names = wb.SheetNames || [];
    var name = names.filter(function(n){ return /profile/i.test(n); })[0] || names[0];
    var ws = name && wb.Sheets[name];
    if(!ws || !ws['!ref']) return { rows: [], decimalComma: false, sheet: name || '' };
    var d1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    var rg = XLSX.utils.decode_range(ws['!ref']);
    var R1 = Math.min(rg.e.r, rg.s.r + ED.ROW_LIMIT), rows = [];
    var colName = [];
    for(var C = rg.s.c; C <= rg.e.c; C++) colName.push(XLSX.utils.encode_col(C));
    for(var R = rg.s.r; R <= R1; R++){
      var row = [], rn = String(R + 1);
      for(var j = 0; j < colName.length; j++){
        var cell = ws[colName[j] + rn], v = '';
        if(cell){
          if(cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) v = ED.serialText(cell.v, d1904);
          else if(cell.t === 'd' && cell.v instanceof Date) v = isoSpace(Date.UTC(cell.v.getFullYear(), cell.v.getMonth(), cell.v.getDate(), cell.v.getHours(), cell.v.getMinutes(), cell.v.getSeconds()));
          else if(cell.t === 'n') v = cell.v;
          else if(cell.t === 's' || cell.t === 'str') v = String(cell.v);
          else if(cell.t === 'e') v = String(cell.w || '#ERROR');
          else if(cell.t === 'b') v = cell.v ? 1 : 0;
        }
        row.push(v);
      }
      rows.push(row);
    }
    return { rows: rows, decimalComma: false, sheet: name };
  };
  // An Excel serial number (days from 1900, or 1904) as "YYYY-MM-DD HH:MM:SS", to the second.
  ED.serialMs = function(serial, d1904){ return Math.round(((serial + (d1904 ? 1462 : 0)) - 25569) * 86400) * 1000; };
  ED.serialText = function(serial, d1904){
    var ms = ED.serialMs(serial, d1904), d = new Date(ms);
    return isFinite(ms) ? isoSpace(ms) + ':' + two(d.getUTCSeconds()) : '';
  };
  ED.msSerial = function(ms){ return ms / 86400000 + 25569; };

  /* ── Reading a cell ── */
  // A number, written as a number, a percentage, or with thousands separated.
  function cellNum(x, dc){
    if(typeof x === 'number') return isFinite(x) ? x : NaN;
    if(typeof x !== 'string') return NaN;
    var s = x.trim().replace(/[\s  ']/g, '');
    if(!s) return NaN;
    var pct = s.charAt(s.length - 1) === '%';
    if(pct) s = s.slice(0, -1);
    // With both marks the last one is the decimal: 1.234,5 written with a decimal comma, 1,234.5 without.
    if(dc && s.indexOf(',') >= 0 && !(s.lastIndexOf('.') > s.lastIndexOf(','))) s = s.replace(/\./g, '').replace(',', '.');
    else if(/^[-+]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) s = s.replace(/,/g, '');
    if(!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    var v = parseFloat(s);
    return pct ? v / 100 : v;
  }
  ED.cellNum = cellNum;
  function blank(x){ return x === undefined || x === null || (typeof x === 'string' && !x.trim()); }

  /* A date and time, in any of the ways a spreadsheet tends to write one:
     2026-01-31 18:00, 2026/01/31T18:00:00, 31/01/2026 18:00, 1/31/2026 6:00 PM,
     31-Jan-2026 18:00, Jan 31 2026 18:00. Two numbers first is day first when
     dayFirst, month first otherwise; the column decides which (whenColumn).
     Gives the wall clock as UTC milliseconds, or NaN. A zone or an offset
     written after the time is not applied: the horizon has no time zone. */
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
              january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
              mei: 5, agu: 8, agt: 8, okt: 10, des: 12, agustus: 8, oktober: 10, desember: 12 };
  var RE_ISO = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s,]+(.*))?$/;
  var RE_NUM = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?:[T\s,]+(.*))?$/;
  var RE_DMONY = /^(\d{1,2})[-\s]([A-Za-z]{3,9})\.?[-\s,]+(\d{4}|\d{2})(?:[T\s,]+(.*))?$/;
  var RE_MONDY = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[T\s,]+(.*))?$/;
  var RE_TIME = /^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2})(?:\.\d+)?)?\s*([AaPp])?\.?(?:[Mm]\.?)?\s*(?:Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/;
  function at(y, mo, d, rest){
    var h = 0, mi = 0, s = 0;
    if(y < 100) y += 2000;
    if(rest !== undefined && rest !== null && String(rest).trim() !== ''){
      var t = RE_TIME.exec(String(rest).trim());
      if(!t) return NaN;
      h = +t[1]; mi = t[2] ? +t[2] : 0; s = t[3] ? +t[3] : 0;
      if(t[4]){ if(h < 1 || h > 12) return NaN; h = h % 12 + (/[Pp]/.test(t[4]) ? 12 : 0); }
      if(mi > 59 || s > 59 || h > 24 || (h === 24 && (mi || s))) return NaN;
    }
    if(mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return NaN;
    var ms = Date.UTC(y, mo - 1, d), dt = new Date(ms);
    if(dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
    return ms + h * HOUR + mi * 60000 + s * 1000; // 24:00 is midnight of the next day
  }
  ED.whenMs = function(x, dayFirst){
    if(typeof x !== 'string') return NaN;
    var s = x.trim(), m;
    if(!s) return NaN;
    if((m = RE_ISO.exec(s))) return at(+m[1], +m[2], +m[3], m[4]);
    if((m = RE_NUM.exec(s))) return dayFirst === false ? at(+m[3], +m[1], +m[2], m[4]) : at(+m[3], +m[2], +m[1], m[4]);
    if((m = RE_DMONY.exec(s)) && MON[m[2].toLowerCase()]) return at(+m[3], MON[m[2].toLowerCase()], +m[1], m[4]);
    if((m = RE_MONDY.exec(s)) && MON[m[1].toLowerCase()]) return at(+m[3], MON[m[1].toLowerCase()], +m[2], m[4]);
    return NaN;
  };
  /* A column of dates and times: day first or month first is settled by the
     column as a whole. Each reading is tried, and the one that parses more
     cells and steps more often by exactly one hour from row to row wins, so
     1/2/2026 is the 1st of February in a column that runs through February,
     and the 2nd of January in one that runs on from the 1st. */
  function whenColumn(cells){
    var tryOrder = function(dayFirst){
      var ms = new Array(cells.length), ok = 0, steps = 0, prev = NaN;
      for(var i = 0; i < cells.length; i++){
        var v = blank(cells[i]) ? NaN : ED.whenMs(cells[i], dayFirst);
        ms[i] = v;
        if(isFinite(v)){ ok++; if(v - prev === HOUR) steps++; prev = v; }
      }
      return { ms: ms, ok: ok, steps: steps, dayFirst: dayFirst };
    };
    var a = tryOrder(true);
    var ambiguous = cells.some(function(c){ return typeof c === 'string' && RE_NUM.test(c.trim()); });
    if(!ambiguous) return a;
    var b = tryOrder(false);
    return b.ok > a.ok || (b.ok === a.ok && b.steps > a.steps) ? b : a;
  }

  /* A header names an element and its unit: "Solar farm [p.u.]", "Load B (MW)",
     "Wind 7 %", or a name alone, per unit. "Load 5 #12" names element 12. */
  function headerOf(h){
    var s = String(h === undefined || h === null ? '' : h).replace(/\s+/g, ' ').trim(), unit = 'pu', m;
    if((m = /^(.*?)\s*[\[(]\s*(mw|%|p\.?\s?u\.?|per unit)\s*[\])]$/i.exec(s)) || (m = /^(.*?)\s+(mw|%|p\.u\.)$/i.exec(s))){
      var u = m[2].toLowerCase();
      unit = u === 'mw' ? 'mw' : u === '%' ? 'pct' : 'pu';
      s = m[1].trim();
    }
    var id = /\s*#(\d+)$/.exec(s);
    return { text: String(h || '').trim(), name: s.replace(/\s*#\d+$/, '').toLowerCase(), id: id ? +id[1] : null, unit: unit, full: s.toLowerCase() };
  }
  var DATE_HEAD = /date|time|stamp|period|interval|tanggal|waktu|jam/i;
  var UNIT_WORD = { pu: 'per unit', pct: 'in %', mw: 'in MW' };

  /* Read a file's rows against the network and the horizon.
     opts: { H, start, only: <element id> to read for one element }.
     Gives { errors: [...], changes: [{ id, ts, p_set? }], notes: [...], used }. */
  ED.readProfiles = function(table, model, opts){
    var rows = table && table.rows ? table.rows : [], dc = !!(table && table.decimalComma);
    var H = opts.H, start = ED.startMs(ED.parseStart(opts.start)), end = start + H * HOUR;
    var out = { errors: [], changes: [], notes: [], used: null };
    var fail = function(msg){ out.errors.push(msg); return out; };
    var targets = model.el.filter(function(e){ return (e.c === 'Load' || e.c === 'Generator') && (opts.only == null || e.id === opts.only); });
    if(!targets.length) return fail('There is no load or generator to give a profile to.');

    // The header is the first row with anything in it; blank rows are skipped.
    var r0 = 0;
    while(r0 < rows.length && rows[r0].every(blank)) r0++;
    if(r0 >= rows.length) return fail('The file is empty.');
    var head = rows[r0], data = [], lineNo = [];
    var width = head.length;
    // No header at all: the first row already has a date and a number in it.
    var isDate = function(c){ return typeof c === 'string' && (isFinite(ED.whenMs(c, true)) || isFinite(ED.whenMs(c, false))); };
    if(head.some(isDate) && head.some(function(c){ return !isDate(c) && !isNaN(cellNum(c, dc)); })){ head = head.map(function(){ return ''; }); r0--; }
    for(var r = r0 + 1; r < rows.length; r++){
      if(rows[r].every(blank)) continue;
      data.push(rows[r]); lineNo.push(r + 1);
      if(rows[r].length > width) width = rows[r].length;
    }
    if(!data.length) return fail('The file has a header row but no rows of values under it.');
    if(data.length > ED.ROW_LIMIT) return fail('The file has more than ' + ED.ROW_LIMIT.toLocaleString('en-AU') + ' rows. Keep the hours around the horizon.');
    var cellAt = function(i, j){ var row = data[i]; return j < row.length ? row[j] : ''; };

    // The date and time column: a column whose every cell is one, a named one first.
    var order = [];
    for(var j0 = 0; j0 < width; j0++) order.push(j0);
    order.sort(function(a, b){ return (DATE_HEAD.test(String(head[b] || '')) ? 1 : 0) - (DATE_HEAD.test(String(head[a] || '')) ? 1 : 0) || a - b; });
    var tcol = -1, when = null;
    for(var oi = 0; oi < order.length && tcol < 0; oi++){
      var j = order[oi], cells = [], filled = 0;
      for(var i = 0; i < data.length; i++){ var c = cellAt(i, j); cells.push(c); if(!blank(c)) filled++; }
      if(!filled) continue;
      var w = whenColumn(cells);
      if(w.ok === filled) { tcol = j; when = w; }
      else if(DATE_HEAD.test(String(head[j] || '')) && w.ok >= filled / 2){
        for(var bi = 0; bi < cells.length; bi++) if(!blank(cells[bi]) && !isFinite(w.ms[bi]))
          return fail('Row ' + lineNo[bi] + ' of the date and time column says “' + String(cells[bi]).slice(0, 40) + '”, which is not a date and time. Write them as the template does, 2026-01-31 18:00.');
      }
    }
    if(tcol < 0) return fail('No column of dates and times was found. Give every row its date and time in a column of its own, as the template does (2026-01-31 18:00), so its hours can be matched to the horizon.');

    // Each hour of the horizon must have exactly one row on the hour.
    var rowAt = new Array(H), minMs = Infinity, maxMs = -Infinity, offHour = -1, outside = 0;
    for(var k = 0; k < data.length; k++){
      var ms = when.ms[k];
      if(!isFinite(ms)) continue; // a blank date on a row of values is skipped below
      if(ms < minMs) minMs = ms;
      if(ms > maxMs) maxMs = ms;
      if(ms < start || ms >= end){ outside++; continue; }
      if(ms % HOUR){ if(offHour < 0) offHour = k; continue; }
      var t = (ms - start) / HOUR;
      if(rowAt[t] !== undefined) return fail('Rows ' + lineNo[rowAt[t]] + ' and ' + lineNo[k] + ' are both ' + ED.msLabel(ms) + '. Each hour needs one row; a clock change can repeat an hour, so write the file in a time without daylight saving.');
      rowAt[t] = k;
    }
    if(offHour >= 0){
      var gapMin = Math.round(Math.abs((when.ms[Math.min(offHour + 1, data.length - 1)] - when.ms[offHour])) / 60000) || 0;
      return fail('Row ' + lineNo[offHour] + ' is at ' + isoSpace(when.ms[offHour]) + ', not on the hour. The file needs one row an hour, on the hour' +
        (gapMin > 0 && gapMin < 60 ? ' (its rows are ' + gapMin + ' minutes apart: average them to hours first).' : '.'));
    }
    var span = 'The file runs from ' + ED.msLabel(minMs) + ' to ' + ED.msLabel(maxMs) + ', but the horizon runs from ' + ED.msLabel(start) + ' to ' + ED.msLabel(end - HOUR) + '.';
    if(minMs > start || maxMs < end - HOUR)
      return fail(span + ' It is ' + (minMs > start ? Math.round((minMs - start) / HOUR) + ' hour' + ((minMs - start) / HOUR === 1 ? '' : 's') + ' short at the start' : '') +
        (minMs > start && maxMs < end - HOUR ? ' and ' : '') + (maxMs < end - HOUR ? Math.round((end - HOUR - maxMs) / HOUR) + ' hour' + ((end - HOUR - maxMs) / HOUR === 1 ? '' : 's') + ' short at the end' : '') +
        '. Open a file that covers every hour of the horizon, or change the horizon to fit the file.');
    var missing = [];
    for(var t2 = 0; t2 < H; t2++) if(rowAt[t2] === undefined) missing.push(t2);
    if(missing.length)
      return fail('The file has no row for ' + ED.msLabel(start + missing[0] * HOUR) + (missing.length > 1 ? ' and ' + (missing.length - 1) + ' more hour' + (missing.length > 2 ? 's' : '') + ' of the horizon' : '') + '. Every hour of the horizon needs a row.');

    // The columns of values, matched to the network.
    var byName = {}, byId = {};
    var names = {};
    targets.forEach(function(e){ var n = ED.nameOf(e).replace(/\s+/g, ' ').trim().toLowerCase(); (byName[n] = byName[n] || []).push(e); byId[e.id] = e; names[e.id] = n; });
    var cols = [], unused = [];
    for(var jc = 0; jc < width; jc++){
      if(jc === tcol) continue;
      var hd = headerOf(head[jc]), any = false;
      for(var ti = 0; ti < H && !any; ti++) if(!blank(cellAt(rowAt[ti], jc))) any = true;
      if(!hd.text && !any) continue;
      var target = null, why = '';
      if(hd.id !== null && byId[hd.id] && (!hd.name || hd.name === names[hd.id])) target = byId[hd.id];
      else {
        var hit = byName[hd.full] || byName[hd.name] || [];
        if(hit.length === 1) target = hit[0];
        else if(hit.length > 1) why = 'more than one element has that name';
      }
      cols.push({ j: jc, hd: hd, e: target, any: any, why: why });
    }
    if(opts.only != null){
      var mine = cols.filter(function(c){ return c.e; });
      if(!mine.length){
        var filledCols = cols.filter(function(c){ return c.any; });
        if(filledCols.length === 1){ filledCols[0].e = targets[0]; mine = filledCols; }
        else return fail(filledCols.length ? 'The file has ' + filledCols.length + ' columns of values and none is named ' + ED.nameOf(targets[0]) + '. Name one after it, as the template does.' : 'The file has dates and times but no values beside them.');
      }
      cols = mine;
    }
    var seen = {};
    cols.forEach(function(c){
      if(!c.e){ unused.push('“' + (c.hd.text || 'column ' + (c.j + 1)) + '”' + (c.why ? ' (' + c.why + ')' : '')); return; }
      if(seen[c.e.id]){ out.errors.push('Two columns are for ' + ED.nameOf(c.e) + ': “' + seen[c.e.id] + '” and “' + c.hd.text + '”. Keep one.'); return; }
      seen[c.e.id] = c.hd.text || ED.nameOf(c.e);
      if(!c.any){ out.notes.push(ED.nameOf(c.e) + ' kept its profile: its column is empty.'); return; }
      var e = c.e, v = new Array(H), neg = 0, over = 0, peak = 0, gaps = 0;
      for(var t3 = 0; t3 < H; t3++){
        var raw = cellAt(rowAt[t3], c.j);
        // A blank cell is no value, not 0: that hour keeps the element's shape.
        if(blank(raw)){ v[t3] = NaN; gaps++; continue; }
        var x = cellNum(raw, dc);
        if(isNaN(x)){
          out.errors.push(ED.nameOf(e) + ': “' + String(raw).slice(0, 30) + '” is not a number at ' + ED.msLabel(start + t3 * HOUR) + ' (row ' + lineNo[rowAt[t3]] + ').');
          return;
        }
        if(c.hd.unit === 'pct') x = x / 100;
        if(x < 0){ neg++; x = 0; }
        if(x > peak) peak = x;
        v[t3] = x;
      }
      var ch = { id: e.id }, scale = 1, msg = '';
      if(c.hd.unit === 'mw'){
        if(e.c === 'Load'){
          // In MW, the file's highest hour becomes the peak demand the profile is per unit of.
          if(peak > 0){ scale = peak; ch.p_set = Math.round(peak * 1e4) / 1e4; msg = ', its peak demand set to the file’s highest hour, ' + fmt(peak) + ' MW'; }
          else scale = e.p_set > 0 ? e.p_set : 1;
        } else {
          if(!(e.p_nom > 0)){ out.errors.push(ED.nameOf(e) + ' needs a rating before a profile in MW can be read as a share of it.'); return; }
          scale = e.p_nom;
        }
      }
      // The blank hours: its shape (Flat, Always available, a built-in or its own bars),
      // not an earlier file, in the MW it gave before a new peak demand.
      var shape = gaps ? ED.series(Object.assign({}, e, { ts: null }), H, opts.start, e.c === 'Generator' ? 1 : 0) : null;
      var keepMw = ch.p_set !== undefined && e.p_set > 0 ? e.p_set / ch.p_set : 1;
      for(var t4 = 0; t4 < H; t4++){
        v[t4] = isNaN(v[t4]) ? r6(shape[t4] * keepMw) : r6(Math.min(100, v[t4] / scale));
        if(e.c === 'Generator' && v[t4] > 1) over++;
      }
      ch.ts = { at: ED.isoOf(start), v: v };
      out.changes.push(ch);
      out.notes.push(ED.nameOf(e) + ' takes its hours from the file, ' + UNIT_WORD[c.hd.unit] + msg + '.' +
        (gaps ? ' ' + gaps + ' blank hour' + (gaps > 1 ? 's follow' : ' follows') + ' its shape.' : '') +
        (neg ? ' ' + neg + ' negative value' + (neg > 1 ? 's were' : ' was') + ' read as 0.' : '') +
        (over ? ' ' + over + ' hour' + (over > 1 ? 's' : '') + ' above its rating ' + (over > 1 ? 'are' : 'is') + ' held at it.' : ''));
    });
    if(unused.length) out.notes.push('Left out, as no load or generator here has the name: ' + unused.slice(0, 6).join(', ') + (unused.length > 6 ? ' and ' + (unused.length - 6) + ' more' : '') + '.');
    if(!out.errors.length && !out.changes.length && !cols.some(function(c){ return c.e; }))
      out.errors.push('No column is named after a load or a generator in this network. Head each column with one’s name, as the template does.');
    out.used = { rows: H, outside: outside, from: start, to: end - HOUR, dayFirst: when.dayFirst };
    if(out.errors.length) out.changes = [];
    return out;
  };

  /* ── The template: the horizon's hours from its first, a column per load
     and generator, filled with the profile each has now, per unit. ── */
  ED.profileTemplate = function(model, H, start, ids){
    var s = ED.startMs(ED.parseStart(start));
    var els = model.el.filter(function(e){ return (e.c === 'Load' || e.c === 'Generator') && (!ids || ids.indexOf(e.id) >= 0); });
    var count = {};
    els.forEach(function(e){ var n = ED.nameOf(e).toLowerCase(); count[n] = (count[n] || 0) + 1; });
    var head = ['Date and time'].concat(els.map(function(e){ var n = ED.nameOf(e); return n + (count[n.toLowerCase()] > 1 ? ' #' + e.id : '') + ' [p.u.]'; }));
    var series = els.map(function(e){ return ED.series(e, H, start, e.c === 'Generator' ? 1 : 0); });
    var times = [], rows = [];
    for(var t = 0; t < H; t++){
      var ms = s + t * HOUR, row = [isoSpace(ms)];
      for(var k = 0; k < series.length; k++) row.push(r4(series[k][t]));
      times.push(ms); rows.push(row);
    }
    return { head: head, rows: rows, times: times, els: els };
  };
  ED.TEMPLATE_NOTES = [
    'One row an hour, from the first hour of the horizon. Keep the date and time column: it is how each row finds its hour.',
    'One column per load and generator, headed with its name. Leave out, or leave empty, any you do not want to change. A blank cell keeps that hour as its shape gives it; 0 is a value.',
    'Values are per unit: a load’s share of its peak demand, a generator’s share of its rating that is available (1 is all of it).',
    'To give a column in MW instead, end its header with [MW]; in percent, with [%].',
    'Rows outside the horizon are left out, so a longer file is fine. A file that misses an hour of the horizon is turned away.'
  ];
  function csvCell(x){ var s = String(x); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  ED.templateCsv = function(tpl){
    var out = [tpl.head.map(csvCell).join(',')];
    for(var i = 0; i < tpl.rows.length; i++) out.push(tpl.rows[i].map(csvCell).join(','));
    return out.join('\r\n') + '\r\n';
  };
  // The same as an Excel workbook: real dates in the first column, and the notes on a sheet of their own.
  ED.templateBook = function(XLSX, tpl){
    var aoa = [tpl.head].concat(tpl.rows.map(function(r, i){ return [ED.msSerial(tpl.times[i])].concat(r.slice(1)); }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    for(var i = 0; i < tpl.rows.length; i++){
      var ref = XLSX.utils.encode_cell({ r: i + 1, c: 0 });
      ws[ref].z = 'yyyy-mm-dd hh:mm';
    }
    ws['!cols'] = [{ wch: 18 }].concat(tpl.head.slice(1).map(function(h){ return { wch: Math.max(10, Math.min(36, h.length + 2)) }; }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profiles');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['How to fill in the Profiles sheet']].concat(ED.TEMPLATE_NOTES.map(function(n){ return [n]; }))), 'Read me');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
