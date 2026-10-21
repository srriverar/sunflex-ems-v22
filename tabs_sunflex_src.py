# ═══════════════════════════════════════════════════════════════════════════
#  TABS SUNFLEX · MOTOR PROPIO (sunflex_model.py) + HERRAMIENTAS
#  (la respuesta de subsanación va en docs/, no en la app)
#  Este bloque se inserta en app.py por encima del footer; usa `tabs` y
#  `SM` ya definidos por el archivo base.
# ═══════════════════════════════════════════════════════════════════════════

# ── Toque de CSS (no cambia lógica): el sidebar del repositorio base pinta sus
# subtítulos en verde oscuro y sobre el tema oscuro del sidebar quedan ilegibles.
st.markdown("""<style>
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h1,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h2,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h3,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] h4,
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] strong { color: #E8F1E9 !important; }
</style>""", unsafe_allow_html=True)

def _es(x, nd=None) -> str:
    """Número en formato es-CO (coma decimal, punto de miles).

    Vive aquí, y no solo en `sunflex_model.n_es`, para que un `app.py` recién
    generado contra una copia antigua del motor no reviente con un
    `AttributeError`: si el helper no está, se calcula en el propio archivo."""
    f = getattr(SM, "n_es", None)
    if f is not None:
        return f(x, nd) if nd is not None else f(x)
    s = f"{float(x):,.{nd if nd is not None else 6}f}"
    if nd is None:
        s = s.rstrip("0").rstrip(".")
    return s.replace(".", "\u00a7").replace(",", ".").replace("\u00a7", ",")


