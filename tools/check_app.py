#!/usr/bin/env python3
"""check_app.py — ejecuta la app completa en modo headless y exige cero excepciones.

`streamlit.testing.v1.AppTest` corre el script real (todas las pestañas, con los
mismos elementos, mismos datos) sin navegador. Es el test que sostiene la
afirmación «la app arranca y calcula»: si una pestaña revienta en Streamlit
Community Cloud, revienta aquí primero.

    python3 tools/check_app.py
"""
from __future__ import annotations

import logging
import pathlib
import sys

logging.disable(logging.WARNING)
RAIZ = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))

from streamlit.testing.v1 import AppTest  # noqa: E402


def main() -> int:
    at = AppTest.from_file(str(RAIZ / "app.py"), default_timeout=900)
    at.run()
    if at.exception:
        for e in at.exception:
            print("EXCEPCIÓN:", str(e.value)[:600])
        return 1
    st = [e.value for e in at.error if "Pendiente del proponente" not in str(e.value)]
    print(f"pestañas={len(at.tabs)}  tablas={len(at.dataframe)}  metric={len(at.metric)}  "
          f"iframes={len(at.get('iframe'))}  codigo={len(at.get('code'))}  "
          f"descargas={len(at.get('download_button'))}")
    print(f"excepciones=0  errores_inesperados={len(st)}")
    for s in st:
        print("  error:", str(s)[:200])
    return 1 if st else 0


if __name__ == "__main__":
    raise SystemExit(main())
