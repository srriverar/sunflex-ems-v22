# Deploy: GitHub + Streamlit Community Cloud

Duración real del camino: **≈ 15 minutos**. Todo lo que hace falta ya está en el repo
(`requirements.txt` pinneado, `.streamlit/config.toml`, CI). Pasos al pie de la letra, con los
puntos donde este proyecto específico se cae si uno los salta.

---

## 0 · Estado del repo local

```bash
cd transforma-energia
git status --short              # debe decir: nothing to commit (ya está commiteado)
git log --oneline -1
```

Si necesita rehacer el primer commit antes de publicar:

```bash
git -c user.name="SU NOMBRE" -c user.email="SU@CORREO" commit --amend --reset-author --no-edit
```

## 1 · Publicar en GitHub

```bash
# a) cree el repo vacío en la web (privado si va a radicar con datos de Ecopetrol):
#    https://github.com/new     nombre: sunflex-ems     ⚠ NO agregue README ni .gitignore
gh repo edit --visibility private --accept-visibility-change-consequences   # opcional, si ya lo creó público

# b) empuje
git remote add origin git@github.com:USUARIO/sunflex-ems.git
git branch -M main
git push -u origin main
```

Sin `gh` (CLI de GitHub) basta con crear el repo en la web y pegar los dos comandos que GitHub
muestra. Si prefiere HTTPS: `git remote set-url origin https://github.com/USUARIO/sunflex-ems.git`
(pide *fine-grained personal access token* con permiso `Contents: Read and write`).

**Qué se sube y qué pesa:** 6,7 MB, de los cuales 3,4 MB son `highs.wasm` del simulador ED
(necesario para que resuelva en el navegador). No hace falta Git LFS.

## 2 · Comprobar el CI antes del deploy

`Actions → ci → motor-app-hojas` en verde significa que, en un Ubuntu limpio con **exactamente**
`requirements.txt`:

- el motor resuelve los 5 activos × 5 escenarios sin `FALLO`;
- `tools/check_app.py`: **0 excepciones** en las 25 pestañas;
- `node tools/verify_casepack.mjs --ed-solve`: 25/25 hojas LF convergen con el motor del navegador
  y 25/25 hojas ED dan `ok/optimal`;
- las hojas publicadas están sincronizadas con `sunflex_model.py`.

El artifact `verificacion` de la corrida trae `output/verificacion_hojas.md` (el anexo de
validación que se referencia en el documento de respuesta).

## 3 · Streamlit Community Cloud

1. <https://share.streamlit.io> → **Sign in with GitHub** → autorizar la app de Streamlit sobre el
   repo (o solo sobre ese repo, si aparece el selector).
2. **New app** → *Repository* `USUARIO/sunflex-ems` · *Branch* `main` ·
   **Main file path** `app.py` → **Deploy**.
3. Esperar 2–4 min (instala pypsa/linopy/highspy). **No** rellene `Secrets`: la app no usa claves.
4. Si el build falla, vea **Settings → Manage app → Activity log**.

### Los 9 tropiezos reales de este repo y su arreglo