with tabs[20]:
    st.markdown("# 🧮 Motor de simulación · PyPSA + HiGHS")
    st.markdown("""<div class="info-box"><b>Qué es esta pestaña.</b> El modelo que sostiene los números del
    reto está en <code>sunflex_model.py</code>: una red PyPSA por activo (3 barras: cabecera del parque ·
    campo de proceso · SE del SIN), 96 pasos de 15 minutos, con la capacidad de conducción habilitada como
    <b>enlace unidireccional</b> (protección de potencia inversa en cabecera). El curtailment no es un
    parámetro: <b>emerge</b> de que la planta no puede entregar más de esa capacidad. Cada escenario se
    resuelve como OPF lineal con HiGHS y se audita después con un flujo de cargas Newton-Raphson
    sobre la misma topología.</div>""", unsafe_allow_html=True)

    _ck = st.selectbox("Activo", list(SM.CASOS.keys()), format_func=lambda k: SM.CASOS[k].nombre)
    _r = _resolver(_ck)
    _c = SM.CASOS[_ck]
    st.caption(f"Capacidad de conducción habilitada calibrada: **{_es(_r['cap_mw'])} MW** · "
               f"perfil solar PR {_es(_r['perfiles']['pr']) if 'pr' in _r['perfiles'] else '–'} · "
               f"96 pasos × 15 min · 2026-02-10")
    st.markdown(f"""
| Auditoría de la calibración | valor |
|---|---|
| Vertimiento **reportado** por el activo (base) | {_es(_r['base_reportada'])} MWh/día |
| Vertimiento que reproduce el modelo | {_es(_r['base_modelo'])} MWh/día |
| Valor usado como línea base de KPI (el menor) | {_es(_r['base_kpi'])} MWh/día |
| Desvío de calibración | {_r['desvio_calibracion_pct']:+.1f} % |
| Reducción piloto medida vs modelo | {_r['reduccion_piloto_vs_modelo_pct']:.1f} % |
| Reducción escala medida vs modelo | {_r['reduccion_escala_vs_modelo_pct']:.1f} % |
    """)
    if abs(_r["desvio_calibracion_pct"]) > 15:
        st.warning("El desvío de calibración supera 15 %: en este activo el suelo físico del modelo "
                   "(potencia solar disponible por encima de la demanda del campo) no permite verter "
                   "tan poco como reporta la fuente. El KPI se calcula contra la línea base **mayor** "
                   "(más conservadora) y el desvío se declara en el informe, no se oculta.")

    st.markdown("### Los cinco escenarios")
    st.dataframe(_r["tabla"], use_container_width=True, hide_index=True)
    st.caption("Unidades: 1 unidad de costo = 1 000 COP/MWh = 1 COP/kWh. El mismo número aparece en el "
               "informe y en la hoja ED, para que ambos sean comparables sin reconversión.")

    st.markdown("### Curvas del día (perfil calibrado)")
    _per = _r["perfiles"]
    _t = (np.arange(96) * 15 / 60.0)
    fig = go.Figure()
    fig.add_bar(x=_t, y=np.asarray(_per["pv"], float), name="PV disponible (MW)", marker_color="#FFB300")
    fig.add_scatter(x=_t, y=np.minimum(np.asarray(_per["pv"], float), _r["cap_mw"]),
                    name=f"Entregable ≤ {_r['cap_mw']:g} MW", line=dict(color="#2E7D32", width=3))
    fig.add_scatter(x=_t, y=np.asarray(_per["dem"], float), name="Demanda del campo (MW)",
                    line=dict(color="#1565C0", dash="dot", width=2))
    fig.update_layout(height=380, margin=dict(l=10, r=10, t=30, b=10),
                      xaxis_title="hora del día", legend=dict(orientation="h", y=1.08))
    st.plotly_chart(fig, use_container_width=True)
    st.markdown("La franja sombreada entre la barra ámbar y la línea verde **es el vertimiento**: "
                "no se impone, se calcula. Por eso la ventana 12:00–14:00 del Reto 1 aparece sola.")

    st.markdown("### Flujo de cargas (Newton-Raphson AC) en la hora de mayor generación")
    _filas = []
    for _esc in SM.ORDEN:
        _pf = _r["pf"][_esc]["gen"]
        _pk = _r["pf"][_esc]["pico"]
        if not _pf.get("ok"):
            _filas.append({"escenario": _esc, "converge": "NO", "detalle": _pf.get("error", "")})
            continue
        _filas.append({"escenario": _esc, "converge": "sí", "V PV (pu)": _pf["v"]["PV"],
                       "V campo (pu)": _pf["v"]["CAMPO"], "alimentador (% S_nom)": _pf["linea_carga_pct"],
                       "TR SE (% MVA)": _pf["traf_carga_pct"], "pérdidas (MW)": _pf["perdidas_tot_mw"],
                       "curtail (MW)": _pf["curtail_mw"], "compra slack (MW)": _pf["compra_slack"],
                       "V campo 19:00": (_pk.get("v") or {}).get("CAMPO", "–")})
    st.dataframe(pd.DataFrame(_filas), use_container_width=True, hide_index=True)
    st.caption("El alimentador está al 100 % de su límite en la hora solar punta **en todos los escenarios**: "
               "esa es la firma de que la restricción es de capacidad de conducción y no de demanda. "
               "Consecuencia de diseño: el almacenamiento y la carga flexible capturadora van en la cabecera "
               "del parque (izquierda de la restricción); mover carga en el campo solo optimiza el costo.")

    st.markdown("### Precio marginal del nodo (COP/kWh) — la señal económica de la restricción")
    _pn = _r["precios_nodales"]
    st.dataframe(pd.DataFrame([{"nodo": k, **{a: b for a, b in v.items()}}
                              for k, v in _pn.items() if isinstance(v, dict)]),
                 use_container_width=True, hide_index=True)
    st.caption("En la hora solar punta el nodo de la planta vale **0 COP/kWh** (el excedente no tiene "
               "salida) y el del campo vale 350 COP/kWh: esa diferencia es la renta de congestión que el "
               "EMS captura almacenando en cabecera. El cálculo es ex-post sobre el despacho óptimo "
               f"({_pn.get('metodo','')}).")

    with st.expander("Descargar el resultado crudo (auditoría)"):
        _json = json.dumps({k: v for k, v in _r.items() if k not in ("nets", "perfiles", "tabla")},
                           ensure_ascii=False, indent=1, default=str,
                           )
        st.download_button("JSON del caso resuelto", _json.encode(), file_name=f"sunflex_{_ck}.json",
                           mime="application/json")
        st.code("python3 sunflex_model.py   # smoke test completo del motor\n"
                "python3 gen_casepack.py   # regenera las hojas de las dos herramientas\n"
                "node tools/verify_casepack.mjs --ed-solve   # control de calidad de esas hojas",
                language="bash")

