#!/usr/bin/env python3
"""build_app.py — arma `app.py` (la app entregable) a partir de `baseline/app.py`
+ las pestañas nuevas del motor propio (`tabs_sunflex_src.py`), aplicando antes la
**poda de pestañas** declarada en `TABS_BORRADOS_BASE`.

Se vuelve a ejecutar cada vez que cambie el baseline o las pestañas nuevas:
    python3 build_app.py

`baseline/app.py` NO se edita: se queda verbatim para que `git diff` y el jurado
puedan auditar qué se añadió. La poda vive aquí, en el ensamblado, y está afirmada
con `assert` (si el baseline cambia de forma inesperada, el build falla en vez de
producir una app con pestañas desalineadas).
"""
from __future__ import annotations

import ast
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent
BASE = RAIZ / "baseline" / "app.py"
NUEVO = RAIZ / "tabs_sunflex_src.py"
SALIDA = RAIZ / "app.py"

# Pestañas que se quitan del repositorio base al armar la app entregable.
# «👤 Equipo» salió por decisión del proponente: el equipo se documenta en el
# Anexo 6 y en docs/RESPUESTA_SUBSANACION.md, no en la app.
TABS_BORRADOS_BASE = ["👤 Equipo"]

CABECEIRA = '''
# ═══════════════════════════════════════════════════════════════════════════
#  BLOQUE SUNFLEX (añadido por build_app.py) — motor propio + herramientas
# ═══════════════════════════════════════════════════════════════════════════
import json
import logging
from urllib.parse import quote

logging.getLogger("linopy").setLevel(logging.ERROR)
logging.getLogger("pypsa").setLevel(logging.ERROR)

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
import sunflex_model as SM                                      # noqa: E402

# Compatibilidad: si el proceso ya tenía importado un `sunflex_model` anterior a
# `n_es` (Streamlit recarga `app.py` en cada rerun pero NO recarga los módulos ya
# importados, y un `__pycache__` rancio hace lo mismo), un `SM.n_es(...)` de una
# copia vieja reventaba con AttributeError. Se rellena el hueco aquí y `app.py`
# deja de depender de que el motor exponga ese helper: los textos usan `_es()`.
if not hasattr(SM, "n_es"):
    def _n_es(x, nd=None) -> str:
        v = float(x)
        t = f"{v:,.{nd if nd is not None else 6}f}"
        if nd is None:
            t = t.rstrip("0").rstrip(".")
        ent, _, dec = t.partition(".")
        return ent.replace(",", ".") + ("," + dec if dec else "")
    SM.n_es = _n_es                                                  # noqa: ANN202

import pathlib as _pl
RAIZ = _pl.Path(os.path.abspath(os.path.dirname(__file__)))


@st.cache_data(show_spinner="Resolviendo el OPF de 96 pasos en HiGHS…")
def _resolver(key: str) -> dict:
    """Resultado completo de un caso (5 escenarios, PF, hojas). Cacheado por caso."""
    r = SM.resolver(key)
    r.pop("nets", None)                                          # objetos PyPSA no serializan
    return r


@st.cache_data(show_spinner=False)
def _demo38() -> dict:
    return SM.caso_3a8mw()


@st.cache_data(show_spinner=False)
def _hoja(key: str, esc: str) -> dict:
    return SM.caso_hoja(key, esc)


'''

# Normalizaciones sobre el ensamblado (el baseline se queda verbatim). La tabla de
# presupuesto del repositorio base mete markdown dentro de un st.dataframe: allí
# `**TOTAL**` y `**820**` salen con asteriscos literales y la columna «M COP» queda
# mixta, lo que en el log produce `ArrowInvalid: Could not convert '**820**' …`
# (Streamlit lo autocorrige, pero el resultado es una columna de texto).
VERSION = "2.2"          # debe coincidir con sunflex_model.VERSION (se comprueba abajo)

PARCHES = [
    ('"Contingencia (10%)", "**TOTAL**"]', '"Contingencia (10%)", "TOTAL"]'),
    ('[180, 250, 80, 60, 120, 48, 82, "**820**"]', '[180, 250, 80, 60, 120, 48, 82, 820]'),
    # El entregable se rotula v2.0 en los tres sitios donde el baseline lleva la versión.
    # El box ASCII conserva el ancho porque "v1.1" y "v2.0" miden lo mismo.
    ("SUNFLEX-EMS v1.1 · Sistema de Gestión Energética", f"SUNFLEX-EMS v{VERSION} · Sistema de Gestión Energética"),
    ("<div style=\"font-size:0.7rem; color:#81C784; margin-top:5px;\">v1.1 ·",
     f"<div style=\"font-size:0.7rem; color:#81C784; margin-top:5px;\">v{VERSION} ·"),
    ("<b>SUNFLEX-EMS v1.1</b>", f"<b>SUNFLEX-EMS v{VERSION}</b>"),
]

TABS_NUEVOS = [
    "🧮 Modelo PyPSA", "🔌 Load Flow (herramienta)", "⏱ ED-UC (herramienta)",
    "🎯 Ventana 3–8 MW", "💰 Economía y TCO",
]

ANCLAS = {
    "imports": 'sys.path.insert(0, os.path.dirname(__file__))\n',
    "tabs": ']\ntabs = st.tabs(tab_names)',
    "footer": "# ═══════════════════════════════════════════════════════════════════════\n#  FOOTER",
}


