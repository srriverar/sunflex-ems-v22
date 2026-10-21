#!/usr/bin/env python3
"""capturas.py — screenshots reales de la app corriendo, para el README y el video.

    python3 tools/capturas.py [URL]        # por defecto http://127.0.0.1:8501

Requisitos (solo de desarrollo): pip install pillow playwright && python -m playwright install chromium
No forma parte del deploy; el README las referencia como `docs/capturas/*.png`.
"""
from __future__ import annotations

import pathlib
import sys

ARGS = [a for a in sys.argv[1:]]
URL = next((a for a in ARGS if a.startswith("http")), "http://127.0.0.1:8501")
FILTRO = [a for a in ARGS if not a.startswith("http")]      # "05,07" -> solo ésas
RAIZ = pathlib.Path(__file__).resolve().parents[1]
OUT = RAIZ / "docs" / "capturas"
OUT.mkdir(parents=True, exist_ok=True)

# (archivo, etiqueta de la pestaña, texto que debe aparecer, espera extra)
TIRO = [
    ("01-resumen.jpg", None, "SUNFLEX-EMS", 2500),
    ("02-motor-pypsa.jpg", "Modelo PyPSA", "Motor de simulación", 6000),
    ("03-curtailment.jpg", "Curtailment", "Curtailment", 3000),
    ("04-loadflow.jpg", "Load Flow", "Load Flow Simulator", 9000),
    ("05-ed-uc.jpg", "ED-UC", "ED-UC Simulator", 9000),
    ("06-ventana-3-8mw.jpg", "Ventana 3", "3 y 8 MW", 4000),
    ("07-economia.jpg", "Economía", "LCOS", 4000),  # última pestaña
]
if FILTRO:
    ns = {n.strip() for a in FILTRO for n in a.split(",")}
    TIRO = [t for t in TIRO if any(t[0].startswith(p) for p in ns)]


def comprimir(png: pathlib.Path) -> None:
    """PNG de Playwright -> JPG q88 (el repo pesa ~4x menos y el texto se ve igual)."""
    from PIL import Image
    Image.open(png).convert("RGB").save(png.with_suffix(".jpg"), quality=88, optimize=True)
    png.unlink(missing_ok=True)


def esperar(page, extra=1200):
    try:
        page.wait_for_selector(".stSpinner", state="detached", timeout=900_000)
    except Exception:
        pass
    page.wait_for_timeout(extra)


def main() -> int:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        pg.goto(URL, wait_until="networkidle", timeout=120_000)
        pg.wait_for_timeout(2500)
        ok, fallos = 0, []
        for arc, pestana, debe, extra in TIRO:
            try:
                if pestana:
                    tab = pg.get_by_role("tab", name=pestana).first
                    tab.click(timeout=20_000)
                    pg.wait_for_timeout(1500)
                esperar(pg, extra)
                if debe:
                    for _ in range(240):
                        if debe.lower() in pg.inner_text("body").lower():
                            break
                        pg.wait_for_timeout(1000)
                    else:
                        fallos.append(f"{arc}: no apareció «{debe}»")
                tmp = OUT / (arc.rsplit(".", 1)[0] + ".png")
                pg.screenshot(path=str(tmp), full_page=False)
                comprimir(tmp)
                print(f"  ✓ {arc}")
                ok += 1
            except Exception as e:
                fallos.append(f"{arc}: {type(e).__name__} {str(e)[:90]}")
                try:
                    tmp = OUT / (arc.rsplit(".", 1)[0] + ".png")
                    pg.screenshot(path=str(tmp), full_page=False)
                    comprimir(tmp)
                except Exception:
                    pass
        b.close()
    print(f"\n{ok}/{len(TIRO)} capturas en {OUT.relative_to(RAIZ)}/")
    for f in fallos:
        print("  !", f)
    return 0 if not fallos else 1


if __name__ == "__main__":
    raise SystemExit(main())
