#!/usr/bin/env python3
"""Barrido de recursos de las dos herramientas vendorizadas, como los pediría el navegador.

Cubre lo que el sondeo de la app no puede ver: `index.html` puede estar servido (200) y aun así
la pestaña no pinta nada porque FALTA un recurso que la página pide a continuación — el motor
`engine/psa-pf.min.js`, `../shared.js`, los CSS, el `highs.wasm` del solver. Ahí el arranque de
`sunflex-boot.js` agota sus 16 s de espera y se rinde en silencio: el usuario ve un spinner
eterno y el diagnóstico correcto (`estática viva`) dice que todo está bien.

Este script parsea los `src`/`href` de cada `index.html`, los resuelve contra la URL real del
iframe (`/app/static/tools/<herramienta>/`) y pide cada uno al servidor en marcha. También
termina la clase de URL que se escapa del `index.html`: los `import()`/`fetch()` de los JS
propios (los tres `sunflex-*.js` y el `*-core.js`), para no juzgar por la mitad.

Salida: una línea por recurso con estado HTTP, bytes y tipo; los que faltan mandan exit 1.
Uso: python3 tools/barrido_recursos.py [--base http://127.0.0.1:8501] [--en-iframe]
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys
import urllib.request
from urllib.parse import urljoin

RAIZ = pathlib.Path(__file__).resolve().parent.parent
HERRAMIENTAS = ["loadflow-simulator", "ed-uc-simulator"]
# un CSS/una fuente que el CDN no entregue no cuelga el diagrama: se degradan, no se reportan
# como fallo del arranque. El motor, el wasm y los JS propios sí.
CRITICO = re.compile(r"\.(js|mjs|wasm|json)$|sunflex-", re.I)
ATTR = re.compile(r"(?:src|href)\s*=\s*[\"']([^\"']+)[\"']", re.I)
JS_URL = re.compile(r"""(?:import\s*\(\s*|fetch\s*\(\s*)["'`]([^"'`?#]+)["'`]""")
EXTERNO = re.compile(r"^(?:https?:)?//", re.I)


def pedir(base: str, url: str, timeout: float = 8.0):
    """GET con tope: devuelve (status, bytes, content_type, error)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sunflex-barrido"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            cuerpo = r.read()
            return r.status, len(cuerpo), r.headers.get("Content-Type", "?"), ""
    except urllib.error.HTTPError as e:          # noqa: PERF203
        return e.code, 0, "?", "HTTPError"
    except Exception as e:
        return None, 0, "?", f"{type(e).__name__}: {str(e)[:60]}"


def recursos(base: str, herramienta: str) -> list[tuple[str, str, bool]]:
    """(origen, url_absoluta, es_critico) para una herramienta, en el orden en que el navegador los pide."""
    ruta = RAIZ / "static" / "tools" / herramienta / "index.html"
    html = ruta.read_text(encoding="utf8")
    url_iframe = f"{base}/app/static/tools/{herramienta}/index.html"
    visto, salida = set(), []
    for m in ATTR.finditer(html):
        bruto = m.group(1).strip()
        if bruto.startswith(("data:", "mailto:", "#", "javascript:")):
            continue
        abs_ = bruto if EXTERNO.match(bruto) else urljoin(url_iframe, bruto)
        crit = bool(CRITICO.search(abs_))
        if (abs_, crit) in visto:
            continue
        visto.add((abs_, crit))
        salida.append((f"html:{herramienta}", abs_, crit))
    # y los que los JS nuestros piden al arrancar (el wasm del solver, los módulos dinámicos)
    for js in sorted((RAIZ / "static" / "tools" / herramienta).glob("*.js")):
        if not js.name.startswith(("sunflex-", "lf-core", "ed-core", "script")):
            continue
        for m in JS_URL.finditer(js.read_text(encoding="utf8")):
            bruto = m.group(1).strip()
            if bruto.startswith(("data:", "http")):
                continue
            abs_ = urljoin(url_iframe, bruto)
            if (abs_, True) in visto:
                continue
            visto.add((abs_, True))
            salida.append((f"{js.name}", abs_, True))
    return salida


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default="http://127.0.0.1:8501")
    args = p.parse_args()
    fallos: list[str] = []
    blandos: list[str] = []
    for h in HERRAMIENTAS:
        lista = recursos(args.base, h)
        print(f"\n── {h} · {len(lista)} recursos que pide el navegador ──")
        for origen, url, crit in lista:
            status, n, tipo, err = pedir(args.base, url)
            ok = status == 200 and n > 0
            marca = "ok " if ok else "MAL"
            relativo = url.replace(args.base, "")
            print(f"  {marca} {status!s:>4} {n:>9} B  {relativo[:74]:<74} {tipo[:18]}  ←{origen}")
            if not ok:
                (fallos if crit else blandos).append(f"{h}: {relativo} → {status or err}")
    print(f"\nrecursos críticos rotos: {len(fallos)} · degradables (css/fuentes): {len(blandos)}")
    for f in fallos:
        print("  ✗", f)
    for b in blandos:
        print("  ·", b)
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