@st.cache_data(show_spinner=False)
def _defecto() -> str:
    """La hoja que debe abrirse por defecto: la que registró `gen_casepack.py`
    (`_default` en sunflex-meta.json), con respaldo si aún no se generó el paquete."""
    try:
        import json as _j
        d = _j.loads((RAIZ / "static" / "tools" / "sunflex-meta.json").read_text(encoding="utf8"))
        if d.get("_default"):
            return d["_default"]
    except Exception:
        pass
    return f"{SM.CASOS['castilla'].corto} · piloto"


def _hojas() -> tuple:
    """Las 25 hojas (5 activos x 5 escenarios) como «Castilla · piloto» y el índice
    de la hoja por defecto. Se listan aqui, y no con el activo elegido en la pestaña
    anterior, para que las dos herramientas puedan apuntar a cualquier caso."""
    ops = [f"{SM.CASOS[k].corto} · {e}" for k in SM.CASOS for e in SM.ORDEN]
    return ops, max(0, ops.index(_defecto()))


def _etiqueta(sel: str) -> str:
    """Nombre legible de una hoja para el selectbox (el valor sigue siendo la hoja)."""
    _a, _, _e = sel.partition(" · ")
    _lab = SM.ESCENARIOS.get(_e, {}).get("label", _e)
    return f"{_a} · {_lab}"


@st.cache_resource(ttl=120, show_spinner=False)
def _estática_viva(tool: str = "loadflow-simulator") -> tuple:
    """¿Está el servidor sirviendo la herramienta? Una sola pregunta, con tope duro.

    Hace falta `server.enableStaticServing = true`. Dos trampas que este sondeo tiene
    que cubrir, y por eso no es un `requests.get` cualquiera:

    1. Si el despliegue NO leyó `.streamlit/config.toml` (típico: el repo se subió con la
       app dentro de una subcarpeta, así que `.streamlit/` y `static/` no están en la raíz
       del repo), `/app/static/tools/...` **no** da 404: devuelve el HTML de la propia app
       Streamlit. Incrustar eso en el iframe es meter la app dentro de la app, y cada copia
       mete otra -> el navegador se queda pensando para siempre. Por eso se exige que el
       cuerpo lleve el gancho propio de la herramienta (`sunflex-boot.js`), no cualquier 200.
    2. Si el puerto no contesta (loopback bloqueado en el entorno), un `urlopen` sin tope
       cuelga el `run` entero. Va con `timeout=0.7`, un único intento, y el resultado vive
       2 minutos en caché: las dos pestañas no vuelven a preguntar.

    `SUNFLEX_ESTATICA=1|0` fuerza el modo (Docker, o el pitch sin red)."""
    import urllib.request
    forzar = (os.environ.get("SUNFLEX_ESTATICA") or "").strip().lower()
    if forzar in ("1", "on", "si", "sí"):
        return True, "forzado por `SUNFLEX_ESTATICA=1`"
    if forzar in ("0", "off", "no"):
        return False, "forzado por `SUNFLEX_ESTATICA=0`"
    # La señal dura de "esto es LA herramienta" es nuestro propio gancho: `sunflex-boot.js`
    # sólo está en el `index.html` de las dos herramientas vendorizadas. (Comparar contra el
    # <title> no vale: el de la ED es "ED/UC Simulator: Economic Dispatch & Unit Commitment
    # | Adjie Brotools" y un `esperado` mal escrito degradaba una pestaña que sí funcionaba.)
    url = "http://127.0.0.1:%d/app/static/tools/%s/index.html?sondeo=1" % (
        int(st.get_option("server.port") or 8501), tool)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "sunflex-ems-sondeo"})
        with urllib.request.urlopen(req, timeout=0.7) as r:
            status, cuerpo = r.status, r.read(300_000).decode("utf-8", "replace")
        if status != 200:
            return False, f"el servidor contestó **{status}** en `{url}`"
        if "sunflex-boot.js" not in cuerpo:
            return False, (f"`{url}` contestó 200 pero con otra cosa (no es el HTML de la "
                           "herramienta): casi seguro el HTML de la propia app Streamlit, que es "
                           "lo que devuelve `/app/static/...` cuando NO se leyó "
                           "`.streamlit/config.toml`. Incrustarlo sería meter la app dentro de la "
                           "app, en bucle: el navegador no pararía de pensar. Arreglo: `app.py`, "
                           "`.streamlit/` y `static/` en la **raíz** del repo desplegado")
        return True, f"herramienta servida en `{url}` ({len(cuerpo)} bytes)"
    except Exception as e:
        return False, f"no se pudo sondear `{url}` ({type(e).__name__}: {str(e)[:70]})"


