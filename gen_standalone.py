#!/usr/bin/env python3
"""Genera `index-sunflex.html`: cada herramienta en **un solo archivo**, sin pedir nada.

Por qué hace falta. El sondeo de la app (`_estática_viva`) pregunta **desde el servidor** a
127.0.0.1: puede estar dando `True` (el contenedor sí sirve `static/`) mientras el navegador,
que pasa por el proxy de la nube, no recibe esos `.js`. El iframe entonces carga `index.html`,
`script.js` intenta `import('./engine/psa-pf.min.js')`, eso no contesta nunca, `window.LF`
no aparece y la pestaña se queda con la rueda girando — con un diagnóstico que dice «todo
bien», porque lo dijo el lado equivocado de la conexión.

Este generador cierra el asunto: deja la herramienta entera dentro de un `index-sunflex.html`
(CSS, los `<script src>` clásicos y los destinos de `import()`, todo en línea) y la app lo mete
en el iframe con `st.iframe(Path)`, que **lee el archivo en el servidor y manda el HTML por el
mismo canal websocket de la app**. Cero peticiciones extra, cero `static/`, cero proxy. Y el
mismo archivo se puede descargar y abrir en local sin servidor.

Qué se queda fuera a propósito: los enlaces externos (la fuente de Google, los logos del pie,
`og:`/`ld+json` de SEO) y `highs.wasm` de la ED, que son 3,4 MB y no caben en un mensaje de
Streamlit con sentido. La hoja ED en modo embebido se pinta igual; resolver su LP pide el wasm
a `/app/static/...` y, si eso no llega, lo dice el vigía `sunflex-boot.js`.

Uso:
    python3 gen_standalone.py            # escribe los dos index-sunflex.html
    python3 gen_standalone.py --check    # falla si están desactualizados
"""
from __future__ import annotations

import argparse
import base64
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent
HERR = ["loadflow-simulator", "ed-uc-simulator"]
# etiquetas del <head> que sólo tienen sentido cuando la página la sirve un buscador o un CDN
FUERA = re.compile(
    r'\n?\s*<(?:link[^>]*\b(?:rel="icon"|rel="modulepreload"|href="https?://)[^>]*'
    r'|meta[^>]*\b(?:property="og:|name="twitter:|name="robots")[^>]*|script[^>]*type="application/ld\+json"[^>]*>.*?</script>)',
    re.S | re.I)
LINK_CSS = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>', re.I)
SCRIPT_SRC = re.compile(r'<script\s+src="([^"]+)"></script>', re.I)
IMPORTA = re.compile(r"""import\(\s*['"](\./[^'"]+)['"]\s*\)""")
CSS_IMPORT = re.compile(r"""@import\s+url\(\s*['"]?([^)'"]+)['"]?\s*\)\s*;?""", re.I)
URL_CSS = re.compile(r"""url\(\s*['"]?(\./[^'")]*)['"]?\s*\)""")
INLINE_MAX = 9_000_000   # bytes: por encima de esto no se inlinea (el wasm del solver)


def b64_de(ruta: pathlib.Path) -> str:
    return base64.b64encode(ruta.read_bytes()).decode("ascii")


def seguro_js(texto: str) -> str:
    """Un `</script>` dentro del JS cerraría la etiqueta y rompería la página."""
    return texto.replace("</script", "<\\/script").replace("</SCRIPT", "<\\/SCRIPT")


def css_local(texto: str, base: pathlib.Path, carpeta: str, nivel: int = 0) -> str:
    """CSS en línea.

    Los `@import` locales se traen dentro del standalone (allí no hay de dónde pedirlos) y los
    remotos se tiran; las `url(...)` pequeñas pasan a data URI y las demás a ruta absoluta bajo
    `/app/static/`, que es la única que tiene sentido dentro del iframe.
    """
    def rep(m: re.Match) -> str:
        ruta = (base / m.group(1)).resolve()
        try:
            ruta = ruta.relative_to(RAIZ)
        except ValueError:
            return m.group(0)
        f = RAIZ / ruta          # ruta ya viene relativa a la raíz del repo
        if f.is_file() and f.stat().st_size < 60_000:
            tipo = "image/svg+xml" if f.suffix == ".svg" else f"image/{f.suffix.lstrip('.')}"
            return f'url("data:{tipo};base64,{b64_de(f)}")'
        return f'url("/app/static/{ruta.as_posix()}")'

    def importa(m: re.Match) -> str:
        bruto = m.group(1)
        if re.match(r"^(https?:)?//", bruto):        # cualquier resto externo: fuera
            return "/* SUNFLEX: @import externo quitado (modo sin red) */"
        f = (base / bruto).resolve()
        if nivel < 2 and f.is_file() and f.suffix == ".css":
            return css_local(f.read_text(encoding="utf8"), f.parent, carpeta, nivel + 1)
        return f"/* SUNFLEX: @import {bruto} no resuelto */"

    texto = CSS_IMPORT.sub(importa, texto)
    return URL_CSS.sub(rep, texto)


