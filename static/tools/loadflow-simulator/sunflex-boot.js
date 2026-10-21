/* sunflex-boot.js — pega los casos SUNFLEX al simulador y los deja seleccionables.
 * No toca el codigo de la herramienta: usa su propia API publica
 * (window.__lf / window.__ed y applyPreset), la misma que usan sus botones
 * de "quick start".
 *
 * Y, sobre todo, NUNCA se queda callado: si la herramienta no arranca dentro del
 * iframe de Streamlit, el usuario veia un spinner eterno sin una sola pista. Este
 * fichero es nuestro, asi que aqui va el vigia:
 *   - captura los errores de JS de la pagina (window.onerror con capture=true),
 *   - mira los recursos que pidio la pagina y quedaron en 4xx o vacios,
 *   - pinta un aviso rojo con el motivo, boton de recargar y boton de "abrir en
 *     pestaña propia", y se quita solo en cuanto la herramienta pinta.
 * El aviso tambien cubre el caso mal escrito (?case= que no esta en el paquete de
 * hojas), que antes se traducian en "no hace nada". */
(function () {
  var S = window.SUNFLEX;
  if (!S || !S.cases) return;
  var ED = S.tool === "ed";
  var KEY = "sunflex-case";
  var AVISO = "sunflex-aviso";
  function q(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  function core() { return ED ? window.ED : window.LF; }
  function api() { return ED ? window.__ed : window.__lf; }
  function ready() { return !!core() && !!api(); }

  /* ── diagnostico ─────────────────────────────────────────────────────── */
  var JS_ERR = [];
  window.addEventListener("error", function (e) {
    var d = e && e.target && e.target.tagName
      ? e.target.tagName + " " + (e.target.src || e.target.href || "")
      : (e && e.message ? e.message : "");
    if (d) JS_ERR.push(String(d).slice(0, 140));
  }, true);

  function recursos_rotos() {
    var mal = [];
    try {
      var L = performance.getEntriesByType("resource") || [];
      for (var i = 0; i < L.length; i++) {
        var e = L[i], est = e.responseStatus || 0;
        if (est >= 400) mal.push(est + " · " + corta(e.name));
        else if (!est && e.transferSize === 0 && e.decodedBodySize === 0 &&
                 !/^(data|blob|https?:)/.test(e.name || "")) mal.push("vacío · " + corta(e.name));
      }
    } catch (err) { /* sin Navigation Timing: no es bloqueante */ }
    return mal.slice(0, 5);
  }
  function corta(u) {
    try { return String(u).replace(location.origin, "").slice(0, 90); } catch (e) { return String(u).slice(0, 90); }
  }
  function pintado() {
    if (ED) return document.querySelectorAll("canvas").length > 0;
    var s = document.getElementById("sldSvg");
    return !!s && s.querySelectorAll("*").length > 40;
  }

  function avisa(titulo, detalle) {
    var viejo = document.getElementById(AVISO);
    if (viejo) viejo.remove();
    var rotos = recursos_rotos();
    var div = document.createElement("div");
    div.id = AVISO;
    div.setAttribute("role", "status");
    div.setAttribute("style",
      "position:fixed;inset:0 0 auto 0;z-index:9999;padding:10px 44px 10px 14px;" +
      "background:#7f1d1d;color:#fff;font:13px/1.5 system-ui,sans-serif;" +
      "box-shadow:0 6px 18px rgba(0,0,0,.35)");
    var ul = "";
    if (rotos.length) ul += "<br>recursos: " + rotos.map(esc).join(" · ");
    if (JS_ERR.length) ul += "<br>JS: " + JS_ERR.slice(0, 3).map(esc).join(" · ");
    if (detalle) ul += "<br>" + esc(detalle);
    div.innerHTML =
      "<strong>SUNFLEX · la herramienta no terminó de arrancar.</strong> " + esc(titulo) + ul +
      '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="sunflex-reintentar" style="' + BTN + '">Volver a cargar (sin caché)</button>' +
      '<button id="sunflex-nueva" style="' + BTN + '">Abrir en pestaña propia</button>' +
      '<button id="sunflex-caso" style="' + BTN + '">Usar la hoja descargable</button></div>' +
      '<button id="sunflex-cerrar" title="Cerrar" aria-label="Cerrar" style="' +
      "position:absolute;top:6px;right:8px;background:none;border:0;color:#fff;font-size:18px;cursor:pointer\">×</button>";
    document.body.appendChild(div);
    var g = function (id) { return document.getElementById(id); };
    var ir = g("sunflex-reintentar"), nueva = g("sunflex-nueva"), cerrar = g("sunflex-cerrar"), caso = g("sunflex-caso");
    if (ir) ir.onclick = function () {
      location.href = location.pathname + "?reintento=" + Date.now() +
        (q(KEY) ? "&" + KEY + "=" + encodeURIComponent(q(KEY)) : "");
    };
    if (nueva) nueva.onclick = function () { window.open(location.href, "_blank", "noopener"); };
    if (caso) caso.onclick = function () {
      location.href = location.pathname.replace(/index\.html$/, "") +
        (ED ? "../../sunflex-ed-cases.json" : "../../sunflex-lf-cases.json");
    };
    if (cerrar) cerrar.onclick = function () { div.remove(); };
  }
  var BTN = "font:13px system-ui,sans-serif;padding:4px 10px;cursor:pointer;" +
    "background:#fff;color:#7f1d1d;border:0;border-radius:6px";
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function quitar_aviso() {
    var a = document.getElementById(AVISO);
    if (a) a.remove();
  }

  /* ── lo de siempre: pegar los casos y aplicar el pedido ──────────────── */
  function merge() {
    var C = core();
    C.PRESETS = C.PRESETS || {};
    for (var k in S.cases) if (Object.prototype.hasOwnProperty.call(S.cases, k)) C.PRESETS[k] = S.cases[k];
  }

  function bar() {
    if (document.getElementById("sunflex-bar")) return;
    var keys = Object.keys(S.cases);
    var opts = keys.map(function (k) {
      return '<option value="' + k.replace(/"/g, "&quot;") + '">' + k + "</option>";
    }).join("");
    var div = document.createElement("div");
    div.id = "sunflex-bar";
    div.setAttribute("style",
      "display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 12px;" +
      "font:13px/1.4 system-ui,sans-serif;border-bottom:1px solid rgba(128,128,128,.35);" +
      "background:rgba(128,128,128,.10)");
    div.innerHTML =
      '<strong style="letter-spacing:.04em">SUNFLEX</strong>' +
      '<label style="opacity:.75">Caso / escenario</label>' +
      '<select id="sunflex-sel" style="font:13px system-ui,sans-serif;padding:3px 6px;max-width:340px">' +
      '<option value="">— elegir —</option>' + opts + "</select>" +
      '<button id="sunflex-run" style="font:13px system-ui,sans-serif;padding:3px 10px;cursor:pointer">Resolver</button>' +
      '<button id="sunflex-orig" style="font:13px system-ui,sans-serif;padding:3px 10px;cursor:pointer">Ejemplos del simulador</button>' +
      '<span id="sunflex-nota" style="flex:1 1 320px;min-width:200px;opacity:.8"></span>';
    var host = document.querySelector(".sld-viewbar");
    host = host && host.parentElement ? host.parentElement : document.body;
    host.parentNode.insertBefore(div, host);
    document.getElementById("sunflex-sel").addEventListener("change", function () {
      try { history.replaceState(null, "", "?" + KEY + "=" + encodeURIComponent(this.value)); } catch (e) {}
      if (this.value) aplicar(this.value);
    });
    document.getElementById("sunflex-run").addEventListener("click", function () {
      var k = document.getElementById("sunflex-sel").value;
      if (k) aplicar(k, true);
    });
    document.getElementById("sunflex-orig").addEventListener("click", function () {
      location.href = location.pathname;   /* recarga sin ?case= -> ejemplos originales */
    });
  }

  function aplicar(key, force) {
    var a = api();
    if (!a || !core().PRESETS[key]) return false;
    var sel = document.getElementById("sunflex-sel");
    if (sel) sel.value = key;
    var meta = (S.meta || {})[key] || {};
    var nota = document.getElementById("sunflex-nota");
    if (nota) nota.textContent = meta.nota || "";
    if (a.app && (a.app.model && a.app.model.name) === key && !force) {
      return true;   // ya est cargado: no resolver dos veces
    }
    a.applyPreset(key);
    return true;
  }

  function init(n) {
    if (!ready()) {
      if (n === 150) {                       /* 6 s: ya es raro, se lo decimos */
        avisa("A los 6 s no apareció " + (ED ? "window.ED / window.__ed" : "window.LF / window.__lf") +
              ": falta o no respondió alguno de los scripts de la herramienta (engine/*.js, " +
              (ED ? "ed-*.js" : "lf-*.js") + ", ../shared.js).",
              "Si esto sólo pasa en la app desplegada, el proxy no está devolviendo los .js: " +
              "«Abrir en pestaña propia» suele funcionar, y si no, descargue la hoja.");
      }
      if (n > 400) return;                   /* 16 s: se queda el aviso puesto */
      return setTimeout(function () { init(n + 1); }, 40);
    }
    core()._sunflexBackup = core()._sunflexBackup || JSON.parse(JSON.stringify(core().PRESETS));
    core().PRESETS = Object.assign({}, core()._sunflexBackup);
    merge();
    bar();
    var want = q(KEY) || S.default;
    if (want && S.cases[want]) {
      if (!aplicar(want)) {
        avisa("El motor está vivo pero no pudo cargar la hoja «" + want +
              "» (applyPreset la rechazó): revise que la hoja esté en el paquete de 25.", "");
      }
    } else if (want) {
      avisa("El caso pedido no existe en este paquete: «" + want + "». Las 25 hojas son " +
            "5 activos × 5 escenarios (p. ej. «Castilla · piloto»).",
            "cambie el selector de la pestaña en la app, o el ?case= de la URL.");
    } else if (S.default) {
      aplicar(S.default);
    }
    /* si en 4 s no pintó nada encima del diagrama, lo decimos; si pintó, se quita solo */
    setTimeout(function () { if (!pintado() && !document.getElementById(AVISO)) {
      avisa("La hoja se cargó pero el diagrama no pintó en 4 s (el motor no devolvió " +
            (ED ? "el gráfico de despacho" : "el nodo de barras") + ").",
            "Pruebe «Resolver» de la barra SUNFLEX; con la hoja descargada funciona igual.");
    } else if (pintado()) quitar_aviso(); }, 4000);
    setTimeout(function () { if (pintado()) quitar_aviso(); }, 250);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(0); });
  else init(0);
})();