def _nombre_hoja(tool: str, sel: str) -> str:
    """`sunflex-lf-Castilla-piloto.json` / `sunflex-ed-Castilla-piloto.json`."""
    q = "lf" if tool.startswith("loadflow") else "ed"
    return (f"sunflex-{q}-" + sel.replace(" · ", "-").replace(" ", "_") + ".json")


def _url_herramienta(tool: str, sel: str) -> str:
    """URL **absoluta** de la herramienta, para que el botón de abrir en pestaña nueva sirva
    también detrás del proxy de la nube (con la ruta relativa no se puede: `st.link_button`
    necesita un `http(s)://` y el iframe heredaba el host del padre)."""
    ruta = f"/app/static/tools/{tool}/index.html?case={quote(sel)}"
    host = ""
    try:  # en la nube el único host fiable es el de la petición, no el de la config
        cab = dict(st.context.headers or {})
        host = cab.get("host") or cab.get("Host") or ""
    except Exception:
        host = ""
    if not host:
        return ruta
    local = host.startswith(("localhost", "127.", "0.0.0.0", "10.", "192.168."))
    return f"{'http' if local else 'https'}://{host}{ruta}"


def _herramienta(tool: str, sel: str, alto: int, intro: str):
    """Iframe si el servidor está poniendo `static/tools/` a la vista; si no, la pestaña
    degrada a la hoja. Y en los dos casos, acciones **visibles desde el primer píxel**: ni
    una ni otra dependen de que el iframe termine (es lo que dejaba al usuario con la
    rueda dando vueltas sin poder hacer nada).

    El vigía del otro lado del iframe (`static/tools/*/sunflex-boot.js`) hace lo propio por
    dentro: si en 6 s no aparece el motor, pinta un aviso rojo con el recurso que falta."""
    st.markdown(intro, unsafe_allow_html=True)
    viva, motivo = _estática_viva(tool)
    _h = _hoja(sel.split(" · ")[0], sel.split(" · ")[1])
    _q = "lf" if tool.startswith("loadflow") else "ed"
    _sheet = _h[_q]
    url = _url_herramienta(tool, sel)
    # SUNFLEX_MODO=archivo (o `sunflex_modo = "archivo"` en los Secrets de la nube, que es lo
    # único que se puede tocar desde la UI de Streamlit Cloud) fija el modo embebido: el botón
    # de emergencia para el pitch y para entornos cuyo proxy no deja pasar /app/static/.
    modo_env = (os.environ.get("SUNFLEX_MODO") or "").strip().lower()
    if not modo_env:
        try:
            modo_env = str((st.secrets or {}).get("sunflex_modo", "")).strip().lower()
        except Exception:
            pass                        # sin secrets.toml: ni siquiera es un aviso
    _opciones = ["iframe (rápido: pide los archivos a /app/static/)",
                 "archivo embebido (cero peticiones al servidor)",
                 "sin herramienta (sólo la hoja)"]
    _por_defecto = 2 if not viva else (1 if modo_env in ("archivo", "embebido", "standalone") else 0)
    modo = st.radio("Cómo se carga la herramienta", _opciones, index=_por_defecto,
                    key=f"sunflex-modo-{_q}", label_visibility="collapsed",
                    help="El sondeo lo hace el **servidor** hacia sí mismo: puede dar bien y que su "
                         "navegador no reciba los .js (un proxy que reescribe /app/static/, por "
                         "ejemplo). Si la caja se queda pensando, cambie a «archivo embebido»: la "
                         "herramienta entera viaja dentro del mensaje de la app, sin pedir nada.")
    c1, c2 = st.columns([3, 2])
    if viva and modo.startswith("iframe"):
        c1.link_button("↗ Abrir la herramienta en pestaña nueva", url)
    elif modo.startswith("sin"):
        c1.caption("El botón de abrir en pestaña nueva aparece en los modos con herramienta.")
    c2.download_button("⬇ Descargar la hoja (JSON)",
                       json.dumps(_sheet, ensure_ascii=False, indent=1).encode(),
                       file_name=_nombre_hoja(tool, sel), mime="application/json",
                       key=f"sunflex-descarga-{_q}")
    if modo.startswith("sin"):
        if not viva:
            st.error("Este despliegue no está sirviendo `static/tools/`, así que la herramienta no se "
                     "puede incrustar. **Motivo del sondeo:** " + motivo + ".\n\n"
                     "Se arregla comprobando que en el repo desplegado `app.py`, `.streamlit/config.toml` "
                     "y `static/tools/` estén en la **misma raíz**: si el `Main file path` de la nube es "
                     "`subcarpeta/app.py`, Streamlit busca `.streamlit/` junto a esa subcarpeta y no lo "
                     "encuentra, `enableStaticServing` no se aplica y `/app/static/...` devuelve el HTML "
                     "de la app. Reinicie la app tras corregirlo.")
        st.info("Iframe oculto. Esto es exactamente lo que la herramienta carga al abrir la hoja "
                "(25 hojas = 5 activos × 5 escenarios); en `File → Load` de la herramienta "
                "standalone sirve el JSON descargado de arriba.")
        st.json(_sheet, expanded=1)
        st.caption("Fuentes de la hoja: despacho y topología calculados por `sunflex_model.py` "
                   "(PyPSA + HiGHS); el check `node tools/verify_casepack.mjs` confirma que esta "
                   "misma hoja carga, valida y converge en el motor de la herramienta.")
        return
    if modo.startswith("archivo"):
        solo = RAIZ / "static" / "tools" / tool / "index-sunflex.html"
        if not solo.is_file():
            st.warning("No está generado el archivo embebido (`python3 gen_standalone.py`) y "
                       "además este despliegue no sirve `static/tools/`. Mientras tanto: la hoja "
                       "descargable de arriba.")
            return
        # `st.iframe(Path)` lee el HTML **en el servidor** y lo manda por el canal de la app:
        # el navegador no hace ni una petición más, así que esto funciona aunque el proxy de
        # la nube no deje pasar /app/static/. (~1,2 MB de HTML por rerun: por eso no es el modo
        # por defecto.)
        st.iframe(solo, height=alto)
        with st.expander("Descargas y diagnóstico del modo embebido", expanded=False):
            st.caption("Sondeo interno (lo hace el servidor hacia sí mismo, no su navegador): " + motivo)
            st.download_button("⬇ Bajar la herramienta en un solo archivo HTML (funciona sin servidor)",
                               solo.read_bytes(), file_name=f"{tool}-sunflex.html", mime="text/html",
                               key=f"sunflex-bajar-solo-{_q}")
            st.caption("La hoja y el motor van dentro del mismo archivo; el `<script>` que carga "
                       "`engine/psa-pf.min.js` se resuelve contra el mapa en línea que genera "
                       "`gen_standalone.py`. En la ED queda fuera `highs.wasm` (3,4 MB), que se pide "
                       "a `/app/static/...`: si el proxy lo bloquea, el solver lo dirá y el diagrama "
                       "se pinta igual.")
        return
    st.iframe(f"/app/static/tools/{tool}/index.html?case={quote(sel)}", height=alto)
    with st.expander("Diagnóstico del iframe (sondeo, ruta directa y vigía)", expanded=False):
        st.caption("Sondeo interno (lo hace el servidor hacia sí mismo, no su navegador): " + motivo)
        st.markdown("Ruta directa, por si el iframe no pinta: ")
        st.code(url, language="text")
        st.caption("El HTML incrustado lleva nuestro vigía `sunflex-boot.js`: si el motor no aparece "
                   "en 6 s, **dentro del recuadro** sale un aviso rojo que lista el recurso que faltó y "
                   "da botones para recargar sin caché, abrir en pestaña propia o cambiar de modo. Si "
                   "el recuadro queda en blanco y sin aviso, su navegador no recibió el HTML de la "
                   "herramienta (aunque el sondeo diga que sí): use entonces el modo «archivo "
                   "embebido», que no pide nada.")