def construir(herr: str) -> tuple[str, dict]:
    """Devuelve el HTML de un solo archivo y el detalle de lo que metió dentro."""
    carpeta = RAIZ / "static" / "tools" / herr
    html = (carpeta / "index.html").read_text(encoding="utf8")
    html = FUERA.sub("", html)
    nota = {"css": 0, "js": 0, "modulos": 0, "bytes_css": 0, "bytes_js": 0, "sueltos": []}

    # 1) los destinos de import(): se sirven como blob: generados desde un mapa base64
    modulos: dict[str, str] = {}
    js_files = sorted({m.group(1) for js in carpeta.glob("*.js")
                       for m in IMPORTA.finditer(js.read_text(encoding="utf8"))})
    for ref in js_files:
        f = (carpeta / ref).resolve()
        if not f.is_file():
            nota["sueltos"].append(ref)
            continue
        if f.stat().st_size > INLINE_MAX:
            nota["sueltos"].append(f"{ref} ({f.stat().st_size // 1024} kB: demasiado grande)")
            continue
        interior = f.read_text(encoding="utf8")
        if f.name == "highs.mjs":   # la ruta del wasm se resuelve contra el blob → hay que fijarla
            interior = interior.replace('new URL("highs.wasm",import.meta.url).href',
                                        f'location.origin+"/app/static/tools/{herr}/engine/highs.wasm"')
        modulos[ref] = base64.b64encode(seguro_js(interior).encode()).decode("ascii")
        nota["modulos"] += 1

    # 2) en el <head>, antes que nada: el mapa + el cargador + (si hace falta) los CSS en línea
    cargador = ("<script>/* SUNFLEX-standalone: import() de archivo en línea, nada de red */\n"
                "window.__SUNFLEX_INLINE = " + "/*mapa*/")
    mapa = "{" + ",".join(f'{k!r}:{v!r}' for k, v in modulos.items()) + "}"
    cargador = ("<script>\n/* SUNFLEX-standalone: los import() locales se resuelven contra el mapa en "
                "línea; si algo no está, se pide igual (y el vigía lo dice). */\n"
                "window.__SUNFLEX_INLINE = " + mapa + ";\n"
                "(function(){var M=window.__SUNFLEX_INLINE,c={},g=function(r){return M[r.replace(/^\\.\\//,'')]||M[r];};\n"
                "window.__sunflex_mod=function(r){if(c[r])return c[r];var b=g(r);if(!b)return import(r);\n"
                "var s=atob(b),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);\n"
                "var t=new TextDecoder().decode(u);c[r]=import(URL.createObjectURL(new Blob([t],{type:'text/javascript'})));\n"
                "return c[r];};})();\n</script>")

    n_css, bytes_css = 0, 0
    def css_rep(m: re.Match) -> str:
        nonlocal n_css, bytes_css
        f = (carpeta / m.group(1)).resolve()
        if not f.is_file():
            return m.group(0)
        texto = css_local(f.read_text(encoding="utf8"), f.parent, herr)
        n_css += 1
        bytes_css += len(texto)
        return f'<style data-inlinado="{m.group(1)}">{texto}</style>'
    html = LINK_CSS.sub(css_rep, html)

    n_js, bytes_js = 0, 0
    def js_rep(m: re.Match) -> str:
        nonlocal n_js, bytes_js
        f = (carpeta / m.group(1)).resolve()
        if not f.is_file():
            return m.group(0)
        texto = ""
        if m.group(1).endswith(".js"):
            texto = IMPORTA.sub(lambda i: f"__sunflex_mod({i.group(1)!r})",
                                seguro_js(f.read_text(encoding="utf8")))
            n_js += 1
            bytes_js += len(texto)
        return f'<script data-inlinado="{m.group(1)}">{texto}</script>'
    html = SCRIPT_SRC.sub(js_rep, html)
    html = html.replace("</head>", cargador + "\n</head>", 1)
    html = html.replace("<!DOCTYPE html>",
                        "<!DOCTYPE html>\n<!-- SUNFLEX-standalone: herramienta en un solo archivo, sin "
                        "CDN ni peticiones al servidor. Generado por gen_standalone.py; no editar a mano. -->",
                        1)
    nota |= {"css": n_css, "js": n_js, "bytes_css": bytes_css, "bytes_js": bytes_js,
             "total": len(html.encode())}
    return html, nota


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="no escribe: falla si falta o está desactualizado")
    args = ap.parse_args()
    mal = 0
    for herr in HERR:
        html, nota = construir(herr)
        destino = RAIZ / "static" / "tools" / herr / "index-sunflex.html"
        viejo = destino.read_text(encoding="utf8") if destino.exists() else ""
        kB = nota["total"] / 1024
        if args.check:
            if not destino.exists():
                print(f"  ✗ falta {herr}/index-sunflex.html (ejecute python3 gen_standalone.py)")
                mal += 1
            elif viejo != html:
                print(f"  ✗ {herr}/index-sunflex.html está desactualizado vs. index.html")
                mal += 1
            else:
                print(f"  ✓ {herr}/index-sunflex.html al día · {kB:.0f} kB")
            continue
        destino.write_text(html, encoding="utf8")
        sueltos = f" · sin inliner: {', '.join(nota['sueltos'])}" if nota["sueltos"] else ""
        print(f"  ✓ {destino.relative_to(RAIZ)} · {kB:.0f} kB · "
              f"{nota['js']} scripts + {nota['css']} CSS + {nota['modulos']} módulos en línea{sueltos}")
        # autocontrol: ni una petición a archivo. Se mira sólo el esqueleto del documento,
        # porque el texto «<link href="../dark.css">» vive dentro del CSS/JS en línea (es un
        # comentario del propio shared.css, no una petición real).
        hueso = re.sub(r"<script\b[^>]*>.*?</script>", "<script/>", html, flags=re.S | re.I)
        hueso = re.sub(r"<style\b[^>]*>.*?</style>", "<style/>", hueso, flags=re.S | re.I)
        hueso = re.sub(r"<!--.*?-->", "", hueso, flags=re.S)
        if re.search(r'<(?:script|link)\b[^>]*(?:src|href)="(?!data:)[^"]+"', hueso, re.I):
            print("    ✗ quedaron peticiones a archivos: el standalone no es standalone")
            mal += 1
        for marcador in ("sunflex-boot.js", "__SUNFLEX_INLINE", "sunflex-cases"):
            if marcador not in html:
                print(f"    ✗ falta {marcador} en el standalone")
                mal += 1
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