| síntoma | causa | arreglo |
|---|---|---|
| Las pestañas 🔌/⏱ muestran un iframe roto o 404 | no se leyó `.streamlit/config.toml` (el repo se desplegó desde una subcarpeta, o la nube fijó sus propias opciones de servidor) | confirmar que `app.py` está en la **raíz** del repo; si la nube no honra `server.enableStaticServing`, la pestaña ya degrada sola: ofrece la hoja en `.json` para cargarla con *File → Load* en el simulador |
| «Your app is having trouble being served» / 502 al abrir por primera vez | el primer `resolver()` tarda ~20 s por activo y el worker todavía está frío | recargar; después del primer hit todo está en `st.cache_data`. Para el pitch: abra la app 2 minutos antes de compartirla |
| El build se queda en *Installing requirements* | pins incompatibles con la imagen de Streamlit | quite los `==` de `pandas`/`numpy`/`scipy` y deje `streamlit==`, `pypsa==`, `linopy==`, `highspy==`; la nube ya trae pandas/numpy |
| `ModuleNotFoundError: data_reto1` | alguien movió `app.py` a una subcarpeta sin mover `data_reto1.py` y `algorithms_reto1.py` | `app.py` y esos dos archivos deben quedar en el mismo directorio (así está) |
| El OPF devuelve `('error','infeasible')` y `n.generators_t.p` queda vacío (luego aparece `KeyError: 'PV'`) | `xarray` 2025.x de la imagen base: PyPSA 1.4 no puede armar el balance nodal y muere con `TypeError: Cannot interpret '<StringDtype(na_value=nan)>'` dentro de `linopy.merge` | el piso `xarray>=2026.1` va pineado en `requirements.txt` y `_preflight()` lo comprueba al importar; si ve este error en otro entorno, `pip install -U xarray` (escape hatch para diagnóstico: `SUNFLEX_SKIP_PREFLIGHT=1`) |
| Ve el `AttributeError: module 'sunflex_model' has no attribute 'n_es'`, o las pestañas que ya no están, o cualquier cosa que el repo ya no contiene | está viendo un `app.py` de un commit anterior (o una copia completa vieja: el error exige app.py viejo **y** motor viejo), o un navegador con el cuadro de excepción pegado tras morir el servidor | `python3 tools/diagnostico.py` (o `make diag`) lo dice en 10 s: qué `app.py`, qué `sunflex_model`, cuántas pestañas y si el proceso es posterior al archivo. Si sale «el código de este repo está bien», recarga forzada (Ctrl+Shift+R); si sale RANCIO y está en otra máquina, sincronice `app.py` **y** `sunflex_model.py` desde `3aeb8ff` o posterior |
| Al abrir **🔌 Load Flow** o **⏱ ED-UC** el navegador se queda pensando sin parar (y sube el CPU de la pestaña) | el iframe apunta a `/app/static/tools/…/index.html` y, cuando la nube no leyó `.streamlit/config.toml`, esa ruta **no da 404**: devuelve el HTML de la propia app Streamlit → la app se incrusta a sí misma, cada copia mete otra y la recursión no termina. Casi siempre porque el repo se subió con todo dentro de una subcarpeta (p. ej. `SUNFLEX-EMS-v2.0/app.py`): ahí `.streamlit/` y `static/` dejan de estar en la raíz | Diagnóstico en 5 s: abra en una pestaña nueva `<su-app>/app/static/tools/loadflow-simulator/index.html`; si ve el simulador la ruta está bien, si ve la app no se leyó la config. Arreglo: `app.py`, `.streamlit/config.toml` y `static/` en la **raíz** del repo (o vuelva a subir el zip, que ya trae esa forma) y *Restart app*. Desde v2.1 la pestaña ya no cuelga el navegador: el sondeo exige que el HTML lleve el gancho `sunflex-boot.js` y, si no, pinta un error rojo explicándolo y deja descargar la hoja. Con `SUNFLEX_ESTATICA=1/0` se fuerza el modo (Docker) |
| El iframe **sigue pensando para siempre en la nube** aunque el sondeo diga `herramienta servida (22090 bytes)` | el sondeo lo hace **el servidor hacia sí mismo** (`127.0.0.1:8501/app/static/...`): dice que el contenedor sirve los archivos, no que lleguen a su navegador. Un gateway que reescriba o bloquee `/app/static/` deja el iframe con el HTML pero sin los `.js`, `script.js` no termina su `import('./engine/…')`, `window.LF` no aparece y la caja no pinta nunca. (Hasta v2.2 además había un `@import` de Google Fonts en `style.css`: si la red no lo sirve, el pintado se bloquea.) | Cambie el selector **«Cómo se carga la herramienta»** a **archivo embebido**: la herramienta entera viaja dentro del mensaje de la app (`st.iframe(Path)` lee el archivo en el servidor), así que no pide nada al proxy. Para siempre: `SUNFLEX_MODO=archivo`, y como en Streamlit Cloud no hay terminal, escriba en *Settings → Secrets* la línea `sunflex_modo = "archivo"` (la app la lee igual). Y por dentro, el vigía `sunflex-boot.js` pinta en 6 s un aviso rojo con el recurso que faltó y botones para reintentar, abrir en pestaña propia o cambiar de modo, en vez de dejar la rueda. `python3 gen_standalone.py` regenera los archivos; `node tools/verify_standalone.mjs` verifica que no piden nada |
| Decenas de avisos `Please replace use_container_width with width` en el log | el repositorio base usa la firma antigua de Streamlit (anunciada para eliminarse después de 2025-12-31) | inocuo hoy: por eso `requirements.txt` fija `streamlit==1.66.0`. Si algún día sube la versión y rompe, `sed -i "s/use_container_width=True/width='stretch'/g" app.py` y `python3 tools/check_app.py` |

### Si la nube no sirve el directorio `static/` (plan B, 3 minutos)

- **Docker** (sirve todo igual que en local):

```bash
cat > Dockerfile <<'EOF'
FROM python:3.13-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8501
# enableStaticServing ya está en .streamlit/config.toml
CMD ["streamlit","run","app.py","--server.address","0.0.0.0","--server.port","8501"]
EOF
docker build -t sunflex . && docker run -p 8501:8501 sunflex
```

  Sírvelo en Render / Railway / Fly.io / Hugging Face Spaces (SDK *docker*) con el mismo
  `PORT` 8501. La URL resultante es la que va en el formulario del reto.

- **EJECUTAR el repo local sin Docker** (para la demo en vivo del pitch, la más segura):

```bash
pip install -r requirements.txt
streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

## 4 · URL corta y video

La URL de Streamlit Cloud (`https://sunflex-ems-app.streamlit.app`) va en:
- el campo *enlace de la aplicación* del formulario, si lo piden;
- la descripción del video de YouTube (junto con el enlace al repo);
- `README.md` del repo (badge de estado del CI al final de este archivo).

Antes del pitch, abra la app desde una ventana incógnita y revise las pestañas
**Modelo PyPSA → Load Flow → ED-UC → Ventana 3–8 MW → Economía → Respuesta de subsanación**:
son las seis nuevas y las que se ven afectadas por un cambio de servidor.

## 5 · Actualizar números después (flujo de trabajo)

```bash
# cambió algo del modelo →
python3 sunflex_model.py            # 1. smoke test
python3 gen_casepack.py             # 2. regenera las 50 hojas de las dos herramientas
node tools/verify_casepack.mjs --ed-solve   # 3. control de calidad de esas hojas
python3 gen_docs.py                 # 4. reescribe docs/RESPUESTA_SUBSANACION.{md,docx} y README
python3 gen_habilitantes.py         # 5. planilla Anexo 6 + checklist
python3 tools/check_app.py          # 6. la app sigue sin explotar
git commit -am "números actualizados desde el modelo" && git push
```

Streamlit Cloud redeploya solo al hacer push a `main` (≈90 s).

---

### Badges para el `README.md` del repo público

```markdown
![ci](https://github.com/USUARIO/sunflex-ems/actions/workflows/ci.yml/badge.svg)
[![Open in Streamlit](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://SUA-APP.streamlit.app)
```