with tabs[21]:
    st.markdown("# 🔌 Load Flow Simulator · hojas del proyecto")
    _ops, _i0 = _hojas()
    _sel = st.selectbox("Hoja", _ops, index=_i0, format_func=_etiqueta, key="sunflex-hoja-lf")
    _hm = SM.hoja_meta(_sel) or {}
    if _hm:
        st.caption("Nota de la hoja: " + _hm.get("nota", ""))
    _herramienta("loadflow-simulator", _sel, 880,
                 """<div class="info-box">El simulador open-source (herramienta 1) carga aquí las hojas que
                 generó <code>gen_casepack.py</code> desde el motor PyPSA: <b>25 hojas</b> (5 activos × 5
                 escenarios). Cambie el caso en la barra superior del iframe o desde aquí; puede editar el
                 diagrama y volver a resolver: el motor es PSA.js, un port de PyPSA, así que coincide con
                 Python. Todo local, sin CDN ni analítica.</div>""")

with tabs[22]:
    st.markdown("# ⏱ ED-UC Simulator · el mismo caso como despacho económico")
    _ops2, _i2 = _hojas()
    _sel2 = st.selectbox("Hoja", _ops2, index=_i2, format_func=_etiqueta, key="sunflex-hoja-ed")
    _herramienta("ed-uc-simulator", _sel2, 880,
                 """<div class="info-box">Hojas para la herramienta 2: 24 horas, curva de oferta de la red
                 en tres escalones y modo <b>UC</b> cuando el activo tiene respaldo térmico o flexibilidad
                 conmutada. La hoja no puede valorar la venta de excedentes (no admite costo horario
                 variable), así que ese ingreso se monetiza aparte, en el modelo.</div>""")

