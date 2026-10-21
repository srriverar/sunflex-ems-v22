#!/usr/bin/env bash
# Arranca la app en modo preview (0.0.0.0 para el proxy del entorno / de Docker).
set -e
cd "$(dirname "$0")/.."
[ -d /tmp/st-check ] || python3 - <<'PY'
import subprocess, sys
try:
    import streamlit, pypsa  # noqa
except Exception:
    print("instalando dependencias del requirements.txt …", flush=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"])
PY
# `--server.runOnSave true` solo en el preview: al regenerar app.py con
# build_app.py la pestaña no se queda mostrando el código viejo (en la nube no
# aplica: allí el deploy es inmutable). Aun así, los módulos ya importados
# (sunflex_model) NO se recargan: por eso app.py lleva el shim de compatibilidad.
exec streamlit run app.py --server.address 0.0.0.0 --server.port "${PORT:-8501}" \
     --server.headless true --server.enableStaticServing true --browser.gatherUsageStats false \
     --server.runOnSave true
