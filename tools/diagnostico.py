#!/usr/bin/env python3
"""diagnostico.py — responde en 10 s «¿estoy ejecutando el código de este repo o una copia rancia?».

    python3 tools/diagnostico.py

Imprime qué archivo está usando realmente el intérprete, si el fallo que ve en el
navegador puede salir de ahí, y si las dos pestañas podadas siguen en la app. Cada
línea lleva el veredicto (OK / RANCIO) para poder pegarla tal cual en un informe.
"""
from __future__ import annotations

import pathlib
import re
import subprocess
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[1]


def git(*args: str) -> str:
    try:
        return subprocess.run(["git", "-C", str(RAIZ), *args], capture_output=True,
                              text=True, timeout=20).stdout.strip()
    except Exception as e:                                       # sin git, sin repo…
        return f"(git no disponible: {type(e).__name__})"


def linea(etiqueta: str, ok: bool, detalle: str) -> bool:
    print(f"  [{'OK  ' if ok else 'RANCIO'}] {etiqueta}: {detalle}")
    return ok


def main() -> int:
    print(f"repo   : {RAIZ}")
    print(f"python : {sys.version.split()[0]} · {sys.executable}")
    print(f"git    : {git('log', '--oneline', '-1') or 'sin commits'} · "
          f"{'árbol limpio' if not git('status', '--porcelain') else 'con cambios sin commitear'}")
    print()

    bien = True
    app = RAIZ / "app.py"
    src = app.read_text(encoding="utf8") if app.exists() else ""
    cap = [i for i, l in enumerate(src.splitlines(), 1) if "Capacidad de conducción habilitada calibrada" in l]
    bien &= linea("app.py", app.exists(), f"{len(src.splitlines())} líneas · {app} · el caption del "
                  f"case en línea {cap[0] if cap else '?'} (el traceback rancio decía 1133)")

    # el fallo citado: una llamada al helper del motor que ya no existe en app.py
    vieja = len(re.findall(r"\{SM\.n_es\(", src))
    bien &= linea("llamada antigua {SM.n_es(…}", vieja == 0,
                  "no aparece (el texto usa el helper local _es)" if vieja == 0
                  else f"{vieja} apariciones → este app.py es del commit da565f8 o anterior")

    sys.path.insert(0, str(RAIZ))
    sombras = []
    for d in sys.path:
        if not d:
            continue
        f = pathlib.Path(d) / "sunflex_model.py"
        if f.exists():
            sombras.append(str(f))
    bien &= linea("sunflex_model.py en el sys.path", len(set(sombras)) <= 1,
                  f"{len(set(sombras))} candidato(s): " + (", ".join(sorted(set(sombras))[:3]) or "ninguno"))
    pycs = sorted(str(x) for x in RAIZ.rglob("__pycache__/sunflex_model*.pyc"))
    if pycs:
        for c in pycs:
            src_pyc = pathlib.Path(c)
            print(f"         (aviso) hay caché compilada: {src_pyc.relative_to(RAIZ)} · "
                  f"si su .py no está al lado o es más viejo, borre el __pycache__: "
                  f"find . -name __pycache__ -exec rm -rf {{}} +")
    import warnings, logging                                     # noqa: E402
    warnings.filterwarnings("ignore")
    logging.disable(logging.WARNING)
    try:
        import sunflex_model as SM
        f = getattr(SM, "__file__", "?")
        bien &= linea("sunflex_model cargado de", str(f).startswith(str(RAIZ)), str(f))
        bien &= linea("sunflex_model.n_es", hasattr(SM, "n_es"),
                      f"presente ({SM.n_es(10.83)})" if hasattr(SM, "n_es")
                      else "falta: reinstale/actualice sunflex_model.py (n_es vive en él)")
        if hasattr(SM, "n_es"):
            bien &= linea("formato es-CO", SM.n_es(17095.7) == "17.095,7", SM.n_es(17095.7))
    except Exception as e:
        linea("sunflex_model", False, f"{type(e).__name__}: {e}")
        bien = False

    # las dos pestañas que se pidieron borrar: leemos la lista como la lee Python
    # (build_app deja el último nombre en la misma línea del corchete, un regex
    # ingenuo contaría 0)
    nombres = []
    import ast
    for nodo in ast.parse(src).body:
        if isinstance(nodo, ast.Assign) and getattr(nodo.targets[0], "id", "") == "tab_names":
            nombres = [str(x) for x in ast.literal_eval(nodo.value)]
            break
    bien &= linea("nº de pestañas", len(nombres) == 25, f"{len(nombres)} (se esperaban 25)")
    for b in ("Equipo", "subsanación"):
        quedan = [n for n in nombres if b.lower() in n.lower()]
        bien &= linea(f"pestaña «{b}» borrada", not quedan,
                      "no está en la tira" if not quedan else "sigue en: " + ", ".join(quedan))
    bloques = [int(x) for x in re.findall(r"^with tabs\[(\d+)\]:", src, re.M)]
    # la base genera 6 pestañas (los parques) con `tabs[tab_idx + 2]` dentro de un bucle,
    # así que los índices literales saltan 2..7 a propósito: lo que tiene que valer es
    # que ningún bloque quede fuera de rango y que las 5 pestañas propias estén.
    en_rango = bool(bloques) and max(bloques) < len(nombres)
    propias = [k for k in range(len(nombres)) if f"with tabs[{k}]:" in src]
    bien &= linea("bloques dentro de la tira", en_rango,
                  f"bloques literales {min(bloques)}…{max(bloques)}, máximo permitido "
                  f"{len(nombres) - 1}")
    bien &= linea("pestañas propias presentes", propias[-5:] == list(range(len(nombres) - 5, len(nombres))),
                  f"últimos bloques {propias[-5:]} de {len(nombres)} pestañas")

    # ¿qué proceso está sirviendo el puerto? (un servidor viejo = navegador rancio)
    try:
        ps = subprocess.run(["ps", "-eo", "pid,lstart,args"], capture_output=True, text=True,
                            timeout=20).stdout
        todos = [l.strip() for l in ps.splitlines() if "streamlit run" in l]
        vivos = []
        for l in todos:                            # sólo los que arrancaron EN este repo
            pid = l.split()[0]
            try:
                if pathlib.Path(f"/proc/{pid}/cwd").resolve() == RAIZ:
                    vivos.append(l)
                else:
                    print(f"  [info] hay un streamlit ajeno a este repo (pid {pid}, cwd "
                          f"{pathlib.Path(f'/proc/{pid}/cwd').resolve()}): no lo cuento")
            except Exception:
                vivos.append(l)
    except Exception:
        vivos = []
    if vivos:
        port = re.findall(r"--server\.port (\d+)", vivos[0])
        mt = app.stat().st_mtime
        start = subprocess.run(["ps", "-o", "lstart=", "-p", vivos[0].split()[0]],
                               capture_output=True, text=True).stdout.strip()
        try:
            import datetime as _dt
            t_proc = _dt.datetime.strptime(start, "%a %b %d %H:%M:%S %Y").timestamp()
            recarga = "--server.runOnSave true" in vivos[0]
            rancio = (mt > t_proc) and not recarga
            bien &= linea("servidor vs app.py", not rancio,
                          f"puerto {port[0] if port else '?'}, levantado {start}; app.py modificado "
                          f"{'DESPUÉS' if mt > t_proc else 'antes'} de ese arranque"
                          + (" · con --server.runOnSave true, así que recarga el script solo" if recarga else "")
                          + (" → recargue con R o reinicie tools/preview.sh" if rancio else ""))
        except Exception:
            linea("servidor vs app.py", True, f"puerto {port[0] if port else '?'}")
    else:
        print("  [AVISO] no hay ningún `streamlit run` vivo: el navegador está mostrando una "
              "página muerta (el cuadro de excepción se queda pegado hasta que se recarga).")

    print()
    print("VEREDICTO:", "el código de este repo está bien; lo que ve el navegador es rancio"
          if bien else "hay un desajuste real que corregir")
    print("Si el veredicto es «bien» y su navegador sigue con el error: recarga forzada "
          "(Ctrl+Shift+R), o pare el servidor y vuelva a `bash tools/preview.sh`. Si está "
          "ejecutando otra copia (su portátil, otro checkout), sincronice app.py Y "
          "sunflex_model.py desde el commit 3aeb8ff o posterior: uno solo de los dos "
          "archivos no basta.")
    return 0 if bien else 1


if __name__ == "__main__":
    raise SystemExit(main())
