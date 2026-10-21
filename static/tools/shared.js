/* ──────────────────────────────────────────────────────────────────────────
   Shared Design System — common formatting helpers
   Included by tools via <script src="../shared.js"></script>
   (load before the tool's own script.js)
   ────────────────────────────────────────────────────────────────────────── */
(function(global){
  // Files beside this one (the Share links' dictionary) are found from here.
  var SCRIPT_URL = (document.currentScript && document.currentScript.src) || global.location.href;
  /* A chart embedded on another site (SharedShare, below) is this page opened
     in an iframe as #embed=<chart>&theme=<theme>&s=<scenario>. Read once, now,
     because the mini cache has to know before any tool script calls it. */
  var EMBED = readEmbedHash(global.location && global.location.hash);
  function readEmbedHash(hash){
    var m = /(?:^#|&)embed=([^&]+)/.exec(hash || '');
    // Only inside a frame: opened as a page of its own, the link is just the tool.
    if(!m || global.self === global.top) return null;
    var get = function(k){ var r = new RegExp('(?:^#|&)' + k + '=([^&]*)').exec(hash); return r ? decodeURIComponent(r[1]) : ''; };
    return { key: decodeURIComponent(m[1]), theme: get('theme'), s: get('s') };
  }
  if(EMBED) document.documentElement.classList.add('abt-embed', 'abt-embed-wait');
  /* The links back to the tool (the frame's watermark and the credit line
     under it) open the whole tool as #open=<chart>&s=<scenario>, set up on
     the scenario the embed shows, so a reader starts from what they saw. */
  var OPEN = EMBED ? null : readOpenHash(global.location && global.location.hash);
  function readOpenHash(hash){
    var m = /(?:^#|&)open=([^&]+)/.exec(hash || ''), s = /(?:^#|&)s=([^&]*)/.exec(hash || '');
    return m && s ? { key: decodeURIComponent(m[1]), s: decodeURIComponent(s[1]) } : null;
  }

  function formatThousands(value, opts){
    opts = opts || {};
    var maxDecimals = opts.maxDecimals || 0;
    var allowNegative = !!opts.allowNegative;
    var s = String(value == null ? '' : value);
    var neg = allowNegative && /^\s*-/.test(s);
    if (maxDecimals <= 0) {
      var n = parseInt(s.replace(/[^0-9]/g,''), 10) || 0;
      var out = n.toLocaleString('en-US');
      return (neg && n !== 0) ? '-' + out : out;
    }
    s = s.replace(/[^0-9.]/g,'');
    var dot = s.indexOf('.');
    var intPart, decPart;
    if (dot === -1) { intPart = s; decPart = null; }
    else {
      intPart = s.slice(0, dot);
      decPart = s.slice(dot+1).replace(/\./g,'').slice(0, maxDecimals);
    }
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (intPart === '') intPart = '0';
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var out = intPart + (decPart !== null ? '.' + decPart : '');
    if (neg && !/^0(\.0*)?$/.test(out)) out = '-' + out;
    return out;
  }

  function parseFormatted(value){
    var cleaned = String(value == null ? '' : value).replace(/,/g,'').trim();
    var n = parseFloat(cleaned);
    return isFinite(n) ? n : 0;
  }

  function liveFormat(el, opts){
    var pos = el.selectionStart;
    var oldLen = el.value.length;
    el.value = formatThousands(el.value, opts);
    var newLen = el.value.length;
    var newPos = Math.max(0, pos + (newLen - oldLen));
    if (document.activeElement === el) el.setSelectionRange(newPos, newPos);
  }

  function attachCurrencyInput(el, opts){
    opts = opts || {};
    el.addEventListener('input', function(){
      liveFormat(this, opts);
      if (typeof opts.onChange === 'function') opts.onChange(this);
    });
    el.addEventListener('blur', function(){
      liveFormat(this, opts);
      if (typeof opts.onChange === 'function') opts.onChange(this);
    });
  }

  /* Unit label beside a .affix-input. A currency symbol is a PREFIX
     ("$ 1,000", "Rp 1,000"); a percentage or any other trailing unit is a
     SUFFIX ("4.5 %", "30 yrs", "/mo"). Fields whose unit switches between
     the two (a $/% selector) call this instead of rewriting the prefix's text,
     so "%" never ends up in front of the number. Pass '' to hide a side. */
  function setAffix(wrap, prefix, suffix){
    if (!wrap) return;
    var input = wrap.querySelector('.affix-input');
    var pre = wrap.querySelector('.prefix');
    var suf = wrap.querySelector('.suffix');
    if (prefix && !pre) {
      pre = document.createElement('span');
      pre.className = 'prefix';
      wrap.insertBefore(pre, wrap.firstChild);
    }
    if (suffix && !suf) {
      suf = document.createElement('span');
      suf.className = 'suffix';
      wrap.appendChild(suf);
    }
    if (pre) { if (prefix) pre.textContent = prefix; pre.hidden = !prefix; }
    if (suf) { if (suffix) suf.textContent = suffix; suf.hidden = !suffix; }
    if (input) input.classList.toggle('has-suffix', !!suffix);
  }

  global.SharedFmt = {
    formatThousands: formatThousands,
    parseFormatted: parseFormatted,
    liveFormat: liveFormat,
    attachCurrencyInput: attachCurrencyInput,
    setAffix: setAffix
  };

  /* ── Currency symbol picker ─────────────────────────────────────────────
     Two kinds of currency choice live on this site, and they are kept apart:

       - A SYMBOL is cosmetic. Nothing is converted; the figures mean whatever
         money the reader typed them in, and the picker only decides what is
         drawn in front of them. Every such picker is built from the one list
         below, so the tools offer the same choices in the same order.
       - An ISO CODE (AUD, USD, EUR…) is reserved for a tool that really
         converts between currencies with an exchange rate (the Cost of Living
         Comparator). A code on a display-only picker would promise a
         conversion that never happens.

     Mark the <select> with data-currency-symbols and leave it empty; it is
     filled when this file loads (every tool loads shared.js at the end of
     <body>, after its form, and before its own script reads or restores the
     value). The labels follow <html lang>: "id" gets Indonesian names.
       data-currency-none  adds a "None" option (value "") for tools that can
                           draw money with no symbol at all.
     A symbol may stand for several currencies ($ is the US, Australian,
     Singapore… dollar), which is fine precisely because nothing converts. */
  var CURRENCY_SYMBOLS = [
    {sym:'$',   en:'Dollar',                       id:'Dolar'},
    {sym:'€',   en:'Euro',                         id:'Euro'},
    {sym:'£',   en:'Pound',                        id:'Pound'},
    {sym:'¥',   en:'Yen / Yuan',                   id:'Yen / Yuan'},
    {sym:'₹',   en:'Rupee (India)',                id:'Rupee (India)'},
    {sym:'Rs',  en:'Rupee (Pakistan, Sri Lanka)',  id:'Rupee (Pakistan, Sri Lanka)'},
    {sym:'Rp',  en:'Rupiah',                       id:'Rupiah'},
    {sym:'RM',  en:'Ringgit',                      id:'Ringgit'},
    {sym:'₱',   en:'Peso (Philippines)',           id:'Peso (Filipina)'},
    {sym:'฿',   en:'Baht',                         id:'Baht'},
    {sym:'₫',   en:'Dong',                         id:'Dong'},
    {sym:'₩',   en:'Won',                          id:'Won'},
    {sym:'CHF', en:'Swiss Franc',                  id:'Franc Swiss'},
    {sym:'Dh',  en:'Dirham (UAE)',                 id:'Dirham (UEA)'},
    {sym:'kr',  en:'Krona / Krone',                id:'Krona / Krone'},
    {sym:'zł',  en:'Złoty',                        id:'Zloty'},
    {sym:'₺',   en:'Lira',                         id:'Lira'},
    {sym:'₽',   en:'Ruble',                        id:'Rubel'},
    {sym:'₪',   en:'Shekel',                       id:'Shekel'},
    {sym:'R',   en:'Rand',                         id:'Rand'},
    {sym:'R$',  en:'Real',                         id:'Real'},
    {sym:'₦',   en:'Naira',                        id:'Naira'},
    {sym:'₿',   en:'Bitcoin',                      id:'Bitcoin'}
  ];

  /* Saved plans from before a tool moved from codes to symbols carry a code.
     Read through this so an old file or mini cache still opens on the symbol
     it used to show. */
  var CODE_TO_SYMBOL = {
    AUD:'$', USD:'$', SGD:'$', NZD:'$', CAD:'$', HKD:'$', TWD:'$', MXN:'$',
    EUR:'€', GBP:'£', JPY:'¥', CNY:'¥', INR:'₹', PKR:'Rs', LKR:'Rs', NPR:'Rs',
    IDR:'Rp', MYR:'RM', PHP:'₱', THB:'฿', VND:'₫', KRW:'₩', CHF:'CHF',
    SEK:'kr', NOK:'kr', DKK:'kr', ISK:'kr', PLN:'zł', TRY:'₺', RUB:'₽',
    ILS:'₪', ZAR:'R', BRL:'R$', NGN:'₦', BTC:'₿', AED:'Dh'
  };

  function currencyLang(lang){
    lang = lang || (document.documentElement && document.documentElement.lang) || 'en';
    return /^id/i.test(lang) ? 'id' : 'en';
  }
  function hasSymbol(sym){
    for(var i = 0; i < CURRENCY_SYMBOLS.length; i++) if(CURRENCY_SYMBOLS[i].sym === sym) return true;
    return false;
  }
  /* A value as a tool may find it saved: a listed symbol stays, a code from
     before the move maps to its symbol, anything else falls back. */
  function toSymbol(v, fallback){
    if(fallback === undefined) fallback = '$';
    if(typeof v !== 'string') return fallback;
    if(hasSymbol(v)) return v;
    var code = v.trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(CODE_TO_SYMBOL, code) ? CODE_TO_SYMBOL[code] : fallback;
  }
  /* The other way, for a tool that starts converting from a page that only
     knew a symbol: the first code listed for it above ($ is AUD, ¥ is JPY),
     or the fallback for a symbol no code is listed for. */
  function toCode(sym, fallback){
    for(var code in CODE_TO_SYMBOL){
      if(Object.prototype.hasOwnProperty.call(CODE_TO_SYMBOL, code) && CODE_TO_SYMBOL[code] === sym) return code;
    }
    return fallback === undefined ? 'USD' : fallback;
  }
  /* Fill (or refill, e.g. on a language change) a symbol <select>. The
     current value is kept when it is still on the list. */
  function fillCurrency(sel, opts){
    if(!sel) return;
    opts = opts || {};
    var lang = currencyLang(opts.lang);
    var none = opts.none != null ? !!opts.none : sel.hasAttribute('data-currency-none');
    // An empty <select> reads '' — that is "nothing chosen yet", not "None".
    var keep = opts.value != null ? opts.value
      : (sel.options.length ? sel.value : (sel.getAttribute('data-currency-default') || '$'));
    sel.innerHTML = '';
    CURRENCY_SYMBOLS.forEach(function(c){
      var o = document.createElement('option');
      o.value = c.sym;
      o.textContent = c.sym + ' ' + c[lang];
      sel.appendChild(o);
    });
    if(none){
      var o = document.createElement('option');
      o.value = '';
      o.textContent = lang === 'id' ? 'Tanpa simbol' : 'None (no symbol)';
      sel.appendChild(o);
    }
    sel.value = (keep === '' && none) || hasSymbol(keep) ? keep : '$';
  }
  function fillAllCurrency(){
    var els = document.querySelectorAll('select[data-currency-symbols]');
    for(var i = 0; i < els.length; i++) if(!els[i].options.length) fillCurrency(els[i]);
  }
  fillAllCurrency();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fillAllCurrency);

  global.SharedCurrency = {
    SYMBOLS: CURRENCY_SYMBOLS,
    fill: fillCurrency,
    has: hasSymbol,
    toSymbol: toSymbol,
    toCode: toCode
  };

  /* ── Frequency conversion ───────────────────────────────────────────────
     A per-period amount only means something next to its period: $500 a month
     is $6,000 a year, not $500 a year. So when a frequency control moves, the
     amount beside it is rescaled to keep describing the same real-world money,
     instead of silently changing what was entered by a factor of twelve.

     The result is rounded back to the field's own precision, because the
     arithmetic does not always land on a round figure: $500 a week is
     2,166.6666666666665 a month, which nobody wants to read. It becomes
     2,166.67, or 2,167 in a field that takes no decimals.
     ───────────────────────────────────────────────────────────────────────── */
  var FREQ_PER_YEAR = {
    daily: 365, weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, yearly: 1
  };

  // null for a period this table does not know — a caller's "% of value" or
  // "fixed" basis, say, which is not a frequency and must not be rescaled.
  function convertFrequency(amount, from, to, maxDecimals){
    var f = FREQ_PER_YEAR[from], t = FREQ_PER_YEAR[to];
    if (!f || !t || !isFinite(amount)) return null;
    if (f === t) return amount;
    var p = Math.pow(10, maxDecimals == null ? 2 : maxDecimals);
    return Math.round(amount * f / t * p) / p;
  }

  /* Wires a <select> of periods to the amount input beside it.
       maxDecimals  the field's precision (default 2)
       format       value -> display string (default: the shared formatter)
       skip         () -> true when the amount is not money this period (a
                    percentage basis, say), so the value is left alone
       onChange     called with (value, input) after a conversion
     Both `input` and `change` are listened for, since a select fires input
     first: converting there puts the new amount in place before any listener
     the tool has already hung on the same events reads the form. The second
     event then finds nothing left to do. */
  function attachFrequencySelect(sel, input, opts){
    if (!sel || !input) return;
    opts = opts || {};
    var decimals = opts.maxDecimals == null ? 2 : opts.maxDecimals;
    var format = opts.format || function(v){
      return formatThousands(String(v), {maxDecimals: decimals, allowNegative: true});
    };
    var prev = sel.value;
    // A preset or a loaded config sets the control without firing an event, so
    // the period we convert FROM is re-read as the user reaches for the select.
    function syncPrev(){ prev = sel.value; }
    sel.addEventListener('focus', syncPrev);
    sel.addEventListener('mousedown', syncPrev);

    function onPeriodChange(){
      var from = prev, to = sel.value;
      prev = to;
      if (from === to) return;
      if (typeof opts.skip === 'function' && opts.skip()) return;
      var raw = String(input.value == null ? '' : input.value).trim();
      if (raw === '') return;
      var next = convertFrequency(parseFormatted(raw), from, to, decimals);
      if (next === null) return;
      input.value = format(next);
      if (typeof opts.onChange === 'function') opts.onChange(next, input);
    }
    sel.addEventListener('input', onPeriodChange);
    sel.addEventListener('change', onPeriodChange);
  }

  global.SharedFreq = {
    perYear: FREQ_PER_YEAR,
    convert: convertFrequency,
    attachSelect: attachFrequencySelect
  };

  /* ── Market data fetch — batched, self-hosted Worker only ──────────────────
     The simulator runs in the browser; Yahoo's chart endpoint
     (query1/query2.finance.yahoo.com/v8/finance/chart — what the Python
     `yfinance` library wraps) and Stooq's CSV endpoint send no CORS headers, so
     the page cannot call them directly. We relay through ONE self-hosted
     Cloudflare Worker (dcasimulator/yf-proxy-worker.js). The old public CORS
     proxies (allorigins/corsproxy/codetabs) were the unreliable part and have
     been removed entirely.

     REQUEST-MINIMISING DESIGN (Worker free tier = 100k requests/day):
       • BATCHING — fetchPricesBatch() sends every ticker in ONE request
         (?tickers=A,B,C). The Worker fans out to Yahoo/Stooq server-side, so N
         tickers cost ONE invocation instead of N.
       • NO PREFLIGHT — a GET with no custom headers is a "simple request", so
         the browser sends no OPTIONS preflight (no doubled invocation).
       • Source selection (Yahoo vs Stooq, FX/metal detection, exchange-suffix
         mapping) now lives in the Worker; the client just passes ticker strings.

     SETUP: deploy the Worker, then set WORKER_ENDPOINT below (or call
     SharedYF.setEndpoint('https://NAME.SUBDOMAIN.workers.dev') once at startup).
     ──────────────────────────────────────────────────────────────────────── */

  // ▼▼▼ Deployed market-data Worker (dcasimulator/yf-proxy-worker.js) ▼▼▼
  var WORKER_ENDPOINT = 'https://yfinance.adjiebrotots.workers.dev';
  // ▲▲▲ change here if the Worker is ever redeployed under a new name ▲▲▲

  var MAX_PER_REQUEST = 25; // must match the Worker's MAX_TICKERS cap

  /* ── SOFT DAILY REQUEST CAP (per device, via a 1-day cookie) ───────────────
     The Worker free tier is finite, so we nudge users to batch their loads. A
     "request" here is one Worker invocation (one batch of up to 25 tickers).
     Tickers already in the cache, and same-day reloads, cost nothing. The cap
     lives in a cookie that expires at the end of the local day; clearing cookies
     resets it — accepted friction, not a hard wall. The cookie is shared across
     the whole origin, so the single-asset and portfolio tools draw on the SAME
     daily allowance. */
  var DAILY_REQUEST_LIMIT = 5;
  var RATE_COOKIE = 'yf_req';
  // Set when an embedded chart asked for prices its link did not carry.
  var embedFetchRefused = false;

  function rlToday(){ return new Date().toISOString().slice(0,10); }
  function rlRead(){
    var jar = (typeof document !== 'undefined' ? document.cookie : '') || '';
    var m = jar.match(new RegExp('(?:^|;\\s*)' + RATE_COOKIE + '=([^;]+)'));
    if(!m) return { day: rlToday(), n: 0 };
    var parts = decodeURIComponent(m[1]).split('|');
    if(parts[0] !== rlToday()) return { day: rlToday(), n: 0 }; // new day → reset
    return { day: parts[0], n: parseInt(parts[1], 10) || 0 };
  }
  function rlWrite(n){
    if(typeof document === 'undefined') return;
    var exp = new Date(); exp.setHours(23, 59, 59, 999); // end of the local day
    document.cookie = RATE_COOKIE + '=' + encodeURIComponent(rlToday() + '|' + n) +
      '; expires=' + exp.toUTCString() + '; path=/; SameSite=Lax';
  }
  function rlRemaining(){ return Math.max(0, DAILY_REQUEST_LIMIT - rlRead().n); }
  function rlConsume(){ var c = rlRead(); rlWrite(c.n + 1); return Math.max(0, DAILY_REQUEST_LIMIT - (c.n + 1)); }

  // Merge two {dates, prices [, opens, highs, lows]} series (ascending ISO
  // dates), deduping by date so a freshly-fetched tail/front can be folded into
  // the cached history without re-downloading what we already hold. `b` wins on
  // overlapping dates. OHLC arrays are merged only when present on either input.
  //
  // Adjusted closes are restated after every dividend and split, so history
  // cached weeks ago and a tail fetched today can sit on different bases.
  // Stitched as they are, a 10:1 split reads as a 90% crash on the seam day and
  // every dividend in between as a small fake drop. `b` is the fresher fetch, so
  // the part of `a` it does not cover is rescaled onto b's basis by the ratio of
  // the two on the latest day they share. `a`'s own last day is never used for
  // that ratio: it may have been fetched mid-session, before the close was final.
  function rebaseFactor(a, b){
    if(!a || !b || !a.dates || !b.dates || !a.prices || !b.prices) return 1;
    var bIdx = Object.create(null), j, k, pa, pb;
    for(j = 0; j < b.dates.length; j++) bIdx[b.dates[j]] = j;
    for(j = a.dates.length - 2; j >= 0; j--){
      k = bIdx[a.dates[j]];
      if(k === undefined) continue;
      pa = a.prices[j]; pb = b.prices[k];
      if(!(isFinite(pa) && pa > 0 && isFinite(pb) && pb > 0)) continue;
      var f = pb / pa;
      return Math.abs(f - 1) < 1e-9 ? 1 : f;
    }
    return 1;
  }
  function mergeSeries(a, b){
    var map = Object.create(null), i;
    function absorb(s, f){
      if(!s || !s.dates) return;
      function sc(arr){ var v = arr ? arr[i] : undefined; return (f !== 1 && typeof v === 'number') ? v * f : v; }
      for(i=0;i<s.dates.length;i++){
        map[s.dates[i]] = { p: sc(s.prices), o: sc(s.opens), h: sc(s.highs), l: sc(s.lows) };
      }
    }
    absorb(a, rebaseFactor(a, b)); absorb(b, 1); // b wins on overlapping dates
    var dates = Object.keys(map).sort();
    var prices = dates.map(function(d){ return map[d].p; });
    var out = { dates: dates, prices: prices };
    var hasOHLC = (a && a.opens && a.highs && a.lows) || (b && b.opens && b.highs && b.lows);
    if(hasOHLC){
      out.opens = dates.map(function(d){ return map[d].o; });
      out.highs = dates.map(function(d){ return map[d].h; });
      out.lows  = dates.map(function(d){ return map[d].l; });
    }
    return out;
  }

  async function workerFetchJson(url, timeoutMs){
    var controller = new AbortController();
    var timeoutId = setTimeout(function(){ controller.abort(); }, timeoutMs);
    try {
      var resp = await fetch(url, {signal: controller.signal, cache:'no-store'});
      if (!resp.ok) {
        // Prefer the Worker's own JSON error (e.g. the per-IP daily-limit
        // message on a 429) over a bare status code.
        var msg = 'Worker HTTP ' + resp.status;
        try { var j = await resp.json(); if (j && j.error) msg = j.error; } catch(_e){}
        throw new Error(msg);
      }
      return await resp.json();
    } catch(err){
      if (err && err.name === 'AbortError') throw new Error('timed out');
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function chunk(arr, size){
    var out = [];
    for (var i=0; i<arr.length; i+=size) out.push(arr.slice(i, i+size));
    return out;
  }

  // Fetch many tickers in as few Worker calls as possible. Returns a map
  // { TICKER: {dates, prices, source, kind} | {error} }. Never throws for an
  // individual bad ticker — only for a total transport failure of a batch.
  async function yfFetchPricesBatch(tickers, startDate, endDate){
    // An embedded chart is this page in another site's frame. Its requests
    // carry this origin, so the Worker's origin lock lets them through and
    // every viewer there would cost an invocation. It never calls the Worker:
    // the prices it draws ride in its link (snapCache, below).
    if (EMBED){
      embedFetchRefused = true;
      var refused = {};
      (tickers || []).forEach(function(t){
        refused[String(t||'').trim().toUpperCase()] = { error: 'market data is not fetched inside an embedded chart' };
      });
      return refused;
    }
    if (!WORKER_ENDPOINT || /REPLACE-WITH-YOUR-WORKER/.test(WORKER_ENDPOINT)){
      throw new Error('Market-data Worker endpoint not configured (set WORKER_ENDPOINT / SharedYF.setEndpoint)');
    }
    var list = (tickers || [])
      .map(function(t){ return String(t||'').trim().toUpperCase(); })
      .filter(Boolean);
    list = list.filter(function(t, i){ return list.indexOf(t) === i; }); // dedupe
    if (!list.length) return {};

    var start = String(startDate).slice(0,10);
    var end = String(endDate).slice(0,10);
    var base = WORKER_ENDPOINT.replace(/\/+$/, '');
    var enc = encodeURIComponent;

    var batches = chunk(list, MAX_PER_REQUEST);
    var merged = {};
    // Batches run in parallel; with ≤25 tickers (the common case) this is one call.
    // Each batch that actually reaches the Worker consumes one of the device's
    // daily requests. The .map() callbacks run synchronously in order, so the
    // remaining-count check and the consume happen deterministically per batch.
    var responses = await Promise.all(batches.map(function(group){
      if (rlRemaining() <= 0) {
        var blocked = {};
        group.forEach(function(t){
          blocked[t] = { error: 'daily data-request limit reached (' + DAILY_REQUEST_LIMIT + '/device/day)' };
        });
        return Promise.resolve(blocked);
      }
      rlConsume();
      var url = base + '/?tickers=' + enc(group.join(',')) +
                '&start=' + enc(start) + '&end=' + enc(end);
      return workerFetchJson(url, 20000).then(function(data){
        if (data && data.error && !data.results) throw new Error(data.error);
        return data && data.results ? data.results : {};
      }).catch(function(err){
        // Mark every ticker in a failed batch so callers can report it.
        var out = {};
        group.forEach(function(t){ out[t] = { error: (err && err.message) || 'fetch failed' }; });
        return out;
      });
    }));
    responses.forEach(function(r){ Object.assign(merged, r); });
    return merged;
  }

  // Where a tail refresh should start. Not at coverageEnd itself: that day may
  // be a weekend with no bar, or a bar fetched mid-session. Reaching a couple of
  // weeks back lands several finished closes in both the cache and the new
  // fetch, which is what mergeSeries needs to put them on one basis.
  function tailStart(entry){
    var end = entry && entry.coverageEnd;
    var last = entry && entry.dates && entry.dates.length ? entry.dates[entry.dates.length - 1] : end;
    if(!last) return end;
    var p = String(last).split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] - 14)).toISOString().slice(0, 10);
    return (end && end < d) ? end : d;
  }

  // Single-ticker convenience wrapper (kept for the portfolio tool and any
  // caller that wants one series). Throws on failure like the old API.
  async function yfFetchPrices(ticker, startDate, endDate){
    var tk = String(ticker||'').trim().toUpperCase();
    var map = await yfFetchPricesBatch([tk], startDate, endDate);
    var r = map[tk];
    if (!r || r.error || !r.dates || !r.dates.length){
      throw new Error('Unable to fetch market data for ' + ticker +
        ' (' + ((r && r.error) || 'no data') + ')');
    }
    return r;
  }

  /* ── Prices for an embedded chart ──────────────────────────────────────────
     An embed never calls the Worker (yfFetchPricesBatch), so the reader's
     page packs the prices the scenario draws into the link, and the frame
     puts them in its cache before the scenario runs. Only the scenario's own
     window is sent, and every number comes back exactly as cached, so the
     embed draws the same trades the reader saw, on the day they shared it.

     A column is the smallest power of ten that holds every value exactly, as
     delta-coded integers. Yahoo's closes are float32 values widened to
     doubles, so where no decimal scale is exact one is tried that is exact
     after Math.fround. Anything else travels as it is. The link then
     deflates it (SharedShare.pack).

         payload = SharedYF.snapCache(priceCache, ['SPY'], start, end)  // throws if not loaded
         SharedYF.restoreCache(priceCache, payload)                     // in the frame
     ──────────────────────────────────────────────────────────────────────── */
  var SNAP_COLS = { p: 'prices', o: 'opens', h: 'highs', l: 'lows' };
  var SNAP_MAX = 40000;
  function snapNums(a){
    var modes = [false, true], m, k, i, f, n, q, ok;
    for(m = 0; m < 2; m++){
      for(k = 0; k <= 12; k++){
        f = Math.pow(10, k); q = new Array(a.length); ok = true;
        for(i = 0; i < a.length && ok; i++){
          n = typeof a[i] === 'number' ? Math.round(a[i] * f) : NaN;
          ok = Number.isSafeInteger(n) && (modes[m] ? Math.fround(n / f) : n / f) === a[i];
          q[i] = i ? n - Math.round(a[i - 1] * f) : n;
        }
        if(ok) return modes[m] ? { k: k, f: 1, d: q } : { k: k, d: q };
      }
    }
    return { r: a.slice() };
  }
  function unsnapNums(c, len){
    if(!c || typeof c !== 'object') return null;
    var a = Array.isArray(c.r) ? c.r : Array.isArray(c.d) ? c.d : null;
    if(!a || a.length !== len) return null;
    if(c.r) return a.every(function(v){ return v === null || (typeof v === 'number' && isFinite(v)); }) ? a.slice() : null;
    var k = c.k, f = Math.pow(10, k), out = new Array(len), n = 0;
    if(!(Number.isInteger(k) && k >= 0 && k <= 12)) return null;
    for(var i = 0; i < len; i++){
      if(!Number.isSafeInteger(a[i])) return null;
      n += a[i];
      out[i] = c.f ? Math.fround(n / f) : n / f;
    }
    return out;
  }
  var ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  function dayNum(iso){ var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function dayIso(n){ return new Date(n * 864e5).toISOString().slice(0, 10); }
  function snapLabel(v){ return typeof v === 'string' && /^[\w.-]{0,24}$/.test(v) ? v : ''; }

  function snapCache(cache, tickers, start, end){
    var out = { a: start, b: end, t: {} };
    (tickers || []).forEach(function(raw){
      var tk = String(raw || '').trim().toUpperCase(), e = cache && cache[tk];
      if(!tk || out.t[tk]) return;
      if(!(e && e.dates && e.coverageStart <= start && e.coverageEnd >= end))
        throw new Error('the prices for ' + tk + ' over these dates are not loaded yet. Run the simulation, then embed again.');
      var si = -1, ei = -1, i;
      for(i = 0; i < e.dates.length; i++){ if(e.dates[i] >= start){ si = i; break; } }
      for(i = e.dates.length - 1; i >= 0; i--){ if(e.dates[i] <= end){ ei = i; break; } }
      var s = { s: e.source, k: e.kind, b: e.basis };
      if(si >= 0 && ei >= si){
        var dates = e.dates.slice(si, ei + 1), gaps = [];
        for(i = 1; i < dates.length; i++) gaps.push(dayNum(dates[i]) - dayNum(dates[i - 1]));
        s.t = dates[0]; s.g = gaps;
        Object.keys(SNAP_COLS).forEach(function(c){
          var col = e[SNAP_COLS[c]];
          if(c === 'p' || (e.opens && e.highs && e.lows)) s[c] = snapNums(col.slice(si, ei + 1));
        });
      }
      out.t[tk] = s;
    });
    return out;
  }
  // Writes each ticker in a link into `cache`, covering the link's window.
  // A link is anyone's to write, so anything malformed is dropped whole.
  function restoreCache(cache, d){
    if(!d || typeof d !== 'object' || !d.t || typeof d.t !== 'object') return [];
    var start = d.a, end = d.b, done = [];
    if(!(typeof start === 'string' && ISO_DAY.test(start) && typeof end === 'string' && ISO_DAY.test(end))) return [];
    Object.keys(d.t).forEach(function(tk){
      var s = d.t[tk];
      if(!/^[A-Z0-9.^=_-]{1,24}$/.test(tk) || !s || typeof s !== 'object') return;
      var dates = [];
      if(s.t !== undefined){
        if(!(typeof s.t === 'string' && ISO_DAY.test(s.t) && Array.isArray(s.g) && s.g.length < SNAP_MAX)) return;
        var n = dayNum(s.t);
        dates.push(s.t);
        for(var i = 0; i < s.g.length; i++){
          if(!(Number.isInteger(s.g[i]) && s.g[i] > 0 && s.g[i] < 4000)) return;
          dates.push(dayIso(n += s.g[i]));
        }
      }
      var entry = { dates: dates, prices: dates.length ? unsnapNums(s.p, dates.length) : [] };
      if(!entry.prices) return;
      if(s.o || s.h || s.l){
        entry.opens = unsnapNums(s.o, dates.length); entry.highs = unsnapNums(s.h, dates.length); entry.lows = unsnapNums(s.l, dates.length);
        if(!(entry.opens && entry.highs && entry.lows)) return;
      }
      entry.cachedStart = dates[0]; entry.cachedEnd = dates[dates.length - 1];
      entry.coverageStart = start; entry.coverageEnd = end;
      entry.source = snapLabel(s.s); entry.kind = snapLabel(s.k); entry.basis = snapLabel(s.b);
      cache[tk] = entry;
      done.push(tk);
    });
    // Whatever runs from here on draws from these; an earlier refusal was the
    // page's own defaults, before the link was read.
    embedFetchRefused = false;
    return done;
  }

  global.SharedYF = {
    fetchPrices: yfFetchPrices,
    fetchPricesBatch: yfFetchPricesBatch,
    snapCache: snapCache,
    restoreCache: restoreCache,
    mergeSeries: mergeSeries,
    tailStart: tailStart,
    setEndpoint: function(url){ WORKER_ENDPOINT = url || ''; },
    // Soft daily request cap (shared across both tools on this origin).
    getDailyLimit: function(){ return DAILY_REQUEST_LIMIT; },
    getDailyRemaining: rlRemaining
  };

  /* ── Persistent price cache (shared with the DCA tools) ───────────────────
     A past date's price never changes, so a fetched series is kept in
     localStorage and reused. The storage key and the entry shape are
     DELIBERATELY identical to the DCA simulator's, so a ticker loaded on
     either page is free on the other.

     Anything written here must keep every field the DCA tools read back:
     they use `source`/`kind` to flag unadjusted Stooq prices, and
     `coverageStart`/`coverageEnd` to decide whether a refetch is needed.

     There is no TTL, by design. `coverageEnd` is the last date we asked for,
     so on the next calendar day it stops reaching "today" and the caller
     refetches just the tail. Same-day reloads cost zero requests, which
     matters because the whole origin shares one small daily allowance. */
  var PRICE_CACHE_KEY = 'dca_priceCache_v2';
  var priceCache = {};
  var priceCacheLoaded = false;
  var pcInFlight = {};

  function pcMinIso(a, b){ return (a && a < b) ? a : b; }
  function pcMaxIso(a, b){ return (a && a > b) ? a : b; }
  function pcKey(t){ return String(t == null ? '' : t).trim().toUpperCase(); }

  function pcLoad(){
    if(priceCacheLoaded) return priceCache;
    priceCacheLoaded = true;
    try {
      var raw = localStorage.getItem(PRICE_CACHE_KEY);
      if(raw){
        var parsed = JSON.parse(raw);
        if(parsed && parsed.cache && typeof parsed.cache === 'object') priceCache = parsed.cache;
      }
    } catch(_e){ /* corrupt or unavailable storage - start empty */ }
    return priceCache;
  }

  function pcSave(){
    try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({savedAt: Date.now(), cache: priceCache})); }
    catch(_e){ /* quota or private mode - caching is best-effort */ }
  }

  // Fold one Worker result into the cache. Merges rather than replaces, so an
  // incremental front/tail fetch never discards history we already hold.
  function pcStore(tk, r, fetchStart, fetchEnd){
    if(!(r && !r.error && r.dates && r.dates.length)) return false;
    // A series dated on another basis (the Worker's `basis` tag) is replaced,
    // never merged: stitching the two would duplicate or shift trading days.
    var prev = (priceCache[tk] && priceCache[tk].basis === r.basis) ? priceCache[tk] : null;
    var dates = r.dates, prices = r.prices, opens = r.opens, highs = r.highs, lows = r.lows;
    if(prev && prev.dates && prev.dates.length){
      var m = mergeSeries(
        {dates: prev.dates, prices: prev.prices, opens: prev.opens, highs: prev.highs, lows: prev.lows},
        {dates: r.dates,    prices: r.prices,    opens: r.opens,    highs: r.highs,    lows: r.lows});
      dates = m.dates; prices = m.prices; opens = m.opens; highs = m.highs; lows = m.lows;
    }
    var entry = {
      dates: dates,
      prices: prices,
      cachedStart: dates[0],
      cachedEnd: dates[dates.length - 1],
      coverageStart: prev ? pcMinIso(prev.coverageStart, fetchStart) : fetchStart,
      coverageEnd:   prev ? pcMaxIso(prev.coverageEnd, fetchEnd)     : fetchEnd,
      source: r.source,
      kind: r.kind,
      basis: r.basis
    };
    if(opens && highs && lows){ entry.opens = opens; entry.highs = highs; entry.lows = lows; }
    priceCache[tk] = entry;
    return true;
  }

  function pcCovered(ticker, start, end){
    pcLoad();
    var e = priceCache[pcKey(ticker)];
    return !!(e && e.coverageStart <= start && e.coverageEnd >= end);
  }

  // A {dates, prices, [opens, highs, lows], source, kind} slice of the cache,
  // filtered to [start, end]. Null when nothing cached covers that window.
  function pcSlice(ticker, start, end){
    pcLoad();
    var e = priceCache[pcKey(ticker)];
    if(!e || !e.dates || !e.dates.length) return null;
    var si = -1, ei = -1, i;
    for(i = 0; i < e.dates.length; i++){ if(e.dates[i] >= start){ si = i; break; } }
    for(i = e.dates.length - 1; i >= 0; i--){ if(e.dates[i] <= end){ ei = i; break; } }
    if(si < 0 || ei < 0 || si > ei) return null;
    var out = {
      dates: e.dates.slice(si, ei + 1),
      prices: e.prices.slice(si, ei + 1),
      source: e.source,
      kind: e.kind
    };
    if(e.opens && e.highs && e.lows){
      out.opens = e.opens.slice(si, ei + 1);
      out.highs = e.highs.slice(si, ei + 1);
      out.lows  = e.lows.slice(si, ei + 1);
    }
    return out;
  }

  // Guarantee [start, end] is covered, fetching ONLY the missing front/tail
  // segments. Concurrent callers for the same ticker share one fetch.
  async function pcEnsure(ticker, start, end){
    var tk = pcKey(ticker);
    if(!tk) throw new Error('Invalid ticker');
    pcLoad();
    if(pcCovered(tk, start, end)) return priceCache[tk];
    if(pcInFlight[tk]){ await pcInFlight[tk]; return priceCache[tk]; }
    pcInFlight[tk] = (async function(){
      var prev = priceCache[tk];
      var segments = [];
      if(!prev){
        segments.push([start, end]);
      } else {
        if(start < prev.coverageStart) segments.push([start, prev.coverageStart]);
        if(end   > prev.coverageEnd)   segments.push([tailStart(prev), end]);
      }
      var lastErr = null, i, seg, map, r;
      for(i = 0; i < segments.length; i++){
        seg = segments[i];
        map = await yfFetchPricesBatch([tk], seg[0], seg[1]);
        r = map[tk];
        if(!r || r.error){ lastErr = new Error((r && r.error) || 'fetch failed'); continue; }
        pcStore(tk, r, seg[0], seg[1]);
      }
      // A partial fetch that came back on a new date basis replaced the cached
      // history rather than extending it, so the whole window is fetched again.
      if(prev && priceCache[tk] && priceCache[tk].basis !== prev.basis && segments.length &&
         (segments[0][0] !== start || segments[0][1] !== end)){
        map = await yfFetchPricesBatch([tk], start, end);
        r = map[tk];
        if(!r || r.error) lastErr = new Error((r && r.error) || 'fetch failed');
        else pcStore(tk, r, start, end);
      }
      if(!priceCache[tk]) throw lastErr || new Error('No price data for ' + tk + ' in that range');
      // Only widen the recorded coverage when every segment came back clean.
      // A segment may legitimately hold no rows (a holiday tail) and past
      // prices are immutable, so that still counts as covered. A failed
      // request must not, or we would never retry it.
      if(!lastErr){
        priceCache[tk].coverageStart = pcMinIso(priceCache[tk].coverageStart, start);
        priceCache[tk].coverageEnd   = pcMaxIso(priceCache[tk].coverageEnd, end);
      }
      pcSave();
    })();
    try { await pcInFlight[tk]; } finally { delete pcInFlight[tk]; }
    return priceCache[tk];
  }

  global.SharedPriceCache = {
    key: PRICE_CACHE_KEY,
    load: pcLoad,
    save: pcSave,
    ensure: pcEnsure,
    slice: pcSlice,
    covers: pcCovered,
    entry: function(ticker){ pcLoad(); return priceCache[pcKey(ticker)] || null; },
    tickers: function(){ pcLoad(); return Object.keys(priceCache).sort(); },
    clear: function(){ priceCache = {}; priceCacheLoaded = true; pcSave(); }
  };

  /* ── Technical indicators (shared by the single-asset & portfolio tools) ──
     All operate on a close-price array and return same-length arrays padded
     with null until the indicator has enough history. Pure & side-effect free,
     so both tools compute them lazily on the price series they already hold. */
  function taParseDate(s){ var p=String(s).split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
  function smaSeries(p,n){
    const out=new Array(p.length).fill(null);
    if(n<1) return out;
    let sum=0;
    for(let i=0;i<p.length;i++){ sum+=p[i]; if(i>=n) sum-=p[i-n]; if(i>=n-1) out[i]=sum/n; }
    return out;
  }
  function emaSeries(p,n){
    const out=new Array(p.length).fill(null);
    if(n<1||p.length<n) return out;
    const k=2/(n+1);
    let seed=0;
    for(let i=0;i<n;i++) seed+=p[i];
    let prev=seed/n; out[n-1]=prev;
    for(let i=n;i<p.length;i++){ prev=p[i]*k+prev*(1-k); out[i]=prev; }
    return out;
  }
  function maSeries(p,type,n){ return type==='ema'?emaSeries(p,n):smaSeries(p,n); }
  function rsiSeries(p,n){
    const out=new Array(p.length).fill(null);
    if(p.length<n+1) return out;
    let gain=0,loss=0;
    for(let i=1;i<=n;i++){ const ch=p[i]-p[i-1]; if(ch>=0) gain+=ch; else loss-=ch; }
    let avgG=gain/n, avgL=loss/n;
    out[n]= avgL===0?100:100-100/(1+avgG/avgL);
    for(let i=n+1;i<p.length;i++){
      const ch=p[i]-p[i-1], g=ch>0?ch:0, l=ch<0?-ch:0;
      avgG=(avgG*(n-1)+g)/n; avgL=(avgL*(n-1)+l)/n;
      out[i]= avgL===0?100:100-100/(1+avgG/avgL);
    }
    return out;
  }
  function bollingerSeries(p,n,k){
    const mid=smaSeries(p,n);
    const upper=new Array(p.length).fill(null), lower=new Array(p.length).fill(null);
    for(let i=n-1;i<p.length;i++){
      let sq=0;
      for(let j=i-n+1;j<=i;j++){ const d=p[j]-mid[i]; sq+=d*d; }
      const sd=Math.sqrt(sq/n);
      upper[i]=mid[i]+k*sd; lower[i]=mid[i]-k*sd;
    }
    return {mid,upper,lower};
  }
  function macdSeries(p,fast,slow,signal){
    const ef=emaSeries(p,fast), es=emaSeries(p,slow);
    const macd=p.map((_,i)=> (ef[i]!=null&&es[i]!=null)? ef[i]-es[i] : null);
    const sig=new Array(p.length).fill(null);
    const k=2/(signal+1);
    let prev=null, count=0, seed=0;
    for(let i=0;i<p.length;i++){
      if(macd[i]==null) continue;
      count++;
      if(count<signal){ seed+=macd[i]; }
      else if(count===signal){ seed+=macd[i]; prev=seed/signal; sig[i]=prev; }
      else { prev=macd[i]*k+prev*(1-k); sig[i]=prev; }
    }
    const hist=p.map((_,i)=> (macd[i]!=null&&sig[i]!=null)? macd[i]-sig[i] : null);
    return {macd,signal:sig,hist};
  }
  // ADX from close prices only (high=low=close approximation), Wilder-smoothed.
  function adxSeries(p,n){
    const len=p.length;
    const out=new Array(len).fill(null);
    if(len<2*n+1) return out;
    const tr=new Array(len).fill(0), pdm=new Array(len).fill(0), ndm=new Array(len).fill(0);
    for(let i=1;i<len;i++){
      const up=p[i]-p[i-1], down=p[i-1]-p[i];
      pdm[i]=(up>down&&up>0)?up:0;
      ndm[i]=(down>up&&down>0)?down:0;
      tr[i]=Math.abs(p[i]-p[i-1]);
    }
    let atr=0,apdm=0,andm=0;
    for(let i=1;i<=n;i++){ atr+=tr[i]; apdm+=pdm[i]; andm+=ndm[i]; }
    const dx=new Array(len).fill(null);
    for(let i=n+1;i<len;i++){
      atr=atr-atr/n+tr[i]; apdm=apdm-apdm/n+pdm[i]; andm=andm-andm/n+ndm[i];
      const pdi=atr===0?0:100*apdm/atr, ndi=atr===0?0:100*andm/atr;
      const sum=pdi+ndi;
      dx[i]= sum===0?0:100*Math.abs(pdi-ndi)/sum;
    }
    let cnt=0, dsum=0, prev=null;
    for(let i=0;i<len;i++){
      if(dx[i]==null) continue;
      cnt++;
      if(cnt<=n){ dsum+=dx[i]; if(cnt===n){ prev=dsum/n; out[i]=prev; } }
      else { prev=(prev*(n-1)+dx[i])/n; out[i]=prev; }
    }
    return out;
  }
  // Build the per-day buy-signal array (and the overlay lines) for a technical
  // strategy. Returns { signal:[bool], lines:[{name,values,axis,dash,fade}] }.
  function buildTech(prices, style, tech){
    const t=tech||{};
    const n=prices.length;
    const sig=new Array(n).fill(false);
    const lines=[];
    const crossUp=(a,b,i)=> a[i]!=null&&b[i]!=null&&a[i-1]!=null&&b[i-1]!=null&&a[i-1]<=b[i-1]&&a[i]>b[i];
    if(style==='tech-ma-cross'){
      const fast=maSeries(prices,t.fastMaType||'ema',t.fastMaLen||50);
      const slow=maSeries(prices,t.slowMaType||'sma',t.slowMaLen||200);
      for(let i=1;i<n;i++) if(crossUp(fast,slow,i)) sig[i]=true;
      lines.push({name:`${(t.fastMaType||'ema').toUpperCase()} ${t.fastMaLen||50}`,values:fast,axis:'price',dash:'dash',fade:0.7});
      lines.push({name:`${(t.slowMaType||'sma').toUpperCase()} ${t.slowMaLen||200}`,values:slow,axis:'price',dash:'dot',fade:0.45});
    } else if(style==='tech-rsi'){
      const r=rsiSeries(prices,t.rsiPeriod||14); const thr=t.rsiOversold??35;
      for(let i=0;i<n;i++) if(r[i]!=null&&r[i]<thr) sig[i]=true;
      lines.push({name:`RSI ${t.rsiPeriod||14}`,values:r,axis:'osc',dash:'dash',fade:0.75});
      lines.push({name:`Oversold ${thr}`,values:new Array(n).fill(thr),axis:'osc',dash:'dot',fade:0.4});
    } else if(style==='tech-bollinger'){
      const {mid,upper,lower}=bollingerSeries(prices,t.bbPeriod||20,t.bbStd||2);
      if((t.bbTrigger||'below')==='reclaim'){
        for(let i=1;i<n;i++) if(lower[i]!=null&&lower[i-1]!=null&&prices[i]>=lower[i]&&prices[i-1]<lower[i-1]) sig[i]=true;
      } else {
        for(let i=0;i<n;i++) if(lower[i]!=null&&prices[i]<lower[i]) sig[i]=true;
      }
      lines.push({name:'BB Upper',values:upper,axis:'price',dash:'dot',fade:0.4});
      lines.push({name:`BB Mid ${t.bbPeriod||20}`,values:mid,axis:'price',dash:'dash',fade:0.6});
      lines.push({name:'BB Lower',values:lower,axis:'price',dash:'dot',fade:0.4,bandFill:true});
    } else if(style==='tech-macd-cross'){
      const {macd,signal}=macdSeries(prices,t.macdFast||12,t.macdSlow||26,t.macdSignal||9);
      for(let i=1;i<n;i++) if(crossUp(macd,signal,i)) sig[i]=true;
      lines.push({name:'MACD',values:macd,axis:'osc',dash:'dash',fade:0.75});
      lines.push({name:'Signal',values:signal,axis:'osc',dash:'dot',fade:0.45});
    } else if(style==='tech-macd-hist'){
      const {hist}=macdSeries(prices,t.macdFast||12,t.macdSlow||26,t.macdSignal||9);
      const thr=t.macdHistThreshold??0;
      for(let i=1;i<n;i++) if(hist[i]!=null&&hist[i-1]!=null&&hist[i]>thr&&hist[i-1]<=thr) sig[i]=true;
      lines.push({name:'MACD Hist',values:hist,axis:'osc',bar:true});
      lines.push({name:`Threshold ${thr}`,values:new Array(n).fill(thr),axis:'osc',dash:'dot',fade:0.4});
    } else if(style==='tech-adx'){
      const a=adxSeries(prices,t.adxPeriod||14); const thr=t.adxThreshold??25;
      for(let i=0;i<n;i++) if(a[i]!=null&&a[i]>thr) sig[i]=true;
      lines.push({name:`ADX ${t.adxPeriod||14}`,values:a,axis:'osc',dash:'dash',fade:0.75});
      lines.push({name:`Threshold ${thr}`,values:new Array(n).fill(thr),axis:'osc',dash:'dot',fade:0.4});
    }
    return {signal:sig, lines};
  }
  // A stable Sunday-aligned "year + week-of-year" key. NOTE: despite the name
  // this is NOT an ISO-8601 week number (ISO weeks are Monday-aligned and can
  // roll a late-December date into week 1 of the next year). It is a simple
  // local-time bucket that every "weekly" feature shares so they group
  // identically; the name is kept only because both tools import it by this name.
  function isoWeekBucket(dateStr){
    const dt=taParseDate(dateStr);
    const y=dt.getFullYear();
    const doy=Math.floor((dt-new Date(y,0,1))/86400000);
    const wk=Math.floor((doy+new Date(y,0,1).getDay())/7);
    return y+'-'+String(wk).padStart(2,'0');
  }
  function periodKey(dateStr, period){
    return period==='weekly' ? isoWeekBucket(dateStr) : dateStr.slice(0,7);
  }

  // When a decision is filled. Every rule in both DCA tools decides on a trading
  // day's close (a scheduled date, or the close a signal fires on); `exec` says
  // where the order fills:
  //   'close'      that same close (lag 0)
  //   'next-open'  the next trading day's open (lag 1), the evening-review habit
  //   'next-close' the next trading day's close (lag 1)
  // Returns { lag, fill } with fill[j] the price an order executing on day j
  // pays. A missing open reads as the previous close, the nearest price that
  // exists; proxy[j] marks the days that needed it.
  var EXEC_MODES = ['close', 'next-open', 'next-close'];
  function execPlan(closes, opens, exec){
    var mode = EXEC_MODES.indexOf(exec) >= 0 ? exec : 'next-open';
    var n = closes.length, fill = new Array(n), proxy = new Array(n).fill(false), j, o;
    for(j = 0; j < n; j++){
      if(mode !== 'next-open'){ fill[j] = closes[j]; continue; }
      o = opens ? opens[j] : undefined;
      if(Number.isFinite(o) && o > 0) fill[j] = o;
      else { fill[j] = j > 0 ? closes[j - 1] : closes[j]; proxy[j] = true; }
    }
    return { mode: mode, lag: mode === 'close' ? 0 : 1, fill: fill, proxy: proxy };
  }

  global.SharedTA = {
    execPlan: execPlan, EXEC_MODES: EXEC_MODES,
    smaSeries: smaSeries, emaSeries: emaSeries, maSeries: maSeries,
    rsiSeries: rsiSeries, bollingerSeries: bollingerSeries,
    macdSeries: macdSeries, adxSeries: adxSeries, buildTech: buildTech,
    isoWeekBucket: isoWeekBucket, periodKey: periodKey
  };

  /* ── Settings save/load (download/upload a config as JSON) ─────────────────
     Each tool builds its own plain-object snapshot and restores from it; these
     are just the transport helpers so a user can persist a configuration and
     resume it later instead of re-entering everything. */
  function downloadJson(filename, obj){
    var blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 0);
  }
  function uploadJson(onParsed, onError){
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.style.display = 'none';
    inp.addEventListener('change', function(){
      var f = inp.files && inp.files[0];
      if(!f){ inp.remove(); return; }
      var reader = new FileReader();
      reader.onload = function(){
        try { onParsed(JSON.parse(reader.result)); }
        catch(e){ if(typeof onError==='function') onError(e); else alert('Invalid JSON file: '+e.message); }
        inp.remove();
      };
      reader.onerror = function(){ if(typeof onError==='function') onError(new Error('Could not read file')); inp.remove(); };
      reader.readAsText(f);
    });
    document.body.appendChild(inp);
    inp.click();
  }

  global.SharedConfig = { download: downloadJson, upload: uploadJson };

  /* ── SharedIcon: one picture per job, on every tool ──────────────────────
     A reader who learns a button on one tool should read it on the next, so
     the icons that carry a meaning are drawn once, here:

       close      ✕   dismiss a panel, a modal or a card. Nothing is lost.
       trash      bin delete a row, a scenario, a chip, a loaded file.
       duplicate  two sheets and a plus: add a copy of this item beside it.
       edit       pencil: open this item for editing.
       clear      backspace key: empty the text field it sits in.
       reset      anticlockwise arrow: put this value back to its default.
       refresh    two arrows chasing round: fetch the latest data for what is
                  already loaded.
       save       floppy disk: write the work to a file.
       open       open folder: read a file from this device.
       view       eye: show the rendered result instead of its source.

     ✕ never deletes and the bin never closes; that is the whole point. Two
     ways to use it:

         SharedIcon.svg('trash')                       // markup for a template
         SharedIcon.button('trash', 'Remove this row', 'row-del', 'data-i="3"')
         <button class="btn-bare" data-icon="trash" …>  // static markup,
                                                         // filled at load

     button() builds a .btn-bare (no fill, no border, tinted on hover; the
     bin's hover is red). A labelled button can carry data-icon too and the
     icon is placed before its text. See "Buttons and icons" in
     _ref/design-reference.md for the full vocabulary.                     */
  function makeIcon(){
    var PATHS = {
      close: '<path d="M6 6l12 12M18 6 6 18" stroke-width="2"/>',
      trash: '<path d="M4 6.5h16"/><path d="M9 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/><path d="M6.2 6.5l.8 12.2a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l.8-12.2"/><path d="M10 10.5v6M14 10.5v6"/>',
      duplicate: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.2"/><path d="M15.5 8.5V5.7a2.2 2.2 0 0 0-2.2-2.2H5.7a2.2 2.2 0 0 0-2.2 2.2v7.6a2.2 2.2 0 0 0 2.2 2.2h2.8"/><path d="M14.5 11.9v5.2M11.9 14.5h5.2"/>',
      edit: '<path d="M16.4 4a2.1 2.1 0 0 1 3 3L8 18.4l-4.3 1.2L4.9 15.3z"/><path d="M14.4 6l3 3"/>',
      clear: '<path d="M8.7 5h10.8A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H8.7a1.5 1.5 0 0 1-1.15-.54L2.6 12l4.95-6.46A1.5 1.5 0 0 1 8.7 5z"/><path d="M11.6 9.6l4.8 4.8M16.4 9.6l-4.8 4.8"/>',
      reset: '<path d="M4.2 12a7.8 7.8 0 1 0 2.3-5.5"/><path d="M4.2 3.8v4.6h4.6"/>',
      refresh: '<path d="M19.6 10A7.8 7.8 0 0 0 5.5 7.3"/><path d="M5.2 3.6v4h4"/><path d="M4.4 14a7.8 7.8 0 0 0 14.1 2.7"/><path d="M18.8 20.4v-4h-4"/>',
      save: '<path d="M5 3.5h11.2L20.5 7.8V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v5h8v-5"/><rect x="7" y="13" width="10" height="7.5" rx=".6"/>',
      open: '<path d="M3.5 19V6a1.5 1.5 0 0 1 1.5-1.5h4.2l2 2.2H18a1.5 1.5 0 0 1 1.5 1.5V10"/><path d="M3.5 19l2.6-7.4A1.5 1.5 0 0 1 7.5 10.6h13.1a1 1 0 0 1 .95 1.3L19.3 18.5a1.5 1.5 0 0 1-1.4 1H3.5"/>',
      view: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
    };
    function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
    function svg(name){
      var p = PATHS[name];
      if(!p) return '';
      return '<svg class="ico ico-' + name + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + p + '</svg>';
    }
    // A bare icon button, as markup. label is its tooltip and accessible name.
    function button(name, label, cls, attrs){
      var c = 'btn-bare' + (name === 'trash' ? ' is-delete' : '') + (cls ? ' ' + cls : '');
      return '<button type="button" class="' + c + '" title="' + esc(label) + '" aria-label="' + esc(label) + '"' +
        (attrs ? ' ' + attrs : '') + '>' + svg(name) + '</button>';
    }
    // Static markup names its icon with data-icon; this puts the drawing in,
    // before any text the button already carries. Safe to run twice.
    function hydrate(root){
      var els = (root || document).querySelectorAll('[data-icon]');
      for(var i = 0; i < els.length; i++){
        var el = els[i], name = el.getAttribute('data-icon');
        if(!PATHS[name] || el.querySelector(':scope > .ico')) continue;
        el.insertAdjacentHTML('afterbegin', svg(name));
        if(name === 'trash' && el.classList.contains('btn-bare')) el.classList.add('is-delete');
        if(/\S/.test(el.textContent)) el.classList.add('has-ico'); // icon and a word
      }
    }
    return { svg: svg, button: button, hydrate: hydrate, names: Object.keys(PATHS) };
  }
  global.SharedIcon = makeIcon();

  /* ── SharedScenario — save the scenario to a file, open it again tomorrow ──
     Two small icon buttons (a floppy disk and an open folder) that write every
     input on the page to a JSON file and read one back. The mini cache already
     knows how to snapshot a tool and put it back, so a tool that uses Persist
     needs one line, after its Persist.init:

         SharedScenario.mount('.quick-start-row', { tool: 'financingvscash', persist: persist });

     The file is { tool, kind: 'scenario', version, savedAt, state }, where state
     is the Persist blob. A file from another tool is refused rather than half
     applied. A tool whose state does not live in Persist (the DCA explorers,
     which already had their own settings format) passes save()/load(obj) in
     place of persist, and its file is whatever save() returns.

     target  — element or selector the buttons are appended to: the Quick Start
               row where the tool has one, else the header's button cluster.
     options — tool (file tag and default file name), persist | save+load,
               filename, onError(message), onLoaded().                        */
  function makeScenario(){
    var ICON_SAVE = global.SharedIcon.svg('save');
    var ICON_OPEN = global.SharedIcon.svg('open');
    var TEXT = {
      en: { save: 'Save scenario to a file', load: 'Open a saved scenario file',
            wrong: 'That file is not a saved scenario for this tool.',
            bad: 'Could not open that file: ' },
      id: { save: 'Simpan skenario ke file', load: 'Buka file skenario tersimpan',
            wrong: 'File itu bukan skenario tersimpan untuk alat ini.',
            bad: 'File tidak bisa dibuka: ' }
    };
    function lang(){
      var l = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
      return l.indexOf('id') === 0 ? 'id' : 'en';
    }
    function stamp(){
      var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
    function button(cls, icon, label){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scenario-io-btn ' + cls;
      b.innerHTML = icon;
      b.title = label;
      b.setAttribute('aria-label', label);
      return b;
    }
    function mount(target, opts){
      opts = opts || {};
      var host = typeof target === 'string' ? document.querySelector(target) : target;
      if(!host || !opts.tool) return null;
      var t = TEXT[lang()];
      var fail = function(msg){
        if(typeof opts.onError === 'function') opts.onError(msg); else alert(msg);
      };
      var custom = typeof opts.save === 'function' && typeof opts.load === 'function';
      if(!custom && !(opts.persist && typeof opts.persist.snapshot === 'function')) return null;

      function body(){
        return custom ? opts.save() : {
          tool: opts.tool, kind: 'scenario', version: 1,
          savedAt: new Date().toISOString(), state: opts.persist.snapshot()
        };
      }
      function doSave(){
        downloadJson(opts.filename || (opts.tool + '-scenario-' + stamp() + '.json'), body());
      }
      // Returns whatever a custom load returns, so a tool that fetches before
      // it can draw (the DCA explorers) can say when it has finished.
      function doLoad(obj){
        var out;
        if(custom){ out = opts.load(obj); }
        else {
          if(!obj || obj.tool !== opts.tool || !obj.state || typeof obj.state !== 'object'){ fail(t.wrong); return; }
          opts.persist.load(obj.state);
        }
        // A loaded file is the user's own scenario, not one of the presets.
        document.querySelectorAll('.quick-start-btn.active').forEach(function(b){ b.classList.remove('active'); });
        if(typeof opts.onLoaded === 'function') opts.onLoaded(obj);
        return out;
      }
      // An embedded chart carries the same file in its link (SharedShare).
      if(global.SharedShare) global.SharedShare.state({
        save: function(){ var b = body(); if(b && b.savedAt) delete b.savedAt; return b; },
        load: doLoad
      });

      var wrap = document.createElement('div');
      wrap.className = 'scenario-io';
      wrap.setAttribute('data-no-abbr', '');
      // Beside the header's own buttons, look like them.
      var extra = host.classList.contains('header-right') ? ' btn-theme' : '';
      var bSave = button('scenario-save' + extra, ICON_SAVE, t.save);
      var bLoad = button('scenario-load' + extra, ICON_OPEN, t.load);
      bSave.addEventListener('click', doSave);
      bLoad.addEventListener('click', function(){
        uploadJson(doLoad, function(e){ fail(t.bad + (e && e.message ? e.message : e)); });
      });
      wrap.appendChild(bSave); wrap.appendChild(bLoad);
      host.appendChild(wrap);
      return { save: doSave, load: doLoad, el: wrap };
    }
    return { mount: mount };
  }
  global.SharedScenario = makeScenario();

  /* ── SharedLegend — swatches that look like the mark they stand for ────────
     A legend is a key, not a colour list: a dotted line on the chart has to be
     a dotted line in the legend, a shaded range a shaded block, a ring marker
     a ring. The swatch is therefore DERIVED from the Chart.js dataset that
     draws the series (`fromDataset`), so a change to the line can never leave
     a stale square behind in the key.

     One geometry function feeds all three renderers — the HTML swatch, the
     PNG export and the SVG export — so an exported chart carries exactly the
     key the page shows.

         var spec = SharedLegend.fromDataset(ds);          // or a literal spec
         SharedLegend.attach(itemEl, spec, 'Money deposited');

     Spec fields (all optional bar `color`):
       type    'line' (default) | 'area' | 'bar' | 'point' | 'candle'
       color   stroke colour;  colors  [a,b] for a line that changes colour
       dash    Chart.js borderDash, e.g. [2,3];   width  borderWidth
       fill    fill colour — under the line for an area line, the whole block
               for a band;  fill2  second fill, for a band filled either side
       hatch   colour of 45° lines over a bar or area block, or the area under
               a line — a hatched fill (existing plant under new build,
               curtailed output under the output, say) keyed as hatched
       hatchDir 'down' for lines falling left to right, so a second hatched
               fill (existing plant, beside curtailment) keys apart from the
               first; they rise left to right otherwise
       dots    colour of a dotted fill over a block or the area under a line
               (storage among generators, say) keyed as dotted
       point   {shape:'circle'|'ring'|'triangle'|'rect', fill, stroke, width,
                radius} — a marker drawn at the centre of the swatch
     ──────────────────────────────────────────────────────────────────────── */
  var LEG_W = 22, LEG_H = 12;

  function legFirst(v){ return Array.isArray(v) ? (v.find(function(x){ return !!x; }) || v[0]) : v; }

  function isTransparent(c){
    if(!c) return true;
    var s = String(c).trim().toLowerCase();
    if(s === 'transparent' || s === 'none') return true;
    var m = s.match(/^rgba?\([^)]*,\s*([\d.]+)\s*\)$/);
    if(m && parseFloat(m[1]) === 0) return true;
    return /^#[0-9a-f]{8}$/.test(s) && s.slice(7) === '00';
  }

  /* A swatch is drawn as SVG and as canvas, so only a CSS colour STRING can
     serve: a gradient object or a per-point callback read straight off a
     dataset would paint nothing and take the whole mark down with it. */
  function legCss(c){ return typeof c === 'string' && c.trim() ? c.trim() : null; }

  function normSpec(spec){
    var s = spec || {};
    var type = s.type || 'line';
    var colors = (s.colors && s.colors.length >= 2 && legCss(s.colors[0]) && legCss(s.colors[1]))
      ? [legCss(s.colors[0]), legCss(s.colors[1])] : null;
    var color = legCss(s.color) || (colors ? colors[0] : '#888888');
    var out = {
      type: type,
      color: color,
      colors: colors,
      dash: Array.isArray(s.dash) && s.dash.length ? s.dash.slice() : null,
      width: s.width == null ? 2 : s.width,
      fill: isTransparent(s.fill) ? null : legCss(s.fill),
      fill2: isTransparent(s.fill2) ? null : legCss(s.fill2),
      hatch: isTransparent(s.hatch) ? null : legCss(s.hatch),
      dots: isTransparent(s.dots) ? null : legCss(s.dots),
      point: null
    };
    if(out.hatch && s.hatchDir === 'down') out.hatchDir = 'down';
    if(out.type === 'line' && out.width <= 0 && out.fill) out.type = 'area';
    if(s.point){
      var p = s.point === true ? {} : s.point;
      out.point = {
        shape: p.shape || 'circle',
        fill: p.shape === 'ring' ? (isTransparent(p.fill) ? null : legCss(p.fill)) : (legCss(p.fill) || out.color),
        stroke: legCss(p.stroke) || (p.shape === 'ring' ? out.color : null),
        width: p.width == null ? (p.shape === 'ring' ? 2 : 0) : p.width,
        radius: p.radius == null ? 3.6 : p.radius
      };
    }
    return out;
  }

  /* Read a swatch straight off the dataset that draws the series, so the key
     and the chart cannot disagree. `over` patches anything the dataset states
     as a callback (per-point radii and colours) or does not state at all. */
  function legFromDataset(ds, over){
    ds = ds || {};
    var spec = {
      color: typeof ds.borderColor === 'string' ? ds.borderColor : legFirst(ds.borderColor),
      dash: ds.borderDash,
      width: ds.borderWidth == null ? 2 : ds.borderWidth,
      type: ds.type === 'bar' ? 'bar' : 'line'
    };
    if(spec.type === 'bar') spec.fill = typeof ds.backgroundColor === 'string' ? ds.backgroundColor : legFirst(ds.backgroundColor);
    else if(ds.fill) spec.fill = typeof ds.backgroundColor === 'string' ? ds.backgroundColor : legFirst(ds.backgroundColor);
    if(ds.showLine === false){ spec.type = 'point'; spec.fill = null; }
    if(typeof ds.pointRadius === 'number' && ds.pointRadius > 0){
      // Chart.js falls back to the dataset's own background/border for a point
      // that states none of its own, which is how a ring marker is written: a
      // panel-coloured fill inside a thick border. The swatch is 12px tall, so
      // a marker sized for the plot is brought down to fit without losing its
      // shape or the hollow that makes it a ring.
      var pb = typeof ds.pointBorderWidth === 'number' ? ds.pointBorderWidth : ds.borderWidth;
      spec.point = {
        shape: ds.pointStyle === 'triangle' ? 'triangle' : (ds.pointStyle === 'rect' ? 'rect' : 'circle'),
        fill: typeof ds.pointBackgroundColor === 'string' ? ds.pointBackgroundColor
            : (typeof ds.backgroundColor === 'string' ? ds.backgroundColor : spec.color),
        stroke: typeof ds.pointBorderColor === 'string' ? ds.pointBorderColor : spec.color,
        width: Math.min(2.2, pb || 0),
        radius: Math.max(2.6, Math.min(4.6, ds.pointRadius * 0.7))
      };
    }
    if(over) for(var k in over) if(Object.prototype.hasOwnProperty.call(over, k)) spec[k] = over[k];
    return normSpec(spec);
  }

  /* The one spec a series is keyed by. A dataset can pin its own mark with
     `legendSpec` for the looks a dataset cannot state — a band that is two
     datasets, a marker a plugin draws — and everything else is read off the
     dataset. The legend and the hover card both come through here, so the two
     cannot drift apart.  `over` patches whichever of the two answers. */
  function legSpecOf(ds, over){
    ds = ds || {};
    if(!ds.legendSpec) return legFromDataset(ds, over);
    var s = {}, k;
    for(k in ds.legendSpec) if(Object.prototype.hasOwnProperty.call(ds.legendSpec, k)) s[k] = ds.legendSpec[k];
    if(over) for(k in over) if(Object.prototype.hasOwnProperty.call(over, k)) s[k] = over[k];
    return normSpec(s);
  }

  /* The one description of what a swatch looks like. Everything below draws
     these primitives; `k` scales the whole box for high-resolution exports. */
  /* 45° lines rising left to right across a block (falling, down), cut to its
     edges, so a hatched fill keys as hatched in the swatch, the PNG and the
     SVG alike. */
  function legHatch(out, x, y, w, h, color, k, down){
    var gap = 3.2 * k;
    for(var c = gap / 2 - h; c < w; c += gap){
      var x1 = x + c, y1 = y + h, x2 = x + c + h, y2 = y;
      if(x1 < x){ y1 -= x - x1; x1 = x; }
      if(x2 > x + w){ y2 += x2 - (x + w); x2 = x + w; }
      // Falling: the same line mirrored top to bottom in the block.
      if(down){ y1 = 2 * y + h - y1; y2 = 2 * y + h - y2; }
      if(x2 - x1 > 0.3 * k) out.push({t:'line', x1:x1, y1:y1, x2:x2, y2:y2, stroke:color, sw:1 * k});
    }
  }

  /* Dots in staggered rows across a block, kept inside its edges, so a
     dotted fill keys as dotted in the swatch, the PNG and the SVG alike. */
  function legDots(out, x, y, w, h, color, k){
    var gap = 3 * k, r = 0.75 * k, row = 0;
    for(var cy = y + gap / 2; cy <= y + h - r; cy += gap, row++)
      for(var cx = x + (row % 2 ? gap : gap / 2); cx <= x + w - r; cx += gap)
        out.push({t:'circle', cx:cx, cy:cy, r:r, fill:color});
  }

  function legMarks(spec, k){
    k = k || 1;
    var s = normSpec(spec), W = LEG_W * k, H = LEG_H * k, cy = H / 2, out = [];
    var lw = Math.max(1 * k, (s.width || 0) * k);
    var dash = s.dash ? s.dash.map(function(d){ return Math.max(0.5, d * k); }) : null;

    if(s.type === 'bar'){
      var bw = W * 0.56;
      out.push({t:'rect', x:(W - bw)/2, y:cy - 4.5*k, w:bw, h:9*k, r:1.5*k, fill:s.fill || s.color});
      if(s.hatch) legHatch(out, (W - bw)/2, cy - 4.5*k, bw, 9*k, s.hatch, k, s.hatchDir === 'down');
      if(s.dots) legDots(out, (W - bw)/2, cy - 4.5*k, bw, 9*k, s.dots, k);
    } else if(s.type === 'candle'){
      // Body with a wick standing clear above and below it, so a candlestick
      // series reads as candles rather than as a block of colour.
      var cw = W * 0.38;
      out.push({t:'line', x1:W/2, y1:cy - 6*k, x2:W/2, y2:cy + 6*k, stroke:s.color, sw:1.2*k});
      out.push({t:'rect', x:(W - cw)/2, y:cy - 3.4*k, w:cw, h:6.8*k, r:1*k, fill:s.fill || s.color});
    } else if(s.type === 'area'){
      // A band or a filled region with no line of its own: the whole block is
      // the mark, in the two colours it is filled with when it has two.
      if(s.fill2){
        out.push({t:'rect', x:0, y:cy - 4.5*k, w:W/2, h:9*k, r:2*k, fill:s.fill || s.color});
        out.push({t:'rect', x:W/2, y:cy - 4.5*k, w:W/2, h:9*k, r:2*k, fill:s.fill2});
      } else {
        out.push({t:'rect', x:0, y:cy - 4.5*k, w:W, h:9*k, r:2*k, fill:s.fill || s.color});
      }
      if(s.hatch) legHatch(out, 0, cy - 4.5*k, W, 9*k, s.hatch, k, s.hatchDir === 'down');
      if(s.dots) legDots(out, 0, cy - 4.5*k, W, 9*k, s.dots, k);
    } else if(s.type !== 'point'){
      // A line, with the area under it shaded when the series is filled.
      if(s.fill) out.push({t:'rect', x:0, y:cy, w:W, h:H/2, r:0, fill:s.fill});
      if(s.fill && s.hatch) legHatch(out, 0, cy, W, H/2, s.hatch, k, s.hatchDir === 'down');
      if(s.fill && s.dots) legDots(out, 0, cy, W, H/2, s.dots, k);
      if(lw > 0){
        if(s.colors) {
          out.push({t:'line', x1:0, y1:cy, x2:W/2, y2:cy, stroke:s.colors[0], sw:lw, dash:dash});
          out.push({t:'line', x1:W/2, y1:cy, x2:W, y2:cy, stroke:s.colors[1], sw:lw, dash:dash});
        } else {
          out.push({t:'line', x1:0, y1:cy, x2:W, y2:cy, stroke:s.color, sw:lw, dash:dash});
        }
      }
    }
    if(s.point){
      var p = s.point, r = p.radius * k, pw = (p.width || 0) * k;
      if(p.shape === 'triangle'){
        out.push({t:'poly', pts:[[W/2, cy - r], [W/2 + r, cy + r * 0.85], [W/2 - r, cy + r * 0.85]],
                  fill:p.fill || s.color, stroke:p.stroke, sw:pw});
      } else if(p.shape === 'rect'){
        out.push({t:'rect', x:W/2 - r, y:cy - r, w:r*2, h:r*2, r:1*k, fill:p.fill || s.color, stroke:p.stroke, sw:pw});
      } else {
        out.push({t:'circle', cx:W/2, cy:cy, r:r, fill:p.fill, stroke:p.stroke, sw:pw});
      }
    }
    return out;
  }

  function legSvgMarkup(spec, k){
    k = k || 1;
    return legMarks(spec, k).map(function(m){
      var st = (m.stroke && m.sw > 0) ? ' stroke="' + m.stroke + '" stroke-width="' + m.sw + '"' : '';
      if(m.t === 'line') return '<line x1="' + m.x1 + '" y1="' + m.y1 + '" x2="' + m.x2 + '" y2="' + m.y2 +
        '" stroke="' + m.stroke + '" stroke-width="' + m.sw + '"' +
        (m.dash ? ' stroke-dasharray="' + m.dash.join(' ') + '"' : '') + ' stroke-linecap="butt"/>';
      if(m.t === 'rect') return '<rect x="' + m.x + '" y="' + m.y + '" width="' + m.w + '" height="' + m.h +
        '" rx="' + (m.r || 0) + '" fill="' + (m.fill || 'none') + '"' + st + '/>';
      if(m.t === 'circle') return '<circle cx="' + m.cx + '" cy="' + m.cy + '" r="' + m.r +
        '" fill="' + (m.fill || 'none') + '"' + st + '/>';
      return '<polygon points="' + m.pts.map(function(p){ return p[0] + ',' + p[1]; }).join(' ') +
        '" fill="' + (m.fill || 'none') + '"' + st + '/>';
    }).join('');
  }

  /* The HTML swatch: an inline SVG, so a dotted line is dotted at any zoom. */
  function legSwatchHtml(spec){
    return '<span class="legend-swatch" aria-hidden="true"><svg width="' + LEG_W + '" height="' + LEG_H +
      '" viewBox="0 0 ' + LEG_W + ' ' + LEG_H + '">' + legSvgMarkup(spec, 1) + '</svg></span>';
  }

  /* Fill a legend item: the swatch, the label, and the spec itself stashed on
     the element so the PNG/SVG exporters can redraw the very same mark. */
  function legAttach(el, spec, label){
    if(!el) return el;
    var s = normSpec(spec);
    el.dataset.swatch = JSON.stringify(s);
    el.innerHTML = legSwatchHtml(s) + '<span class="legend-label"></span>';
    el.lastChild.textContent = label == null ? '' : String(label);
    return el;
  }

  function legItem(spec, label, className){
    var el = document.createElement('div');
    el.className = className || 'legend-item';
    return legAttach(el, spec, label);
  }

  /* What the exporters read: every visible entry, with the mark it draws. */
  function legItemsOf(elOrId){
    var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    var out = [];
    if(!el) return out;
    el.querySelectorAll('.legend-item:not(.hidden)').forEach(function(item){
      var labelEl = item.querySelector('.legend-label');
      var label = (labelEl ? labelEl.textContent : item.textContent).trim();
      if(!label) return;
      var spec = null;
      if(item.dataset.swatch){ try { spec = JSON.parse(item.dataset.swatch); } catch(e){ spec = null; } }
      if(!spec){
        // An entry built without a spec still exports: fall back to the
        // colour of whatever swatch element it does carry.
        var sw = item.querySelector('.legend-swatch svg *, .dot');
        var col = sw ? (sw.getAttribute && sw.getAttribute('fill')) || window.getComputedStyle(sw).backgroundColor : '#888888';
        spec = normSpec({color: col, type:'point', point:{shape:'circle', radius:5}});
      }
      out.push({label: label, color: spec.color, swatch: spec});
    });
    return out;
  }

  /* Pack an exported legend into as many centred rows as it needs, reporting
     each row's measured width so the caller can centre it. A key wide enough
     to run off the canvas used to do exactly that, straight through the
     watermark. `measure` is the caller's own text measurement, so the same
     packing serves a 3x PNG and a 1x SVG.  `markW` is the swatch width at the
     caller's scale (SharedLegend.W * k). */
  function legLayout(items, measure, maxW, markW, gap, pad){
    var rows = [], row = [], w = 0, i, itemW;
    for(i = 0; i < items.length; i++){
      itemW = markW + gap + measure(items[i].label);
      if(row.length && w + pad + itemW > maxW){ rows.push({items: row, width: w}); row = []; w = 0; }
      w += (row.length ? pad : 0) + itemW;
      row.push(items[i]);
    }
    if(row.length) rows.push({items: row, width: w});
    return rows;
  }

  /* PNG export: the same primitives, painted on a canvas at scale `k`, with
     (x, cy) the left edge and vertical centre of the swatch box. */
  function legPaint(ctx, spec, x, cy, k){
    k = k || 1;
    var top = cy - (LEG_H * k) / 2;
    ctx.save();
    legMarks(spec, k).forEach(function(m){
      ctx.beginPath();
      if(m.t === 'line'){
        ctx.setLineDash(m.dash || []);
        ctx.lineWidth = m.sw; ctx.strokeStyle = m.stroke; ctx.lineCap = 'butt';
        ctx.moveTo(x + m.x1, top + m.y1); ctx.lineTo(x + m.x2, top + m.y2); ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      if(m.t === 'rect'){
        var r = Math.min(m.r || 0, m.h / 2, m.w / 2);
        if(ctx.roundRect) ctx.roundRect(x + m.x, top + m.y, m.w, m.h, r);
        else ctx.rect(x + m.x, top + m.y, m.w, m.h);
      } else if(m.t === 'circle'){
        ctx.arc(x + m.cx, top + m.cy, m.r, 0, Math.PI * 2);
      } else {
        m.pts.forEach(function(p, i){ i ? ctx.lineTo(x + p[0], top + p[1]) : ctx.moveTo(x + p[0], top + p[1]); });
        ctx.closePath();
      }
      if(m.fill){ ctx.fillStyle = m.fill; ctx.fill(); }
      if(m.stroke && m.sw > 0){ ctx.setLineDash([]); ctx.lineWidth = m.sw; ctx.strokeStyle = m.stroke; ctx.stroke(); }
    });
    ctx.restore();
  }

  /* SVG export: the same primitives as a <g>, ready to append to the export. */
  function legSvgNode(spec, x, cy, k){
    k = k || 1;
    var NS = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'translate(' + x + ',' + (cy - (LEG_H * k) / 2) + ')');
    g.innerHTML = legSvgMarkup(spec, k);
    if(!g.childNodes.length){
      // innerHTML on an SVG element is unsupported in a few engines; parse it.
      var doc = new DOMParser().parseFromString('<svg xmlns="' + NS + '">' + legSvgMarkup(spec, k) + '</svg>', 'image/svg+xml');
      Array.prototype.slice.call(doc.documentElement.childNodes).forEach(function(n){ g.appendChild(n); });
    }
    return g;
  }

  global.SharedLegend = {
    W: LEG_W, H: LEG_H,
    spec: normSpec,
    fromDataset: legFromDataset,
    specOf: legSpecOf,
    swatchHtml: legSwatchHtml,
    attach: legAttach,
    item: legItem,
    itemsOf: legItemsOf,
    layout: legLayout,
    markup: legSvgMarkup,
    paint: legPaint,
    svgNode: legSvgNode
  };

  /* ── SharedChartTip — the chart hover card, keyed exactly like the legend ─
     Chart.js draws its own tooltip on the canvas, and every row of it gets the
     same mark: a small filled-or-outlined square. So a chart whose key is a
     dotted line, a shaded band and a ring marker answered the hover with three
     squares, and the reader had to match rows to series by colour alone — the
     very thing SharedLegend exists to stop.

     This replaces that card with an HTML one whose row marks come from the
     SAME spec the legend entry is built from, so the key, the chart and the
     hover all show one mark per series. Being an element rather than canvas
     pixels, it is also never clipped by a small canvas.

         tooltip: SharedChartTip.options({ callbacks: {...}, filter: ... })

     A series whose mark the dataset cannot state — a band that is two datasets,
     a marker a plugin draws — pins it with `legendSpec` on the dataset, which
     is the one spec the legend and the hover then share.
     ──────────────────────────────────────────────────────────────────────── */
  var TIP_ID = 'sharedChartTip';

  /* A sign belongs to the figure it signs. Now that a row wraps instead of
     running out through the side of the card, a line can break between a
     leading − and the $ that follows it, and the next line then reads as a
     positive number. A word joiner closes that one break opportunity and no
     other: the sign has to open the run (start of line, after a space or an
     opening bracket) and be followed by a figure, so a hyphenated word, a
     1990-2020 span and the spaced dash of a (−$491.9k – $31.9k) range all
     still break where they should. */
  var TIP_WJ = /(^|[\s(\[])([-\u2212+])(?=[\d$\u20ac\u00a3\u00a5\u20b9])/g;

  function tipEsc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    }).replace(TIP_WJ, '$1$2\u2060');
  }

  function tipHide(){
    var el = document.getElementById(TIP_ID);
    if(el) el.classList.remove('visible');
  }

  function tipEl(){
    var el = document.getElementById(TIP_ID);
    if(!el){
      el = document.createElement('div');
      el.id = TIP_ID;
      el.className = 'chart-tip';
      // The read-out box under every chart is the accessible copy of this, so
      // the card itself stays out of the a11y tree rather than doubling it.
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      // A fixed card would otherwise hang in mid-air over a page that has
      // scrolled out from under the chart it belongs to.
      window.addEventListener('scroll', tipHide, true);
      window.addEventListener('resize', tipHide);
    }
    return el;
  }

  /* The mark a row carries is the mark its series is drawn with. `legendSpec`
     on the dataset wins, exactly as it does in the key; otherwise the spec is
     read off the dataset, with the per-element colours Chart.js resolved for
     this point filling in whatever the dataset states as an array or a
     callback (a pie slice, a bar in a coloured series). */
  function tipSpecOf(chart, item, colors){
    var ds = (item && item.dataset) || {};
    if(ds.legendSpec) return legSpecOf(ds);
    var lc = colors || {};
    var meta = (chart && chart.getDatasetMeta && item) ? chart.getDatasetMeta(item.datasetIndex) : null;
    var kind = ds.type || (meta && meta.type) ||
               (chart && chart.config && (chart.config.type || (chart.config._config && chart.config._config.type))) || 'line';
    var bg = legCss(lc.backgroundColor) || legFirst(ds.backgroundColor);
    var bc = legCss(lc.borderColor) || legFirst(ds.borderColor);
    if(kind === 'bar') return normSpec({type: 'bar', fill: bg, color: bc});
    if(kind === 'pie' || kind === 'doughnut' || kind === 'polarArea')
      return normSpec({type: 'bar', fill: bg || bc, color: bc});
    if(kind === 'candlestick' || kind === 'ohlc')
      return normSpec({type: 'candle', color: bc || bg, fill: bg || bc});
    // A line, a scatter or anything drawn from them: the key's own reader.
    return legSpecOf(ds, legCss(ds.borderColor) ? null : (bc ? {color: bc} : null));
  }

  function tipNote(line){ return '<div class="chart-tip-note">' + tipEsc(line) + '</div>'; }

  // A callback that has nothing to say returns an empty string, which would
  // otherwise open an empty line in the card.
  function tipLines(v){
    return (v || []).filter(function(line){ return String(line == null ? '' : line).trim() !== ''; });
  }

  function tipMarkup(chart, tooltip){
    var showMarks = !(tooltip.options && tooltip.options.displayColors === false);
    var html = '';
    tipLines(tooltip.title).forEach(function(line){
      html += '<div class="chart-tip-title">' + tipEsc(line) + '</div>';
    });
    tipLines(tooltip.beforeBody).forEach(function(line){ html += tipNote(line); });
    (tooltip.body || []).forEach(function(body, i){
      var mark = showMarks
        ? legSwatchHtml(tipSpecOf(chart, (tooltip.dataPoints || [])[i], (tooltip.labelColors || [])[i]))
        : '';
      tipLines(body.before).forEach(function(line){ html += tipNote(line); });
      tipLines(body.lines).forEach(function(line, k){
        // Only the first line of a multi-line entry carries the mark; the rest
        // line up under it, so one series still reads as one row.
        html += '<div class="chart-tip-row">' +
                (showMarks ? (k === 0 ? mark : '<span class="legend-swatch" aria-hidden="true"></span>') : '') +
                '<span class="chart-tip-label">' + tipEsc(String(line).replace(/^\s+/, '')) + '</span></div>';
      });
      tipLines(body.after).forEach(function(line){ html += tipNote(line); });
    });
    tipLines(tooltip.afterBody).forEach(function(line){ html += tipNote(line); });
    tipLines(tooltip.footer).forEach(function(line){
      html += '<div class="chart-tip-footer">' + tipEsc(line) + '</div>';
    });
    return html;
  }

  /* Beside the caret and centred on it, which is where the canvas tooltip sat,
     but clamped to the VIEWPORT rather than to the canvas: the card is an
     element, so a small chart no longer cuts it in half. */
  function tipPlace(el, chart, tooltip){
    var r = chart.canvas.getBoundingClientRect();
    var cx = r.left + tooltip.caretX, cy = r.top + tooltip.caretY;
    var w = el.offsetWidth, h = el.offsetHeight, pad = 8, gap = 14;
    var left = cx + gap;
    if(left + w > window.innerWidth - pad) left = cx - gap - w;
    el.style.left = Math.max(pad, Math.min(left, window.innerWidth - pad - w)) + 'px';
    el.style.top = Math.max(pad, Math.min(cy - h / 2, window.innerHeight - pad - h)) + 'px';
  }

  function tipHandler(ctx){
    var chart = ctx && ctx.chart, tooltip = ctx && ctx.tooltip;
    if(!chart || !chart.canvas || !tooltip || !tooltip.opacity){ tipHide(); return; }
    var html = tipMarkup(chart, tooltip);
    if(!html){ tipHide(); return; }
    var el = tipEl();
    el.innerHTML = html;
    el.classList.add('visible');
    tipPlace(el, chart, tooltip);
  }

  /* Wrap a tool's own tooltip options: same callbacks, same filter, drawn as
     the shared card instead of by Chart.js. */
  function tipOptions(opts){
    var o = opts || {};
    o.enabled = false;
    o.external = tipHandler;
    return o;
  }

  global.SharedChartTip = {
    id: TIP_ID,
    options: tipOptions,
    handler: tipHandler,
    spec: tipSpecOf,
    markup: tipMarkup,
    hide: tipHide
  };

  /* ══════════════════════════════════════════════════════════════════════
     CHART ZOOM (SharedZoom)

     Two rules every zoomable chart on the site obeys, in one place so they
     cannot drift apart tool by tool:

     1. A gesture can never leave the data. chartjs-plugin-zoom will happily
        pan a linear axis into empty space and pinch it down to a single
        pixel-wide sliver, so every chart hands it the extent of what it
        actually plotted as `limits`, plus a floor on how far in a pinch may
        go (a handful of points wide — past that there is nothing left to
        read). A category axis is bounded by its labels already, but not
        floored, so it gets the same treatment in index units.

     2. The y axis follows the x window. A linear y axis is sized once, from
        the whole series, so zooming into five years of a sixty-year plan
        leaves those five years as a flat smear against a scale built for the
        end of it. Refitting y to the slice on screen is what makes a zoom
        worth making.

     The refit is a Chart.js PLUGIN rather than a zoom callback, because it has
     to happen INSIDE the update the gesture already triggers. A second update
     chasing the first leaves the lines drawn against the old scale while the
     ticks already show the new one, which is worse than not refitting at all.
     The zoom plugin writes the window it is about to draw into the x scale's
     options and then calls update, so the window is readable from the moment
     that update starts, and the axis is sized to it in `afterDataLimits`,
     while the scale is working out its own range (see the hook below).

     3. A chart that is handed new data opens on it. `SharedZoom.resetView`
        drops the window a previous pan or pinch left in the axis options, so
        a recompute, a preset or a fresh simulate draws the whole of what was
        just computed rather than yesterday's zoom over today's numbers.

     A chart opts in by carrying, in its own options,
       plugins: {sharedYFit: {auto: {…}}}        or  {fit: {…}}
     — read on the very first update, so the chart OPENS on the fitted axis —
     or by hanging the same config on the instance as `chart.$autoFitY` /
     `chart.$fitY`, for a chart whose fitters are rebuilt when its data is
     replaced in place. Either way:

       fit  {scaleId: function(xMin, xMax){ return {min, max}; }}
            bespoke fitters, for a chart that sizes an axis to SOME of its
            series rather than all of them.
       auto {…}
            the generic fitter below, which reads the datasets the chart is
            actually showing. Options:
              axes        scale ids to fit (default ['y'])
              includeZero keep zero on the axis either way
              skip        function(dataset, i) -> true to ignore
              fixed       scale ids to leave alone, for an axis pinned to a
                          range of its own (a 0-100 percentage stack)
            A dataset may also opt itself out with `noAutoFit`, which is how a
            series that is deliberately allowed to run off the top of its axis
            says so.

     A fitted axis must NOT carry `min`/`max` in its own configuration. Those
     are USER bounds, and Chart.js pins the axis back to them after the refit
     has run: the chart would open on the right view and then never move again.
     Hand the opening view to the fitter instead — it is applied on the first
     update like any other.
     ══════════════════════════════════════════════════════════════════════ */

  /* The x window the chart is about to draw. The zoom plugin writes numeric
     bounds onto the scale's OPTIONS; before the first gesture they are absent,
     which means the whole of the data. */
  function xWindowOf(chart){
    var sc = chart.options && chart.options.scales && chart.options.scales.x;
    if(!sc) return null;
    var lo = typeof sc.min === 'number' && isFinite(sc.min) ? sc.min : -Infinity;
    var hi = typeof sc.max === 'number' && isFinite(sc.max) ? sc.max : Infinity;
    if(hi < lo) return null;
    return {min: lo, max: hi};
  }

  /* Pad a raw hi/lo into axis bounds. Ten per cent of the span, with a floor
     tied to the numbers themselves so a nearly flat series still gets air
     rather than a hairline box. */
  function padBounds(lo, hi, opts){
    opts = opts || {};
    if(opts.includeZero && lo > 0) lo = 0;
    if(opts.includeZero && hi < 0) hi = 0;
    var pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.02, Math.abs(lo) * 0.02);
    if(!(pad > 0)) pad = Math.max(Math.abs(hi), 1) * 0.1;
    var min = lo - pad * (opts.bottomPad == null ? 0.6 : opts.bottomPad);
    // Never open a gap below an empty pot: a series that never goes negative
    // reads against zero, not against some arbitrary padding below it.
    if(lo >= 0 && min < 0) min = 0;
    return {min: min, max: hi + pad * (opts.topPad == null ? 1 : opts.topPad)};
  }

  /* Scan the datasets the chart is SHOWING for the y extent inside an x
     window. Points are read in either shape Chart.js accepts: {x, y} pairs on
     a linear axis, or bare numbers on a category axis, where the index is the
     x. The nearest point on each side of the window counts too, so a segment
     that crosses an edge is scaled with the slice it is drawn in rather than
     clipped out of its own axis. */
  /* A stacked axis is sized by the TOP of the stack, not by any one series, so
     the values sharing an x are added up first — positives and negatives apart,
     the way Chart.js stacks them — and the extent is taken over those totals. */
  function scanStacked(chart, win, axisId, cfg){
    var up = {}, down = {}, any = false;
    var sets = (chart.data && chart.data.datasets) || [];
    sets.forEach(function(ds, i){
      if(!ds || ds.noAutoFit) return;
      if(cfg.skip && cfg.skip(ds, i)) return;
      if((ds.yAxisID || 'y') !== axisId) return;
      if(chart.isDatasetVisible && !chart.isDatasetVisible(i)) return;
      var data = ds.data || [];
      for(var k = 0; k < data.length; k++){
        var p = data[k], x, y;
        if(p && typeof p === 'object'){ x = p.x; y = p.y; } else { x = k; y = p; }
        if(typeof x !== 'number' || !isFinite(x)) x = k;
        if(y == null || typeof y !== 'number' || !isFinite(y)) continue;
        if(x < win.min || x > win.max) continue;
        var key = String(x);
        if(y >= 0) up[key] = (up[key] || 0) + y; else down[key] = (down[key] || 0) + y;
        any = true;
      }
    });
    if(!any) return null;
    var lo = 0, hi = 0;
    Object.keys(up).forEach(function(k){ if(up[k] > hi) hi = up[k]; });
    Object.keys(down).forEach(function(k){ if(down[k] < lo) lo = down[k]; });
    return {lo: lo, hi: hi};
  }

  function scanExtent(chart, win, axisId, cfg){
    var lo = null, hi = null;
    var sets = (chart.data && chart.data.datasets) || [];
    sets.forEach(function(ds, i){
      if(!ds || ds.noAutoFit) return;
      if(cfg.skip && cfg.skip(ds, i)) return;
      if((ds.yAxisID || 'y') !== axisId) return;
      if(chart.isDatasetVisible && !chart.isDatasetVisible(i)) return;
      var data = ds.data || [];
      var before = null, after = null, k, p, x, y;
      for(k = 0; k < data.length; k++){
        p = data[k];
        if(p && typeof p === 'object'){ x = p.x; y = p.y; } else { x = k; y = p; }
        if(typeof x !== 'number' || !isFinite(x)) x = k;
        if(y == null || typeof y !== 'number' || !isFinite(y)) continue;
        if(x < win.min){ before = y; continue; }
        if(x > win.max){ if(after === null) after = y; continue; }
        if(lo === null || y < lo) lo = y;
        if(hi === null || y > hi) hi = y;
      }
      [before, after].forEach(function(v){
        if(v === null) return;
        if(lo === null || v < lo) lo = v;
        if(hi === null || v > hi) hi = v;
      });
    });
    if(lo === null || hi === null) return null;
    return {lo: lo, hi: hi};
  }

  /* Write the fitted bounds onto the chart's own configuration, so they
     persist past this update, and onto the scale's resolver proxy, which is
     what the scale reads. */
  function writeBounds(chart, id, b){
    var opt = chart.options.scales && chart.options.scales[id];
    if(opt){ opt.min = b.min; opt.max = b.max; }
    var sc = chart.scales && chart.scales[id];
    if(sc && sc.options && sc.options !== opt){ sc.options.min = b.min; sc.options.max = b.max; }
  }

  /* The bounds one y scale should carry for the x window the chart is about to
     draw, or null if this scale is not one the chart asked to have fitted. */
  function boundsFor(chart, id, fits, auto){
    var win = xWindowOf(chart);
    if(!win) return null;
    if(fits && fits[id]) return fits[id](win.min, win.max) || null;
    if(!auto) return null;
    var axes = auto.axes || ['y'];
    if(axes.indexOf(id) < 0) return null;
    if(auto.fixed && auto.fixed.indexOf(id) >= 0) return null;
    var sc = (chart.options.scales || {})[id];
    var stacked = sc && sc.stacked;
    var ext = stacked ? scanStacked(chart, win, id, auto) : scanExtent(chart, win, id, auto);
    if(!ext) return null;
    return padBounds(ext.lo, ext.hi, {
      includeZero: auto.includeZero, topPad: auto.topPad, bottomPad: auto.bottomPad
    });
  }

  /* Write fitted bounds into the chart's own options. This is what `refit`
     does OUTSIDE an update; it is deliberately NOT done from `beforeUpdate`.
     Writing a y bound into the options while an update is already running
     makes Chart.js resolve every scale from the configuration it cached at
     the start of that update, so an x axis whose data has just been replaced
     is sized from the data it no longer holds and only catches up on the NEXT
     update — the stale "0 to 1" axis a reader used to have to clear by hand.
     Sizing the axis from `afterDataLimits` alone costs nothing: that hook
     runs on the very first update too, so a chart still OPENS on the fitted
     axis. */
  function writeFits(chart, popts){
    var fits = chart.$fitY || (popts && popts.fit);
    var auto = chart.$autoFitY || (popts && popts.auto);
    if(!fits && !auto) return;
    var scales = chart.options.scales || {};
    var ids = Object.keys(fits || {}).concat((auto && auto.axes) || []);
    ids.forEach(function(id, i){
      if(ids.indexOf(id) !== i) return;                 // named twice
      if(!scales[id]) return;
      var b = boundsFor(chart, id, fits, auto);
      if(b) writeBounds(chart, id, b);
    });
  }

  /* The bounds a chart's axes carried before any gesture touched them, kept so
     `resetView` can put them back. Read once, off the configuration the chart
     was built with: the zoom plugin writes a pan or a pinch into those same
     option slots, so anything read later is a window, not a baseline. */
  function captureBase(chart){
    if(chart.$zoomBase) return;
    var base = {}, scales = (chart.options && chart.options.scales) || {};
    Object.keys(scales).forEach(function(id){
      var sc = scales[id] || {};
      base[id] = {
        hasMin: typeof sc.min !== 'undefined', min: sc.min,
        hasMax: typeof sc.max !== 'undefined', max: sc.max
      };
    });
    chart.$zoomBase = base;
  }

  /* Put every axis back to the view the chart opened on, dropping whatever
     window a pan or a pinch left behind. Call it whenever the data underneath
     a chart is REPLACED — a recompute, a preset, a fresh simulate — because a
     zoom into year 3 of the run just discarded says nothing about the run that
     replaced it, and a reader should not have to press a reset button to see
     the numbers they just asked for. An axis the chart deliberately pinned in
     its own configuration is restored to that pin, not cleared.

     It only records the intent; the caller's own `update()` draws it, so a
     render still costs exactly one update. */
  function resetView(chart){
    if(!chart || !chart.options) return;
    captureBase(chart);
    var base = chart.$zoomBase || {}, scales = chart.options.scales || {};
    Object.keys(scales).forEach(function(id){
      var sc = scales[id], b = base[id];
      if(!sc) return;
      if(b && b.hasMin) sc.min = b.min; else delete sc.min;
      if(b && b.hasMax) sc.max = b.max; else delete sc.max;
    });
  }

  var FIT_PLUGIN = {
    id: 'sharedYFit',
    /* The baseline is taken before the chart's first update, which is the last
       moment it is certainly free of gesture state. */
    afterInit: captureBase,
    /* The config can arrive two ways. `options.plugins.sharedYFit` is read on
       every update, so a chart built once with a generic fit opens on the
       fitted axis rather than snapping to it on the first gesture;
       `chart.$fitY` / `chart.$autoFitY` are hung on the instance, for a chart
       whose fitters are rebuilt whenever its data is replaced in place. An
       instance property wins, because it is the later word.

       The fit happens here, on the scale itself, because a scale resolves its
       own range while it updates: this hook is the one point where the data
       limits for THIS update are known and can still be overridden.
       `args.scale` is the scale being sized, so each pane of a stacked pair is
       served in its own turn. */
    afterDataLimits: function(chart, args, popts){
      var scale = args && args.scale;
      if(!scale) return;
      var fits = chart.$fitY || (popts && popts.fit);
      var auto = chart.$autoFitY || (popts && popts.auto);
      if(!fits && !auto) return;
      var b = boundsFor(chart, scale.id, fits, auto);
      if(!b) return;
      scale.min = b.min; scale.max = b.max;
    }
  };

  /* The gesture block every zoomable chart passes to `plugins.zoom`, so pan,
     wheel and pinch feel the same everywhere. `min`/`max` are the extent of
     the plotted data in x units (indices on a category axis); `points` is how
     many of them there are, which sets how far in a pinch may go. */
  function zoomOptions(cfg){
    cfg = cfg || {};
    var o = {
      pan: {enabled: cfg.pan !== false, mode: cfg.mode || 'x'},
      zoom: {
        wheel: {enabled: cfg.wheel !== false, speed: cfg.speed || 0.08},
        pinch: {enabled: cfg.pinch !== false},
        mode: cfg.mode || 'x'
      }
    };
    var lim = zoomLimits(cfg);
    if(lim) o.limits = lim;
    return o;
  }

  /* `limits` for one or more x scales. A chart with a second x axis over the
     same numbers (a calendar year and the age it lands on, say) passes both
     ids, because the zoom plugin moves every x scale together and a limit on
     one of them alone would let the other drift out of step. */
  function zoomLimits(cfg){
    cfg = cfg || {};
    if(!isFinite(cfg.min) || !isFinite(cfg.max)) return null;
    var span = Math.max(cfg.max - cfg.min, 0);
    if(!(span > 0)) return null;
    var minRange = cfg.minRange;
    if(minRange == null){
      // Roughly five data points: past that a line chart is two points and a
      // lot of grid. A chart that knows nothing about its density gets a
      // fortieth of the span, the same ceiling by another route.
      var pts = cfg.points;
      minRange = (pts && pts > 1) ? (span / (pts - 1)) * 5 : span / 40;
    }
    minRange = Math.min(minRange, span);
    var bound = {min: cfg.min, max: cfg.max, minRange: minRange};
    var out = {};
    (cfg.axes || ['x']).forEach(function(id){ out[id] = bound; });
    return out;
  }

  /* Registering the refit globally is offered for a page that builds charts in
     many places, but the usual wiring is per chart — `plugins: [SharedZoom.plugin]`
     in the chart's own config — so it cannot depend on shared.js having loaded
     after Chart.js. Charts that carry neither $fitY nor $autoFitY never notice
     it either way. */
  function registerFit(){
    var C = global.Chart;
    if(!C || !C.register) return false;
    if(C.registry && C.registry.plugins && C.registry.plugins.get){
      try { if(C.registry.plugins.get(FIT_PLUGIN.id)) return true; } catch(e){ /* not registered yet */ }
    }
    C.register(FIT_PLUGIN);
    return true;
  }

  global.SharedZoom = {
    plugin: FIT_PLUGIN,
    register: registerFit,
    options: zoomOptions,
    limits: zoomLimits,
    /* Fit y to the current x window outside an update — used right after a
       chart's data is replaced in place, where the axis would otherwise keep
       the bounds of the data it no longer holds. */
    refit: function(chart){
      if(!chart) return;
      var popts = chart.options && chart.options.plugins && chart.options.plugins.sharedYFit;
      writeFits(chart, popts);
    },
    /* Back to the view the chart opened on — see `resetView` above. */
    resetView: resetView
  };

  /* ── Mini cache (autosave) ─────────────────────────────────────────────────
     Snapshots a tool's form controls to localStorage and restores them on the
     next visit, so a returning user keeps their previous work instead of a
     blank page. Best-effort: it silently no-ops in private mode or on quota
     errors — persistence is a convenience, never a dependency.

     Usage (call once, at the very end of the tool's setup so restored values
     land after any default/demo seeding):

         Persist.init('financingvscash', { onRestore: recompute });

     What it saves: every <input>/<textarea>/<select> that has a stable handle
     (data-persist attribute, else id, else name). Skips file/password/hidden/
     button inputs and anything marked data-no-persist (put that on transient
     controls like search boxes). Radios are keyed by group name.

     Options:
       onRestore(data) — called once after values are restored; pass the tool's
                         recompute/render entrypoint so the UI reflects the
                         restored state. When omitted, a bubbling input+change
                         event is fired on each restored control instead.
       extra           — { save():obj, restore(obj) } to piggyback state that
                         isn't in a form control (a JS array of scenarios, a
                         "mode" flag, editable tax brackets…) into the same blob
                         and lifecycle. Call the returned schedule() after such
                         state changes so it gets saved.
       scope           — root element to scan (default: document).
       debounce        — ms to coalesce rapid edits before saving (default 400).
       version         — bump to invalidate an old, incompatible snapshot.

     Returns { save, schedule, collect, clear, snapshot, load }. snapshot() is
     the same blob that goes to localStorage; load(blob) applies one to the live
     page exactly as a returning visit would, then saves it. SharedScenario
     below uses the pair to write a scenario to a file and read it back.      */
  function makePersist(){
    function keyFor(ns, ver){ return 'abt:save:' + ns + ':v' + (ver || 1); }
    function handle(el){ return el.getAttribute('data-persist') || el.id || el.name || ''; }
    function persistable(el){
      if(!el || !el.tagName) return false;
      if(el.closest('[data-no-persist]')) return false;
      var tag = el.tagName;
      if(tag === 'SELECT' || tag === 'TEXTAREA') return !!handle(el);
      if(tag !== 'INPUT') return false;
      var t = (el.type || 'text').toLowerCase();
      if(['file','password','submit','button','reset','image','hidden'].indexOf(t) >= 0) return false;
      return !!handle(el);
    }
    function collect(scope){
      var out = {}, els = scope.querySelectorAll('input, textarea, select');
      for(var i=0;i<els.length;i++){
        var el = els[i]; if(!persistable(el)) continue;
        var t = (el.type||'').toLowerCase(), id = handle(el);
        if(t === 'checkbox') out['c:'+id] = !!el.checked;
        else if(t === 'radio'){ if(el.checked) out['r:'+el.name] = el.value; }
        else out['v:'+id] = el.value;
      }
      return out;
    }
    function restore(scope, data){
      var els = scope.querySelectorAll('input, textarea, select'), touched = [];
      for(var i=0;i<els.length;i++){
        var el = els[i]; if(!persistable(el)) continue;
        var t = (el.type||'').toLowerCase(), id = handle(el), hit = false;
        if(t === 'checkbox'){
          if(Object.prototype.hasOwnProperty.call(data,'c:'+id)){ el.checked = !!data['c:'+id]; hit = true; }
        } else if(t === 'radio'){
          if(Object.prototype.hasOwnProperty.call(data,'r:'+el.name)){ el.checked = (el.value === data['r:'+el.name]); hit = true; }
        } else if(Object.prototype.hasOwnProperty.call(data,'v:'+id)){ el.value = data['v:'+id]; hit = true; }
        // A browser only fires change on the radio that became checked, and
        // tools read el.value in that handler, so the unchecked ones in the
        // group are restored but not announced.
        if(hit && !(t === 'radio' && !el.checked)) touched.push(el);
      }
      return touched;
    }
    function init(ns, opts){
      opts = opts || {};
      var scope = opts.scope || document;
      var KEY = keyFor(ns, opts.version);
      var hasExtra = opts.extra && typeof opts.extra.restore === 'function' && opts.extra.save && typeof opts.extra.save === 'function';
      function apply(saved){
        var touched = restore(scope, saved.__fields || saved);
        if(hasExtra && saved.__extra !== undefined){ try { opts.extra.restore(saved.__extra); } catch(e){} }
        if(typeof opts.onRestore === 'function'){ try { opts.onRestore(saved); } catch(e){} }
        else for(var i=0;i<touched.length;i++){
          touched[i].dispatchEvent(new Event('input', {bubbles:true}));
          touched[i].dispatchEvent(new Event('change', {bubbles:true}));
        }
      }
      var saved = null;
      // An embedded chart opens on the scenario in its link, never on the
      // viewer's own cache, and never writes over it.
      if(!EMBED){ try { var raw = localStorage.getItem(KEY); if(raw) saved = JSON.parse(raw); } catch(e){} }
      if(saved && typeof saved === 'object') apply(saved);
      var timer = null;
      function snapshot(){
        var blob = { __fields: collect(scope) };
        if(hasExtra){ try { blob.__extra = JSON.parse(JSON.stringify(opts.extra.save())); } catch(e){} }
        return blob;
      }
      function save(){
        if(EMBED) return;
        try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch(e){}
        if(typeof opts.onSave === 'function'){ try { opts.onSave(); } catch(e){} }
      }
      function schedule(){ if(timer) clearTimeout(timer); timer = setTimeout(save, opts.debounce == null ? 400 : opts.debounce); }
      scope.addEventListener('input', schedule, true);
      scope.addEventListener('change', schedule, true);
      // Always flush on unload so structural changes that didn't fire an input
      // event (a removed row, a cleared field) are still captured.
      window.addEventListener('beforeunload', function(){ if(timer) clearTimeout(timer); save(); });
      return {
        save: save,
        schedule: schedule,
        collect: function(){ return collect(scope); },
        clear: function(){ try { localStorage.removeItem(KEY); } catch(e){} },
        snapshot: snapshot,
        load: function(blob){
          if(!blob || typeof blob !== 'object') return;
          if(timer) clearTimeout(timer);
          apply(blob);
          save();
        }
      };
    }
    return { init: init };
  }
  global.Persist = makePersist();

  /* ── Global Tooltip ── */
  function initTooltip(){
    if (global.__sharedTooltipInit) return;
    global.__sharedTooltipInit = true;

    var tt = document.getElementById('globalTooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'globalTooltip';
      document.body.appendChild(tt);
    }
    if (!tt.querySelector('.tt-text')) {
      tt.innerHTML = '<div class="tt-text"></div><div class="tt-arrow"></div>';
    }
    var ttText = tt.querySelector('.tt-text');
    var ttArrow = tt.querySelector('.tt-arrow');
    var PAD = 8;
    var activeIcon = null;

    /* A tip on an options control explains only the option that is selected
       (see "Tooltips" in _ref/design-reference.md). The element says so with
       data-tip-options, and this small line under the tip tells the reader the
       other options have their own explanation. */
    function optionsHint(){
      var id = /^id\b/i.test(document.documentElement.lang || '');
      return '<span class="tip-hint">' +
        (id ? 'Ganti pilihan untuk melihat penjelasan lainnya.'
            : 'Change the option to see the others explained.') + '</span>';
    }

    function hide(){
      activeIcon = null;
      tt.classList.remove('visible');
      tt.style.display = 'none';
    }

    // Position the tooltip against the currently-hovered icon. Called on
    // hover and re-called on scroll/resize so the bubble stays glued to the
    // trigger instead of drifting when the page moves underneath it.
    function position(){
      if (!activeIcon || !activeIcon.isConnected) { hide(); return; }

      tt.classList.remove('flip-below');

      var rect = activeIcon.getBoundingClientRect();
      // If the trigger has scrolled out of view, hide rather than float.
      if (rect.bottom < 0 || rect.top > window.innerHeight ||
          rect.right < 0 || rect.left > window.innerWidth) {
        tt.style.opacity = '0';
        return;
      }

      var ttW = tt.offsetWidth;
      var ttH = tt.offsetHeight;
      var iconCX = rect.left + rect.width / 2;

      var top = rect.top - ttH - 10;
      var left = iconCX - ttW / 2;

      if (top < PAD) {
        top = rect.bottom + 10;
        tt.classList.add('flip-below');
      }

      left = Math.max(PAD, Math.min(left, window.innerWidth - ttW - PAD));
      top = Math.max(PAD, Math.min(top, window.innerHeight - ttH - PAD));

      tt.style.left = left + 'px';
      tt.style.top = top + 'px';
      tt.style.opacity = '1';

      var arrowX = Math.max(10, Math.min(iconCX - left, ttW - 10));
      ttArrow.style.left = arrowX + 'px';
    }

    document.addEventListener('mouseover', function(e){
      var icon = e.target.closest('[data-tip]');
      if (!icon) { hide(); return; }
      var tip = icon.getAttribute('data-tip');
      if (!tip) { hide(); return; }

      activeIcon = icon;
      ttText.innerHTML = tip + (icon.hasAttribute('data-tip-options') ? optionsHint() : '');
      tt.classList.add('visible');
      tt.style.display = 'block';
      tt.style.opacity = '0';
      position();
    });

    document.addEventListener('mouseout', function(e){
      var icon = e.target.closest('[data-tip]');
      if (!icon) return;
      if (!e.relatedTarget || !icon.contains(e.relatedTarget)) hide();
    });

    // Keep the bubble anchored to its trigger as the page scrolls or resizes.
    window.addEventListener('scroll', function(){
      if (activeIcon) position();
    }, true);
    window.addEventListener('resize', function(){
      if (activeIcon) position();
    });

    glueTips(document.body);
    if (global.MutationObserver) {
      new MutationObserver(function(records){
        for (var i = 0; i < records.length; i++)
          for (var j = 0; j < records[i].addedNodes.length; j++) glueTips(records[i].addedNodes[j]);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  /* The trigger icon flows inline after its label (see .tip-wrap in
     shared.css), and a browser may break a line before any inline box, so a
     label that just fits would leave the icon alone on the next line. The
     space before the icon moves into a no-wrap span with it, as a no-break
     space, which keeps the icon with the label's last word. Not in a flex or
     grid box: there the text is an item of its own and nothing wraps around
     the icon anyway. */
  function glueTip(icon){
    var glue = icon.parentElement;
    if (!glue) return;
    var glued = glue.classList.contains('tip-glue');
    var at = glued ? glue : icon;
    if (!at.previousSibling && at.parentElement && at.parentElement.classList.contains('tip-wrap')) at = at.parentElement;
    var prev = at.previousSibling, parent = at.parentElement;
    if (!prev || !parent || (prev.nodeType !== 3 && prev.nodeType !== 1)) return;
    if (prev.nodeType === 3 && !prev.data.trim() && !prev.previousSibling) return;
    if (/flex|grid/.test(layoutOf(parent))) return;
    var space = prev.nodeType === 3 && /[ \t\n\r\f]+$/.test(prev.data);
    if (space) prev.data = prev.data.replace(/[ \t\n\r\f]+$/, '');
    if (glued) return;
    glue = document.createElement('span');
    glue.className = 'tip-glue';
    icon.parentNode.insertBefore(glue, icon);
    // No space before the icon: a zero-width no-break space glues it instead.
    glue.appendChild(document.createTextNode(space ? '\u00a0' : '\ufeff'));
    glue.appendChild(icon);
  }
  /* The box's own display, as it lays out open. The control card opens folded,
     and folded it hides its rows (display:none), so a flex row such as Quick
     Start would read as none and its icon would be glued for nothing: lift the
     fold for the one reading, the way SharedCtrl measures its grid. */
  function layoutOf(el){
    var d = getComputedStyle(el).display;
    var fold = d === 'none' && el.closest && el.closest('.ctrl-folded');
    if (!fold) return d;
    fold.classList.remove('ctrl-folded');
    d = getComputedStyle(el).display;
    fold.classList.add('ctrl-folded');
    return d;
  }
  function glueTips(root){
    if (!root) return;
    if (root.nodeType === 3) {
      var next = root.nextSibling;
      if (next && next.nodeType === 1) root = next; else return;
    }
    if (root.nodeType !== 1) return;
    if (root.classList.contains('tip-icon')) { glueTip(root); return; }
    var icons = root.querySelectorAll('.tip-icon');
    for (var i = 0; i < icons.length; i++) glueTip(icons[i]);
  }

  global.SharedTooltip = { init: initTooltip };

  /* ══════════════════════════════════════════════════════════════════════
     ABBREVIATIONS: shared glossary + auto-decoration (SharedAbbr)

     Every tool explains its jargon the same way: any glossary term found in
     visible page text is wrapped in <abbr class="abbr" data-tip="…">, which
     shared.css draws with a soft dashed underline and the shared tooltip
     expands on hover (LVR → Loan-to-Value Ratio).

     GLOSSARY keys are scopes:
       '*'                 every page on the site,
       'borrowingcapacity' that tool's folder, sub-pages included,
       'dcasimulator/ticker'  one sub-page only.
     The scope is read from the URL path, or from data-abbr-scope on <body>.

     An entry is [expansion, optional one-line gloss], or { en: …, id: … }
     when the Indonesian page needs its own wording (<html lang="id">).

     Keeping it calm: skipped inside links, buttons, form controls, code, the
     page title, anything that already carries a data-tip, and any element (or
     subtree) marked data-no-abbr. Use that for user data such as an uploaded
     table, a rendered document or a JSON tree.

     A tool with terms of its own can add them at runtime:
       SharedAbbr.add({ WACC: ['Weighted Average Cost of Capital'] });
     ══════════════════════════════════════════════════════════════════════ */
  var ABBR_GLOSSARY = {

    /* ── Cross-tool subject-matter vocabulary ──
       Only terms a reader may not know from the field the tool works in. File
       formats and everyday computing words (CSV, PDF, PNG, SVG, JSON, URL)
       are deliberately absent: everyone meets them at the download button, and
       underlining them there would drown the terms that carry real meaning. */
    '*': {
      CAGR: { en: ['Compound Annual Growth Rate', 'the one yearly rate that turns the starting value into the ending value'],
              id: ['Compound Annual Growth Rate', 'satu tarif tahunan yang mengubah nilai awal menjadi nilai akhir'] },
      ETF:  { en: ['Exchange-Traded Fund', 'a basket of assets that trades on an exchange like a single share'],
              id: ['Exchange-Traded Fund', 'sekeranjang aset yang diperdagangkan di bursa layaknya satu saham'] },
      ROI:  { en: ['Return on Investment', 'profit measured as a share of what you put in'],
              id: ['Return on Investment', 'keuntungan diukur sebagai porsi dari modal yang ditanam'] },
      /* Not an acronym, but the same problem: it sits next to a rate on half the
         tools and is never spelled out anywhere on the page. */
      'p.a.': { en: ['per annum', 'per year, so the rate is stated on a yearly basis'],
                id: ['per annum', 'per tahun, tarif dinyatakan dalam basis tahunan'] }
    },

    /* ── Finance vs Cash (consumer and asset lending) ── */
    financingvscash: {
      APR:  ['Annual Percentage Rate', 'what a loan really costs a year once the shape of the repayments is taken into account. A 5% flat loan carries an APR near 9%'],
      EAR:  ['Effective Annual Rate', 'a rate that already allows for compounding within the year, so 1% a month is 12.68% EAR, not 12%'],
    },

    /* ── Loan Types Explained ──
       The explainer names the markets each structure is sold in, so it carries
       vocabulary the tool itself never has to: the local name for a lender, a
       product or a contract a reader outside that market will not know. */
    'financingvscash/loan-types': {
      Murabaha:      ['cost-plus sale', 'an Islamic finance contract: the bank buys the asset and resells it to you at an agreed markup, paid in instalments. The markup behaves exactly like a flat rate'],
      multifinance:  ['a non-bank consumer lender', 'the South-East Asian term for the vehicle and appliance credit companies that quote a flat rate per month'],
      KPR:           ['Kredit Pemilikan Rumah', 'the Indonesian home loan'],
      Lombard:       ['a loan secured against a securities portfolio', 'drawn and repaid in one lump, so it is usually a bullet']
    },

    /* ── Borrowing Capacity (Australian home lending) ── */
    borrowingcapacity: {
      APRA: ['Australian Prudential Regulation Authority', 'the regulator that sets the serviceability buffer lenders must add'],
      DSP:  ['Disability Support Pension', 'a Centrelink payment, counted in full as income'],
      DTI:  ['Debt-to-Income ratio', 'total debt divided by gross income. Past 6.0 the loan is reportable to APRA as high DTI'],
      HECS: ['Higher Education Contribution Scheme', 'the older name for the same study loan'],
      HELP: ['Higher Education Loan Program', 'the Australian study loan, repaid through the tax system'],
      HEM:  ['Household Expenditure Measure', 'the benchmark living cost a lender falls back on when your declared expenses look too low'],
      LITO: ['Low Income Tax Offset', 'a rebate that trims the tax bill on lower incomes and tapers away as income rises'],
      LMI:  ['Lenders Mortgage Insurance', 'a one-off premium that lets a lender go past 80% LVR. It protects the lender, not you'],
      LOC:  ['Line of Credit', 'a revolving facility, assessed on its limit rather than its balance'],
      LVR:  ['Loan-to-Value Ratio', 'the loan as a share of the property value, or of the bank valuation if that is lower'],
      NPAT: ['Net Profit After Tax', 'the business profit a lender counts as self-employed income'],
      NSR:  ['Net Service Ratio', 'assessed income divided by every outgoing. It has to clear 1.00'],
      PAYG: ['Pay As You Go', 'salary taxed at the source by your employer'],
      UMI:  ['Uncommitted Monthly Income', 'what is left each month after living costs, commitments and the new repayment']
    },

    /* ── Cost of Living Comparator ── */
    'costofliving-comparator': {
      FX: ['Foreign Exchange', 'the rate one currency converts into another at']
    },

    /* ── DCA Scenario Explorer, Portfolio mode and the ticker reference ── */
    valuateeverything: {
      RMSE: ['Root Mean Square Error', 'how far a listing usually sits from the model, in price']
    },
    dcasimulator: {
      ADX:   ['Average Directional Index', 'how strong a trend is, whichever way it points'],
      DCA:   ['Dollar-Cost Averaging', 'investing a set amount on a set schedule instead of all at once'],
      EMA:   ['Exponential Moving Average', 'a moving average that weights recent prices most, so it turns faster than a plain one'],
      ESG:   ['Environmental, Social and Governance', 'a screen some funds apply to what they are allowed to hold'],
      IRR:   ['Internal Rate of Return', 'the annual rate at which your deposits and the final value balance out'],
      MA:    ['Moving Average', 'the average price over a rolling window, which smooths the day-to-day noise out of a trend'],
      MACD:  ['Moving Average Convergence Divergence', 'the gap between two moving averages, read as a trend signal'],
      MWR:   ['Money-Weighted Return', 'the growth of your actual money, so the timing of every deposit counts'],
      OHLC:  ['Open, High, Low, Close', 'the four prices a candlestick shows for one period'],
      REIT:  ['Real Estate Investment Trust', 'a listed trust that owns income-producing property'],
      RSI:   ['Relative Strength Index', 'a 0 to 100 momentum gauge. Low readings read as oversold'],
      TWR:   ['Time-Weighted Return', 'the growth of the asset itself, ignoring when money went in'],
      UCITS: ['Undertakings for Collective Investment in Transferable Securities', 'the European fund standard, common on cross-border ETFs']
    },
    'dcasimulator/ticker': {
      ASX:    ['Australian Securities Exchange'],
      BSE:    ['Bombay Stock Exchange'],
      HKEX:   ['Hong Kong Exchanges and Clearing'],
      IDX:    ['Indonesia Stock Exchange', 'Bursa Efek Indonesia'],
      CAC:    ['Cotation Assistée en Continu', 'the CAC 40 is the headline index of the Paris exchange'],
      KOSDAQ: ['Korea Securities Dealers Automated Quotations', 'the Korea Exchange board for smaller and growth companies'],
      KOSPI:  ['Korea Composite Stock Price Index', 'the main board of the Korea Exchange'],
      LSE:    ['London Stock Exchange'],
      NASDAQ: ['National Association of Securities Dealers Automated Quotations', 'the US exchange where most technology names list'],
      NSE:    ['National Stock Exchange of India'],
      NYSE:   ['New York Stock Exchange'],
      SGX:    ['Singapore Exchange'],
      SIX:    ['Swiss Infrastructure and Exchange', 'the Swiss stock exchange'],
      TSE:    ['Tokyo Stock Exchange'],
      XETRA:  ['Exchange Electronic Trading', 'the electronic market of the Frankfurt Stock Exchange']
    },

    /* ── Financial Freedom Calculator ── */
    financialfreedom: {
      FIRE: ['Financial Independence, Retire Early', 'the idea this tool does the arithmetic for: save hard, invest, then live off the pot'],
      MDD:  ['Maximum Drawdown', 'the deepest peak-to-trough fall an asset has had, which is what the crash test lands on you'],
      SORR: ['Sequence-of-Returns Risk', 'the risk that the bad years arrive early in retirement, when the pot is largest and has the longest left to fund'],
      SWR:  ['Safe Withdrawal Rate', 'the share of the pot you can spend each year without running out']
    },

    /* ── Rent vs Own Home (and its Sensitivity page, EN + ID) ── */
    rentvsownhouse: {
      RTB:   { en: ['Rent-Then-Buy', 'the third scenario: rent first, then buy partway through the run'],
               id: ['Rent-Then-Buy', 'skenario ketiga: menyewa dulu, lalu membeli di tengah periode'] },
      RPPI:  { en: ['Residential Property Price Index', 'the official measure of how fast house prices move'],
               id: ['Residential Property Price Index', 'Indeks Harga Properti Residensial, ukuran resmi laju pergerakan harga rumah'] },
      DP:    { en: ['Down Payment', 'the deposit paid upfront, the rest is borrowed'],
               id: ['Down Payment', 'uang muka yang dibayar di depan, sisanya dipinjam'] },
      KPR:   { en: ['Kredit Pemilikan Rumah', 'the Indonesian home loan'],
               id: ['Kredit Pemilikan Rumah', 'pinjaman bank untuk membeli rumah'] },
      BPHTB: { en: ['Bea Perolehan Hak atas Tanah dan Bangunan', 'the Indonesian buyer duty on transferring property title'],
               id: ['Bea Perolehan Hak atas Tanah dan Bangunan', 'pajak pembeli saat hak atas properti dialihkan'] },
      PBB:   { en: ['Pajak Bumi dan Bangunan', 'the annual Indonesian land and building tax'],
               id: ['Pajak Bumi dan Bangunan', 'pajak tahunan atas tanah dan bangunan'] }
    },

    /* ── PPh 21 Pisah vs Gabung (Indonesian personal income tax) ── */
    pisahvsgabung: {
      PPh:   { en: ['Pajak Penghasilan', 'Indonesian income tax. PPh 21 is the tax on personal employment income'],
               id: ['Pajak Penghasilan', 'PPh 21 adalah pajak atas penghasilan orang pribadi dari pekerjaan'] },
      PTKP:  { en: ['Penghasilan Tidak Kena Pajak', 'the slice of yearly income that is not taxed at all'],
               id: ['Penghasilan Tidak Kena Pajak', 'bagian penghasilan setahun yang tidak dikenai pajak'] },
      PKP:   { en: ['Penghasilan Kena Pajak', 'income left after PTKP and deductions, the figure the brackets run on'],
               id: ['Penghasilan Kena Pajak', 'penghasilan setelah PTKP dan pengurang, dasar perhitungan lapisan tarif'] },
      SPT:   { en: ['Surat Pemberitahuan Tahunan', 'the annual tax return'],
               id: ['Surat Pemberitahuan Tahunan', 'laporan pajak yang disampaikan setiap tahun'] },
      /* The single letters the PTKP section spells its codes out of, and the
         ones the computed-PTKP line uses for each spouse. Both pages carry
         both sets, so a reader switching language still gets a definition. */
      TK: { en: ['Tidak Kawin', 'not married'],
            id: ['Tidak Kawin', 'belum atau tidak menikah'] },
      K:  { en: ['Kawin', 'married'],
            id: ['Kawin', 'menikah'] },
      I:  { en: ['Istri', 'the wife, whose income is combined into one filing'],
            id: ['Istri', 'penghasilan istri digabung dalam satu SPT'] },
      H:  { en: ['Husband', 'the husband\u2019s side of the Pisah Harta filing'],
            id: ['Husband', 'sisi suami dalam skema Pisah Harta'] },
      W:  { en: ['Wife', 'the wife\u2019s side of the Pisah Harta filing'],
            id: ['Wife', 'sisi istri dalam skema Pisah Harta'] },
      S:  { en: ['Suami', 'the husband\u2019s side of the Pisah Harta filing'],
            id: ['Suami', 'sisi suami dalam skema Pisah Harta'] }
      /* The numbered status codes (TK/0 … K/I/3) are added below: they only
         differ by the dependant count, so writing all twelve out by hand would
         be twelve chances to let one drift out of step with the others. */
    },

    /* ── PowerFactory Scripter (and its samples page) ── */
    'powerfactory-scripter': {
      AC:   ['Alternating Current', 'the mains supply, where current reverses direction each cycle'],
      API:  ['Application Programming Interface', 'here, the PowerFactory Python folder a script imports from'],
      EMT:  ['Electromagnetic Transient', 'the instantaneous-value simulation. Slower than RMS, but it keeps switching and waveform detail'],
      HV:   ['High Voltage'],
      LV:   ['Low Voltage'],
      HVDC: ['High Voltage Direct Current', 'a DC link used to move bulk power or tie two AC systems together'],
      IEEE: ['Institute of Electrical and Electronics Engineers', 'the body whose published test systems these presets are built on'],
      /* MW is deliberately absent here: on the samples pages it is a unit next to
         a number ("163 MW", "0.61 MW per MW of G2"), and underlining every one
         would bury the terms that actually need explaining. So are N-1 and N-2:
         the page names the element count next to them every time they appear. */
      Op:   ['Operator', 'the comparison the filter applies to the value, such as = or >'],
      'p.u.': ['per unit', 'a quantity scaled against its rated base, so 1.0 is nameplate'],
      PF:   ['PowerFactory', 'the DIgSILENT PowerFactory power system simulator'],
      RMS:  ['Root Mean Square', 'the phasor-domain dynamic simulation, fast enough for stability studies'],
      SG:   ['Synchronous Generator', 'the rotating machine most large power stations use'],
      THD:  ['Total Harmonic Distortion', 'how much harmonic content distorts a waveform, as a share of the fundamental']
    },

    /* ── Load Flow Simulator ──
       Its readers work in power systems, so the field's own units and words
       (p.u., MW, MVAr, kV, AC, DC, HV, HVDC, PV, PQ) are left alone. Only the
       names a power engineer may not have met are explained. */
    'loadflow-simulator': {
      PyPSA: ['Python for Power System Analysis', 'the open-source power system toolbox this engine is ported from'],
      WSCC:  ['Western Systems Coordinating Council', 'the US body whose 9-bus test system became a textbook standard']
    },

    /* ── ED/UC Simulator ──
       The same readers as the Load Flow Simulator, so the field's own units and
       words (MW, MWh, p.u., DC, HVDC) are left alone. */
    'ed-uc-simulator': {
      'ED/UC': ['Economic Dispatch and Unit Commitment', 'sharing the load among units, and deciding which units run in each hour'],
      PJM:   ['PJM Interconnection', 'the US grid operator whose 5-bus test system is a textbook example of nodal prices'],
      PyPSA: ['Python for Power System Analysis', 'the open-source power system toolbox this engine is ported from'],
      VoLL:  ['Value of Lost Load', 'what a MWh of demand left unserved is taken to cost']
    },

    /* ── Capacity Expansion Planner ──
       Planners and students of the power sector: the field's own units (MW,
       GWh, kW) are left alone, its cost and technology shorthand is not. */
    'capacity-expansion-planner': {
      'O&M': ['Operation and Maintenance', 'the staff, parts and servicing a plant needs to keep running'],
      PV:    ['Photovoltaic', 'solar panels that turn sunlight straight into electricity'],
      EV:    ['Electric Vehicle', 'a car charged from the grid, which adds to the evening demand'],
      PyPSA: ['Python for Power System Analysis', 'the open-source power system toolbox this engine is ported from'],
      VoLL:  ['Value of Lost Load', 'what a MWh of demand left unserved is taken to cost'],
      OCGT:  ['Open-Cycle Gas Turbine', 'a gas turbine on its own: cheap to build and quick to start, but it burns more gas per MWh, so it suits the few peak hours'],
      CCGT:  ['Combined-Cycle Gas Turbine', 'a gas turbine whose hot exhaust raises steam for a second turbine: dearer to build, but it burns far less gas per MWh'],
      LCOE:  ['Levelised Cost of Energy', 'every year’s cost over every year’s energy served, both discounted: the flat price per MWh that would pay for the whole plan']
    },

    /* ── WEM Constraint Checker (Western Australian electricity market) ── */
    'wemconstraint-checker': {
      LHS: ['Left-Hand Side', 'the flow side of the constraint equation, what is actually flowing'],
      MW:  ['Megawatt', 'a million watts of active power'],
      RHS: ['Right-Hand Side', 'the limit side of the constraint equation, what the flow has to stay under'],
      WEM: ['Wholesale Electricity Market', 'the Western Australian electricity market']
    }
  };

  /* PTKP status codes carry the dependant count, and the tool lets a reader pick
     0 to 3, so "K/I/2" has to define itself as readily as "K/I/0" does. One pass
     writes the whole ladder, which keeps the three families worded alike. */
  (function expandPtkpCodes(scope, max){
    var dep = {
      en: ['no dependants', 'one dependant', 'two dependants', 'three dependants'],
      id: ['tanpa tanggungan', 'satu tanggungan', 'dua tanggungan', 'tiga tanggungan']
    };
    var family = [
      { code: 'TK/', en: 'Tidak Kawin', id: 'Tidak Kawin',
        enGloss: 'single, ', idGloss: 'lajang, ' },
      { code: 'K/',  en: 'Kawin', id: 'Kawin',
        enGloss: 'married, ', idGloss: 'kawin, ' },
      { code: 'K/I/', en: 'Kawin, Istri berpenghasilan', id: 'Kawin, penghasilan Istri digabung',
        enGloss: 'married with the spouse income combined, ', idGloss: 'kawin dengan penghasilan istri digabung, ' }
    ];
    for (var f = 0; f < family.length; f++) {
      for (var n = 0; n <= max; n++) {
        scope[family[f].code + n] = {
          en: [family[f].en + ', ' + n + ' tanggungan', family[f].enGloss + dep.en[n]],
          id: [family[f].id + ', ' + n + ' tanggungan', family[f].idGloss + dep.id[n]]
        };
      }
    }
  })(ABBR_GLOSSARY.pisahvsgabung, 3);

  function makeAbbr(global){
    /* Regions that must never be decorated: interactive controls, code, an
       element that already owns a tooltip, and anything opted out. */
    var SKIP = 'a,button,input,select,textarea,option,optgroup,code,pre,kbd,samp,var,' +
               'script,style,noscript,template,svg,canvas,iframe,abbr,' +
               'h1,.logo,.header-title,' +                       /* the tool's own name stays clean */
               '[class*="btn"],' +                               /* label-buttons read as controls too */
               '[contenteditable],[data-no-abbr],[data-tip],.tip-icon,.pf-tour-tooltip,#globalTooltip';
    var MAX_NODES = 5000;        // safety valve on a single pass
    var WORDY  = /[A-Za-z0-9_&#]/;
    var JOINER = /[.\-\/]/;      // a ticker suffix, a path, a hyphenated compound
    var PLURAL = /^[A-Z0-9]{3,}$/;

    var extra = {};              // terms a tool registered at runtime
    var terms = null;            // TERM -> tooltip HTML, for the active page
    var pattern = null;
    var observer = null, pendingRoots = [], queued = false, started = false;

    function escapeRe(s){ return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

    /* This module is DOM-only. Node-side harnesses load shared.js for its
       maths helpers against a stub document, so check before touching one. */
    function hasDom(){
      return typeof document !== 'undefined' && !!document.body &&
             typeof document.createTreeWalker === 'function' &&
             typeof document.createDocumentFragment === 'function';
    }

    function locale(){
      var el = document.documentElement,
          l = (el && typeof el.getAttribute === 'function' && el.getAttribute('lang')) || 'en';
      return String(l).toLowerCase().slice(0,2) === 'id' ? 'id' : 'en';
    }

    /* '*' plus the tool folder the page sits in, plus the sub-page when the
       glossary defines one. Works from any path depth, file:// included. */
    function scopeKeys(){
      var explicit = document.body && typeof document.body.getAttribute === 'function' &&
                     document.body.getAttribute('data-abbr-scope');
      var path = (global.location && global.location.pathname) || '';
      var parts = String(explicit || path).split('/');
      var keys = ['*'], clean = [], i;
      for (i = 0; i < parts.length; i++) if (parts[i]) clean.push(parts[i]);
      if (!explicit && clean.length && clean[clean.length-1].indexOf('.') > -1) clean.pop();
      for (i = clean.length - 1; i >= 0; i--) {
        if (ABBR_GLOSSARY[clean[i]]) {
          keys.push(clean[i]);
          if (clean[i+1] && ABBR_GLOSSARY[clean[i] + '/' + clean[i+1]]) keys.push(clean[i] + '/' + clean[i+1]);
          break;
        }
      }
      return keys;
    }

    function tipHtml(entry, loc){
      if (!entry) return '';
      if (!(entry instanceof Array)) entry = entry[loc] || entry.en;
      if (!entry) return '';
      if (typeof entry === 'string') entry = [entry];
      return '<strong>' + entry[0] + '</strong>' + (entry[1] ? '<br>' + entry[1] : '');
    }

    function build(){
      var loc = locale(), keys = scopeKeys(), map = {}, list = [], i, k, src;
      for (i = 0; i < keys.length; i++) {
        src = ABBR_GLOSSARY[keys[i]];
        for (k in src) if (Object.prototype.hasOwnProperty.call(src, k)) map[k] = tipHtml(src[k], loc);
      }
      for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) map[k] = tipHtml(extra[k], loc);
      terms = map;
      for (k in map) if (map[k]) list.push(k);
      list.sort(function(a,b){ return b.length - a.length; });   // longest match wins
      pattern = list.length ? new RegExp(list.map(escapeRe).join('|'), 'g') : null;
    }

    function okLeft(text, i){
      if (i === 0) return true;
      var c = text.charAt(i-1);
      return !WORDY.test(c) && !JOINER.test(c);
    }
    function okRight(text, i){
      if (i >= text.length) return true;
      var c = text.charAt(i);
      if (WORDY.test(c)) return false;
      return !(JOINER.test(c) && WORDY.test(text.charAt(i+1)));
    }

    /* A flex or grid parent turns each run of text into an anonymous item, so
       splitting one would add items, add gaps and collapse the space at the
       seam. Keep the run as a single item by wrapping it. */
    function needsRunWrapper(node){
      var parent = node.parentElement;
      if (!parent || typeof global.getComputedStyle !== 'function') return false;
      var display = global.getComputedStyle(parent).display || '';
      return display.indexOf('flex') > -1 || display.indexOf('grid') > -1;
    }

    /* Split one text node around every term it holds. Leftover text never
       contains a term, so re-scanning what this inserts is a no-op. */
    function decorateNode(node){
      if (!node.parentNode) return 0;
      var text = node.nodeValue, frag = null, last = 0, hits = 0, m, term, start, end, el, run;
      pattern.lastIndex = 0;
      while ((m = pattern.exec(text))) {
        term = m[0];
        start = m.index;
        end = start + term.length;
        if (PLURAL.test(term) && text.charAt(end) === 's') end++;       // ETFs, PNGs
        if (!okLeft(text, start) || !okRight(text, end)) { pattern.lastIndex = start + 1; continue; }
        if (!frag) frag = document.createDocumentFragment();
        if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
        el = document.createElement('abbr');
        el.className = 'abbr';
        el.setAttribute('data-abbr', term);
        el.setAttribute('data-tip', terms[term]);
        el.textContent = text.slice(start, end);
        frag.appendChild(el);
        last = end;
        hits++;
        pattern.lastIndex = end;
      }
      if (!frag) return 0;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (needsRunWrapper(node)) {
        run = document.createElement('span');
        run.className = 'abbr-run';
        run.appendChild(frag);
        frag = run;
      }
      node.parentNode.replaceChild(frag, node);
      return hits;
    }

    function scan(root){
      if (!pattern) return 0;
      root = root || document.body;
      if (!root) return 0;
      if (root.nodeType === 3) {
        var owner = root.parentElement;
        if (!owner || owner.closest(SKIP)) return 0;
        pattern.lastIndex = 0;
        return pattern.test(root.nodeValue || '') ? decorateNode(root) : 0;
      }
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return 0;
      if (root.nodeType === 1 && root.closest(SKIP)) return 0;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null),
          found = [], hits = 0, node, value, parent, i;
      while ((node = walker.nextNode())) {
        value = node.nodeValue;
        if (!value || value.length < 2) continue;
        pattern.lastIndex = 0;
        if (!pattern.test(value)) continue;
        parent = node.parentElement;
        if (!parent || parent.closest(SKIP)) continue;
        found.push(node);
        if (found.length >= MAX_NODES) break;
      }
      for (i = 0; i < found.length; i++) hits += decorateNode(found[i]);
      return hits;
    }

    function flush(){
      queued = false;
      var roots = pendingRoots, i;
      pendingRoots = [];
      for (i = 0; i < roots.length; i++) if (roots[i] && roots[i].isConnected) scan(roots[i]);
    }

    function queue(root){
      if (!root) return;
      pendingRoots.push(root);
      if (queued) return;
      queued = true;
      if (global.requestAnimationFrame) global.requestAnimationFrame(flush);
      else setTimeout(flush, 16);
    }

    /* Tools rewrite their results constantly, so watch instead of re-running. */
    function onMutations(records){
      var i, j, rec, node;
      for (i = 0; i < records.length; i++) {
        rec = records[i];
        if (rec.type === 'characterData') { queue(rec.target); continue; }
        for (j = 0; j < rec.addedNodes.length; j++) {
          node = rec.addedNodes[j];
          if (node.nodeType === 1 || node.nodeType === 3) queue(node);
        }
      }
    }

    function init(){
      if (started || !hasDom()) return;
      started = true;
      build();
      scan(document.body);
      if (global.MutationObserver) {
        observer = new MutationObserver(onMutations);
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    }

    return {
      GLOSSARY: ABBR_GLOSSARY,
      init: init,
      /* Register page-specific terms, same entry shape as the glossary. */
      add: function(map){
        if (!map) return;
        for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) extra[k] = map[k];
        if (started && hasDom()) { build(); scan(document.body); }
      },
      /* Decorate a subtree now (rarely needed, the observer handles updates). */
      scan: function(root){ if (!hasDom()) return 0; if (!pattern) build(); return scan(root); },
      /* Re-read scope, locale and terms, then decorate the page again. */
      refresh: function(){ if (!hasDom()) return 0; build(); return scan(document.body); },
      /* Tooltip HTML for a term on this page, or '' when it is not defined. */
      define: function(term){ if (!terms) build(); return terms[term] || ''; },
      terms: function(){ if (!terms) build(); return Object.keys(terms); },
      /* Strip the decoration from a subtree, e.g. before exporting a clone. */
      undecorate: function(root){
        root = root || document.body;
        if (!root || !root.querySelectorAll) return 0;
        var els = root.querySelectorAll('abbr.abbr'), runs, i, run;
        for (i = 0; i < els.length; i++) els[i].parentNode.replaceChild(document.createTextNode(els[i].textContent), els[i]);
        runs = root.querySelectorAll('span.abbr-run');
        for (i = 0; i < runs.length; i++) {
          run = runs[i];
          while (run.firstChild) run.parentNode.insertBefore(run.firstChild, run);
          run.parentNode.removeChild(run);
        }
        if (root.normalize) root.normalize();
        return els.length;
      },
      stop: function(){ if (observer) { observer.disconnect(); observer = null; } started = false; }
    };
  }

  global.SharedAbbr = makeAbbr(global);

  /* ── Fit KPI / tile values ──
     A figure too long for its tile ("Rp14,914,099/mo") is shortened in place
     ("Rp14.9m/mo") rather than wrapped or spilled past the border. Only
     numbers with thousand groups (or 5+ digits) are touched, so years and
     small values never change; the full figure stays in the tooltip. */
  var FIT_SEL = '.tile .value, .metric .value, .metric .val';
  var FIT_SUFFIX = [[1e12,'t'],[1e9,'b'],[1e6,'m'],[1e3,'k']];
  var FIT_NUM = /\d{1,3}(?:([,.])\d{3})(?:\1\d{3})*(?:[.,]\d+)?|\d{5,}(?:\.\d+)?/g;
  function fitParse(str){
    var m = str.match(/^\d{1,3}([,.])\d{3}/);
    var sep = m ? m[1] : null;
    if (sep) str = str.split(sep).join('');
    return parseFloat(str.replace(',', '.'));
  }
  function fitCompact(text, dp){
    return text.replace(FIT_NUM, function(tok){
      var n = fitParse(tok);
      for (var i = 0; i < FIT_SUFFIX.length; i++) {
        if (n >= FIT_SUFFIX[i][0]) {
          var v = n / FIT_SUFFIX[i][0];
          return (dp ? String(Number(v.toFixed(dp))) : String(Math.round(v))) + FIT_SUFFIX[i][1];
        }
      }
      return tok;
    });
  }
  function fitOne(el, force){
    if (el.children.length) return;
    var text = el.textContent;
    if (text !== el.__fitShown) el.__fitFull = text;
    else if (!force && el.clientWidth === el.__fitW) return;
    var full = el.__fitFull, shown = full;
    var ws = el.style.whiteSpace;
    el.style.whiteSpace = 'nowrap';
    if (el.textContent !== full) el.textContent = full;
    if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) {
      for (var dp = 2; dp >= 0; dp--) {
        shown = fitCompact(full, dp);
        el.textContent = shown;
        if (el.scrollWidth <= el.clientWidth + 1) break;
      }
    }
    el.style.whiteSpace = ws;
    if (shown !== full) el.title = full; else if (el.title === el.__fitTitle) el.removeAttribute('title');
    el.__fitTitle = shown !== full ? full : null;
    el.__fitShown = shown;
    el.__fitW = el.clientWidth;
  }
  function fitAll(force){
    var els = document.querySelectorAll(FIT_SEL);
    for (var i = 0; i < els.length; i++) fitOne(els[i], force);
  }
  function initFit(){
    var queued = false;
    function queue(){
      if (queued) return;
      queued = true;
      requestAnimationFrame(function(){ queued = false; fitAll(false); });
    }
    if (global.MutationObserver) {
      new MutationObserver(queue).observe(document.body, {childList:true, subtree:true, characterData:true});
    }
    global.addEventListener('resize', queue);
    queue();
  }
  global.SharedFit = { fitAll: fitAll, compact: fitCompact };

  /* ── SharedPane: axis text on a chart of stacked panes ───────────────────
     A chart that stacks several y axes on one canvas (Financial Freedom's flows
     over its balance, the DCA price chart over its oscillators) breaks two of
     Chart.js's assumptions about axis text, and on a phone both showed:

     1. Every left axis is capped at half the width over the number of left
        axes. With a price pane and three oscillators that is an eighth of a
        phone, narrower than a title plus "-$2.00m", so the labels were drawn
        under the title and off the canvas. A stacked axis is given the width
        its own text needs instead, up to two fifths of the canvas.
     2. A title is centred on its own pane and never clipped to it, so a title
        longer than its pane is tall ("Balance, future's money" on a pane 90px
        high) runs across the pane beside it. Each title gives way in steps
        once the panes are laid out: the whole title; the same words on two
        lines, broken at ", " or " ("; then the words before the break alone.

     Wiring is one plugin, `plugins: [SharedPane.plugin]`. It only acts on
     scales that carry `stack`, so a chart without stacked axes never notices
     it. The title steps down only within one pane height (a two-line title
     makes the axis wider and the pane no taller, so it can never argue for the
     longer one), which keeps it from flipping between two frames. */
  function paneTitleSteps(full){
    var at = full.indexOf(', '), keep = 1, skip = 2;
    if(at < 0){ at = full.indexOf(' ('); keep = 0; skip = 1; }
    if(at <= 0) return [full];
    return [full, [full.slice(0, at + keep), full.slice(at + skip)], full.slice(0, at)];
  }
  function paneAxisFit(scale){
    var H = global.Chart && global.Chart.helpers;
    if(!H || !scale._getLabelSizes || !scale.ticks || !scale.ticks.length || scale.isHorizontal()) return;
    var o = scale.options;
    // A pane hidden after it was fitted (Dispatch's curtailment) keeps the hook but takes no width.
    if(o.display === false) return;
    var lines = o.title && o.title.display ? (Array.isArray(o.title.text) ? o.title.text.length : 1) : 0;
    var title = lines ? H.toFont(o.title.font).lineHeight * lines + H.toPadding(o.title.padding).height : 0;
    var tick = o.grid && o.grid.display !== false && o.grid.drawTicks !== false ? (o.grid.tickLength || 0) : 0;
    var labels = o.ticks.display === false ? 0 : scale._getLabelSizes().widest.width + (o.ticks.padding || 0) * 2;
    var need = Math.ceil(title + tick + labels);
    scale.width = Math.max(scale.width, Math.min(need, scale.chart.width * 0.4));
  }
  var PANE_PLUGIN = {
    id: 'sharedPane',
    beforeUpdate: function(chart){
      var scales = chart.options && chart.options.scales;
      if(!scales) return;
      Object.keys(scales).forEach(function(id){
        var cfg = scales[id];
        if(!cfg || !cfg.stack || cfg.display === false || cfg.afterFit) return;
        cfg.afterFit = paneAxisFit;
      });
    },
    afterLayout: function(chart){
      var H = global.Chart && global.Chart.helpers;
      if(!H || !chart.ctx || !chart.scales || !chart.options.scales) return;
      var memo = chart.$sharedPane || (chart.$sharedPane = {});
      var relayout = false;
      var lineCount = function(v){ return Array.isArray(v) ? v.length : 1; };
      Object.keys(chart.scales).forEach(function(id){
        var sc = chart.scales[id], cfg = chart.options.scales[id];
        if(!sc.options || !sc.options.stack || sc.isHorizontal() || !cfg || !cfg.title || !cfg.title.display) return;
        // The whole title is remembered on the options it came in on, so a
        // chart given new options starts again from the whole of the new one.
        if(cfg.title.$full == null || (cfg.title.$shown != null &&
           JSON.stringify(cfg.title.$shown) !== JSON.stringify(cfg.title.text))){
          cfg.title.$full = String(cfg.title.text);
        }
        var full = cfg.title.$full;
        var steps = paneTitleSteps(full);
        var room = Math.round(sc.bottom - sc.top - 4);
        var ctx = chart.ctx;
        ctx.save();
        ctx.font = H.toFont(sc.options.title.font).string;
        var pick = steps.length - 1;
        for(var i = 0; i < steps.length; i++){
          var lines = Array.isArray(steps[i]) ? steps[i] : [steps[i]];
          var widest = Math.max.apply(null, lines.map(function(l){ return ctx.measureText(l).width; }));
          if(widest <= room){ pick = i; break; }
        }
        ctx.restore();
        var key = id + '|' + full, last = memo[key];
        if(last && last.room === room) pick = Math.max(pick, last.pick);
        memo[key] = {pick: pick, room: room};
        var want = steps[pick], had = cfg.title.text;
        cfg.title.$shown = want;
        if(JSON.stringify(had) === JSON.stringify(want)) return;
        cfg.title.text = want;
        // Same line count: the axis keeps its width, so this frame can simply
        // draw the new words. A different count needs the layout run again.
        if(lineCount(had) !== lineCount(want)) relayout = true;
        else sc.options.title.text = want;
      });
      if(relayout && !chart.$sharedPaneBusy){
        chart.$sharedPaneBusy = true;
        Promise.resolve().then(function(){
          /* Stopped first: a still-running animation from the update before
             would otherwise carry on to the positions of the OLD layout after
             this one has placed every point, leaving the lines drawn off their
             own x axis (three years early on a phone). */
          try { if(chart.canvas){ chart.stop(); chart.update('none'); } } finally { chart.$sharedPaneBusy = false; }
        });
      }
    }
  };
  global.SharedPane = { plugin: PANE_PLUGIN, axisFit: paneAxisFit, titleSteps: paneTitleSteps };

  /* ── SharedExport — an exported chart is always the desktop chart ─────────
     A PNG or SVG export copies the live canvas, so on a phone it used to copy
     the phone's narrow, squat chart: squeezed axes, a legend packed into a
     column. An exported image is read on its own, away from the device, so it
     should have the one ideal proportion the chart was designed at.

         SharedExport.atDesktopSize('chartCanvas', function(){ ...read it... });

     For the duration of `fn` the chart's wrapper is laid out at the desktop
     width and at the height the tool's stylesheet gives it OUTSIDE any media
     query, and the Chart.js chart is redrawn at that size. Everything happens
     in one synchronous task, so the page never paints the large chart; a
     Promise returned by `fn` keeps the size until it settles. The width is
     the same on every screen, a wide monitor included, so one chart exports
     one picture whatever it was opened on. A chart already at exactly that
     size, or anything that is not a Chart.js canvas, is passed straight
     through. */
  var EXPORT_W = 940;

  // The wrapper's height as the desktop stylesheet sets it: the last plain
  // (non-media) rule that matches, or an inline height, in px.
  function desktopHeight(el){
    var h = 0;
    function scan(rules){
      Array.prototype.forEach.call(rules, function(rule){
        if (rule.type !== 1) return;                     // CSSStyleRule only
        var v = rule.style && rule.style.getPropertyValue('height');
        var px = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(v || '');
        if (!px) return;
        try { if (el.matches(rule.selectorText)) h = parseFloat(px[1]); } catch (e) { /* bad selector */ }
      });
    }
    Array.prototype.forEach.call(document.styleSheets, function(sheet){
      var rules;
      try { rules = sheet.cssRules; } catch (e) { return; }  // cross-origin sheet
      if (rules) scan(rules);
    });
    var inline = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(el.style.height || '');
    return inline ? parseFloat(inline[1]) : h;
  }

  var exportDepth = 0;
  function atDesktopSize(canvas, fn){
    if (typeof canvas === 'string') canvas = document.getElementById(canvas);
    var Chart = global.Chart;
    var chart = canvas && Chart && Chart.getChart ? Chart.getChart(canvas) : null;
    var wrap = canvas && canvas.parentElement;
    if (!chart || !wrap || exportDepth) return fn();
    var H = desktopHeight(wrap) || wrap.offsetHeight;
    var W = EXPORT_W;
    if (wrap.clientWidth === W && Math.abs(wrap.offsetHeight - H) < 1) return fn();

    var savedStyle = wrap.getAttribute('style');
    function restore(){
      exportDepth--;
      if (savedStyle == null) wrap.removeAttribute('style');
      else wrap.setAttribute('style', savedStyle);
      chart.resize();
      chart.update('none');
    }
    exportDepth++;
    try {
      // !important, because some tools pin a mobile height with !important.
      wrap.style.setProperty('width', W + 'px', 'important');
      wrap.style.setProperty('max-width', 'none', 'important');
      wrap.style.setProperty('height', H + 'px', 'important');
      // The chart fills the box inside the border, which is what has to come
      // out at W: a border-box wrapper's border would take two pixels off it.
      var dw = W - wrap.clientWidth;
      if (dw) wrap.style.setProperty('width', (W + dw) + 'px', 'important');
      chart.stop();
      // A resize Chart.js deferred while an animation ran is replayed on the
      // next draw, and would put back the size the page had before this one.
      chart._resizeBeforeDraw = null;
      chart.resize();
      chart.update('none');
    } catch (e) { restore(); throw e; }

    var out;
    try { out = fn(); }
    catch (e) { restore(); throw e; }
    if (out && typeof out.then === 'function') {
      return out.then(function(v){ restore(); return v; },
                      function(err){ restore(); throw err; });
    }
    restore();
    return out;
  }

  global.SharedExport = { atDesktopSize: atDesktopSize, desktopHeight: desktopHeight, WIDTH: EXPORT_W };

  /* ── SharedShare — one Share menu on every chart ──────────────────────────
     A chart's toolbar used to carry ⬇ SVG, ⬇ PNG and ⧉ side by side. They are
     now one "Share ⌄" button whose menu holds those three and two more, Share
     as link and Embed as HTML. The ⟳ beside it moves the view rather than exporting anything,
     so it stays on the row.

     A tool keeps the three buttons it always had, since their ids are what
     its script binds. At load every .btn-cluster's ⬇ SVG, ⬇ PNG and ⧉ are
     folded into the menu, and a pick clicks the button it stands for. A
     cluster built later (a popup) is folded by SharedShare.upgrade(root).

         SharedShare.copyImage(function(){ return chartPng(...); }, this);

     Every ⧉ handler copies through copyImage: it writes the PNG inside the
     click, which Safari requires, flashes "✓ Copied" on the Share button and
     says why in words when it fails.

     EMBED AS HTML hands the reader one line: an iframe of this very page. The
     link back to the tool is drawn inside the frame, under the chart, as the
     PNG and SVG exports carry theirs, so the other site cannot edit it out
     without dropping the chart with it. The iframe's link carries the
     chart and the reader's scenario, which is the file the save button writes
     (SharedScenario registers it here through state()), deflated into the
     #hash, which never reaches a server. Both links back to the tool (the
     watermark and the credit line) open it as #open=<chart>&s=<scenario>,
     set up on that same scenario and view. On the other site the page opens in
     embed mode: it loads that scenario instead of the viewer's own cache and
     saves nothing, puts back the chart's view (the metric buttons, toggles
     and legend entries in its card, plus a view() hook where the view lives
     elsewhere), and shows that one chart card filling the frame, with every
     gesture still working.

         SharedShare.state({ save, load })        // a tool outside SharedScenario
         SharedShare.state({ save, load, sync: true })
                                                  // ...that draws in the same tick it loads
         SharedShare.view(key, { save, load })    // a popup that has to open first
         SharedShare.view(key, { save(picked), load, choices, height })
                                                  // a checklist in the embed dialog
         SharedShare.data({ save, load })         // data the frame cannot fetch (prices)
         SharedShare.fit(key, width => height)    // a diagram as tall as its width draws it
         SharedShare.alias(oldKey, key)           // a chart merged into another keeps its links

     choices() lists what the embed may carry besides the chart, as
     [{ value, label }]; the dialog shows them as checkboxes, all off, and
     hands the ticked values to save(picked) and height(picked), the extra
     pixels the frame needs for them. Share as link calls save() with none.

     key is the chart's canvas or Plotly id ('.class' when it has none). An
     embed or link names its chart by that key for good, so a chart that goes
     into another one leaves alias(oldKey, key) behind, and its old embeds and
     links open the chart it went into. A
     card whose view depends on fields outside it names them in
     data-share-view="<selector>", and their fields and toggles ride along.

     A chart drawn by the tool itself (an SVG diagram, not Chart.js or Plotly)
     marks its element data-share-chart and keeps data-share-sig set to a
     signature of what it draws, which embeds wait on and the checks compare.
     A tool whose load, view() and drawing all finish before they return
     passes sync: true, and its embed shows on the next frame instead of
     after the pauses and settling polls a chart that draws later needs.
     A cluster may also carry ⬇ GIF for an animated chart: its row sits after
     PNG and shows only while that button does, and the tool's ⧉ handler can
     pass copyImage a third argument, { gif: fn, onDone: fn }, to put the
     animation on the clipboard where the browser allows it.

     A tool that is not a chart (the Random Picker's wheel) can share itself
     with no picture to download: an empty <div class="btn-cluster"
     data-share="tool"> gets a menu of Share as link and Embed as HTML alone,
     always shown, and its dialog, credit line and watermark say "tool"
     where a chart's say "chart". */
  function makeShare(){
    var TEXT = {
      en: { share: 'Share', shareTitle: 'Download, copy, link or embed this chart',
            svg: ['Download as SVG'], png: ['Download as PNG'], gif: ['Download as GIF'], copy: ['Copy to clipboard'],
            link: ['Share as link', 'Opens the tool on your scenario'],
            linkCopied: '✓ Link copied', linkPrompt: 'Copy this link:', noLink: 'This link could not be made: ',
            embed: ['Embed as HTML', 'Interactive chart for your site'],
            copied: '✓ Copied', copyFail: 'PNG copy failed: ',
            noCopy: 'This browser cannot copy images.', noImage: 'the image could not be drawn',
            embedTitle: 'Embed this chart', close: 'Close', codeLabel: 'Embed code', include: 'Include:',
            embedNote: 'Paste this into any web page. The chart stays interactive and opens on your scenario, which travels inside the link: nothing is uploaded, but anyone who sees the page can read it. Please keep the credit line under the chart.',
            credit: ['Interactive chart: ', ' by '],
            copyCode: 'Copy code', preview: 'Preview in a new tab', building: 'Building the code…',
            noEmbed: 'This chart could not be embedded: ', textFail: 'Copy failed. Select the code and copy it yourself.',
            backlink: 'Try your own scenarios at',
            long: 'This code is {kb} KB, because the data the chart draws travels inside it.',
            tooBig: 'This chart carries too much data to fit in a link. Embed a smaller part of it.',
            failed: 'This chart could not be loaded here.', openTool: 'Open the tool',
            // A data-share="tool" cluster: the words that would say "chart".
            tool: { shareTitle: 'Link to or embed this tool', embed: ['Embed as HTML', 'Interactive tool for your site'],
                    embedTitle: 'Embed this tool',
                    embedNote: 'Paste this into any web page. The tool stays interactive and opens set up as you have it now, which travels inside the link: nothing is uploaded, but anyone who sees the page can read it. Please keep the credit line under it.',
                    credit: ['Interactive tool: ', ' by '], noEmbed: 'This tool could not be embedded: ',
                    backlink: 'Make your own at', failed: 'This tool could not be loaded here.' } },
      id: { share: 'Bagikan', shareTitle: 'Unduh, salin, tautkan, atau sematkan grafik ini',
            svg: ['Unduh sebagai SVG'], png: ['Unduh sebagai PNG'], gif: ['Unduh sebagai GIF'], copy: ['Salin ke papan klip'],
            link: ['Bagikan sebagai tautan', 'Membuka alat ini pada skenario Anda'],
            linkCopied: '✓ Tautan tersalin', linkPrompt: 'Salin tautan ini:', noLink: 'Tautan ini tidak bisa dibuat: ',
            embed: ['Sematkan sebagai HTML', 'Grafik interaktif untuk situs Anda'],
            copied: '✓ Tersalin', copyFail: 'Gagal menyalin PNG: ',
            noCopy: 'Browser ini tidak bisa menyalin gambar.', noImage: 'gambar tidak bisa dibuat',
            embedTitle: 'Sematkan grafik ini', close: 'Tutup', codeLabel: 'Kode sematan', include: 'Sertakan:',
            embedNote: 'Tempel kode ini di halaman web mana pun. Grafiknya tetap interaktif dan terbuka pada skenario Anda, yang ikut di dalam tautannya: tidak ada yang diunggah, tetapi siapa pun yang melihat halaman itu bisa membacanya. Mohon biarkan baris kredit di bawah grafik.',
            credit: ['Grafik interaktif: ', ' oleh '],
            copyCode: 'Salin kode', preview: 'Pratinjau di tab baru', building: 'Menyusun kode…',
            noEmbed: 'Grafik ini tidak bisa disematkan: ', textFail: 'Gagal menyalin. Pilih kodenya dan salin sendiri.',
            backlink: 'Coba skenario Anda sendiri di',
            long: 'Kode ini {kb} KB, karena data yang digambar grafik ikut di dalamnya.',
            tooBig: 'Grafik ini membawa terlalu banyak data untuk muat di tautan. Sematkan bagian yang lebih kecil.',
            failed: 'Grafik ini tidak bisa dimuat di sini.', openTool: 'Buka alatnya',
            tool: { shareTitle: 'Tautkan atau sematkan alat ini', embed: ['Sematkan sebagai HTML', 'Alat interaktif untuk situs Anda'],
                    embedTitle: 'Sematkan alat ini',
                    embedNote: 'Tempel kode ini di halaman web mana pun. Alatnya tetap interaktif dan terbuka seperti yang Anda atur sekarang, yang ikut di dalam tautannya: tidak ada yang diunggah, tetapi siapa pun yang melihat halaman itu bisa membacanya. Mohon biarkan baris kredit di bawahnya.',
                    credit: ['Alat interaktif: ', ' oleh '], noEmbed: 'Alat ini tidak bisa disematkan: ',
                    backlink: 'Buat versi Anda sendiri di', failed: 'Alat ini tidak bisa dimuat di sini.' } }
    };
    var LINK_ICO = '<svg viewBox="0 0 24 24" width="15" height="15" focusable="false" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M10 13.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.6 1.6"/><path d="M14 10.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.6-1.6"/></svg>';
    // Share as link and Embed are drawn by this menu, not by a button the tool binds.
    var ROWS = [['svg', '⬇'], ['png', '⬇'], ['gif', '⬇'], ['copy', '⧉'], ['link', LINK_ICO], ['embed', '&lt;/&gt;']];
    var OWN = { link: 1, embed: 1 };
    var LABEL = { svg: /^⬇\s*SVG$/, png: /^⬇\s*PNG$/, gif: /^⬇\s*GIF$/, copy: /^⧉$/ };
    var CHEVRON = '<svg class="share-chev" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    // The box a chart and its own controls live in, nearest first.
    var CARD = '.chart-modal, .detail-subsection, .chart-card, .chart-panel, .card';
    var uid = 0, menus = [], current = null, provider = null, dataHook = null, views = {}, fits = {}, aliases = {}, dlg = null;
    // The chart a key names now: itself, or the chart it went into.
    function keyNow(key){ return Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : key; }

    function T(){ return TEXT[pageLang()]; }
    // The words for one menu: a tool's (data-share="tool") say "tool" for "chart".
    function W(m){
      var t = T();
      if(!m || !m.tool) return t;
      var w = {}, k;
      for(k in t) w[k] = t[k];
      for(k in t.tool) w[k] = t.tool[k];
      return w;
    }
    function toolCluster(card){ return !!(card && card.querySelector('.btn-cluster[data-share="tool"]')); }
    function norm(s){ return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    /* A key entry is named in a link by its words, or by data-legend-key where
       its words alone would not tell it apart (two stores' "Charging" inside
       their names' brackets). A link written before it named itself still
       finds it by its words. */
    function legendKey(it){ return it.getAttribute('data-legend-key') || norm(it.textContent); }
    function html(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function attr(s){ return html(s).replace(/"/g, '&quot;'); }
    function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
    function each(list, fn){ Array.prototype.forEach.call(list || [], fn); }

    /* ── The menu ── */
    function kindOf(b){
      var s = norm(b.textContent);
      for(var k in LABEL) if(LABEL[k].test(s)) return k;
      return null;
    }
    function upgrade(root){
      root = root || document;
      if(root.matches && root.matches('.btn-cluster')) fold(root);
      each(root.querySelectorAll ? root.querySelectorAll('.btn-cluster') : [], fold);
    }
    function fold(cluster){
      if(cluster.__share) return;
      var src = {}, first = null;
      each(cluster.children, function(b){
        var k = b.tagName === 'BUTTON' ? kindOf(b) : null;
        if(k && !src[k]){ src[k] = b; if(!first) first = b; }
      });
      var tool = cluster.getAttribute('data-share') === 'tool';
      if(!first && !tool) return;
      var t = W({ tool: tool });
      var wrap = document.createElement('span');
      wrap.className = 'share-menu';
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn-secondary btn-sm share-toggle';
      toggle.title = t.shareTitle;
      toggle.setAttribute('aria-haspopup', 'menu');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('data-no-abbr', '');
      toggle.innerHTML = '<span class="share-label">' + t.share + '</span>' + CHEVRON;
      wrap.appendChild(toggle);
      var list = document.createElement('ul');
      list.className = 'combo-list share-list';
      list.id = 'share-list-' + (++uid);
      list.setAttribute('role', 'menu');
      list.setAttribute('data-no-abbr', '');
      toggle.setAttribute('aria-controls', list.id);
      ROWS.forEach(function(r){
        if(!OWN[r[0]] && !src[r[0]]) return;
        var words = t[r[0]], li = document.createElement('li');
        li.setAttribute('role', 'none');
        li.innerHTML = '<button type="button" role="menuitem" class="combo-opt share-opt" data-kind="' + r[0] + '">' +
          '<span class="share-ico' + (r[0] === 'embed' ? ' share-ico-code' : '') + '" aria-hidden="true">' + r[1] + '</span>' +
          '<span class="combo-text"><span class="combo-main">' + words[0] + '</span>' +
          // Only the two rows the tool has no button for need a line under it.
          (words[1] ? '<span class="combo-sub">' + words[1] + '</span>' : '') + '</span></button>';
        list.appendChild(li);
      });
      // The buttons the tool binds stay in the cluster, out of sight, so
      // closest('.btn-cluster') and every handler still find them.
      var hold = document.createElement('span');
      hold.className = 'share-src';
      hold.hidden = true;
      cluster.insertBefore(wrap, first || cluster.firstChild);
      cluster.insertBefore(hold, wrap.nextSibling);
      ['svg', 'png', 'gif', 'copy'].forEach(function(k){ if(src[k]) hold.appendChild(src[k]); });
      var m = { cluster: cluster, wrap: wrap, toggle: toggle, list: list, src: src, tool: tool };
      cluster.__share = m;
      menus.push(m);
      wire(m);
      // A tool that shows its export buttons only once it has drawn a chart
      // (the Graph Visualiser) now shows and hides the Share button with them.
      sync(m);
      if(global.MutationObserver) new MutationObserver(function(){ sync(m); })
        .observe(hold, { attributes: true, subtree: true, attributeFilter: ['style', 'hidden', 'disabled'] });
    }
    function shown(b){ return !!b && !b.hidden && b.style.display !== 'none'; }
    function sync(m){
      var any = m.tool || shown(m.src.svg) || shown(m.src.png) || shown(m.src.copy);
      m.wrap.style.display = any ? '' : 'none';
      if(!any && current === m) close(m);
    }
    function rows(m){
      return Array.prototype.filter.call(m.list.querySelectorAll('.share-opt'), function(b){ return !b.disabled && !b.parentNode.hidden; });
    }
    function open(m){
      if(current && current !== m) close(current);
      each(m.list.querySelectorAll('.share-opt'), function(b){
        var k = b.getAttribute('data-kind'), s = m.src[k];
        b.disabled = !!(s && s.disabled);
        // An animation's GIF row shows only while the tool shows its button.
        if(k === 'gif') b.parentNode.hidden = !shown(s);
      });
      // In the body, so no card's overflow or a popup's transform can clip it.
      if(m.list.parentNode !== document.body) document.body.appendChild(m.list);
      m.list.classList.add('is-open');
      m.toggle.setAttribute('aria-expanded', 'true');
      // Fetched now, so a link is ready the moment its row is picked.
      dictionary(DICT).catch(function(){});
      if(global.SharedDropdown) global.SharedDropdown.place(m.toggle, m.list, { minWidth: 292, align: 'end', maxHeight: 320 });
      current = m;
    }
    function close(m, refocus){
      m.list.classList.remove('is-open');
      m.toggle.setAttribute('aria-expanded', 'false');
      if(current === m) current = null;
      if(refocus) m.toggle.focus({ preventScroll: true });
    }
    function wire(m){
      m.toggle.addEventListener('click', function(e){
        e.stopPropagation();
        if(current === m){ close(m); return; }
        open(m);
        var r = rows(m)[0];
        if(r) r.focus({ preventScroll: true });
      });
      m.toggle.addEventListener('keydown', function(e){
        if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        open(m);
        var r = rows(m), to = e.key === 'ArrowDown' ? r[0] : r[r.length - 1];
        if(to) to.focus({ preventScroll: true });
      });
      m.list.addEventListener('click', function(e){
        e.stopPropagation();
        var b = e.target.closest('.share-opt');
        if(!b || b.disabled) return;
        close(m, true);
        pick(m, b.getAttribute('data-kind'));
      });
      // Once the keyboard is in the list, the mouse moves the lit row with it.
      m.list.addEventListener('mousemove', function(e){
        var b = e.target.closest('.share-opt');
        if(b && b !== document.activeElement && m.list.contains(document.activeElement)) b.focus({ preventScroll: true });
      });
      m.list.addEventListener('keydown', function(e){
        var r = rows(m), i = r.indexOf(document.activeElement), to = null;
        if(e.key === 'ArrowDown') to = r[(i + 1) % r.length];
        else if(e.key === 'ArrowUp') to = r[(i - 1 + r.length) % r.length];
        else if(e.key === 'Home') to = r[0];
        else if(e.key === 'End') to = r[r.length - 1];
        // The list sits at the end of the body, so Tab out of it would land at
        // the end of the page: both keys hand the focus back to Share instead.
        else if(e.key === 'Escape' || e.key === 'Tab'){ e.preventDefault(); e.stopPropagation(); close(m, true); return; }
        else return;
        e.preventDefault();
        if(to) to.focus();
      });
    }
    // Synchronous, so a copy still runs inside the reader's click.
    function pick(m, kind){
      if(kind === 'embed'){ openEmbed(m); return; }
      if(kind === 'link'){ copyLink(m); return; }
      var b = m.src[kind];
      if(b && !b.disabled) b.click();
    }
    document.addEventListener('click', function(){ if(current) close(current); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && current) close(current, true); });
    global.addEventListener('scroll', function(e){ if(current && !current.list.contains(e.target)) close(current); }, true);
    global.addEventListener('resize', function(){ if(current) close(current); });

    /* ── Copy to clipboard ── */
    function flash(from, text){
      var c = from && from.closest ? from.closest('.btn-cluster') : null;
      var m = c && c.__share;
      var el = m ? m.toggle.querySelector('.share-label') : from;
      if(!el) return;
      if(el.__flashT) clearTimeout(el.__flashT); else el.__flashText = el.textContent;
      el.textContent = m ? text : '✓';
      el.__flashT = setTimeout(function(){ el.textContent = el.__flashText; el.__flashT = null; }, 1400);
    }
    function asBlob(v){
      return Promise.resolve(v).then(function(x){
        if(x instanceof Blob) return x;
        if(typeof x === 'string') return fetch(x).then(function(r){ return r.blob(); });
        if(x && typeof x.toBlob === 'function') return new Promise(function(res, rej){
          x.toBlob(function(b){ if(b) res(b); else rej(new Error(T().noImage)); }, 'image/png');
        });
        throw new Error(T().noImage);
      });
    }
    /* source: a canvas, a Blob, a data URL, or a function returning one of
       them or a promise of one. Resolves true once copied, false if not.
       opts.gif (optional): a function returning a GIF Blob or a promise of
       one, for an animated chart. Where the browser takes image/gif on the
       clipboard it goes as it is; elsewhere the still PNG goes with an HTML
       copy carrying the GIF, which rich-text apps (mail, documents) paste
       animated. opts.onDone(kind) is told 'gif', 'png+html' or 'png'. */
    function copyImage(source, from, opts){
      var t = T(), done, kind = 'png';
      opts = opts || {};
      function supports(type){ try { return !!(global.ClipboardItem && global.ClipboardItem.supports && global.ClipboardItem.supports(type)); } catch(e){ return false; } }
      try {
        if(!navigator.clipboard || !navigator.clipboard.write || !global.ClipboardItem) throw new Error(t.noCopy);
        // The item is handed a promise and written straight away: Safari only
        // allows a write that starts inside the click.
        var blob = asBlob(typeof source === 'function' ? source() : source);
        blob.catch(function(){});
        var item = { 'image/png': blob };
        if(typeof opts.gif === 'function'){
          var gif = Promise.resolve(opts.gif());
          gif.catch(function(){});
          if(supports('image/gif')){ item = { 'image/gif': gif }; kind = 'gif'; }
          else if(supports('text/html') || !global.ClipboardItem.supports){
            item['text/html'] = gif.then(function(g){
              return new Promise(function(res){ var r = new FileReader(); r.onload = function(){ res(new Blob(['<img src="' + r.result + '" alt="">'], { type: 'text/html' })); }; r.readAsDataURL(g); });
            });
            kind = 'png+html';
          }
        }
        done = navigator.clipboard.write([new global.ClipboardItem(item)]);
        // A browser that refuses the pair still takes the PNG on its own.
        if(kind !== 'png') done = done.catch(function(){ kind = 'png'; return navigator.clipboard.write([new global.ClipboardItem({ 'image/png': asBlob(typeof source === 'function' ? source() : source) })]); });
      } catch(e){ done = Promise.reject(e); }
      return done.then(function(){ flash(from, t.copied); if(typeof opts.onDone === 'function') opts.onDone(kind); return true; },
                       function(e){ alert(t.copyFail + (e && e.message ? e.message : e)); return false; });
    }

    /* ── The embed link ── */
    function b64(bytes){
      var s = '';
      for(var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function unb64(str){
      var s = atob(str.replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(s.length);
      for(var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    }
    function pipe(bytes, Stream){
      return new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')))
        .arrayBuffer().then(function(b){ return new Uint8Array(b); });
    }

    /* A scenario of a few hundred bytes barely deflates on its own: deflate
       has seen none of it before, so every field name and value is spelt out.
       So a link is deflated against a dictionary, a frozen file of what the
       tools save (their defaults and presets, built by _ref/share-dict.mjs):
       a run of text the dictionary also holds, "v:mortgageRate":"6" or a
       whole preset's scenario, is written as one back-reference of 2 to 4
       bytes, however long. A link names its dictionary by its first letter,
       and a dictionary never changes once shipped, so a better one is a new
       letter here and a new file beside the old, which stays for the links
       made with it. */
    var DICTS = { a: { file: 'share-dict-a.txt', size: 24279 } }, DICT = 'a', dicts = {};
    function dictionary(letter){
      if(!dicts[letter]) dicts[letter] = fetch(new URL(DICTS[letter].file, SCRIPT_URL)).then(function(r){
        if(!r.ok) throw new Error(DICTS[letter].file + ' ' + r.status);
        return r.arrayBuffer();
      }).then(function(b){
        // One byte off and every link made with it decodes to nonsense.
        if(b.byteLength !== DICTS[letter].size) throw new Error(DICTS[letter].file + ' is not the shipped file');
        return new Uint8Array(b);
      });
      dicts[letter].catch(function(){ dicts[letter] = null; });
      return dicts[letter];
    }
    /* The browser's CompressionStream cannot be primed, so links are written
       here: one deflate block in its fixed codes, which spend nothing on a
       code table (on a short scenario the table would cost more than it
       saves) and make every symbol's cost known, so the cheapest parse into
       literals and back-references is found exactly, by a shortest path. */
    var LBASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
    var LEXT = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    var DBASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    var DEXT = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    var LCODE = null, DCODE = null;
    function deflateWith(dict, data){
      if(!LCODE){
        LCODE = new Uint8Array(259); DCODE = new Uint8Array(32769);
        for(var c = 0; c < 29; c++) for(var l = LBASE[c]; l < (c < 28 ? LBASE[c + 1] : 259); l++) LCODE[l] = c;
        for(c = 0; c < 30; c++) for(var d = DBASE[c]; d < (c < 29 ? DBASE[c + 1] : 32769); d++) DCODE[d] = c;
      }
      var n0 = dict.length, n = data.length, N = n0 + n, buf = new Uint8Array(N);
      buf.set(dict); buf.set(data, n0);
      // Where each 3-byte string last occurred, and before that, and so on.
      var head = new Int32Array(1 << 15).fill(-1), prev = new Int32Array(N);
      function hash(i){ return ((buf[i] << 10) ^ (buf[i + 1] << 5) ^ buf[i + 2]) & 0x7fff; }
      for(var i = 0; i + 2 < n0; i++){ var h0 = hash(i); prev[i] = head[h0]; head[h0] = i; }
      // bits[k]: the fewest bits that write data[0..k); len and dist: the last step there.
      var bits = new Float64Array(n + 1).fill(Infinity), len = new Uint16Array(n + 1), dist = new Uint16Array(n + 1);
      bits[0] = 0;
      for(var k = 0; k < n; k++){
        var p = n0 + k, here = bits[k], lit = here + (buf[p] < 144 ? 8 : 9);
        if(lit < bits[k + 1]){ bits[k + 1] = lit; len[k + 1] = 0; }
        if(p + 2 >= N) continue;
        var h = hash(p), best = 2, max = Math.min(258, N - p), tries = 1024;
        // Nearest first, so the first match to reach a length is its cheapest.
        for(var q = head[h]; q >= 0 && p - q <= 32768 && tries-- > 0; q = prev[q]){
          if(buf[q + best] !== buf[p + best]) continue;
          var L = 0;
          while(L < max && buf[q + L] === buf[p + L]) L++;
          if(L <= best) continue;
          var dc = DCODE[p - q], db = 5 + DEXT[dc];
          for(var m = best + 1; m <= L; m++){
            var lc = LCODE[m], cost = here + (lc < 23 ? 7 : 8) + LEXT[lc] + db;
            if(cost < bits[k + m]){ bits[k + m] = cost; len[k + m] = m; dist[k + m] = p - q; }
          }
          best = L;
          if(L === max) break;
        }
        prev[p] = head[h]; head[h] = p;
      }
      var steps = [];
      for(k = n; k > 0; k -= len[k] || 1) steps.push(k);
      var out = new Uint8Array((bits[n] >> 3) + 4), at = 0, acc = 0, used = 0;
      function put(v, nb){ acc |= v << used; used += nb; while(used >= 8){ out[at++] = acc & 255; acc >>>= 8; used -= 8; } }
      // Huffman codes are packed from their top bit, everything else from the bottom.
      function code(v, nb){ for(var r = 0, j = 0; j < nb; j++){ r = (r << 1) | (v & 1); v >>= 1; } put(r, nb); }
      function sym(s){
        if(s < 144) code(0x30 + s, 8); else if(s < 256) code(0x190 + s - 144, 9);
        else if(s < 280) code(s - 256, 7); else code(0xC0 + s - 280, 8);
      }
      put(1, 1); put(1, 2);   // the last block, in the fixed codes
      for(var j = steps.length - 1; j >= 0; j--){
        k = steps[j];
        if(!len[k]){ sym(buf[n0 + k - 1]); continue; }
        var lc2 = LCODE[len[k]], dc2 = DCODE[dist[k]];
        sym(257 + lc2); if(LEXT[lc2]) put(len[k] - LBASE[lc2], LEXT[lc2]);
        code(dc2, 5); if(DEXT[dc2]) put(dist[k] - DBASE[dc2], DEXT[dc2]);
      }
      sym(256);
      if(used) out[at++] = acc & 255;
      return out.subarray(0, at);
    }
    // The browser inflates it: the dictionary goes in first as a stored
    // block, so the link's back-references reach into it, and comes off again.
    function inflateWith(dict, bytes){
      var n = dict.length, all = new Uint8Array(5 + n + bytes.length);
      all.set([0, n & 255, n >> 8, ~n & 255, (~n >> 8) & 255]);
      all.set(dict, 5); all.set(bytes, 5 + n);
      return pipe(all, global.DecompressionStream).then(function(b){ return b.subarray(n); });
    }

    /* A link's first letter says how the rest is written: a dictionary's
       letter, 'z' (deflated alone, as links were first written, and still
       the choice where it comes out shorter, as for a page of data), or 'j'
       (plain JSON, where the browser cannot deflate). */
    function pack(obj){
      var bytes = new TextEncoder().encode(JSON.stringify(obj));
      var alone = global.CompressionStream ? pipe(bytes, global.CompressionStream).then(function(z){ return 'z' + b64(z); })
                                           : Promise.resolve('j' + b64(bytes));
      // Past this it is the data (an embed's prices), which no dictionary knows.
      if(bytes.length > 0x10000) return alone;
      var primed = dictionary(DICT).then(function(d){ return DICT + b64(deflateWith(d, bytes)); }, function(){ return null; });
      return Promise.all([alone, primed]).then(function(r){ return r[1] && r[1].length < r[0].length ? r[1] : r[0]; });
    }
    function unpack(str){
      var c = str.charAt(0), bytes = unb64(str.slice(1));
      var p = c === 'z' ? pipe(bytes, global.DecompressionStream)
            : DICTS.hasOwnProperty(c) ? dictionary(c).then(function(d){ return inflateWith(d, bytes); })
            : Promise.resolve(bytes);
      return p.then(function(b){ return JSON.parse(new TextDecoder().decode(b)); });
    }
    /* A file is opened by the reader who chose it; a link can be sent by
       anyone. So no string from a link may carry markup or close a quote in a
       tool's template: < > " ' ` become look-alikes that can only be text. */
    var LOOKALIKE = { '<': '‹', '>': '›', '"': '”', "'": 'ʼ', '`': 'ʼ' };
    function inert(v){
      if(typeof v === 'string') return v.replace(/[<>"'`]/g, function(c){ return LOOKALIKE[c]; });
      if(Array.isArray(v)) return v.map(inert);
      if(v && typeof v === 'object'){
        var o = {};
        Object.keys(v).forEach(function(k){ if(!/^(__proto__|constructor|prototype)$/.test(k)) o[inert(k)] = inert(v[k]); });
        return o;
      }
      return v;
    }

    function chartOf(card){
      // A chart the tool draws itself (an SVG diagram) says so.
      var own = card ? card.querySelector('[data-share-chart]') : null;
      if(own) return own;
      var cs = card ? card.querySelectorAll('canvas') : [];
      for(var i = 0; i < cs.length; i++) if(global.Chart && global.Chart.getChart && global.Chart.getChart(cs[i])) return cs[i];
      return (card && card.querySelector('.js-plotly-plot')) || cs[0] || null;
    }
    function keyOf(el){ return el ? (el.id || (el.classList[0] ? '.' + el.classList[0] : '')) : ''; }
    function findChart(key){
      try { return key.charAt(0) === '.' ? document.querySelector(key) : document.getElementById(key); }
      catch(e){ return null; }
    }
    function cardOf(el){ return el ? (el.closest(CARD) || el.parentElement) : null; }
    function fillOf(el){ return el.tagName === 'CANVAS' ? el.parentElement : el; }
    function pageUrl(){
      var c = document.querySelector('link[rel="canonical"]');
      var u = c && c.href ? c.href : global.location.origin + global.location.pathname;
      return u.split('#')[0].split('?')[0];
    }
    function toolName(){
      var m = document.querySelector('meta[property="og:title"]');
      return norm(m && m.content) || norm(document.title.split('|')[0]);
    }
    function chartTitle(card){
      var h = card.querySelector('.chart-modal-title, h2, h3');
      if(!h) return '';
      var c = h.cloneNode(true);
      each(c.querySelectorAll('.tip-icon, .muted-note, button'), function(x){ x.remove(); });
      return norm(c.textContent);
    }
    // The frame is as tall as the card is on a desktop, so the chart opens
    // at the height it was designed at. A diagram drawn to fit its width
    // (SharedShare.fit) is instead as tall as its drawing is at a typical
    // column's width, plus its margin, so it opens without bands of empty
    // stage above and below it. The resizer() then fits either to the column.
    // extra: what a view's ticked choices add under the chart.
    var EMBED_W = 760, MARK_H = 22;
    function frameHeight(card, el, extra){
      var fill = fillOf(el), key = keyOf(el);
      var want = fitOf(key, Math.min(fill.clientWidth, EMBED_W - (card.clientWidth - fill.clientWidth))) ||
        desktopHeight(fill) || fill.offsetHeight || 430;
      var chrome = Math.max(0, card.offsetHeight - fill.offsetHeight) + MARK_H;
      return Math.round((Math.min(1000, Math.max(380, want + chrome)) + (extra || 0)) / 10) * 10;
    }
    // The height a fit hook asks for at this width, or 0 when it has none.
    function fitOf(key, w){
      var f = fits[key], h = 0;
      if(f && w > 0){ try { h = +f(w); } catch(e){ h = 0; } }
      return isFinite(h) && h > 0 ? Math.max(160, Math.ceil(h)) : 0;
    }
    /* The few lines that let the other site's page size the frame to what it
       shows. The frame posts its height whenever its width changes it (a
       phone wraps the legend, a diagram is as tall as its width draws it);
       this listens for that, from the tool's own origin and that very frame
       only. A site that strips scripts keeps the height the iframe carries. */
    function resizer(home){
      var origin = home.replace(/^(https?:\/\/[^\/]+).*$/, '$1');
      return '<script>addEventListener("message",function(e){var d=e.data;if(e.origin!=="' + origin +
        '"||!d||d.abtEmbed!=="height")return;[].forEach.call(document.getElementsByTagName("iframe"),function(f){' +
        'if(f.contentWindow===e.source)f.style.height=Math.min(4000,Math.max(160,+d.height||0))+"px"})})</script>';
    }

    /* What the card shows beyond the scenario: its fields (a metric select, a
       toggle switch), its pressed buttons, and which legend entries are off. */
    function rootsOf(card){
      var out = [card], extra = card.getAttribute('data-share-view');
      if(extra) each(document.querySelectorAll(extra), function(r){ if(out.indexOf(r) < 0) out.unshift(r); });
      return out;
    }
    function fieldsIn(root){
      var els = root.matches('input, select, textarea') ? [root] : [];
      each(root.querySelectorAll('input, select, textarea'), function(el){ els.push(el); });
      return els.filter(function(el){
        var ty = (el.type || '').toLowerCase();
        return !!(el.id || el.name) && !el.closest('.share-menu, .share-src') &&
          ['file', 'password', 'hidden', 'button', 'submit', 'reset', 'image'].indexOf(ty) < 0;
      });
    }
    function fieldKey(el){ return el.id ? '#' + el.id : el.name + (el.type === 'radio' ? '=' + el.value : ''); }
    function readField(el){
      var ty = (el.type || '').toLowerCase();
      if(ty === 'checkbox' || ty === 'radio') return el.checked;
      if(el.tagName === 'SELECT' && el.multiple) return Array.prototype.filter.call(el.options, function(o){ return o.selected; }).map(function(o){ return o.value; });
      return el.value;
    }
    function writeField(el, v){
      var ty = (el.type || '').toLowerCase();
      if(ty === 'checkbox' || ty === 'radio') el.checked = !!v;
      else if(el.tagName === 'SELECT' && el.multiple) each(el.options, function(o){ o.selected = Array.isArray(v) && v.indexOf(o.value) >= 0; });
      else el.value = v;
    }
    function isOn(b){ return b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true'; }
    function togglesIn(root){
      return Array.prototype.filter.call(root.querySelectorAll('button'), function(b){
        // A SharedSeg button mirrors a select, which is already a field.
        if(b.closest('.btn-cluster, .legend, .share-list') || b.getAttribute('role') === 'radio') return false;
        return isOn(b) || b.getAttribute('aria-pressed') === 'false';
      });
    }
    var NOT_A_HANDLE = /^data-(tip|i18n|no-|icon|persist)/;
    function locator(el){
      if(el.id) return '#' + (global.CSS && CSS.escape ? CSS.escape(el.id) : el.id);
      for(var i = 0; i < el.attributes.length; i++){
        var a = el.attributes[i];
        if(/^data-/.test(a.name) && !NOT_A_HANDLE.test(a.name))
          return el.tagName.toLowerCase() + '[' + a.name + '="' + String(a.value).replace(/["\\]/g, '\\$&') + '"]';
      }
      return null;
    }
    function captureUi(card){
      var u = { f: {}, on: [], off: [], legend: {} }, any = false;
      rootsOf(card).forEach(function(root){
        fieldsIn(root).forEach(function(el){ u.f[fieldKey(el)] = readField(el); any = true; });
        togglesIn(root).forEach(function(b){
          var l = locator(b);
          if(l){ (isOn(b) ? u.on : u.off).push(l); any = true; }
        });
        each(root.querySelectorAll('.legend-item'), function(it){
          var l = legendKey(it);
          if(l){ u.legend[l] = it.classList.contains('hidden') ? 1 : 0; any = true; }
        });
      });
      return any ? u : null;
    }
    function inRoots(roots, el){ return !!el && roots.some(function(r){ return r === el || r.contains(el); }); }
    function findIn(roots, sel){
      for(var i = 0; i < roots.length; i++){
        var r = roots[i], el = null;
        try { el = r.matches(sel) ? r : r.querySelector(sel); } catch(e){}
        if(el) return el;
      }
      return null;
    }
    function applyUi(card, u){
      var roots = rootsOf(card);
      Object.keys(u.f || {}).forEach(function(k){
        var el = k.charAt(0) === '#' ? document.getElementById(k.slice(1)) : null;
        if(!el){
          var name = k.split('=')[0];
          each(document.getElementsByName(name), function(x){ if(!el && fieldKey(x) === k) el = x; });
        }
        if(!inRoots(roots, el)) return;
        var want = u.f[k];
        if(JSON.stringify(readField(el)) === JSON.stringify(want)) return;
        writeField(el, want);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      (u.on || []).forEach(function(l){ var b = findIn(roots, l); if(b && !isOn(b)) b.click(); });
      (u.off || []).forEach(function(l){ var b = findIn(roots, l); if(b && isOn(b)) b.click(); });
      // A legend is often rebuilt by the click on it, so one entry at a time.
      var legend = u.legend || {}, n = 0;
      function next(){
        var hit = null;
        rootsOf(card).forEach(function(root){
          each(root.querySelectorAll('.legend-item'), function(it){
            var l = legendKey(it);
            if(!legend.hasOwnProperty(l)) l = norm(it.textContent);
            if(!hit && legend.hasOwnProperty(l) && !!legend[l] !== it.classList.contains('hidden')) hit = it;
          });
        });
        if(!hit || ++n > 40) return;
        hit.click();
        return wait(80).then(next);
      }
      return wait(300).then(next);
    }

    // What the chart shows: the scenario (s), the popup's view (v) and the
    // card's fields, toggles and legend (u). The prices (d) only on request.
    function payloadOf(card, key, withData, picked){
      var payload = {};
      // A hook that cannot hand over its data (prices not loaded) says why.
      if(withData && dataHook) payload.d = dataHook.save();
      if(provider) payload.s = provider.save();
      if(views[key] && views[key].save) payload.v = views[key].save(picked);
      var u = captureUi(card);
      if(u) payload.u = u;
      return payload;
    }
    function buildEmbed(m, picked){
      var card = cardOf(m.cluster), el = chartOf(card), key = keyOf(el);
      if(!key) return Promise.reject(new Error('no chart'));
      var payload, extra = 0;
      try {
        payload = payloadOf(card, key, true, picked);
        if(picked && picked.length && views[key] && views[key].height) extra = Math.max(0, +views[key].height(picked) || 0);
      }
      catch(e){ return Promise.reject(e); }
      var theme = document.body.classList.contains('light') ? 'light' : 'dark', home = pageUrl();
      return Promise.all([pack(payload), openLink(home, key, payload)]).then(function(r){
        var src = home + '#embed=' + encodeURIComponent(key) + '&theme=' + theme + '&s=' + r[0];
        var code = '<iframe src="' + attr(src) + '" title="' + attr(chartTitle(card) || toolName()) +
          '" width="100%" height="' + frameHeight(card, el, extra) + '" style="border:0;background:transparent" loading="lazy"></iframe>\n' + credit(r[1], W(m)) + '\n' + resizer(home);
        return { code: code, src: src, key: key, open: r[1] };
      });
    }

    /* The address the links back to the tool point at: the tool itself, set
       up on the scenario and the view the embed shows. The prices (d) stay
       out: the tool fetches its own, so the link stays short. */
    function openLink(home, key, payload){
      var p = {};
      ['s', 'v', 'u'].forEach(function(k){ if(payload[k] !== undefined) p[k] = payload[k]; });
      if(!p.s && !p.v && !p.u) return Promise.resolve(home);
      return pack(p).then(function(s){ return home + '#open=' + encodeURIComponent(key) + '&s=' + s; },
                          function(){ return home; });
    }

    /* ── Share as link ──
       The address the embed's links back point at, on its own: the tool set
       up on the reader's scenario and this chart's view, copied to the
       clipboard. Whoever opens it gets open mode below. */
    function buildLink(m){
      var card = cardOf(m.cluster), key = keyOf(chartOf(card)), home = pageUrl();
      if(!key) return Promise.resolve(home);
      var payload;
      try { payload = payloadOf(card, key, false); }
      catch(e){ return Promise.reject(e); }
      return openLink(home, key, payload);
    }
    function copyLink(m){
      var t = T(), url = buildLink(m), done;
      url.catch(function(){});
      try {
        // Packing is async, so the item is handed a promise and written
        // straight away, inside the click, as Safari requires.
        if(!navigator.clipboard || !navigator.clipboard.write || !global.ClipboardItem) throw new Error(t.noCopy);
        done = navigator.clipboard.write([new global.ClipboardItem({
          'text/plain': url.then(function(u){ return new Blob([u], { type: 'text/plain' }); })
        })]);
      } catch(e){ done = Promise.reject(e); }
      done.then(function(){ flash(m.toggle, t.linkCopied); }, function(){
        return url.then(function(u){
          var fallback = function(){ global.prompt(t.linkPrompt, u); };
          if(navigator.clipboard && navigator.clipboard.writeText)
            return navigator.clipboard.writeText(u).then(function(){ flash(m.toggle, t.linkCopied); }, fallback);
          fallback();
        });
      }).catch(function(e){ alert(t.noLink + (e && e.message ? e.message : e)); });
    }

    /* The credit line under the frame. The watermark inside the frame cannot
       be edited out, but a link inside a frame counts for the framed page, so
       it earns no backlink. This one is a plain link on the other site's own
       page, which does. Its anchor is the tool's name, not keywords (links in
       widgets with keyword anchors are what search engines treat as spam),
       and it is visible and followed. It takes the other site's own font and
       link colour. The site may delete it; the watermark stays either way. */
    function siteName(){
      var m = document.querySelector('meta[property="og:site_name"]');
      return norm(m && m.content) || 'Adjie Brotot Tools';
    }
    function credit(home, t){
      t = t || T();
      return '<p style="margin:6px 0 0;font-size:13px;text-align:right">' + html(t.credit[0]) +
        '<a href="' + attr(home) + '">' + html(toolName()) + '</a>' + html(t.credit[1]) + html(siteName()) + '</p>';
    }

    /* ── The embed dialog ── */
    function copyText(text, area){
      var fallback = function(){
        area.focus(); area.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch(e){}
        return ok;
      };
      if(navigator.clipboard && navigator.clipboard.writeText)
        return navigator.clipboard.writeText(text).then(function(){ return true; }, fallback);
      return Promise.resolve(fallback());
    }
    function dialog(){
      if(dlg) return dlg;
      var t = T(), ov = document.createElement('div');
      ov.className = 'share-embed-overlay';
      ov.setAttribute('data-no-abbr', '');
      ov.innerHTML =
        '<div class="share-embed card" role="dialog" aria-modal="true" aria-labelledby="shareEmbedTitle">' +
          '<div class="share-embed-head"><h2 id="shareEmbedTitle">' + t.embedTitle + '</h2>' +
            global.SharedIcon.button('close', t.close, 'share-embed-close') + '</div>' +
          '<p class="share-embed-note">' + t.embedNote + '</p>' +
          '<div class="share-embed-choices" role="group" aria-label="' + attr(t.include.replace(/:$/, '')) + '" hidden></div>' +
          '<textarea class="share-code" readonly spellcheck="false" rows="6" data-no-persist aria-label="' + attr(t.codeLabel) + '"></textarea>' +
          '<p class="share-embed-size" hidden></p>' +
          '<div class="share-embed-actions">' +
            '<a class="share-preview" target="_blank" rel="noopener">' + t.preview + '</a>' +
            '<button type="button" class="btn-primary share-copy-code">⧉ ' + t.copyCode + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      dlg = { el: ov, code: ov.querySelector('.share-code'), copy: ov.querySelector('.share-copy-code'),
              preview: ov.querySelector('.share-preview'), size: ov.querySelector('.share-embed-size'),
              choices: ov.querySelector('.share-embed-choices'), title: ov.querySelector('#shareEmbedTitle'),
              note: ov.querySelector('.share-embed-note'), back: null, n: 0 };
      var shut = function(){
        ov.classList.remove('is-open');
        if(dlg.back) dlg.back.focus({ preventScroll: true });
      };
      dlg.close = shut;
      ov.addEventListener('click', function(e){ if(e.target === ov) shut(); });
      ov.querySelector('.share-embed-close').addEventListener('click', shut);
      ov.addEventListener('keydown', function(e){
        if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); shut(); return; }
        if(e.key !== 'Tab') return;
        // Keep the keyboard inside the dialog while it is open.
        var f = Array.prototype.filter.call(ov.querySelectorAll('button, a[href], textarea, input'), function(x){ return x.offsetParent !== null; });
        var i = f.indexOf(document.activeElement);
        if(e.shiftKey && i <= 0){ e.preventDefault(); f[f.length - 1].focus(); }
        else if(!e.shiftKey && i === f.length - 1){ e.preventDefault(); f[0].focus(); }
      });
      dlg.code.addEventListener('focus', function(){ dlg.code.select(); });
      dlg.copy.addEventListener('click', function(){
        if(!dlg.ready) return;
        copyText(dlg.code.value, dlg.code).then(function(ok){
          if(!ok){ alert(t.textFail); return; }
          var lbl = dlg.copy.textContent;
          dlg.copy.textContent = t.copied;
          setTimeout(function(){ dlg.copy.textContent = lbl; }, 1400);
        });
      });
      return dlg;
    }
    function previewPage(code){
      return '<!doctype html><html lang="' + pageLang() + '"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html(T().preview) + '</title></head>' +
        '<body style="margin:0;padding:24px 16px;background:#f4f5f7;color:#222;font:16px/1.5 system-ui,sans-serif">' +
        '<div style="max-width:960px;margin:0 auto">' + code + '</div></body></html>';
    }
    function openEmbed(m){
      var d = dialog(), t = W(m), key = keyOf(chartOf(cardOf(m.cluster))), hook = views[key];
      d.back = m.toggle;
      // One dialog serves every menu, so it takes this menu's words each time.
      d.title.textContent = t.embedTitle;
      d.note.textContent = t.embedNote;
      // The view's checklist, all off: an embed carries only the chart unless asked.
      var list = hook && hook.choices ? hook.choices() || [] : [];
      d.choices.innerHTML = list.length ? '<span class="share-embed-inc">' + html(t.include) + '</span><span class="share-embed-opts">' + list.map(function(c){
        return '<label><input type="checkbox" data-no-persist value="' + attr(c.value) + '"> ' + html(c.label) + '</label>';
      }).join('') + '</span>' : '';
      d.choices.hidden = !list.length;
      d.choices.onchange = function(){ fillEmbed(m, d, t); };
      d.el.classList.add('is-open');
      fillEmbed(m, d, t);
      d.code.focus({ preventScroll: true });
    }
    function fillEmbed(m, d, t){
      var picked = Array.prototype.filter.call(d.choices.querySelectorAll('input'), function(x){ return x.checked; })
        .map(function(x){ return x.value; });
      // A later tick wins over a build still running for an earlier one.
      var n = ++d.n;
      d.ready = false;
      d.code.value = t.building;
      d.preview.removeAttribute('href');
      d.copy.disabled = true;
      d.size.hidden = true;
      buildEmbed(m, picked).then(function(r){
        if(n !== d.n) return;
        // Browsers stop following a link at about 2 MB; past a few KB the
        // reader should know why the code is long (a dataset rides in it).
        if(r.code.length > 8000){
          d.size.textContent = r.code.length > 1.9e6 ? t.tooBig : t.long.replace('{kb}', Math.round(r.code.length / 1024));
          d.size.hidden = false;
          if(r.code.length > 1.9e6){ d.code.value = t.tooBig; return; }
        }
        d.code.value = r.code;
        // The preview is the code on a page of its own, as another site shows it.
        if(d.blob) URL.revokeObjectURL(d.blob);
        d.blob = URL.createObjectURL(new Blob([previewPage(r.code)], { type: 'text/html' }));
        d.preview.href = d.blob;
        d.ready = true;
        d.copy.disabled = false;
        if(!d.choices.contains(document.activeElement)){
          d.code.focus({ preventScroll: true });
          d.code.select();
        }
      }, function(e){ if(n === d.n) d.code.value = t.noEmbed + (e && e.message ? e.message : e); });
    }

    /* ── Embed mode: this page, inside someone else's iframe ── */
    function applyTheme(theme){
      if(theme !== 'light' && theme !== 'dark') return;
      var want = theme === 'light';
      if(want === document.body.classList.contains('light')) return;
      var b = document.getElementById('themeToggle');
      // The tool's own toggle, so its charts re-read their colours.
      if(b) b.click(); else document.body.classList.toggle('light', want);
    }
    /* The frame's watermark: the site's circled A and one quiet line back to
       the tool, at the card's foot. It is part of the framed page, which the
       other site cannot reach into, so it goes wherever the chart goes. */
    var LOGO = '<svg class="abt-embed-mark-logo" viewBox="0 0 680 680" width="12" height="12" aria-hidden="true" focusable="false">' +
      '<circle cx="340" cy="340" r="300" fill="#0052cc"/><g fill="none" stroke="#fff" stroke-width="46">' +
      '<path d="M242 570A250 250 0 0 1 234 113"/><path d="M234 113A250 250 0 0 1 446 113"/><path d="M446 113A250 250 0 0 1 438 570"/></g>' +
      '<line x1="113" y1="354" x2="567" y2="354" stroke="#fff" stroke-width="42" stroke-linecap="round"/></svg>';
    function mark(card, href){
      var home = pageUrl(), a = document.createElement('a');
      a.className = 'abt-embed-mark';
      a.href = href || home;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = toolName();
      a.setAttribute('data-no-abbr', '');
      a.innerHTML = LOGO + '<span>' + html(W({ tool: toolCluster(card) }).backlink) + ' ' + html(home.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</span>';
      card.appendChild(a);
    }
    // Only the card is left: every sibling on the way up to the body is
    // hidden, and every box on that way loses its own layout.
    function isolate(card, el, href){
      var fill = fillOf(el);
      // The chart's own height on the page, before the frame stretches it.
      var natural = desktopHeight(fill) || fill.offsetHeight || 430;
      mark(card, href);
      card.classList.add('abt-embed-card');
      fill.classList.add('abt-embed-fill');
      for(var n = fill.parentElement; n && n !== card; n = n.parentElement) n.classList.add('abt-embed-col');
      for(var node = card; node && node.parentElement && node !== document.body; node = node.parentElement){
        var parent = node.parentElement, atBody = parent === document.body;
        each(parent.children, function(sib){
          if(sib === node || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(sib.tagName)) return;
          // Tooltips and menus float over the body, and still have to.
          if(atBody && /^(fixed|absolute)$/.test(getComputedStyle(sib).position)) return;
          sib.setAttribute('data-abt-hide', '');
        });
        if(!atBody) parent.classList.add('abt-embed-path');
      }
      var ch = global.Chart && global.Chart.getChart ? global.Chart.getChart(el) : null;
      if(ch) ch.resize();
      if(global.Plotly && el.classList.contains('js-plotly-plot')) { try { global.Plotly.Plots.resize(el); } catch(e){} }
      sizeFrame(card, el, natural);
    }
    /* The height the frame asks the other site for: the card's chrome (its
       title, toolbar, legend and watermark) at the frame's width, plus the
       chart at its own height, or a diagram at the height its width draws it
       (SharedShare.fit). The resizer() in the code applies it; it only reads
       the width, so the frame growing never feeds back into what it asks. */
    function sizeFrame(card, el, natural){
      if(global.parent === global) return;
      var fill = fillOf(el), key = keyOf(el), sent = [], at = 0, queued = false;
      // The card laid out at its own height for a moment, the chart at the
      // height it asks for, and put back before anything is painted.
      function measure(){
        var want = fitOf(key, fill.clientWidth) || natural, cs = card.style.cssText, fs = fill.style.cssText;
        var cols = Array.prototype.filter.call(card.querySelectorAll('.abt-embed-col'), function(c){ return c.contains(fill); });
        var css = cols.map(function(c){ return c.style.cssText; });
        card.style.setProperty('height', 'auto', 'important');
        cols.forEach(function(c){ c.style.setProperty('min-height', '0', 'important'); });
        fill.style.setProperty('flex', '0 0 auto', 'important');
        fill.style.setProperty('height', want + 'px', 'important');
        fill.style.setProperty('min-height', '0', 'important');
        var h = card.getBoundingClientRect().height;
        card.style.cssText = cs;
        cols.forEach(function(c, i){ c.style.cssText = css[i]; });
        fill.style.cssText = fs;
        // A card that scrolls (a diagram with charts under it) holds its
        // chart at this height rather than squeezing it: --abt-fill-h.
        card.style.setProperty('--abt-fill-h', want + 'px');
        // One pixel to spare, so rounding never leaves a scrollbar.
        return Math.ceil(h) + 1;
      }
      function post(){
        queued = false;
        var h = measure();
        if(sent.length && Math.abs(h - sent[0]) < 2) return;
        // A scrollbar on the other page coming and going swings the width,
        // and with it the height: settle on the taller of the two.
        if(sent.length > 1 && Math.abs(h - sent[1]) < 2 && Date.now() - at < 1000 && h <= sent[0]) return;
        at = Date.now();
        sent.unshift(h);
        sent.length = Math.min(sent.length, 2);
        try { global.parent.postMessage({ abtEmbed: 'height', height: h }, '*'); } catch(e){}
      }
      function queue(){ if(!queued){ queued = true; global.requestAnimationFrame(post); } }
      if(global.ResizeObserver) new ResizeObserver(queue).observe(card);
      else global.addEventListener('resize', queue);
      // A diagram is redrawn (another hour, a solved scenario) without a resize.
      if(global.MutationObserver) new MutationObserver(queue).observe(el, { attributes: true, attributeFilter: ['data-share-sig'] });
      queue();
    }
    // A signature of what the chart is drawing, to tell when it has settled.
    function sig(el){
      if(!el) return '';
      var ch = global.Chart && global.Chart.getChart ? global.Chart.getChart(el) : null;
      if(ch) return ch.id + '|' + (ch.data.labels || []).length + '|' + ch.data.datasets.map(function(d){
        var a = d.data || [], s = 0, step = Math.max(1, Math.ceil(a.length / 60));
        for(var i = 0; i < a.length; i += step){ var v = a[i]; s += typeof v === 'number' ? v : (v && typeof v.y === 'number' ? v.y : 0); }
        return (d.label || '') + ':' + a.length + ':' + s + ':' + !!d.hidden;
      }).join(',');
      if(el.data && el._fullLayout) return 'p|' + el.data.length + '|' + el.data.map(function(tr){ return (tr.x || tr.z || []).length + ':' + (tr.visible === false); }).join(',');
      if(el.hasAttribute && el.hasAttribute('data-share-sig')) return el.getAttribute('data-share-sig');
      return '';
    }
    function settled(key, quick){
      return new Promise(function(resolve){
        // A tool that draws as it loads has settled once it draws anything.
        if(quick && sig(findChart(key))) return global.requestAnimationFrame(function(){ resolve(); });
        var last = null, same = 0, t0 = Date.now();
        (function poll(){
          var s = sig(findChart(key));
          same = s && s === last ? same + 1 : 0;
          last = s;
          if((s && same >= 3) || Date.now() - t0 > 15000) return resolve();
          setTimeout(poll, 120);
        })();
      });
    }
    function embedFailed(key){
      var el = key ? findChart(key) : null;
      var t = W({ tool: toolCluster(cardOf(el)) }), box = document.createElement('div');
      box.className = 'share-embed-fail';
      box.innerHTML = '<p>' + t.failed + '</p><p><a href="' + attr(pageUrl()) + '" target="_blank" rel="noopener">' +
        t.openTool + ': ' + html(toolName()) + '</a></p>';
      document.body.appendChild(box);
      document.documentElement.classList.add('abt-embed-failed');
    }
    function startEmbed(){
      var E = { key: keyNow(EMBED.key), theme: EMBED.theme, s: EMBED.s }, payload = {}, back = null;
      var quick = !!(provider && provider.sync), pause = function(ms){ return quick ? Promise.resolve() : wait(ms); };
      Promise.resolve()
        .then(function(){ applyTheme(E.theme); })
        .then(function(){ return E.s ? unpack(E.s) : {}; })
        .then(function(p){
          payload = p && typeof p === 'object' ? p : {};
          // Packed as it came, before any string is made inert below.
          back = openLink(pageUrl(), E.key, payload);
          // The legend labels and toggles are only compared and matched as
          // selectors, never written into the page; everything else is.
          payload.s = inert(payload.s);
          payload.v = inert(payload.v);
          if(payload.u && typeof payload.u === 'object') payload.u.f = inert(payload.u.f);
          // The data goes in first, so the scenario runs on it. It is checked
          // field by field by its own hook rather than made inert.
          if(payload.d && dataHook) dataHook.load(payload.d);
          if(payload.s && provider) return provider.load(payload.s);
        })
        .then(function(){ return pause(250); })
        .then(function(){
          // A tool behind a Simulate gate draws on its button, not on load.
          var run = document.querySelector('.needs-run');
          if(run && !run.disabled){ run.click(); return pause(250); }
        })
        .then(function(){ var h = views[E.key]; if(h && h.load) return h.load(payload.v || {}); })
        .then(function(){ return pause(250); })
        .then(function(){ var card = cardOf(findChart(E.key)); if(card && payload.u) return applyUi(card, payload.u); })
        .then(function(){ return pause(200); })
        .then(function(){
          var el = findChart(E.key), card = cardOf(el);
          if(!card) throw new Error('no chart ' + E.key + ' on this page');
          return back.then(function(href){ isolate(card, el, href); return settled(E.key, quick); });
        })
        .then(function(){
          // A link from before prices rode in it would need the Worker, which
          // an embed never calls: say so rather than draw half the chart.
          if(embedFetchRefused) throw new Error('this link carries no prices; copy the embed code again');
        })
        .catch(function(err){ if(global.console) console.warn('Embed:', err); embedFailed(E.key); })
        .then(function(){ document.documentElement.classList.remove('abt-embed-wait'); });
    }
    if(EMBED){
      var started = false, go = function(){ if(!started){ started = true; setTimeout(startEmbed, 0); } };
      if(document.readyState === 'complete') go();
      else {
        global.addEventListener('load', go);
        // A sync tool is drawn by the end of its own script, so it need not
        // wait for the page's other files (analytics, images): only for the
        // webfont its canvases draw in, and not for long.
        document.addEventListener('DOMContentLoaded', function(){
          if(!(provider && provider.sync)) return;
          var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
          Promise.race([fonts, wait(400)]).then(go, go);
        });
      }
    }

    /* ── Open mode: a link back from an embed ──
       The whole tool, on the scenario and view the embed showed. It loads as
       a scenario file would, so it becomes the reader's own saved work; the
       address loses its #open first, so a reload keeps what they change. */
    function startOpen(){
      var O = { key: keyNow(OPEN.key), s: OPEN.s }, payload = {};
      try { global.history.replaceState(null, '', global.location.pathname + global.location.search); } catch(e){}
      unpack(O.s)
        .then(function(p){
          payload = p && typeof p === 'object' ? p : {};
          payload.s = inert(payload.s);
          payload.v = inert(payload.v);
          if(payload.u && typeof payload.u === 'object') payload.u.f = inert(payload.u.f);
          if(payload.s && provider) return provider.load(payload.s);
        })
        .then(function(){ return wait(250); })
        .then(function(){
          var run = document.querySelector('.needs-run');
          if(run && !run.disabled){ run.click(); return wait(250); }
        })
        .then(function(){ var h = views[O.key]; if(h && h.load) return h.load(payload.v || {}); })
        .then(function(){ return wait(250); })
        .then(function(){ var card = cardOf(findChart(O.key)); if(card && payload.u) return applyUi(card, payload.u); })
        .then(function(){
          var card = cardOf(findChart(O.key));
          if(card && card.scrollIntoView) card.scrollIntoView({ block: 'center' });
        })
        .catch(function(err){ if(global.console) console.warn('Open:', err); });
    }
    if(OPEN){
      if(document.readyState === 'complete') setTimeout(startOpen, 0);
      else global.addEventListener('load', function(){ setTimeout(startOpen, 0); });
    }

    return {
      upgrade: upgrade,
      copyImage: copyImage,
      state: function(p){ provider = p && typeof p.save === 'function' && typeof p.load === 'function' ? p : null; },
      view: function(key, hook){ if(key) views[key] = hook; },
      fit: function(key, fn){ if(key && typeof fn === 'function') fits[key] = fn; },
      alias: function(from, to){ if(from && to && from !== to) aliases[from] = to; },
      // Data the scenario draws but cannot rebuild in the frame (prices).
      data: function(hook){ dataHook = hook && typeof hook.save === 'function' && typeof hook.load === 'function' ? hook : null; },
      embedded: EMBED ? { key: EMBED.key, theme: EMBED.theme } : null,
      // For the checks in _ref/: the code a cluster's Embed row would show.
      embedCode: function(cluster){ var m = cluster && cluster.__share; return m ? buildEmbed(m) : Promise.reject(new Error('no menu')); },
      // The address a cluster's Share as link row would copy.
      shareLink: function(cluster){ var m = cluster && cluster.__share; return m ? buildLink(m) : Promise.reject(new Error('no menu')); },
      pack: pack, unpack: unpack
    };
  }
  global.SharedShare = makeShare();

  /* ══ Finance tool skeleton ═══════════════════════════════════════════════
     The behaviours every finance tool shares, so the same field behaves the
     same way on every page. See "Finance tool skeleton" in
     _ref/design-reference.md. */
  function pageLang(){
    var l = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
    return l.indexOf('id') === 0 ? 'id' : 'en';
  }
  function decimalsOf(step){
    if(step == null || step === '' || step === 'any' || !isFinite(+step)) return null;
    var s = String(+step), e = s.indexOf('e-');
    if(e >= 0) return parseInt(s.slice(e + 2), 10);
    var i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }
  // A number as a reader writes it: no float dust, a real minus sign.
  function plainNumber(v, maxDp){
    var n = +(+v).toFixed(maxDp == null ? 10 : maxDp);
    var s = String(Math.abs(n));
    if(Math.abs(n) >= 10000) s = Math.abs(n).toLocaleString('en-US', {maximumFractionDigits: maxDp == null ? 10 : maxDp});
    return (n < 0 ? '−' : '') + s;
  }

  /* ── SharedBounds — a field refuses a value outside its range ─────────────
     Rule: the boundary and the step of a field are stated by the field itself,
     not by a sentence. A typed field declares them the way a slider does:

         <input type="number" min="0" max="30" step="0.1">             (native)
         <input type="text" class="affix-input" data-min="0"
                data-max="100000000000" data-step="1">                 (money)

     When the reader leaves the field (its change event), a value past either
     end is pulled back to that end and snapped to the step, and a small note
     under the field says so for a moment ("Max 30 %/yr"), so the change is
     never silent. Snapping alone, inside the range, is silent: that is what a
     slider does too. Runs in the capture phase, so the tool's own change
     handler already reads the corrected value; an input event is fired as
     well, for tools that only listen to input. A blank field is left blank:
     several tools read blank as "work it out for me". */
  function makeBounds(){
    var TEXT = { en: { max: 'Max', min: 'Min' }, id: { max: 'Maks.', min: 'Min.' } };
    var hintEl = null, hintTimer = null, hintFor = null;
    // data-min / data-max opt a field in anywhere. A native number field's own
    // min / max count too, on the finance tools (where this was designed);
    // other pages keep their number fields as they were.
    function raw(el, name){
      var v = el.getAttribute('data-' + name);
      if(v == null && (el.type || '').toLowerCase() === 'number' && inFinanceTool()) v = el.getAttribute(name);
      return v == null || v === '' ? null : v;
    }
    function limits(el){
      if(!el || el.tagName !== 'INPUT') return null;
      var t = (el.type || 'text').toLowerCase();
      if(t !== 'text' && t !== 'number' && t !== 'tel') return null;
      var mn = raw(el, 'min'), mx = raw(el, 'max'), st = raw(el, 'step');
      if(mn == null && mx == null) return null;
      return {
        min: mn == null ? -Infinity : parseFloat(mn),
        max: mx == null ? Infinity : parseFloat(mx),
        step: st == null || st === 'any' ? null : parseFloat(st)
      };
    }
    function parse(el){
      var s = String(el.value == null ? '' : el.value).replace(/,/g, '').replace(/−/g, '-').trim();
      if(s === '' || s === '-' || s === '.' || s === '-.') return NaN;
      var n = parseFloat(s);
      return isFinite(n) ? n : NaN;
    }
    function grouped(el){
      return /,/.test(el.value || '') || el.getAttribute('data-money') === 'true' ||
             el.classList.contains('money-input') || el.hasAttribute('data-grouped');
    }
    function format(el, v, lim){
      var dp = decimalsOf(lim.step);
      if(grouped(el)) return SharedFmtRef().formatThousands(String(v), {maxDecimals: dp == null ? 2 : dp, allowNegative: v < 0});
      var n = dp == null ? +(+v).toPrecision(12) : +(+v).toFixed(dp);
      return String(n);
    }
    function unitOf(el){
      var pre = '', suf = el.getAttribute('data-unit') || '';
      var wrap = el.closest('.affix-wrap');
      if(wrap){
        var p = wrap.querySelector('.prefix'), s = wrap.querySelector('.suffix');
        if(p && !p.hidden) pre = (p.textContent || '').trim();
        if(s && !s.hidden) suf = (s.textContent || '').trim();
      }
      return {pre: pre, suf: suf};
    }
    function boundText(el, v, lim){
      var u = unitOf(el), dp = decimalsOf(lim.step);
      var num = plainNumber(v, dp == null ? 2 : dp);
      if(grouped(el)) num = (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', {maximumFractionDigits: dp == null ? 2 : dp});
      return (u.pre ? u.pre + ' ' : '') + num + (u.suf ? ' ' + u.suf : '');
    }
    function showHint(el, text){
      if(!hintEl){
        hintEl = document.createElement('div');
        hintEl.id = 'boundHint';
        hintEl.setAttribute('role', 'status');
        hintEl.setAttribute('aria-live', 'polite');
        hintEl.setAttribute('data-no-abbr', '');
        document.body.appendChild(hintEl);
      }
      var box = (el.closest('.affix-wrap') || el).getBoundingClientRect();
      hintEl.textContent = text;
      hintEl.style.left = Math.max(8, Math.min(box.left, window.innerWidth - 268)) + 'px';
      hintEl.style.top = Math.min(window.innerHeight - 30, box.bottom + 4) + 'px';
      hintEl.classList.add('visible');
      if(hintFor && hintFor !== el) hintFor.classList.remove('bound-flash');
      hintFor = el;
      el.classList.add('bound-flash');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(hideHint, 2600);
    }
    function hideHint(){
      if(hintEl) hintEl.classList.remove('visible');
      if(hintFor) hintFor.classList.remove('bound-flash');
      hintFor = null;
    }
    // Pull one field back inside its range. Returns true when it changed.
    function apply(el){
      var lim = limits(el);
      if(!lim) return false;
      var v = parse(el);
      if(!isFinite(v)) return false;
      var out = v, hit = null;
      if(out > lim.max){ out = lim.max; hit = 'max'; }
      if(out < lim.min){ out = lim.min; hit = 'min'; }
      if(lim.step && isFinite(lim.step) && lim.step > 0){
        var base = isFinite(lim.min) ? lim.min : 0;
        var dp = decimalsOf(lim.step);
        out = +(Math.round((out - base) / lim.step) * lim.step + base).toFixed(dp == null ? 10 : dp);
        if(out > lim.max) out = +(out - lim.step).toFixed(dp == null ? 10 : dp);
        if(out < lim.min) out = +(out + lim.step).toFixed(dp == null ? 10 : dp);
      }
      if(Math.abs(out - v) < 1e-12) return false;
      el.value = format(el, out, lim);
      if(hit) showHint(el, TEXT[pageLang()][hit] + ' ' + boundText(el, out, lim));
      return true;
    }
    function onChange(e){
      var el = e.target;
      if(!el || el.tagName !== 'INPUT' || el.__boundsBusy) return;
      if(!limits(el)) return;
      if(apply(el)){
        el.__boundsBusy = true;
        try { el.dispatchEvent(new Event('input', {bubbles: true})); }
        finally { el.__boundsBusy = false; }
      }
    }
    document.addEventListener('change', onChange, true);
    global.addEventListener('scroll', function(){ if(hintFor) hideHint(); }, true);
    return { apply: apply, limits: limits, hint: showHint };
  }
  // SharedFmt is defined above in this same file; read it lazily all the same.
  function SharedFmtRef(){ return global.SharedFmt; }
  global.SharedBounds = makeBounds();

  /* ── SharedSlider — a slider names both ends and takes a typed value ──────
     Every range input gets its min and max written under it (in the unit its
     readout uses), and its readout (.slider-value) becomes a small box: click
     or Enter, type a figure, and it lands on the slider clamped to the same
     ends and snapped to the same step. The ends follow the slider when a tool
     moves its min or max at run time.

     Found automatically at start-up; a slider added later calls
     SharedSlider.enhance(range). Opt-outs: data-no-ends (the tool draws its
     own scale), data-no-edit on the readout. data-unit on the range overrides
     the unit read off the readout; data-readout="<id>" names a readout that
     does not sit in the slider's own row.

     The automatic pass runs on the finance tools only (FINANCE below); any
     other page opts in by calling SharedSlider.scan() itself. A readout that
     already has a tool's own typing box beside it keeps that box. */
  var FINANCE = ['rentvsownhouse', 'pisahvsgabung', 'borrowingcapacity', 'financingvscash',
                 'financialfreedom', 'dcasimulator', 'costofliving-comparator', 'valuateeverything',
                 'capacity-expansion-planner'];
  function inFinanceTool(){
    var path = String((global.location && global.location.pathname) || '');
    return path.split('/').some(function(seg){ return FINANCE.indexOf(seg) > -1; });
  }
  function makeSlider(){
    var TEXT = { en: 'Click to type a value', id: 'Klik untuk mengetik nilai' };
    function readoutOf(range){
      var id = range.getAttribute('data-readout');
      if(id) return document.getElementById(id);
      var box = range.closest('.slider-block, .field-row, .sc-field, .slider-wrap');
      if(!box || box.querySelectorAll('input[type=range]').length !== 1) return null;
      return box.querySelector('.slider-value');
    }
    function unitParts(range, ro){
      if(range.hasAttribute('data-unit')) return {pre: range.getAttribute('data-prefix') || '', suf: range.getAttribute('data-unit')};
      var text = ro ? (ro.textContent || '').trim() : '';
      var m = /^([^\d−+\-]*)[−+\-]?[\d.,]+(.*)$/.exec(text);
      if(!m) return {pre: '', suf: ''};
      var pre = m[1].trim(), rest = m[2], suf = '';
      var u = /^\s?(%|×|x\b)/.exec(rest);
      if(u) suf = u[1];
      else { var w = /^(\s?[A-Za-z]+)/.exec(rest); if(w) suf = w[1]; }
      return {pre: pre, suf: suf};
    }
    function endText(v, step, p){
      var dp = decimalsOf(step);
      return p.pre + plainNumber(v, dp == null ? 2 : Math.min(dp, 2)) + p.suf;
    }
    function editable(ro, range){
      if(ro.__shEdit) return;
      ro.__shEdit = true;
      // The tool already makes this readout typeable: one box, not two.
      var sib = ro.nextElementSibling;
      if(sib && sib.classList && sib.classList.contains('slider-val-edit')) return;
      ro.classList.add('is-editable');
      ro.setAttribute('tabindex', '0');
      ro.setAttribute('role', 'button');
      ro.setAttribute('title', TEXT[pageLang()]);
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.className = 'slider-val-edit';
      inp.setAttribute('data-no-persist', '');
      inp.setAttribute('aria-label', TEXT[pageLang()]);
      ro.parentNode.insertBefore(inp, ro.nextSibling);
      function open(){
        inp.value = String(parseFloat(range.value));
        ro.style.display = 'none';
        inp.style.display = 'inline-block';
        inp.focus();
        inp.select();
      }
      var cancelled = false;
      function commit(){
        if(!cancelled){
          var v = parseFloat(String(inp.value).replace(/,/g, '').replace(/−/g, '-'));
          if(isFinite(v)){
            var mn = parseFloat(range.min), mx = parseFloat(range.max), st = parseFloat(range.step) || 1;
            if(!isFinite(mn)) mn = 0;
            if(!isFinite(mx)) mx = 100;
            var c = Math.min(mx, Math.max(mn, v));
            var dp = decimalsOf(st);
            var snapped = +(Math.round((c - mn) / st) * st + mn).toFixed(dp == null ? 10 : dp);
            if(snapped > mx) snapped = mx;
            range.value = String(snapped);
            range.dispatchEvent(new Event('input', {bubbles: true}));
            range.dispatchEvent(new Event('change', {bubbles: true}));
            if(c !== v){
              var id = pageLang() === 'id';
              var word = v > mx ? (id ? 'Maks.' : 'Max') : (id ? 'Min.' : 'Min');
              global.SharedBounds.hint(ro, word + ' ' + endText(c, st, unitParts(range, ro)));
            }
          }
        }
        cancelled = false;
        inp.style.display = 'none';
        ro.style.display = '';
      }
      ro.addEventListener('click', open);
      ro.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); }
      });
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', function(e){
        if(e.key === 'Enter'){ e.preventDefault(); inp.blur(); }
        else if(e.key === 'Escape'){ cancelled = true; inp.blur(); }
      });
    }
    function enhance(range){
      if(!range || range.__shSlider || range.type !== 'range') return;
      range.__shSlider = true;
      var ro = readoutOf(range);
      var next = range.nextElementSibling;
      var ownScale = range.hasAttribute('data-no-ends') ||
        (next && next.classList && (next.classList.contains('slider-scale') || next.classList.contains('range-ends')));
      if(!ownScale){
        var ends = document.createElement('div');
        ends.className = 'range-ends';
        ends.setAttribute('aria-hidden', 'true');
        ends.setAttribute('data-no-abbr', '');
        ends.innerHTML = '<span></span><span></span>';
        range.insertAdjacentElement('afterend', ends);
        var draw = function(){
          var p = unitParts(range, ro);
          ends.children[0].textContent = endText(range.min === '' ? 0 : range.min, range.step, p);
          ends.children[1].textContent = endText(range.max === '' ? 100 : range.max, range.step, p);
        };
        draw();
        if(global.MutationObserver){
          new MutationObserver(draw).observe(range, {attributes: true, attributeFilter: ['min', 'max', 'step']});
          if(ro) new MutationObserver(draw).observe(ro, {childList: true, characterData: true, subtree: true});
        }
      }
      if(ro && !ro.hasAttribute('data-no-edit')) editable(ro, range);
    }
    function scan(root){
      (root || document).querySelectorAll('input[type=range]').forEach(enhance);
    }
    return { enhance: enhance, scan: scan, auto: inFinanceTool };
  }
  global.SharedSlider = makeSlider();

  /* ── SharedSeg — a small count picked with buttons, kept in a <select> ────
     A choice among a handful of numbers (dependants 0 to 3, adults 1 or 2) is
     one tap on a segmented control rather than a dropdown to open or a slider
     to land. The <select> stays on the page as the field the tool reads, the
     mini cache saves and a scenario file carries; it is only hidden, and the
     buttons follow it however its value is set (a click, a preset, a restored
     file). labelOf(option) shortens a button's text; the option's own text
     stays as the button's title. */
  function fromSelect(sel, opts){
    opts = opts || {};
    if(!sel || sel.__seg) return null;
    sel.__seg = true;
    var group = document.createElement('div');
    group.className = 'seg-group seg-count' + (opts.className ? ' ' + opts.className : '');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('data-no-abbr', '');
    if(opts.ariaLabel) group.setAttribute('aria-label', opts.ariaLabel);
    function sync(){
      var v = sel.value;
      Array.prototype.forEach.call(group.children, function(b){
        var on = b.getAttribute('data-val') === v;
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    function build(){
      group.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function(o){
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'seg-btn';
        b.setAttribute('role', 'radio');
        b.setAttribute('data-val', o.value);
        b.textContent = opts.labelOf ? opts.labelOf(o) : o.value;
        b.title = (o.textContent || '').trim();
        b.addEventListener('click', function(){
          if(sel.value === o.value) return;
          sel.value = o.value;
          sel.dispatchEvent(new Event('input', {bubbles: true}));
          sel.dispatchEvent(new Event('change', {bubbles: true}));
        });
        group.appendChild(b);
      });
      sync();
    }
    sel.classList.add('seg-source');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');
    if(sel.parentElement) sel.parentElement.classList.add('seg-host');
    sel.insertAdjacentElement('afterend', group);
    // Presets and restores set .value without an event; follow them anyway.
    ['value', 'selectedIndex'].forEach(function(prop){
      var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
      if(!d || !d.set) return;
      Object.defineProperty(sel, prop, {
        configurable: true,
        get: function(){ return d.get.call(this); },
        set: function(v){ d.set.call(this, v); sync(); }
      });
    });
    sel.addEventListener('change', sync);
    sel.addEventListener('input', sync);
    if(global.MutationObserver) new MutationObserver(build).observe(sel, {childList: true, subtree: true, characterData: true});
    build();
    return { sync: sync, group: group };
  }
  global.SharedSeg = { fromSelect: fromSelect };

  /* ── SharedSegFit: a segmented control sized to its line ─────────────────
     A .seg-group drawn at its natural width went wrong two ways. Alone on its
     line in a form column, two short buttons left a gap beside them; with more
     options than the column holds, one button wrapped onto a second row of its
     own (Symbol: "Generator Solar Wind" over a lone "Grid"). So each group is
     measured where it stands:
       - alone on its line, in a column no wider than SEG_FILL_MAX (or drawn
         full width already), it fills the line and its buttons share the
         width (.seg-fill);
       - if it does not fit, its buttons tighten first (.seg-tight);
       - if it still does not fit, the buttons go into even rows (.seg-grid),
         the last one spanning what is left, so no row ends in a gap.
     A wide toolbar, and a control in a table cell, keep their compact size.
     data-seg-fit="off" opts a group out. */
  var SEG_FILL_MAX = 560;
  function segBtns(g){
    return Array.prototype.filter.call(g.children, function(b){ return b.offsetParent && b.getBoundingClientRect().width; });
  }
  function segCramped(g){
    var btns = segBtns(g), top = null;
    if(g.scrollWidth > g.clientWidth + 1) return true;
    for(var i = 0; i < btns.length; i++){
      var r = btns[i].getBoundingClientRect();
      if(top === null) top = r.top;
      else if(Math.abs(r.top - top) > 4) return true;
      if(btns[i].scrollWidth > btns[i].clientWidth + 1) return true;
    }
    return false;
  }
  function segAlone(g){
    var r = g.getBoundingClientRect(), p = g.parentElement;
    function beside(cr){ return cr.width > 2 && cr.height > 2 && cr.top < r.bottom - 2 && cr.bottom > r.top + 2; }
    for(var c = p.firstChild; c; c = c.nextSibling){
      if(c === g) continue;
      if(c.nodeType === 1){
        // Out of the flow (a SharedSeg source <select>, a badge) it takes no room.
        var pos = getComputedStyle(c).position;
        if(pos !== 'absolute' && pos !== 'fixed' && beside(c.getBoundingClientRect())) return false;
      }
      else if(c.nodeType === 3 && /\S/.test(c.textContent)){
        var range = document.createRange(); range.selectNodeContents(c);
        if(beside(range.getBoundingClientRect())) return false;
      }
    }
    return true;
  }
  function segInner(p){
    var cs = getComputedStyle(p);
    return p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }
  function segFitOne(g){
    var p = g.parentElement;
    if(!p || !g.offsetParent || g.getAttribute('data-seg-fit') === 'off') return;
    var key = p.clientWidth + '|' + g.children.length + '|' + g.textContent;
    if(g.__segKey === key) return;
    g.__segKey = key;
    var btns = Array.prototype.slice.call(g.children);
    // A button's transition would animate the change being measured.
    g.classList.add('seg-measure');
    segSize(g, btns, p);
    g.classList.remove('seg-measure');
  }
  function segSize(g, btns, p){
    g.classList.remove('seg-fill', 'seg-tight', 'seg-grid');
    g.style.removeProperty('grid-template-columns');
    btns.forEach(function(b){ b.style.removeProperty('grid-column'); });
    // Fill only alone on the line, in a form column or already full width. A
    // table cell is as wide as its columns, which may scroll: never there.
    var inner = segInner(p);
    if(!g.closest('td, th') && (inner <= SEG_FILL_MAX || g.getBoundingClientRect().width >= inner - 2) && segAlone(g)) g.classList.add('seg-fill');
    if(!segCramped(g)) return;
    g.classList.add('seg-tight');
    if(!segCramped(g)) return;
    btns = segBtns(g);
    var n = btns.length, last = btns[n - 1];
    if(n < 2) return;
    g.classList.add('seg-grid');
    for(var rows = 2; rows <= n; rows++){
      var cols = Math.ceil(n / rows), left = n % cols;
      g.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
      last.style.gridColumn = left ? 'span ' + (cols - left + 1) : '';
      if(!btns.some(function(b){ return b.scrollWidth > b.clientWidth + 1; })) break;
    }
  }
  function initSegFit(){
    var queued = false, seen = typeof WeakSet === 'function' ? new WeakSet() : null;
    var ro = global.ResizeObserver ? new ResizeObserver(queue) : null;
    function run(){
      queued = false;
      document.querySelectorAll('.seg-group').forEach(function(g){
        if(ro && seen && !seen.has(g)){ seen.add(g); ro.observe(g); if(g.parentElement) ro.observe(g.parentElement); }
        segFitOne(g);
      });
    }
    function queue(){
      if(queued) return;
      queued = true;
      requestAnimationFrame(run);
    }
    if(global.MutationObserver) new MutationObserver(queue).observe(document.body, {childList: true, subtree: true});
    global.addEventListener('resize', queue);
    queue();
  }
  global.SharedSegFit = { fit: segFitOne };

  /* ── SharedFold — the long table waits behind a button ───────────────────
     A year-by-year table is the most specific thing a tool shows, so it opens
     closed: its header row (title, CSV button) stays, and a chevron at the
     right end of that row, after the CSV button, opens the rest. The reader's
     choice is kept on this device. The CSV button exports the whole table
     either way. Clicking the title toggles it too.

         SharedFold.attach(card, { key: 'rentvsownhouse', bodies: [tabs, wrap],
                                   onOpen: resyncStickyHeader });

     open: true starts it open (a chart) until the reader closes it.

     "What this assumes" (.assumes-card) folds the same way, by itself, on
     every page: SharedFold.assumes() runs at load.                          */
  function makeFold(){
    var TEXT = { en: {show: 'Show table', hide: 'Hide table', showA: 'Show assumptions', hideA: 'Hide assumptions'},
                 id: {show: 'Tampilkan tabel', hide: 'Sembunyikan tabel', showA: 'Tampilkan asumsi', hideA: 'Sembunyikan asumsi'} };
    var CHEV = '<svg class="fold-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
    function attach(card, opts){
      opts = opts || {};
      if(!card || card.__fold) return null;
      card.__fold = true;
      var L = TEXT[pageLang()];
      var t = opts.text || {show: L.show, hide: L.hide};
      var bodies = (opts.bodies || []).map(function(b){ return typeof b === 'string' ? card.querySelector(b) : b; }).filter(Boolean);
      bodies.forEach(function(b){ b.classList.add('fold-body'); });
      var host = opts.host ? (typeof opts.host === 'string' ? card.querySelector(opts.host) : opts.host)
                           : card.querySelector('.detail-head, .chart-head');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary btn-sm btn-icon fold-btn';
      btn.setAttribute('data-no-abbr', '');
      btn.innerHTML = CHEV;
      // Last in the row: after the CSV button when there is one.
      var cluster = host ? host.querySelector('.btn-cluster') : null;
      if(cluster && cluster.parentElement === host) cluster.appendChild(btn);
      else if(host) host.appendChild(btn);
      else card.insertBefore(btn, card.firstChild);
      var title = host ? host.querySelector('h2, h3') : null;
      if(title){
        title.classList.add('fold-title');
        title.addEventListener('click', function(e){
          if(e.target.closest('.tip-icon, a, button, select, input')) return;
          set(!open, true);
        });
      }
      var key = opts.key ? 'abt:fold:' + opts.key : null;
      // Closed unless the reader opened it before; opts.open starts it open instead.
      var open = !!opts.open;
      try { var kept = key ? localStorage.getItem(key) : null; if(kept === '1' || kept === '0') open = kept === '1'; } catch(e){}
      function set(o, byReader){
        open = !!o;
        card.classList.toggle('is-folded', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? t.hide : t.show);
        btn.title = open ? t.hide : t.show;
        if(byReader && key){ try { localStorage.setItem(key, open ? '1' : '0'); } catch(e){} }
        if(open && typeof opts.onOpen === 'function') opts.onOpen();
      }
      btn.addEventListener('click', function(){ set(!open, true); });
      set(open, false);
      return { open: function(){ set(true, true); }, close: function(){ set(false, true); }, isOpen: function(){ return open; }, button: btn };
    }
    /* Every "What this assumes" card: its title moves into a head row and the
       list folds under it, closed until the reader opens it. One key a page,
       shared by its English and Indonesian copies. */
    function assumes(root){
      (root || document).querySelectorAll('.assumes-card').forEach(function(card){
        if(card.__fold) return;
        var h = card.querySelector('h2, h3');
        if(!h) return;
        var head = document.createElement('div');
        head.className = 'detail-head assumes-head';
        h.parentNode.insertBefore(head, h);
        head.appendChild(h);
        var path = (location.pathname || '/').replace(/index\.html$/, '').replace(/\/id\/$/, '/');
        var L = TEXT[pageLang()];
        attach(card, { key: 'assumes:' + path, host: head, bodies: ['.assumptions'], text: {show: L.showA, hide: L.hideA} });
      });
    }
    return { attach: attach, assumes: assumes };
  }
  global.SharedFold = makeFold();

  /* ── SharedVerdict — the answer as one sentence, above the cards ──────────
     tone: '' (a fair comparison: rent or own, separate or joint), 'good',
     'bad' or 'warn' (a pass or a miss against a goal the reader set).
     title and body are HTML the tool builds from its own figures. */
  function setVerdict(el, v){
    if(typeof el === 'string') el = document.getElementById(el);
    if(!el) return;
    el.classList.remove('good', 'bad', 'warn');
    if(!v){ el.classList.remove('visible'); el.innerHTML = ''; return; }
    if(v.tone) el.classList.add(v.tone);
    el.innerHTML = '<h2>' + v.title + '</h2>' + (v.body ? '<p>' + v.body + '</p>' : '');
    el.classList.add('visible');
  }
  global.SharedVerdict = { set: setVerdict };

  /* ── SharedTable.head — a column header with its unit set apart ───────────
     A tool keeps one header string for the table and its CSV ('Peak demand
     MW', 'Margin (MW)'); this returns the HTML for the <th>: the label, then
     the trailing unit in a .th-unit span that shared.css drops to its own
     lighter line. The space before the span keeps textContent readable.
     The label wraps on its own (shared.css) when the column is tight. A
     string with no unit it knows comes back as the label alone. */
  var TH_UNIT = /^(.+?) \(?(MW|MWh|GWh|TWh|kW|kWh|MVA|MVAr|kV|kA|Hz|%|°|p\.u\.|per \S+)\)?$/;
  function escTh(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function tableHead(text){
    var s = String(text == null ? '' : text), m = TH_UNIT.exec(s);
    if(!m) return escTh(s);
    return escTh(m[1]) + ' <span class="th-unit">' + escTh(m[2]) + '</span>';
  }
  global.SharedTable = { head: tableHead };

  /* ── SharedPalette — neutral options never wear red ───────────────────────
     Two options a reader is choosing between (own or rent, separate or joint,
     loan A or loan B) are neither good nor bad, so they take the neutral
     sequence: blue, then gold, then teal, rose, purple. Red and the positive
     blue stay for direction (a gain, a loss, money in, money out). Duplicates
     are dropped by their resolved colour, because in dark mode --line-e and
     --gold are the same gold. Blue against gold stays distinct for all three
     common kinds of colour blindness (see the design reference). */
  var NEUTRAL_VARS = ['--line-a', '--gold', '--line-c', '--line-d', '--line-e'];
  function neutralColours(el){
    var cs = getComputedStyle(el || document.body), out = [], seen = {};
    NEUTRAL_VARS.forEach(function(name){
      var c = cs.getPropertyValue(name).trim();
      var k = c.toLowerCase();
      if(c && !seen[k]){ seen[k] = true; out.push(c); }
    });
    return out;
  }
  global.SharedPalette = {
    NEUTRAL_VARS: NEUTRAL_VARS,
    neutral: neutralColours,
    at: function(i, el){ var l = neutralColours(el); return l.length ? l[((i % l.length) + l.length) % l.length] : ''; }
  };

  /* ── SharedColDrag — pick up a table column and drop it somewhere else ────
     A grip in a header cell (any element carrying data-col-grip="<n>", where
     n counts the draggable columns only, left to right) lifts its whole
     column: the cells slide with the pointer, a line shows where they will
     land (past a column's middle is past that column), and the tool is told the move as onMove(from, to), both in that
     same count. What a move means is the tool's business; this only reports
     it, and the tool redraws. Mouse, pen and touch alike, and the keyboard:
     a focused grip moves its column one place on the left and right arrows.
     Escape, or dropping it back where it was, cancels.

         SharedColDrag.attach(table, { onMove: function(from, to){ ... } });  */
  function makeColDrag(){
    var THRESHOLD = 4;     // px of travel before a press becomes a drag
    var EDGE = 48;         // px from a scroller's edge where it starts scrolling
    // Grid column a cell starts at, counting the colspans before it.
    function gridCol(cell){ var x = 0, c = cell; while((c = c.previousElementSibling)) x += c.colSpan || 1; return x; }
    // Every one-column cell at grid column `col`. A cell spanning several
    // (a section heading, a full-width add button) belongs to no one column,
    // so it stays where it is.
    function cellsAt(table, col){
      var out = [];
      Array.prototype.forEach.call(table.rows, function(tr){
        var x = 0;
        for(var i = 0; i < tr.cells.length; i++){
          var c = tr.cells[i], span = c.colSpan || 1;
          if(x === col){ if(span === 1) out.push(c); break; }
          x += span;
          if(x > col) break;
        }
      });
      return out;
    }
    function scrollerOf(el){
      for(var p = el.parentElement; p && p !== document.body; p = p.parentElement){
        var ox = getComputedStyle(p).overflowX;
        if((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return p;
      }
      return null;
    }
    function attach(table, opts){
      if(!table || !opts || typeof opts.onMove !== 'function') return;
      var grips = Array.prototype.slice.call(table.querySelectorAll('[data-col-grip]'));
      var heads = [];
      grips.forEach(function(g){ heads[+g.getAttribute('data-col-grip')] = g.closest('th,td'); });
      if(heads.length < 2 || heads.some(function(h){ return !h; })) return;
      var scope = opts.scope || document;

      function move(from, to, refocus){
        if(to === from || to < 0 || to >= heads.length) return;
        opts.onMove(from, to);
        if(refocus){
          // The tool has usually rebuilt the table: find the grip again.
          var g = scope.querySelector('[data-col-grip="' + to + '"]');
          if(g) g.focus();
        }
      }

      grips.forEach(function(grip){
        var from = +grip.getAttribute('data-col-grip');
        grip.addEventListener('keydown', function(e){
          var d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
          if(!d) return;
          e.preventDefault();
          move(from, from + d, true);
        });
        grip.addEventListener('click', function(e){ e.preventDefault(); });
        grip.addEventListener('pointerdown', function(e){
          if(e.button !== 0) return;
          e.preventDefault();
          drag(e, grip, from);
        });
      });

      function drag(e, grip, from){
        var startX = e.clientX, lastX = startX, dragging = false, to = from, raf = 0, done = false;
        var cells = cellsAt(table, gridCol(heads[from]));
        var sc = scrollerOf(table), scroll0 = sc ? sc.scrollLeft : 0;
        // Layout rects taken once, before anything moves; later frames shift
        // them by however far the scroller has travelled since.
        var R = heads.map(function(h){ var r = h.getBoundingClientRect(); return { l: r.left, r: r.right, m: (r.left + r.right) / 2 }; });
        var minDx = R[0].l - R[from].l, maxDx = R[R.length - 1].r - R[from].r;
        var others = heads.map(function(_, i){ return i; }).filter(function(i){ return i !== from; });
        var line = null;
        try { grip.setPointerCapture(e.pointerId); } catch(_){}

        function frame(){
          raf = 0;
          if(!dragging || done) return;
          if(sc){
            var b = sc.getBoundingClientRect(), v = 0;
            if(lastX < b.left + EDGE) v = -Math.ceil((b.left + EDGE - lastX) / 4);
            else if(lastX > b.right - EDGE) v = Math.ceil((lastX - b.right + EDGE) / 4);
            if(v){ sc.scrollLeft += Math.max(-16, Math.min(16, v)); }
          }
          var s = sc ? sc.scrollLeft - scroll0 : 0;
          // The cells stop at the table's draggable span. The landing place
          // follows the pointer: past a column's middle is past that column.
          var dx = Math.max(minDx, Math.min(maxDx, lastX - startX + s));
          cells.forEach(function(c){ c.style.transform = 'translateX(' + dx + 'px)'; });
          to = others.filter(function(i){ return R[i].m - s < lastX; }).length;
          if(to === from){ line.style.display = 'none'; }
          else {
            var x = to > from ? R[others[to - 1]].r : R[others[to]].l;
            var t = table.getBoundingClientRect();
            line.style.display = '';
            line.style.left = (x - s) + 'px';
            line.style.top = t.top + 'px';
            line.style.height = t.height + 'px';
          }
          if(sc) raf = requestAnimationFrame(frame);   // keep edge-scrolling while held still
        }
        function begin(){
          dragging = true;
          document.body.classList.add('col-dragging');
          cells.forEach(function(c){ c.classList.add('col-drag-src'); });
          line = document.createElement('div');
          line.className = 'col-drop-line';
          line.style.display = 'none';
          document.body.appendChild(line);
        }
        function onMove(ev){
          lastX = ev.clientX;
          if(!dragging){
            if(Math.abs(lastX - startX) < THRESHOLD) return;
            begin();
          }
          if(!raf) raf = requestAnimationFrame(frame);
        }
        function end(commit){
          if(done) return;
          done = true;
          if(raf) cancelAnimationFrame(raf);
          grip.removeEventListener('pointermove', onMove);
          grip.removeEventListener('pointerup', onUp);
          grip.removeEventListener('pointercancel', onCancel);
          document.removeEventListener('keydown', onKey, true);
          try { grip.releasePointerCapture(e.pointerId); } catch(_){}
          cells.forEach(function(c){ c.classList.remove('col-drag-src'); c.style.transform = ''; });
          document.body.classList.remove('col-dragging');
          if(line) line.remove();
          if(commit && dragging) move(from, to, false);
        }
        function onUp(){ end(true); }
        function onCancel(){ end(false); }
        function onKey(ev){ if(ev.key === 'Escape'){ ev.preventDefault(); end(false); } }
        grip.addEventListener('pointermove', onMove);
        grip.addEventListener('pointerup', onUp);
        grip.addEventListener('pointercancel', onCancel);
        document.addEventListener('keydown', onKey, true);
      }
    }
    return { attach: attach };
  }
  global.SharedColDrag = makeColDrag();

  /* ── SharedReach: a sticky sidebar ends on screen ────────────────────────
     A control card is sticky with max-height:calc(100vh - 32px), which is
     right once it has stuck to the top of the window. Before that, at page
     load, it starts below the header, so its last ~150px hang under the fold:
     exactly where Simulate, Done and the Reset/Clear row live. A reader who
     has not scrolled could not see the button the whole form leads to.

     This sizes the card to the room it really has, from wherever its top is
     now to 16px above the window's bottom, and re-sizes it as the page
     scrolls until the card sticks and the CSS figure takes over. It touches
     only what is already sticky and already capped, so a phone layout (static,
     max-height:none) is left alone. */
  function initReach(){
    var SEL = '.controls, .sidebar';
    var cards = [], queued = false, remeasure = true;
    // On load and resize: learn each card's own CSS cap (it follows the
    // viewport), with this module's figure taken off first.
    function measure(){
      cards = [];
      var els = document.querySelectorAll(SEL);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        el.style.maxHeight = '';
        var cs = getComputedStyle(el);
        if (cs.position !== 'sticky' || cs.maxHeight === 'none') continue;
        cards.push({ el: el, gap: parseFloat(cs.top) || 16, cap: parseFloat(cs.maxHeight) });
      }
    }
    // On scroll: one read and one write per card.
    function fit(){
      queued = false;
      if (remeasure) { remeasure = false; measure(); }
      for (var i = 0; i < cards.length; i++) {
        var c = cards[i];
        var room = global.innerHeight - Math.max(c.gap, c.el.getBoundingClientRect().top) - c.gap;
        var want = room > 160 && room < c.cap ? Math.floor(room) + 'px' : '';
        if (c.el.style.maxHeight !== want) c.el.style.maxHeight = want;
      }
    }
    function queue(){ if (!queued) { queued = true; requestAnimationFrame(fit); } }
    function requeue(){ remeasure = true; queue(); }
    global.addEventListener('scroll', queue, { passive: true });
    global.addEventListener('resize', requeue);
    global.addEventListener('load', requeue);
    queue();
  }
  global.SharedReach = { init: initReach };

  /* ── SharedCtrl: the control card folds away ─────────────────────────────
     A tool's .controls card opens folded, so the first thing a reader sees
     is the answer, not forty fields. Beside the results it folds to a slim
     "Inputs" rail; stacked above them (a phone) it folds to one "Inputs" bar.
     Either way its open icon pulses on arrival. Open, the same icon turned
     round (Hide) sits at the end of the Quick Start row. The reader's choice is kept per
     page on this device.

     Something that needs the card on screen holds it open for as long as it
     needs it, then lets go, and the card returns to the reader's choice:

         SharedCtrl.hold('tour', true);   …   SharedCtrl.hold('tour', false);

     Nothing a tool saves lives in here: the buttons are not fields, so the
     mini cache, a scenario file and a Share link never see the fold. */
  function makeCtrl(){
    var TEXT = {
      en: { name: 'Inputs', open: 'Show the inputs', close: 'Hide the inputs' },
      id: { name: 'Input', open: 'Tampilkan input', close: 'Sembunyikan input' }
    };
    // Two chevrons pointing the way the card moves: left or up to hide it,
    // right or down to open it (CSS turns them).
    var FOLD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 6.5 6.5 12l5.5 5.5"/><path d="M18 6.5 12.5 12l5.5 5.5"/></svg>';
    var card = null, layout = null, rail = null;
    var userOpen = false, holds = {}, shown = null, key = '';

    function pathKey(){
      return 'abt:ctrl:' + global.location.pathname.replace(/index\.html?$/, '').replace(/\/+$/, '/');
    }
    function held(){ for (var k in holds) if (holds[k]) return true; return false; }
    function read(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
    function write(k, v){ try { localStorage.setItem(k, v); } catch(e){} }

    // Beside the results or stacked above them? Read the grid as the tool's
    // own CSS lays it out, with the fold's narrow column taken off first.
    function side(){
      var had = layout.classList.contains('ctrl-folded');
      if (had) layout.classList.remove('ctrl-folded');
      var cols = getComputedStyle(layout).gridTemplateColumns.trim().split(/\s+/).length;
      if (had) layout.classList.add('ctrl-folded');
      layout.classList.toggle('ctrl-side', cols > 1);
    }

    function render(){
      var open = userOpen || held();
      if (open === shown) return;
      var first = shown === null;
      shown = open;
      card.classList.toggle('ctrl-folded', !open);
      layout.classList.toggle('ctrl-folded', !open);
      if (!open) attention();
      // The results just gained or lost the card's width: let anything that
      // sizes itself on resize (a canvas, a sticky card's cap) measure again.
      if (!first) global.dispatchEvent(new Event('resize'));
    }
    function set(open, save){
      holds = {};
      userOpen = !!open;
      if (save) write(key, userOpen ? '1' : '0');
      render();
    }

    function attention(){
      rail.classList.remove('ctrl-attn');
      void rail.offsetWidth;            // restart the pulse
      rail.classList.add('ctrl-attn');
    }

    function init(){
      if (card || EMBED) return;
      card = document.querySelector('.layout > .controls');
      if (!card) return;
      layout = card.parentElement;
      var t = TEXT[pageLang()];
      if (!card.id) card.id = 'ctrlCard';
      key = pathKey();
      userOpen = read(key) === '1';

      rail = document.createElement('button');
      rail.type = 'button';
      rail.className = 'ctrl-fold-rail';
      rail.setAttribute('aria-expanded', 'false');
      rail.setAttribute('aria-controls', card.id);
      rail.setAttribute('aria-label', t.open);
      rail.setAttribute('data-no-abbr', '');
      // The open icon is Hide's own, turned the other way.
      rail.innerHTML = '<span class="ctrl-fold-name">' + t.name + '</span>' +
        '<span class="ctrl-fold-go">' + FOLD + '</span>';
      rail.addEventListener('click', function(){ set(true, true); });
      rail.addEventListener('animationend', function(){ rail.classList.remove('ctrl-attn'); });

      // Hide rides at the end of the Quick Start row, beside save and open,
      // so folding adds no row of its own. A card without that row gets a
      // corner of its own instead.
      var hide = document.createElement('button');
      hide.type = 'button';
      hide.className = 'ctrl-fold-hide';
      hide.setAttribute('aria-expanded', 'true');
      hide.setAttribute('aria-controls', card.id);
      hide.setAttribute('aria-label', t.close);
      hide.title = t.close;
      hide.innerHTML = FOLD;
      hide.addEventListener('click', function(){ set(false, true); });
      var row = card.querySelector(':scope > .quick-start-row');
      if (row) row.appendChild(hide);
      else { hide.classList.add('ctrl-fold-corner'); card.appendChild(hide); }

      card.insertBefore(rail, card.firstChild);
      card.classList.add('ctrl-foldable');

      // A field the browser flags as invalid is one the reader must see.
      card.addEventListener('invalid', function(){ if (!(userOpen || held())) { userOpen = true; render(); } }, true);

      var queued = false;
      global.addEventListener('resize', function(){
        if (queued) return;
        queued = true;
        requestAnimationFrame(function(){ queued = false; side(); });
      });
      side();
      render();
    }

    function hold(reason, on){
      if (!card) return;
      if (!!holds[reason] === !!on) return;
      holds[reason] = !!on;
      render();
    }

    return {
      init: init, hold: hold,
      open: function(){ if (card) set(true, true); },
      close: function(){ if (card) set(false, true); },
      isOpen: function(){ return !!shown; }
    };
  }
  global.SharedCtrl = makeCtrl();
  // The card is already parsed (shared.js loads at the end of the body), so
  // fold it now, before the tool's own script draws anything beside it.
  global.SharedCtrl.init();

  function initShared(){
    global.SharedCtrl.init();
    global.SharedIcon.hydrate();
    global.SharedShare.upgrade(document);
    initReach();
    initTooltip();
    global.SharedAbbr.init();
    initFit();
    initSegFit();
    if(global.SharedSlider.auto()) global.SharedSlider.scan();
    global.SharedFold.assumes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initShared);
  } else {
    initShared();
  }
})(window);