with tabs[23]:
    st.markdown("# 🎯 La ventana exigida: operar entre 3 y 8 MW · 12:00–14:00")
    st.markdown("""<div class="info-box">El Anexo 1 del Reto 1 pide operar <b>dentro de la banda de 3–8 MW</b>
    de excedente solar. Esta pestaña muestra la rampa agregada del portafolio y cómo el EMS la mantiene
    dentro de banda usando BESS + carga flexible, con gestión temporal (desplazar a la hora pico).</div>""",
                unsafe_allow_html=True)
    _d = _demo38()
    f2 = go.Figure()
    f2.add_scatter(x=_d["t"], y=_d["exc"], name="Excedente agregado (MW)", fill="tozeroy",
                   line=dict(color="#FFB300"))
    f2.add_scatter(x=_d["t"], y=_d["carga"], name="Capturado (BESS+DR)", line=dict(color="#2E7D32", width=3))
    f2.add_scatter(x=_d["t"], y=_d["vert"], name="Vertido (MW)", line=dict(color="#C62828", width=2))
    f2.add_hrect(y0=3, y1=8, fillcolor="rgba(46,125,50,.08)", line_width=0)
    f2.update_layout(height=360, xaxis_title="hora", legend=dict(orientation="h", y=1.1))
    st.plotly_chart(f2, use_container_width=True)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Excedente del día", f"{_d['excedente_dia_mwh']:.1f} MWh")
    c2.metric("Capturado", f"{_d['capturado_mwh']:.1f} MWh")
    c3.metric("Vertido", f"{_d['vertido_mwh']:.1f} MWh")
    c4.metric("Reducción", f"{float(_d['reduccion_pct']):.1f} %")
    st.markdown(f"""
- Estado de carga del BESS durante la jornada: ver curva inferior; nunca se exige una potencia al sistema
  superior a la que hoy ya se está cortando.
- Regla de despacho del EMS (modo sunflex): `p_bess = max(pv_disponible − min(demanda, capacidad), 0)`,
  con tope de SOC y sin carga desde la red (el enlace de cabecera no admite flujo inverso).
- Energía aprovechable anual estimada con esta rampa: **{_d['energia_anual_mwh']:,.0f} MWh/año**
  (300 días operativos).
    """)
    f3 = go.Figure()
    f3.add_scatter(x=_d["t"], y=_d["soc"], name="SOC BESS (%)", line=dict(color="#1565C0", width=3))
    f3.update_layout(height=240, yaxis_range=[0, 105], margin=dict(l=10, r=10, t=20, b=10))
    st.plotly_chart(f3, use_container_width=True)