def _tab_names(src: str) -> list[str]:
    """La lista `tab_names = [...]` tal como la ve Python."""
    for nodo in ast.parse(src).body:
        if isinstance(nodo, ast.Assign) and getattr(nodo.targets[0], "id", "") == "tab_names":
            return list(ast.literal_eval(nodo.value))
    raise AssertionError("no se encontró la asignación tab_names en el baseline")


def podar(src: str, nombres: list[str]) -> tuple[str, list[str]]:
    """Quita pestañas: su nombre en `tab_names`, su bloque `with tabs[k]:` con el
    rótulo de tres líneas, y renumera los bloques y rótulos posteriores.

    Devuelve (fuente podada, lista de nombres que quedan)."""
    lista = _tab_names(src)
    for nom in nombres:
        assert nom in lista, f"no existe la pestaña {nom!r} en el baseline"
        k = lista.index(nom)

        for pat in (f'"{nom}", ', f', "{nom}"', f'"{nom}"'):
            if pat in src:
                src = src.replace(pat, "", 1)
                break
        else:
            raise AssertionError(f"no se pudo quitar {nom!r} de la lista tab_names")
        assert f'"{nom}"' not in src, f"{nom!r} sigue referenciada en algún sitio"

        bloque = re.compile(
            "# ═+\\n#  TAB %d\\b[^\\n]*\\n# ═+\\nwith tabs\\[%d\\]:.*?"
            "(?=# ═+\\n#  (?:TAB \\d|FOOTER)|\\Z)" % (k, k), re.S)
        n = len(bloque.findall(src))
        assert n == 1, f"bloque de {nom!r}: {n} coincidencias (¿cambió el formato del rótulo?)"
        src = bloque.sub("", src, count=1)

        for j in range(len(lista) - 1, k, -1):          # 20→19, 21→20, …
            for viejo, nuevo in ((f"#  TAB {j}:", f"#  TAB {j - 1}:"),
                                 (f"with tabs[{j}]:", f"with tabs[{j - 1}]:")):
                if viejo in src:
                    assert src.count(viejo) == 1, viejo
                    src = src.replace(viejo, nuevo, 1)
        lista = [x for x in lista if x != nom]
    return src, lista


def main() -> int:
    motor = (RAIZ / "sunflex_model.py").read_text(encoding="utf8")
    assert f'VERSION = "{VERSION}"' in motor, (
        f"build_app dice v{VERSION} pero sunflex_model.py no: sincronice la versión")
    src0 = BASE.read_text(encoding="utf8")
    nuevo = NUEVO.read_text(encoding="utf8")

    for k, a in ANCLAS.items():
        assert a in src0, f"ancla {k} no encontrada en baseline/app.py (¿cambió el repo base?)"

    # 0 · poda de pestañas del baseline + renumeración
    src, base_restantes = podar(src0, TABS_BORRADOS_BASE)
    bloques_antes = len(re.findall(r"^with tabs\[\d+\]:", src0, re.M))
    bloques_ahora = len(re.findall(r"^with tabs\[\d+\]:", src, re.M))
    assert bloques_ahora == bloques_antes - len(TABS_BORRADOS_BASE), "no se podó un bloque por nombre"
    assert f"with tabs[{len(base_restantes)}]:" not in src, "quedó un bloque fuera de rango"

    # 1 · imports y helpers
    src = src.replace(ANCLAS["imports"], ANCLAS["imports"] + CABECEIRA, 1)

    # 2 · nombres de las pestañas nuevas
    src = src.replace(ANCLAS["tabs"],
                      '\n    "' + '", "'.join(TABS_NUEVOS) + '"]\ntabs = st.tabs(tab_names)', 1)

    # 3 · cuerpo de las pestañas nuevas, justo antes del footer
    idx = [int(m) for m in re.findall(r"^with tabs\[(\d+)\]:", nuevo, re.M)]
    assert len(idx) == len(TABS_NUEVOS), f"{len(idx)} bloques para {len(TABS_NUEVOS)} nombres"
    assert idx == list(range(len(base_restantes), len(base_restantes) + len(idx))), \
        f"tabs_sunflex_src.py usa tabs{idx} y la base podada tiene {len(base_restantes)} pestañas "\
        f"→ renumere los bloques (deben empezar en tabs[{len(base_restantes)}])"
    src = src.replace(ANCLAS["footer"], nuevo.rstrip() + "\n\n" + ANCLAS["footer"], 1)

    # 4 · normalizaciones de la tabla de presupuesto
    n_par = 0
    for viejo, nuevo_txt in PARCHES:
        assert src.count(viejo) == 1, f"parche no localizado (¿cambió el baseline?): {viejo[:40]}"
        src = src.replace(viejo, nuevo_txt, 1)
        n_par += 1

    SALIDA.write_text(src, encoding="utf8")
    ast.parse(src)
    total = len(_tab_names(src))
    n_base = len(src0.splitlines())
    print(f"app.py escrito: {len(src.splitlines())} líneas · {SALIDA.stat().st_size/1024:.0f} kB")
    print(f"  = baseline ({n_base}) − {len(TABS_BORRADOS_BASE)} poda(s) + pestañas nuevas "
          f"({len(nuevo.splitlines())}) + cabecera ({len(CABECEIRA.splitlines())})")
    print(f"  · sintaxis OK · {total} pestañas = {len(base_restantes)} de la base + {len(TABS_NUEVOS)} propias")
    print(f"  · podadas: {', '.join(TABS_BORRADOS_BASE) or 'ninguna'} · {n_par} parche(s) de limpieza")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
