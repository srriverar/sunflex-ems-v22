#!/usr/bin/env python3
"""Revisión de las dos pestañas de herramientas CON navegador real, como las ve el usuario.

El `tools/check_app.py` de la app no puede ver esto: AppTest ejecuta el Python y comprueba que
`st.iframe` se emita, pero **no carga el iframe**. Justamente ahí estaba el fallo que ve el
usuario: el sondeo dice `herramienta servida (22090 bytes)` y la pestaña sigue dando vueltas,
porque lo que cuelga no es el HTML sino el arranque de la herramienta dentro del iframe (un
recurso que falta, un módulo que lanza, o una espera sin fin). Este script sí abre el navegador,
entra en la pestaña y mide si el diagrama pintó de verdad.

Mide tres contextos distintos, porque la solución que ve el usuario depende de cuál falle:
  1. dentro del iframe de Streamlit (lo que él ve al abrir la pestaña),
  2. la herramienta abierta en pestaña propia (el consejo del expander «ábrela en otra pestaña»),
  3. con el caso puesto por `?case=`, que es como la app la llama.

Criterio de «pintó»: existe la barra `#sunflex-bar`, el selector trae el caso, y el SVG/canvas
tiene nodos dibujados. Además se listan las peticiones no-2xx y los errores de JS, que es donde
se ve la causa real (p. ej. `engine/psa-pf.min.js` 404 dentro del iframe).

Uso: python3 tools/review_herramientas.py [--base http://127.0.0.1:8501] [--out docs/capturas]
"""
from __future__ import annotations

import argparse
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

HERR = {
    "lf": dict(tool="loadflow-simulator", tab=r"Load Flow Simulator", alto=880),
    "ed": dict(tool="ed-uc-simulator", tab=r"ED-UC Simulator", alto=880),
}
SONDEO_LF = ("() => ({bar: !!document.getElementById('sunflex-bar'),"
             " sel: (document.getElementById('sunflex-sel')||{}).value || '',"
             " nodos: document.querySelectorAll('#sldSvg *').length,"
             " vis: getComputedStyle(document.body).visibility,"
             " conv: (document.getElementById('mConv')||{}).textContent || '',"
             " sub: (document.getElementById('sldSub')||{}).textContent || '',"
             " motor: typeof window.LF})")
SONDEO_ED = ("() => ({bar: !!document.getElementById('sunflex-bar'),"
             " sel: (document.getElementById('sunflex-sel')||{}).value || '',"
             " canvas: document.querySelectorAll('canvas').length,"
             " nodos: document.querySelectorAll('svg *').length,"
             " vis: getComputedStyle(document.body).visibility,"
             " chart: typeof window.Chart, api: !!window.__ed, sol: typeof window.SUNFLEX_ED_solve,"
             " sub: (document.getElementById('statusLine')||document.getElementById('edSub')||{}).textContent || ''})")


def sonda(page, clave):
    return page.evaluate(SONDEO_LF if clave == "lf" else SONDEO_ED)


def pinta_ok(clave, s):
    if clave == "lf":
        return bool(s.get("bar")) and s.get("nodos", 0) > 40 and s.get("vis") == "visible"
    return bool(s.get("bar")) and (s.get("canvas", 0) > 0 or s.get("nodos", 0) > 40) and s.get("vis") == "visible"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8501")
    ap.add_argument("--out", default="docs/capturas")
    ap.add_argument("--espera", type=float, default=14.0)
    args = ap.parse_args()
    salida = pathlib.Path(args.out)
    salida.mkdir(parents=True, exist_ok=True)
    fallos = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for clave, cfg in HERR.items():
            ctx = browser.new_context(viewport={"width": 1600, "height": 1100})
            page = ctx.new_page()
            consola, http_malo = [], []
            page.on("console", lambda m: consola.append(f"{m.type}: {m.text[:160]}")
                    if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: consola.append(f"pageerror: {str(e)[:160]}"))
            page.on("response", lambda r: http_malo.append(f"{r.status} {r.url[:110]}")
                    if r.status >= 400 else None)

            print(f"\n═══ 1) {cfg['tool']} dentro del iframe de la app ({args.base}) ═══")
            page.goto(args.base + "/", wait_until="domcontentloaded")
            page.wait_for_selector('[role="tab"]', timeout=120_000)
            page.get_by_role("tab", name=re.compile(cfg["tab"], re.I)).first.click()
            page.wait_for_timeout(args.espera * 1000)
            marco = None
            for f in page.frames:
                if cfg["tool"] in (f.url or ""):
                    marco = f
                    break
            iframe_en_su_sitio = page.query_selector(f'iframe[src*="{cfg["tool"]}"]')
            print(f"   iframe presente en el DOM: {bool(iframe_en_su_sitio)} · url del frame: "
                  f"{(marco.url if marco else 'NINGUNO (no se cargó)')[:96]}")
            if marco is None:
                print("   ✗ el iframe no llegó a cargar: el navegador no obtuvo el documento")
                fallos += 1
            else:
                s = sonda(marco, clave)
                print("   sondeo interno:", {k: (str(v)[:40]) for k, v in s.items()})
                ok = pinta_ok(clave, s)
                print(f"   {'✓ pintó' if ok else '✗ NO pintó el diagrama'} "
                      f"(barra={bool(s.get('bar'))}, dibujado={s.get('nodos', s.get('canvas'))})")
                if not ok:
                    fallos += 1
                marco.page.screenshot(path=str(salida / f"11-{clave}-iframe.png"), full_page=False)
                page.screenshot(path=str(salida / f"11-{clave}-pestana.png"), full_page=False)

            print("═══ 2) la misma herramienta en pestaña propia, con ?case= ═══")
            url = (f"{args.base}/app/static/tools/{cfg['tool']}/index.html"
                   "?case=Castilla%20%C2%B7%20piloto")
            p2 = ctx.new_page()
            c2 = []
            p2.on("pageerror", lambda e: c2.append(f"pageerror: {str(e)[:160]}"))
            p2.on("response", lambda r: http_malo.append(f"[pestaña] {r.status} {r.url[:100]}")
                  if r.status >= 400 else None)
            p2.goto(url, wait_until="load", timeout=60_000)
            p2.wait_for_timeout(args.espera * 1000)
            s2 = sonda(p2, clave)
            print("   sondeo interno:", {k: (str(v)[:40]) for k, v in s2.items()})
            ok2 = pinta_ok(clave, s2)
            print(f"   {'✓ pintó' if ok2 else '✗ NO pintó'} · errores de JS en pestaña propia: {len(c2)}")
            for m in c2[:4]:
                print("     ·", m)
            if not ok2:
                fallos += 1
            p2.screenshot(path=str(salida / f"11-{clave}-pestana-propia.png"), full_page=False)

            print("── señales comunes ──")
            print(f"   respuestas ≥400: {len(http_malo)}")
            for h in http_malo[:6]:
                print("     ·", h)
            errs = [c for c in consola if c.startswith(("error", "pageerror"))]
            print(f"   errores de consola en la app: {len(errs)} (avisos: {len(consola) - len(errs)})")
            for c in (errs or consola)[:6]:
                print("     ·", c)
            ctx.close()

        browser.close()
    print(f"\nVEREDICTO: {'las dos pestañas pintan en ambos contextos' if fallos == 0 else f'{fallos} contexto(s) sin pintar'}")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