with tabs[24]:
    st.markdown("# 💰 Economía: LCOS, presupuesto, cronograma")
    _lc = {p: SM.lcos(*v) for p, v in {"Piloto 0,5 MW / 1 MWh": (0.5, 1.0),
                                       "Escalado 8 MW / 16 MWh": (8.0, 16.0),
                                       "Ventana 3 MW / 6 MWh": (3.0, 6.0)}.items()}
    st.dataframe(pd.DataFrame([dict(tamaño=k, **{a: b for a, b in v.items()}) for k, v in _lc.items()]),
                 use_container_width=True)
    st.caption(f"Supuestos BNEF (2025-2026): pack LFP {_es(SM.BNEF['pack_usd_kwh'])} USD/kWh × factor EPC "
               f"{_es(SM.BNEF['factor_epc'])}, {_es(SM.BNEF['cop_usd'], 0)} COP/USD, degradación 2 %/año, "
               f"TIR de descuento 10,5 %. El LCOS es el costo nivelado de la energía que cicla la batería: "
               f"compite contra el precio evitado en hora punta (340–380 COP/kWh).")
    st.markdown("### Presupuesto del piloto (820 M COP del incentivo Reto 1)")
    _pr = pd.DataFrame(SM.PRESUPUESTO, columns=SM.PRESUPUESTO_COLS)
    _pr = _pr.groupby("categoria", as_index=False)["m_cop"].sum().sort_values("m_cop", ascending=False)
    _pr = pd.concat([_pr, pd.DataFrame([{"categoria": "TOTAL piloto", "m_cop": SM.PRESUPUESTO_TOTAL},
                                        {"categoria": "  · incentivo Reto 1", "m_cop": SM.INCENTIVO_RETO1},
                                        {"categoria": "  · contrapartida del consorcio",
                                         "m_cop": SM.CONTRAPARTIDA}])], ignore_index=True)
    st.dataframe(_pr, use_container_width=True, hide_index=True)
    st.caption(f"El piloto cuesta **{SM.PRESUPUESTO_TOTAL:,.0f} M COP**; el incentivo del Reto 1 cubre "
               f"{SM.INCENTIVO_RETO1:,.0f} M COP y el consorcio aporta {SM.CONTRAPARTIDA:,.0f} M COP "
               f"({100*SM.CONTRAPARTIDA/SM.PRESUPUESTO_TOTAL:.1f} %) en especie (tiempo de ingeniería, "
               "licencia de supervisión y garantía de fabricación del PCS). El detalle línea por línea está "
               "en `sunflex_model.PRESUPUESTO` y en el documento de respuesta.")
    st.markdown("### Costo por línea (para el formulario: costo del piloto por rubros)")
    st.dataframe(pd.DataFrame(SM.PRESUPUESTO, columns=["categoría", "detalle", "M COP"]),
                 use_container_width=True, hide_index=True)
    st.markdown("### Cronograma (6 meses desde el acta de inicio)")
    st.dataframe(pd.DataFrame(SM.CRONOGRAMA, columns=SM.CRONOGRAMA_COLS),
                 use_container_width=True, hide_index=True)
    st.markdown("### Escenarios económicos por activo")
    _eco = []
    for _k in SM.CASOS:
        _rr = _resolver(_k)
        _eco.append({"activo": SM.CASOS[_k].corto, "cap_mw": _rr["cap_mw"],
                     "ahorro_piloto_M": _rr["ahorro_piloto_mcop"], "ahorro_escala_M": _rr["ahorro_escala_mcop"],
                     "extra_MPC_%": _rr["valor_ad_mpc_pct"], "venta_vs_bess_M": _rr["venta_vs_bess_mcop"],
                     "co2_t_año": _rr["metricas"]["piloto"]["co2_t_anio"]})
    st.dataframe(pd.DataFrame(_eco), use_container_width=True, hide_index=True)


