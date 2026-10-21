#!/usr/bin/env python3
"""
gen_casepack.py — compila los casos del motor `sunflex_model.py` a las dos
herramientas vendorizadas (loadflow-simulator y ed-uc-simulator).

Entrada : sunflex_model.casepack()  (PyPSA + HiGHS, 15 min, 5 casos × 5 escenarios)
Salida  : static/tools/loadflow-simulator/sunflex-cases.js
          static/tools/loadflow-simulator/sunflex-boot.js
          static/tools/ed-uc-simulator/sunflex-cases.js
          static/tools/ed-uc-simulator/sunflex-boot.js
          static/tools/sunflex-lf-cases.json      (para el verificador Node)
          output/casepack.json                    (auditoría: todo el paquete)

Los `.js` generados NO se editan a mano: cualquier cambio se hace en
`sunflex_model.py` y se vuelve a generar (`python3 gen_casepack.py`).
"""
from __future__ import annotations

import json
import logging
import pathlib
import sys

logging.basicConfig(level=logging.ERROR)
for _n in ("linopy", "pypsa"):
    logging.getLogger(_n).setLevel(logging.ERROR)

RAIZ = pathlib.Path(__file__).resolve().parent
HERR = RAIZ / "static" / "tools"
sys.path.insert(0, str(RAIZ))

import sunflex_model as S  # noqa: E402

CABECERA = (
    "/* sunflex-cases.js — GENERADO por gen_casepack.py, no editar a mano.\n"
    " * Origen: sunflex_model.py (PyPSA {v} + HiGHS), 96 pasos de 15 min,\n"
    " * 5 activos x 5 escenarios. Cada hoja reproduce la red del activo: bus de\n"
    " * cabecera del parque, alimentador con la capacidad de conduccion\n"
    " * habilitada, campo de proceso, transformador de la SE y el slack del SIN.\n"
    " */\n"
)

BOOT = r"""
/* sunflex-boot.js — pega los casos SUNFLEX al simulador y los deja seleccionables.
 * No toca el codigo de la herramienta: usa su propia API publica
 * (window.__lf / window.__ed y applyPreset), la misma que usan sus botones
 * de "quick start". */
(function () {
  var S = window.SUNFLEX;
  if (!S || !S.cases) return;
  var ED = S.tool === "ed";
  var KEY = "sunflex-case";
  function q(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }
  function core() { return ED ? window.ED : window.LF; }
  function api() { return ED ? window.__ed : window.__lf; }
  function ready() { return !!core() && !!api(); }

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
      if (n > 400) return;
      return setTimeout(function () { init(n + 1); }, 40);
    }
    core()._sunflexBackup = core()._sunflexBackup || JSON.parse(JSON.stringify(core().PRESETS));
    core().PRESETS = Object.assign({}, core()._sunflexBackup);
    merge();
    bar();
    var want = q(KEY) || S.default;
    if (want && S.cases[want]) aplicar(want);
    else if (S.default) aplicar(S.default);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { init(0); });
  else init(0);
})();
"""


def js(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str)


def main() -> int:
    v = getattr(__import__("pypsa"), "__version__", "?")
    pack = S.casepack()
    HERR.mkdir(parents=True, exist_ok=True)
    for sub, tool, casos in (("loadflow-simulator", "lf", pack["lf"]),
                             ("ed-uc-simulator", "ed", pack["ed"])):
        d = HERR / sub
        d.mkdir(parents=True, exist_ok=True)
        head = CABECERA.replace("{v}", str(v))
        body = js(dict(tool=tool, default=pack["default"], cases=casos, meta=pack["meta"]))
        (d / "sunflex-cases.js").write_text(head + "window.SUNFLEX = " + body + ";\n", encoding="utf-8")
        (d / "sunflex-boot.js").write_text(BOOT.strip() + "\n", encoding="utf-8")
        print(f"{sub:20s} {len(casos):2d} casos · cases {len(body)//1024:4d} kB")
    for nm, data in (("sunflex-lf-cases.json", pack["lf"]), ("sunflex-ed-cases.json", pack["ed"])):
        (HERR / nm).write_text(json.dumps(data, ensure_ascii=False, indent=0, default=str),
                               encoding="utf-8")
    (HERR / "sunflex-meta.json").write_text(
        json.dumps(pack["meta"], ensure_ascii=False, indent=0, default=str), encoding="utf-8")
    out = RAIZ / "output"
    out.mkdir(exist_ok=True)
    (out / "casepack.json").write_text(
        json.dumps(dict(default=pack["default"], meta=pack["meta"], lf=pack["lf"], ed=pack["ed"],
                        demo_3a8=pack["demo_3a8"]),
                   ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"{'total':20s} {len(pack['lf'])} pares LF/ED · {pack['default']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
