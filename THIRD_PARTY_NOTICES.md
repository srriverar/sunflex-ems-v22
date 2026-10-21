# Terceros, licencias y procedencia de los datos

## Código de terceros incluido en este repositorio

| componente | origen | licencia | cómo se usa aquí |
|---|---|---|---|
| Load Flow Simulator (`static/tools/loadflow-simulator/`) | <https://tool.adjiebrotots.com/loadflow-simulator/> · repo `adjiebrotot/tool` | GPL-3.0 | vendorizado, servido por Streamlit en `/app/static/…`; se le añadieron `sunflex-cases.js` y `sunflex-boot.js` |
| ED-UC Simulator (`static/tools/ed-uc-simulator/`) | idem | GPL-3.0 | idem |
| PSA.js (`engine/psa-pf.min.js`, `engine/psa-opt.min.js`) | port a JavaScript de PyPSA, incluido en las herramientas arriba | MIT (ver `engine/LICENSE.txt`) | motor de Newton-Raphson y de optimización dentro del navegador |
| HiGHS wasm (`ed-uc-simulator/engine/highs.*`) | HiGHS, ERGO | MIT | solver LP/MILP del simulador ED en el navegador |
| Chart.js 4.4.1 · hammer.js 2.0.8 · chartjs-plugin-zoom (`static/tools/vendor/`) | CDN originales | MIT | se bajaron al repo para no depender de internet |
| PyPSA (`sunflex_model.py`) | <https://github.com/PyPSA/PyPSA> | MIT | modelo y OPF del proyecto |
| linopy + HiGHS, pandas, numpy, xarray, scipy, plotly | PyPI | MIT/BSD/Apache | cálculo y gráficos |

Al redistribuir las dos herramientas (GPL-3.0) **este repositorio se publica bajo GPL-3.0**: el
árbol `static/tools/` con sus modificaciones y las hojas de caso generadas, y también el resto del
proyecto (`sunflex_model.py`, `app.py`, `docs/`), para que la distribución del trabajo combinado sea
coherente. El texto completo está en `LICENSE` (raíz) y en `static/tools/LICENSE`: el repositorio
upstream no publica archivo de licencia (solo el enlace a `gnu.org/licenses/gpl-3.0.html` en el pie
de cada herramienta), así que se incorpora aquí la GPL-3.0 oficial de la FSF. El MIT del motor del
navegador queda en `static/tools/*/engine/LICENSE.txt` y el de HiGHS wasm en
`static/tools/ed-uc-simulator/engine/LICENSE.txt`.

Modificaciones aplicadas a los dos `index.html` (ediciones a mano, visibles en el diff; ninguna toca
la lógica del motor): retirada de la analítica (`gtag`), del PWA y del service worker (cachean el dev
server), de `manifest`/`canonical`, sustitución de los enlaces a CDN por `../vendor/`, e inserción de
`sunflex-cases.js` antes de `script.js` y de `sunflex-boot.js` después. Se añade además un
`<script>` de dos líneas antes de `../tour-shared.js` que marca el tour guiado como visto
(`localStorage['loadflow-tour-v1-seen']` / `['educ-tour-v1-seen']`) cuando la página va embebida en un
iframe o llega con `?case=`: la ventana de Streamlit es estrecha y el tour tapaba el diagrama.
Abriendo la herramienta en una pestaña propia sin `?case=` el tour sigue disponible.

## Procedencia de los datos

- **Activos solares del Grupo Ecopetrol** (potencia instalada, generación, área, número de módulos,
  vertimiento reportado): cifras públicas del repositorio base (`data_reto1.py`) y del **Anexo 1 del
  Reto 1**, que fija la ventana de excedente de **3–8 MW entre 12:00 y 14:00**.
- **Términos y condiciones de la convocatoria**: documento de ConnectBOGOTÁ (criterios de evaluación,
  fases, TRL 7–9, video ≤ 2 min en YouTube, 3 días hábiles de subsanación, pilotos de 6 meses).
- **Precios de bolsa y tarifa regulada**: series públicas de XM usadas en el repositorio base; aquí se
  usan como escalones (valle / medio / punta) declarados en el supuesto **S4**.
- **Costos de baterías**: BNEF *Battery Pack Price Survey* (108 USD/kWh de pack LFP, 70 USD/kWh
  celdas/prisma estacionario) y factor EPC 1,8 — ver `sunflex_model.BNEF`.
- **Factores de emisión del SIN**: fuente citada en el repositorio base (`CO2_SIN`).
- **Impedancias de línea**: dato de catálogo del conductor Drake 397 kcmil (r = 0,0913 Ω/km,
  x = 0,3979 Ω/km).

## Lo que **no** contiene este repositorio

- No hay datos de Ecopetrol/CADE no públicos ni instrucciones reales del despacho.
- No se incluye ningún dato personal del jurado, de funcionarios ni de clientes.
- Los campos administrativos del proponente (habilitantes, Anexo 6, enlace del video) están marcados
  `[COMPLETAR]` a propósito: son verificables de la empresa y no se sustituyen por estimaciones.