# ═══════════════════════════════════════════════════════════════════════════
#  SELO DE BUILD (fuera de las pestañas: se ve al final de todas)
#  Un cuadro de excepción de Streamlit se queda pegado en pantalla cuando el
#  servidor muere, y entonces la página muestra errores de un código que ya no
#  existe. Esta línea permite distinguir eso de un fallo real en un vistazo.
# ═══════════════════════════════════════════════════════════════════════════
@st.cache_data(show_spinner=False)  # el hash ha de ser el de ESTE render: sin ttl
# (una llamada a `git rev-parse` cuesta ~8 ms; si no hubiera git, sale «sin git»)
def _build_info() -> str:
    import subprocess
    import datetime as _dt
    try:
        sha = subprocess.run(["git", "-C", str(RAIZ), "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=15).stdout.strip()
    except Exception:
        sha = ""
    app = RAIZ / "app.py"
    n, m = 0, 0
    try:
        txt = app.read_text(encoding="utf8")
        n, m = len(txt.splitlines()), app.stat().st_mtime
    except Exception:
        pass
    when = _dt.datetime.fromtimestamp(m).strftime("%Y-%m-%d %H:%M") if m else "?"
    return (f"`{sha or 'sin git'}` · `app.py` {n} líneas · escrito {when} · "
            f"{len(tab_names)} pestañas")


st.caption("Build SUNFLEX-EMS · " + _build_info() +
           " · si su pantalla **no** muestra esta línea, lo que ve es una sesión vieja del "
           "navegador: recargue con **Ctrl+Shift+R** (o ejecute `python3 tools/diagnostico.py` "
           "para comparar el commit con el que está sirviendo).")
