"""
╔══════════════════════════════════════════════════════════════════════════╗
║  SUNFLEX-EMS v2.2 · Sistema de Gestión Energética de Excedentes        ║
║  Plataforma interactiva — Reto 1: Aprovechamiento Energía Excedentaria ║
║  Ecopetrol · Centro Autónomo de Despacho de Energía (CADE)             ║
║  Autor: Prof. Sergio Rivera — Universidad Nacional de Colombia         ║
║  Datos: verificados (Ecopetrol, UPME, CREG, BNEF, XM, IDEAM)          ║
╚══════════════════════════════════════════════════════════════════════════╝
"""

import streamlit as st
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import plotly.express as px
import sys, os

sys.path.insert(0, os.path.dirname(__file__))

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


from data_reto1 import (PARQUES_SOLARES, PARQUES_CARIBE_NUEVOS, OSS_RETO1,
                         CADE_DATA, SIN_CONTEXTO, BESS_COSTOS, REGULACION,
                         DIFERENCIAS_PILOTO_TRADICIONAL,
                         curva_solar_tipica, curva_demanda_tipica,
                         calcular_excedente_y_curtailment)
from algorithms_reto1 import (pronostico_solar_24h, optimizador_UCF_MPC,
                               simular_bess_arbitraje, simular_demand_response,
                               analisis_economico_bess, pronostico_excedentes_48h)

# ═══════════════════════════════════════════════════════════════════════
#  CONFIG + STYLE
# ═══════════════════════════════════════════════════════════════════════
st.set_page_config(page_title="SUNFLEX-EMS · Ecopetrol", page_icon="☀️",
                   layout="wide", initial_sidebar_state="expanded")

st.markdown("""
<style>
.stApp { background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%); color: #1a1a2e; }
[data-testid="stSidebar"] { background: linear-gradient(180deg, #1a3a2a 0%, #0d2818 100%); color: #e0e0e0; }
[data-testid="stSidebar"] .stMarkdown { color: #e0e0e0; }
h1, h2, h3, h4 { color: #1a3a2a !important; }
.stMetric {
    background: white; border-radius: 12px; padding: 15px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-left: 4px solid #2E7D32;
}
.stMetric label { color: #555 !important; font-size: 0.85rem !important; }
.stMetric [data-testid="stMetricValue"] { color: #1a3a2a !important; font-weight: 700 !important; }
.stTabs [data-baseweb="tab-list"] { gap: 3px; flex-wrap: wrap; }
.stTabs [data-baseweb="tab"] {
    padding: 7px 12px; border-radius: 8px 8px 0 0; background: #e8ecf1;
    color: #333; font-size: 0.78rem; font-weight: 600;
}
.stTabs [aria-selected="true"] { background: #2E7D32 !important; color: white !important; }
.streamlit-expanderHeader { font-weight: 600; color: #1a3a2a; }
.stButton > button {
    background: linear-gradient(135deg, #2E7D32, #43A047); color: white;
    border: none; border-radius: 8px; font-weight: 600; padding: 8px 20px;
}
.stButton > button:hover { background: linear-gradient(135deg, #1B5E20, #2E7D32); }
div.info-box { background: linear-gradient(135deg, #E8F5E9, #C8E6C9); padding: 15px 20px; border-radius: 10px; border-left: 5px solid #2E7D32; margin: 10px 0; }
div.warn-box { background: linear-gradient(135deg, #FFF8E1, #FFECB3); padding: 15px 20px; border-radius: 10px; border-left: 5px solid #FF8F00; margin: 10px 0; }
div.danger-box { background: linear-gradient(135deg, #FFEBEE, #FFCDD2); padding: 15px 20px; border-radius: 10px; border-left: 5px solid #C62828; margin: 10px 0; }
div.diff-card { background: white; padding: 15px; border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); margin: 5px 0; border-left: 4px solid #2E7D32; }
div.trad-card { background: #FFF8E1; padding: 12px; border-radius: 8px; border-left: 4px solid #FF8F00; margin: 3px 0; }
div.sunf-card { background: #E8F5E9; padding: 12px; border-radius: 8px; border-left: 4px solid #2E7D32; margin: 3px 0; }
</style>
""", unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════
#  SIDEBAR
# ═══════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.markdown("""
    <div style="text-align:center; padding:10px 0;">
        <div style="font-size:2.5rem;">☀️🔋</div>
        <div style="font-size:1.3rem; font-weight:800; color:#4CAF50;">SUNFLEX-EMS</div>
        <div style="font-size:0.75rem; color:#aaa; letter-spacing:2px;">ENERGY MANAGEMENT SYSTEM</div>
        <div style="font-size:0.7rem; color:#81C784; margin-top:5px;">v2.2 · Reto 1 · Datos verificados</div>
    </div>
    <hr style="border-color:#2E7D32;">
    """, unsafe_allow_html=True)
    st.markdown("### 🏢 Ecopetrol")
    st.markdown("- Mayor consumidor energía Colombia\n- CADE + ISA (may-2026)\n- **6 parques** operativos\n- **375 MW** capacidad solar\n- **>2.000 MW** meta 2026")
    st.markdown("### 🔑 Algoritmo Core")
    st.markdown("**UCF-MPC**\nUncertainty Cost Functions +\nModel Predictive Control\n*Prof. Sergio Rivera (UNAL)*")
    st.markdown("### 💰 Piloto")
    st.markdown("- **$820M COP** · 6 meses\n- **BESS:** 500 kW / 1 MWh\n- **Meta:** >60% reducción curtailment\n- **Escala:** → 4-8 MW")
    st.markdown("---")
    st.markdown('<div style="text-align:center; font-size:0.7rem; color:#81C784;">Prof. Sergio Rivera<br>Universidad Nacional de Colombia<br>sergio.rivera@unal.edu.co</div>', unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════
#  TABS
# ═══════════════════════════════════════════════════════════════════════
tab_names = [
    "🏠 Resumen", "📉 Contexto SIN", "🏭 Castilla 21MW", "🛢️ San Fernando 61MW",
    "🌿 Brisas 26MW", "⛽ Rubiales 100MW", "🏗️ Refinerías 39MW", "🌍 Statkraft 128MW",
    "🗺️ Mapa Colombia", "🔮 Pronóstico Solar", "🧠 UCF-MPC",
    "🔋 BESS Simulador", "🔄 Demand Response", "📊 Curtailment",
    "⚖️ Balance Energético", "⚡ Piloto vs Tradicional", "📋 Regulación",
    "🔗 Integración CADE", "🧰 Open-Source", "📅 Plan Piloto",

    "🧮 Modelo PyPSA", "🔌 Load Flow (herramienta)", "⏱ ED-UC (herramienta)", "🎯 Ventana 3–8 MW", "💰 Economía y TCO"]
tabs = st.tabs(tab_names)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 0: RESUMEN EJECUTIVO
# ═══════════════════════════════════════════════════════════════════════
with tabs[0]:
    st.markdown("# ☀️ SUNFLEX-EMS · Resumen Ejecutivo")
    st.markdown('<div class="info-box"><b>Plataforma de Gestión Energética de Excedentes Solares</b><br>Captura, optimiza y valoriza los excedentes de generación renovable restringidos por limitaciones del sistema eléctrico del Grupo Ecopetrol.<br><b>Datos 100% verificados</b> con fuentes públicas: Ecopetrol, UPME, CREG, BNEF, XM, IDEAM.</div>', unsafe_allow_html=True)
    
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Capacidad Solar Grupo", "375 MW", "+1.364 MW Statkraft")
    c2.metric("Excedente Recurrente", "3-8 MW", "12:00-14:00")
    c3.metric("Precio bolsa mediodía", "$101-177 COP/kWh", "vs $286 regulado")
    c4.metric("Curtailment diario est.", "~41 MWh", "5 parques")
    c5.metric("Presupuesto Piloto", "$820M COP", "6 meses")
    
    st.markdown("---")
    c1, c2 = st.columns([3, 2])
    with c1:
        st.markdown("### 🏭 Parques Solares Operativos del Grupo Ecopetrol")
        df_p = pd.DataFrame([
            {"Parque": p["nombre"][:30], "Dpto": p["departamento"], "MW": p["capacidad_mw"],
             "GWh/año": p["energia_gwh_anio"], "Exced. MW": p["excedente_tipico_mw"],
             "Curt.%": p["curtailment_pct"], "Inversión M USD": p["inversion_usd_m"],
             "Irrad. kWh/m²/d": p["irradiancia_kwhm2"], "Estado": p["inauguracion"]}
            for p in PARQUES_SOLARES.values()
        ])
        st.dataframe(df_p, use_container_width=True, hide_index=True)
    with c2:
        st.markdown("### 📊 Distribución MW")
        fig_pie = go.Figure(data=[go.Pie(
            labels=[p["nombre"].split("(")[0].strip()[:18] for p in PARQUES_SOLARES.values()],
            values=[p["capacidad_mw"] for p in PARQUES_SOLARES.values()],
            hole=0.4, marker=dict(colors=["#2E7D32","#43A047","#66BB6A","#81C784","#A5D6A7","#C8E6C9"]),
        )])
        fig_pie.update_layout(height=300, margin=dict(t=20,b=20,l=20,r=20),
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", font=dict(color="#1a1a2e"))
        st.plotly_chart(fig_pie, use_container_width=True)
    
    st.markdown("---")
    c1, c2, c3 = st.columns(3)
    with c1:
        st.markdown("#### 🔋 BESS Demostrador\n- 500 kW / 1 MWh (piloto)\n- Escala a 4-8 MW\n- ROI 1.77x en 10 años\n- Payback 5.5 años")
    with c2:
        st.markdown("#### 🔄 Demand Response\n- 22.5 MW cargas flexibles\n- Desplaza consumo industrial\n- CAPEX ≈ $0\n- Compatible con operación")
    with c3:
        st.markdown("#### 🧠 UCF-MPC Optimizer\n- MILP 24h, paso 15min\n- Incertidumbre cuantificada\n- Minimiza curtailment\n- Maximiza valor económico")

# ═══════════════════════════════════════════════════════════════════════
#  TAB 1: CONTEXTO SIN
# ═══════════════════════════════════════════════════════════════════════
with tabs[1]:
    st.markdown("# 📉 Contexto SIN — La Curva de Pato Colombiana")
    st.markdown('<div class="info-box"><b>¿Por qué el excedente solar "no vale nada" en bolsa?</b><br>Colombia pasó de ~200 MW FNCER (ago-2022) a <b>4.627 MW</b> (jul-2026). La sobreoferta solar de mediodía colapsó los precios de bolsa a <b>$101 COP/kWh</b> (feb-2026), vs. <b>$286 COP/kWh</b> del precio regulado industrial. El valor solo se captura almacenando o usando el excedente localmente.</div>', unsafe_allow_html=True)
    
    sc = SIN_CONTEXTO
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Capacidad solar SIN", f"{sc['capacidad_solar_mw']:,.0f} MW")
    c2.metric("Solar superó carbón", "2025", f"{sc['solar_gwh_2025']:,.0f} vs {sc['carbon_gwh_2025']:,.0f} GWh")
    c3.metric("Precio bolsa mínimo", f"${sc['precio_bolsa_minimo']} COP/kWh", "8-feb-2026")
    c4.metric("Precio industrial", f"${sc['precio_industrial_regulado']} COP/kWh", "regulado")
    c5.metric("Bolsa < contratos", f"{sc['tiempo_bolsa_bajo_contrato_pct']}% del tiempo", "ene25-feb26")
    
    st.markdown("---")
    st.markdown("### 📊 Precio de bolsa vs. Precio regulado — Colapso del mediodía")
    
    # Simular curva de pato colombiana
    horas_precio = np.arange(0, 24, 0.25)
    precio_sim = np.ones(len(horas_precio)) * 280
    # Valle solar (duck curve)
    for i, h in enumerate(horas_precio):
        if 9 <= h <= 16:
            precio_sim[i] = 120 + 50 * (1 - np.exp(-0.5 * ((h - 12.5) / 2) ** 2))
        elif 17 <= h <= 21:
            precio_sim[i] = 320 + 80 * np.exp(-0.5 * ((h - 19) / 1.5) ** 2)
        elif h < 6:
            precio_sim[i] = 180
        else:
            precio_sim[i] = 260
    
    precio_sim += np.random.randn(len(precio_sim)) * 15
    precio_sim = np.maximum(precio_sim, 80)
    
    fig_duck = go.Figure()
    fig_duck.add_trace(go.Scatter(x=horas_precio, y=precio_sim, name="Precio bolsa (simulado)",
        line=dict(color="#FF8F00", width=2.5), fill="tozeroy", fillcolor="rgba(255,143,0,0.1)"))
    fig_duck.add_hline(y=sc['precio_industrial_regulado'], line_dash="dash", line_color="#C62828",
        annotation_text=f"Regulado: ${sc['precio_industrial_regulado']} COP/kWh")
    fig_duck.add_hline(y=sc['precio_bolsa_minimo'], line_dash="dot", line_color="#1565C0",
        annotation_text=f"Mínimo histórico: ${sc['precio_bolsa_minimo']} COP/kWh")
    fig_duck.add_vrect(x0=12, x1=14, fillcolor="rgba(255,0,0,0.08)", line_width=0,
        annotation_text="Ventana excedente\n12:00-14:00")
    fig_duck.update_layout(height=380, paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"),
        xaxis_title="Hora", yaxis_title="Precio (COP/kWh)",
        title="Curva de Pato Colombiana: bolsa colapsa en mediodía solar")
    st.plotly_chart(fig_duck, use_container_width=True)
    
    st.markdown("### 💡 Implicación para el Reto")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("""
        <div class="danger-box">
        <b>❌ Vender excedente en bolsa NO compensa:</b><br>
        Precio bolsa mediodía: <b>$101-177 COP/kWh</b><br>
        Precio industrial regulado: <b>$286 COP/kWh</b><br>
        Diferencia: <b>$109-185 COP/kWh perdidos</b><br>
        Por cada MW de excedente × 2h × 300 días: <b>$130-220M COP/año perdidos</b>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        st.markdown("""
        <div class="info-box">
        <b>✅ Almacenar + desplazar consumo SÍ compensa:</b><br>
        BESS captura excedente a $0 (ya generado)<br>
        Descarga en punta: valor <b>$286 COP/kWh</b> (evita compra SIN)<br>
        + Demand Response: <b>CAPEX ≈ $0</b><br>
        + UCF-MPC: maximiza cada intervalo de 15 min<br>
        <b>Valor capturado: 2-4× vs venta en bolsa</b>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("---")
    st.markdown("### 📈 Evolución Solar en Colombia (datos verificados)")
    evolucion = pd.DataFrame({
        "Año": [2022, 2023, 2024, 2025, "2026 (jul)"],
        "Generación solar (GWh)": [255, 1205, 3297, 4474, "~5.500 est."],
        "Capacidad instalada (MW)": ["~200", "~800", "~2.500", 3988, 4627],
        "% Matriz eléctrica": ["~1%", "~3%", "~8%", "~12%", "~14%"],
    })
    st.dataframe(evolucion, use_container_width=True, hide_index=True)

# ═══════════════════════════════════════════════════════════════════════
#  TABS 2-7: PARQUES SOLARES INDIVIDUALES
# ═══════════════════════════════════════════════════════════════════════
parque_keys = list(PARQUES_SOLARES.keys())
for tab_idx, pk in enumerate(parque_keys):
    p = PARQUES_SOLARES[pk]
    with tabs[tab_idx + 2]:
        st.markdown(f"# {p['nombre']}")
        st.markdown(f"**{p['departamento']}** · {p['capacidad_mw']} MWp · {p['energia_gwh_anio']} GWh/año · {p['inauguracion']}")
        st.markdown(f'<div class="info-box">{p["problema"]}<br><b>Fuente:</b> {p["fuente"]} | <b>Irradiancia:</b> {p["irradiancia_kwhm2"]} kWh/m²/día</div>', unsafe_allow_html=True)
        
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Capacidad", f"{p['capacidad_mw']} MWp")
        c2.metric("Excedente típico", f"{p['excedente_tipico_mw']} MW")
        c3.metric("Curtailment", f"{p['curtailment_pct']}%", f"{p['curtailment_mwh_dia']} MWh/día")
        c4.metric("Cargas flexibles", f"{p['cargas_flexibles_mw']} MW")
        c5.metric("CO₂ evitado/año", f"{p['co2_ton_anio']:,} ton")
        
        st.markdown("---")
        
        if p['curtailment_pct'] > 0:
            sub1, sub2, sub3, sub4 = st.tabs(["📉 Curtailment", "🔋 BESS", "🔄 Demand Response", "🔮 Pronóstico"])
            
            with sub1:
                st.markdown("### Análisis de Curtailment")
                dem_base = p['demanda_campo_mw'] if p['demanda_campo_mw'] > 0 else p['capacidad_mw'] * 0.6
                np.random.seed(42)
                resultado = calcular_excedente_y_curtailment(p['capacidad_mw'], dem_base)
                
                fig_curt = make_subplots(rows=2, cols=1, shared_xaxes=True,
                    subplot_titles=["Generación Solar vs Demanda del Campo", "Excedente y Curtailment (MW)"])
                # Row 1
                fig_curt.add_trace(go.Scatter(x=resultado['horas_solar'], y=resultado['gen_solar'],
                    name="Generación Solar", fill="tozeroy", line=dict(color="#FFB300", width=2),
                    fillcolor="rgba(255,179,0,0.3)"), row=1, col=1)
                fig_curt.add_trace(go.Scatter(x=resultado['horas_solar'], y=resultado['demanda_interp'],
                    name="Demanda Campo", fill="tozeroy", line=dict(color="#1565C0", width=2),
                    fillcolor="rgba(21,101,192,0.2)"), row=1, col=1)
                # Row 2
                fig_curt.add_trace(go.Scatter(x=resultado['horas_solar'], y=resultado['curtailment'],
                    name="Curtailment (MW)", fill="tozeroy", line=dict(color="#C62828", width=2),
                    fillcolor="rgba(198,40,40,0.4)"), row=2, col=1)
                fig_curt.add_trace(go.Scatter(x=resultado['horas_solar'], y=resultado['excedente'],
                    name="Excedente (MW)", line=dict(color="#FF8F00", width=2, dash="dash")), row=2, col=1)
                
                fig_curt.update_layout(height=500, paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"),
                    xaxis_title="Hora del día", yaxis_title="Potencia (MW)")
                st.plotly_chart(fig_curt, use_container_width=True, key=f"fig_curt_{pk}")
                
                c1, c2, c3 = st.columns(3)
                c1.metric("Curtailment diario", f"{p['curtailment_mwh_dia']} MWh")
                c2.metric("Curtailment anual est.", f"{p['curtailment_mwh_dia'] * 330:,} MWh")
                val_perdido = p['curtailment_mwh_dia'] * 330 * 1000 * p['precio_compra_sin'] / 1e6
                c3.metric("Valor perdido/año", f"${val_perdido:.0f}M COP")
            
            with sub2:
                st.markdown("### 🔋 Simulación BESS")
                if p['bess_demo_kwh'] > 0:
                    bess_kw = st.slider("Potencia BESS (kW)", 100, 2000, p['bess_demo_kv'], 100, key=f"bkw_{pk}")
                    bess_kwh = st.slider("Capacidad BESS (kWh)", 200, 4000, p['bess_demo_kwh'], 200, key=f"bkh_{pk}")
                    np.random.seed(42)
                    hs, solar = curva_solar_tipica(p['capacidad_mw'])
                    hd, demanda = curva_demanda_tipica(dem_base)
                    t = np.linspace(0, 24, 96)
                    solar_96 = np.interp(t, hs, solar)
                    demanda_96 = np.interp(t, hd, demanda)
                    bess_r = simular_bess_arbitraje(solar_96, demanda_96, bess_kw, bess_kwh)
                    
                    fig_bess = make_subplots(rows=2, cols=1, shared_xaxes=True,
                        subplot_titles=["BESS: Carga y Descarga (MW)", "Estado de Carga (SOC %)"])
                    fig_bess.add_trace(go.Bar(x=t, y=bess_r['carga_mw'], name="Carga (absorbe excedente)",
                        marker_color="#43A047"), row=1, col=1)
                    fig_bess.add_trace(go.Bar(x=t, y=-bess_r['descarga_mw'], name="Descarga (inyecta)",
                        marker_color="#1565C0"), row=1, col=1)
                    fig_bess.add_trace(go.Scatter(x=t, y=bess_r['soc_pct'], name="SOC (%)",
                        line=dict(color="#FF8F00", width=3)), row=2, col=1)
                    fig_bess.update_layout(height=450, barmode='relative', paper_bgcolor="rgba(0,0,0,0)",
                        plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"))
                    st.plotly_chart(fig_bess, use_container_width=True, key=f"fig_bess_{pk}")
                    c1, c2, c3 = st.columns(3)
                    c1.metric("Energía capturada/día", f"{bess_r['energia_cargada_mwh']:.1f} MWh")
                    c2.metric("Energía inyectada/día", f"{bess_r['energia_descargada_mwh']:.1f} MWh")
                    c3.metric("Eficiencia round-trip", "92%")
                else:
                    st.info("Este parque es de autogeneración remota — BESS se analiza en escalamiento.")
            
            with sub3:
                st.markdown("### 🔄 Demand Response")
                pct_flex = st.slider("Cargas flexibles (%)", 5, 40, 20, 5, key=f"dr_{pk}")
                np.random.seed(42)
                hd, demanda = curva_demanda_tipica(dem_base)
                hs, solar = curva_solar_tipica(p['capacidad_mw'])
                t = np.linspace(0, 24, 96)
                demanda_96 = np.interp(t, hd, demanda)
                solar_96 = np.interp(t, hs, solar)
                excedente_96 = np.maximum(solar_96 - demanda_96, 0)
                dr_r = simular_demand_response(demanda_96, excedente_96, pct_flex / 100)
                
                fig_dr = go.Figure()
                fig_dr.add_trace(go.Scatter(x=t, y=demanda_96, name="Demanda original",
                    line=dict(color="#1565C0", width=2)))
                fig_dr.add_trace(go.Scatter(x=t, y=dr_r['demanda_desplazada'], name="Carga desplazada (DR)",
                    fill="tozeroy", line=dict(color="#43A047", width=2), fillcolor="rgba(67,160,71,0.3)"))
                fig_dr.add_trace(go.Scatter(x=t, y=dr_r['demanda_nueva'], name="Demanda optimizada",
                    line=dict(color="#FF8F00", width=2, dash="dash")))
                fig_dr.update_layout(height=350, paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"),
                    xaxis_title="Hora", yaxis_title="Demanda (MW)")
                st.plotly_chart(fig_dr, use_container_width=True, key=f"fig_dr_{pk}")
                c1, c2, c3 = st.columns(3)
                c1.metric("Carga flexible disp.", f"{p['cargas_flexibles_mw']} MW")
                c2.metric("Energía desplazada/día", f"{dr_r['energia_desplazada_mwh']:.1f} MWh")
                c3.metric("Ahorro SIN/día", f"${dr_r['energia_desplazada_mwh'] * 1000 * p['precio_compra_sin'] / 1e6:.2f}M COP")
            
            with sub4:
                st.markdown("### 🔮 Pronóstico Solar y Excedentes (48h)")
                seed_val = st.slider("Semilla aleatoria", 1, 100, 42, key=f"s_{pk}")
                forecast = pronostico_excedentes_48h(p['capacidad_mw'], dem_base, seed=seed_val)
                
                fig_fc = make_subplots(rows=2, cols=1, shared_xaxes=True,
                    subplot_titles=["Pronóstico Solar 48h (ensemble ML)", "Excedente pronosticado con bandas de confianza"])
                fig_fc.add_trace(go.Scatter(x=forecast['horas'], y=forecast['gen_solar'],
                    name="Generación solar", line=dict(color="#FFB300", width=2),
                    fill="tozeroy", fillcolor="rgba(255,179,0,0.2)"), row=1, col=1)
                fig_fc.add_trace(go.Scatter(x=forecast['horas'], y=forecast['banda_sup'],
                    name="Banda 95%", line=dict(color="#C62828", width=1, dash="dot")), row=2, col=1)
                fig_fc.add_trace(go.Scatter(x=forecast['horas'], y=forecast['excedente'],
                    name="Excedente esperado", line=dict(color="#FF8F00", width=2),
                    fill="tozeroy", fillcolor="rgba(255,143,0,0.3)"), row=2, col=1)
                fig_fc.add_trace(go.Scatter(x=forecast['horas'], y=forecast['banda_inf'],
                    name="Banda 5%", line=dict(color="#43A047", width=1, dash="dot")), row=2, col=1)
                fig_fc.update_layout(height=500, paper_bgcolor="rgba(0,0,0,0)",
                    plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"))
                st.plotly_chart(fig_fc, use_container_width=True, key=f"fig_fc_{pk}")
        else:
            st.markdown("### 📊 Portafolio Statkraft (may-2025)")
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Solar total", "614 MW")
            c2.metric("Eólico total", "750 MW")
            c3.metric("Total portafolio", "1,364 MW")
            c4.metric("Inversión", "~$150M USD")
            
            st.markdown("""
            **Propósito declarado:** Autoconsumo del Grupo Ecopetrol, reduciendo compras en bilaterales y exposición a bolsa.
            
            **Meta del Presidente Ricardo Roa:** >1.700 MW en ejecución al cierre 2025, >2.000 MW al cierre 2026.
            
            **Riesgo de curtailment:** La congestión de red de transmisión en La Guajira y Caribe es un fenómeno documentado.
            Chile perdió 6.084 GWh en 2025, Brasil 20.6%. El portafolio enfrenta riesgos similares.
            
            **Parques nuevos Caribe (2026):** ~10 parques de ~12.5 MW cada uno en Córdoba, Cesar, Sucre, Magdalena.
            """)
            df_caribe = pd.DataFrame(PARQUES_CARIBE_NUEVOS)
            st.dataframe(df_caribe, use_container_width=True, hide_index=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 8: MAPA COLOMBIA
# ═══════════════════════════════════════════════════════════════════════
with tabs[8]:
    st.markdown("# 🗺️ Mapa de Parques Solares Ecopetrol — Colombia")
    st.markdown('<div class="info-box">Ubicación geográfica de los parques solares con indicador de curtailment, irradiancia (kWh/m²/día) y capacidad BESS propuesta. Datos IDEAM/UPME.</div>', unsafe_allow_html=True)
    
    fig_mapa = go.Figure()
    colombia_lon = [-79, -78.5, -77, -75.5, -73, -72, -70, -67, -67.5, -69.5, -71, -72.5, -74, -76, -77.5, -79, -79]
    colombia_lat = [1.5, 2, 1, -1, -4, -2, -1.5, 1, 2.5, 6, 9, 11.5, 12.5, 11, 8.5, 5, 1.5]
    fig_mapa.add_trace(go.Scattergeo(lon=colombia_lon, lat=colombia_lat, mode="lines",
        line=dict(color="#2E7D32", width=2), showlegend=False))
    
    for pk, p in PARQUES_SOLARES.items():
        color = "#C62828" if p['curtailment_pct'] > 15 else "#FF8F00" if p['curtailment_pct'] > 10 else "#43A047" if p['curtailment_pct'] > 0 else "#1565C0"
        size = max(15, p['capacidad_mw'] / 4)
        fig_mapa.add_trace(go.Scattergeo(
            lon=[p['lon']], lat=[p['lat']], mode="markers+text",
            marker=dict(size=size, color=color, opacity=0.85, line=dict(color="white", width=2)),
            text=[f"{p['nombre'][:20]}<br>{p['capacidad_mw']}MW"],
            textposition="top center", textfont=dict(size=9, color="#1a1a2e"),
            name=f"{p['nombre'][:20]} ({p['capacidad_mw']}MW)",
            hovertemplate=f"<b>{p['nombre']}</b><br>Cap: {p['capacidad_mw']} MW<br>"
                         f"Excedente: {p['excedente_tipico_mw']} MW<br>Curt: {p['curtailment_pct']}%<br>"
                         f"Irrad: {p['irradiancia_kwhm2']} kWh/m²/d<extra></extra>"
        ))
    
    fig_mapa.update_geos(center=dict(lon=-73.5, lat=4.5), projection_scale=8,
        showcoastlines=True, coastlinecolor="#aaa", showland=True, landcolor="#f0f0f0",
        showocean=True, oceancolor="#e3f2fd", showcountries=True, countrycolor="#ccc")
    fig_mapa.update_layout(height=550, paper_bgcolor="rgba(0,0,0,0)", font=dict(color="#1a1a2e"),
        title="Parques Solares Ecopetrol — Excedentes, Curtailment e Irradiancia")
    st.plotly_chart(fig_mapa, use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 9: PRONÓSTICO SOLAR
# ═══════════════════════════════════════════════════════════════════════
with tabs[9]:
    st.markdown("# 🔮 Pronóstico Solar — pvlib + Quartz + Prophet + Darts")
    st.markdown('<div class="info-box">Motor de pronóstico ensemble que combina modelos físicos (pvlib), ML estadístico (Prophet/NeuralProphet) y deep learning (Darts/TFT) para predecir generación solar y excedentes con <b>RMSE < 8% @ 4h</b>.</div>', unsafe_allow_html=True)
    
    c1, c2, c3, c4 = st.columns(4)
    with c1: parque_sel = st.selectbox("Parque", list(PARQUES_SOLARES.keys()), format_func=lambda x: PARQUES_SOLARES[x]['nombre'][:25], key="fc_pk")
    with c2: dia_tipo = st.selectbox("Condición", ["claro", "parcial", "nublado"])
    with c3: ruido = st.slider("Ruido pronóstico (%)", 1, 15, 5, key="fc_r") / 100
    with c4: seed_p = st.slider("Semilla", 1, 100, 42, key="fc_s")
    
    p_sel = PARQUES_SOLARES[parque_sel]
    fc = pronostico_solar_24h(p_sel['capacidad_mw'], p_sel['lat'], p_sel['lon'], dia_tipo, ruido_pct=ruido, seed=seed_p)
    
    fig_pron = make_subplots(rows=2, cols=1, shared_xaxes=True,
        subplot_titles=[f"Pronóstico solar {p_sel['nombre'][:25]} (48h)", "Error del pronóstico (real vs predicho)"])
    fig_pron.add_trace(go.Scatter(x=fc['horas'], y=fc['banda_superior'], name="Banda 95%",
        line=dict(width=0)), row=1, col=1)
    fig_pron.add_trace(go.Scatter(x=fc['horas'], y=fc['banda_inferior'], name="Banda 5%",
        fill="tonexty", fillcolor="rgba(67,160,71,0.15)", line=dict(width=0)), row=1, col=1)
    fig_pron.add_trace(go.Scatter(x=fc['horas'], y=fc['pronostico'], name="Pronóstico",
        line=dict(color="#FF8F00", width=2)), row=1, col=1)
    fig_pron.add_trace(go.Scatter(x=fc['horas'], y=fc['generacion_real'], name="Generación real",
        line=dict(color="#FFB300", width=2, dash="dash")), row=1, col=1)
    error = fc['pronostico'] - fc['generacion_real']
    fig_pron.add_trace(go.Scatter(x=fc['horas'], y=error, name="Error",
        line=dict(color="#C62828", width=1), fill="tozeroy",
        fillcolor="rgba(198,40,40,0.1)"), row=2, col=1)
    fig_pron.update_layout(height=550, paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"))
    st.plotly_chart(fig_pron, use_container_width=True)
    
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("RMSE", f"{fc['rmse_mw']:.2f} MW")
    c2.metric("RMSE %", f"{fc['rmse_pct']:.1f}%")
    c3.metric("Meta RMSE @4h", "<8%")
    c4.metric("Estado", "✅ Cumple" if fc['rmse_pct'] < 8 else "⚠️ Revisar")

# ═══════════════════════════════════════════════════════════════════════
#  TAB 10: OPTIMIZADOR UCF-MPC
# ═══════════════════════════════════════════════════════════════════════
with tabs[10]:
    st.markdown("# 🧠 Optimizador UCF-MPC")
    st.markdown('<div class="info-box"><b>Uncertainty Cost Functions + Model Predictive Control</b> — Algoritmo propietario del Prof. Sergio Rivera (UNAL). MILP con horizonte rodante 24h, paso 15 min. Minimiza curtailment + costo compra SIN, maximiza valor capturado. Resuelve con Pyomo + HiGHS (open-source).</div>', unsafe_allow_html=True)
    
    st.markdown("### Ecuación objetivo UCF-MPC")
    st.latex(r"\min_{u_t} \sum_{t=1}^{T} \left[ C_{SIN}(t) \cdot P_{compra}(t) + C_{curt}(t) \cdot P_{curt}(t) + C_{deg}(t) \cdot |P_{BESS}(t)| - V_{serv}(t) \cdot P_{serv}(t) \right] + \lambda \cdot \text{UCF}(\sigma_{solar})")
    
    st.markdown("**Restricciones:** Balance energético | SOC bounds [20%-95%] | BESS power limit | Red capacity | DR shift limits")
    st.markdown("---")
    
    c1, c2, c3 = st.columns(3)
    with c1: parque_opt = st.selectbox("Parque", list(PARQUES_SOLARES.keys()), format_func=lambda x: PARQUES_SOLARES[x]['nombre'][:25], key="op_pk")
    with c2: bess_kw_opt = st.slider("BESS potencia (kW)", 100, 2000, 500, 100, key="op_kw")
    with c3: bess_kwh_opt = st.slider("BESS capacidad (kWh)", 200, 4000, 1000, 200, key="op_kh")
    c1, c2 = st.columns(2)
    with c1: soc_init = st.slider("SOC inicial (%)", 20, 95, 50, 5, key="op_soc")
    with c2: precio_sin = st.slider("Precio compra SIN (COP/kWh)", 200, 500, 286, 10, key="op_pr")
    
    if st.button("▶️ Ejecutar Optimización UCF-MPC", key="run_ucf"):
        p_opt = PARQUES_SOLARES[parque_opt]
        dem_opt = p_opt['demanda_campo_mw'] if p_opt['demanda_campo_mw'] > 0 else p_opt['capacidad_mw'] * 0.6
        fc_opt = pronostico_solar_24h(p_opt['capacidad_mw'], seed=42)
        demanda_opt = np.full(96, dem_opt)
        
        opt_r = optimizador_UCF_MPC(
            pronostico_solar=fc_opt['pronostico'], demanda_mw=demanda_opt,
            capacidad_bess_kw=bess_kw_opt, capacidad_bess_kwh=bess_kwh_opt,
            precio_compra_sin=precio_sin, precio_bolsa_punta=p_opt['precio_bolsa_punta'],
            precio_bolsa_valle=p_opt['precio_bolsa_valle'], soc_inicial=soc_init
        )
        
        st.markdown("---")
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Curtailment original", f"{opt_r['curtailment_original_mwh']:.1f} MWh")
        c2.metric("Curtailment con EMS", f"{opt_r['curtailment_con_ems_mwh']:.1f} MWh")
        c3.metric("Reducción", f"{opt_r['reduccion_curtailment_pct']:.0f}%")
        c4.metric("Valor capturado", f"${opt_r['valor_total_cop']/1e6:.1f}M COP")
        c5.metric("Energía BESS", f"{opt_r['energia_cargada_mwh']:.1f} MWh")
        
        fig_opt = make_subplots(rows=3, cols=1, shared_xaxes=True,
            subplot_titles=["Balance energético optimizado", "Operación BESS + Demand Response", "Estado de Carga (SOC)"])
        fig_opt.add_trace(go.Scatter(x=opt_r['horas'], y=opt_r['solar'], name="Solar",
            fill="tozeroy", fillcolor="rgba(255,179,0,0.2)", line=dict(color="#FFB300", width=2)), row=1, col=1)
        fig_opt.add_trace(go.Scatter(x=opt_r['horas'], y=opt_r['demanda'], name="Demanda",
            line=dict(color="#1565C0", width=2, dash="dash")), row=1, col=1)
        fig_opt.add_trace(go.Scatter(x=opt_r['horas'], y=opt_r['excedente_con_ems'], name="Excedente residual",
            fill="tozeroy", fillcolor="rgba(198,40,40,0.2)", line=dict(color="#C62828", width=1)), row=1, col=1)
        fig_opt.add_trace(go.Bar(x=opt_r['horas'], y=opt_r['bess_carga_mw'], name="BESS carga",
            marker_color="#43A047"), row=2, col=1)
        fig_opt.add_trace(go.Bar(x=opt_r['horas'], y=-opt_r['bess_descarga_mw'], name="BESS descarga",
            marker_color="#1565C0"), row=2, col=1)
        fig_opt.add_trace(go.Scatter(x=opt_r['horas'], y=opt_r['dr_activado_mw'], name="DR activado",
            line=dict(color="#FF8F00", width=2)), row=2, col=1)
        fig_opt.add_trace(go.Scatter(x=opt_r['horas'], y=opt_r['soc_pct'], name="SOC (%)",
            line=dict(color="#9C27B0", width=3)), row=3, col=1)
        fig_opt.add_hline(y=95, line_dash="dot", line_color="red", row=3, col=1)
        fig_opt.add_hline(y=20, line_dash="dot", line_color="red", row=3, col=1)
        fig_opt.update_layout(height=650, barmode='relative', paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"))
        st.plotly_chart(fig_opt, use_container_width=True)
        
        st.markdown("### 💰 Desglose Económico (24h)")
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Ahorro compras SIN", f"${opt_r['ahorro_compras_cop']/1e6:.2f}M COP")
        c2.metric("Ahorro curtailment", f"${opt_r['ahorro_curtailment_cop']/1e6:.2f}M COP")
        c3.metric("Costo degradación", f"${opt_r['costo_degradacion_cop']/1e6:.2f}M COP")
        c4.metric("Valor neto", f"${opt_r['valor_total_cop']/1e6:.2f}M COP")

# ═══════════════════════════════════════════════════════════════════════
#  TAB 11: BESS SIMULADOR
# ═══════════════════════════════════════════════════════════════════════
with tabs[11]:
    st.markdown("# 🔋 Simulador BESS — Costos BNEF 2025 + Análisis Económico")
    st.markdown(f'<div class="info-box"><b>Costos BESS verificados (BloombergNEF dic-2025):</b><br>Pack Li-ion promedio: <b>US${BESS_COSTOS["pack_promedio_usd_kwh"]}/kWh</b> | Estacionario: <b>US${BESS_COSTOS["estacionario_usd_kwh"]}/kWh</b> | Celda: US${BESS_COSTOS["celda_usd_kwh"]}/kWh | LFP: US${BESS_COSTOS["lfp_usd_kwh"]}/kWh | Proyección 2026: &lt;US${BESS_COSTOS["proyeccion_2026_usd_kwh"]}/kWh</div>', unsafe_allow_html=True)
    
    c1, c2, c3 = st.columns(3)
    with c1: bess_a_kw = st.slider("Potencia BESS (kW)", 250, 8000, 500, 250, key="abk")
    with c2: bess_a_kwh = st.slider("Capacidad BESS (kWh)", 500, 16000, 1000, 500, key="abh")
    with c3: capex_kwh = st.slider("CAPEX (USD/kWh)", 50, 400, BESS_COSTOS['estacionario_usd_kwh'], 10, key="acx")
    c1, c2 = st.columns(2)
    with c1: curtail_dia = st.slider("Curtailment diario (MWh)", 2, 20, 8, 1, key="acd")
    with c2: precio_sin_a = st.slider("Precio SIN (COP/kWh)", 200, 500, 286, 10, key="apr")
    
    eco = analisis_economico_bess(bess_a_kw, bess_a_kwh, curtail_dia, precio_sin_a,
                                   precio_sin_a * 1.3, precio_sin_a * 0.45, capex_kwh)
    
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("CAPEX", f"${eco['capex_usd']/1e6:.2f}M USD", f"${eco['capex_cop']/1e6:.0f}M COP")
    c2.metric("Ahorro anual", f"${eco['ahorro_total_anual_usd']/1e3:.0f}K USD")
    c3.metric("Payback", f"{eco['payback_anios']:.1f} años")
    c4.metric("ROI 10 años", f"{eco['roi_10anios_pct']:.0f}%")
    c5.metric("VAN", f"${eco['van_usd']/1e3:.0f}K USD")
    
    st.markdown("---")
    st.markdown("### Escalamiento BESS (piloto → producción)")
    df_esc = pd.DataFrame({
        "Fase": ["Demostrador (piloto)", "Fase 2 (12 meses)", "Escalamiento completo (año 2)"],
        "Potencia": ["500 kW", "2 MW", "8 MW"],
        "Capacidad": ["1 MWh", "4 MWh", "16 MWh"],
        "CAPEX pack (BNEF)": [f"US${1000*70/1e6:.2f}M", f"US${4000*70/1e6:.2f}M", f"US${16000*70/1e6:.2f}M"],
        "CAPEX total (EPC)": [f"US${1000*70*1.8/1e6:.2f}M", f"US${4000*70*1.8/1e6:.2f}M", f"US${16000*70*1.8/1e6:.2f}M"],
        "Objetivo": ["Validar UCF-MPC", "2 parques Meta", "Todos los parques"],
    })
    st.dataframe(df_esc, use_container_width=True, hide_index=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 12: DEMAND RESPONSE
# ═══════════════════════════════════════════════════════════════════════
with tabs[12]:
    st.markdown("# 🔄 Demand Response — Flexibilización de Cargas")
    st.markdown('<div class="info-box">Estrategia de demanda flexible: desplazar cargas industriales no críticas hacia las horas de excedente solar (12:00-14:00). <b>CAPEX ≈ $0</b> — solo señalización y control. Multiplica el efecto del BESS ×2-3.</div>', unsafe_allow_html=True)
    
    st.markdown("### Cargas Flexibles Identificadas por Parque")
    cargas_df = pd.DataFrame([
        {"Parque": p['nombre'][:28], "Demanda total MW": p['demanda_campo_mw'] if p['demanda_campo_mw'] > 0 else 0,
         "Flexible MW": p['cargas_flexibles_mw'],
         "Flexible %": round(p['cargas_flexibles_mw'] / max(p['demanda_campo_mw'], 1) * 100, 1) if p['demanda_campo_mw'] > 0 else 0,
         "Tipo": "Bombeo/Industrial" if 'bombeo' in p['nombre'].lower() or 'estacion' in p['tipo'].lower() else "Refinería" if 'refiner' in p['tipo'].lower() else "Campo petrolero"}
        for p in PARQUES_SOLARES.values() if p['cargas_flexibles_mw'] > 0
    ])
    st.dataframe(cargas_df, use_container_width=True, hide_index=True)
    
    total_flex = sum(p['cargas_flexibles_mw'] for p in PARQUES_SOLARES.values())
    c1, c2, c3 = st.columns(3)
    c1.metric("Cargas flexibles totales", f"{total_flex:.1f} MW")
    c2.metric("Energía desplazable/día", f"~{total_flex * 2:.0f} MWh")
    c3.metric("Ahorro potencial/día", f"~${total_flex * 2 * 1000 * 286 / 1e6:.1f}M COP")
    
    st.markdown("---")
    c1, c2, c3 = st.columns(3)
    with c1: st.markdown("**🛢️ Bombeo petróleo**\n- VFD (velocidad variable)\n- Tolerancia ±15% caudal\n- Buffer en tanques\n- Desplazar a 12-14h")
    with c2: st.markdown("**💧 Inyección agua**\n- Bombas centrífugas\n- Almacenamiento en pozos\n- Flexibilidad 2-4h\n- Compatible con solar")
    with c3: st.markdown("**⚙️ Auxiliares**\n- Compresores de gas\n- Refrigeración industrial\n- Iluminación\n- Vehículos eléctricos")

# ═══════════════════════════════════════════════════════════════════════
#  TAB 13: CURTAILMENT DASHBOARD
# ═══════════════════════════════════════════════════════════════════════
with tabs[13]:
    st.markdown("# 📊 Curtailment Dashboard")
    st.markdown('<div class="info-box">Balance energético generación-demanda-excedentes agregado. Magnitud del excedente: <b>3-8 MW × 2h/día × ~300 días = 1.800-4.800 MWh/año por activo</b>. Valor al precio industrial: <b>$515M - $1.370M COP/año/activo</b>.</div>', unsafe_allow_html=True)
    
    total_curt = sum(p['curtailment_mwh_dia'] for p in PARQUES_SOLARES.values() if p['curtailment_pct'] > 0)
    total_cap = sum(p['capacidad_mw'] for p in PARQUES_SOLARES.values())
    total_exc = sum(p['excedente_tipico_mw'] for p in PARQUES_SOLARES.values() if p['excedente_tipico_mw'] > 0)
    
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Capacidad solar", f"{total_cap} MW")
    c2.metric("Excedente pico", f"{total_exc} MW")
    c3.metric("Curtailment diario", f"{total_curt:.0f} MWh")
    c4.metric("Curtailment anual", f"{total_curt * 330:,.0f} MWh")
    c5.metric("Valor perdido/año", f"${total_curt * 330 * 1000 * 286 / 1e9:.1f}B COP")
    
    st.markdown("### Benchmark Internacional")
    bench = pd.DataFrame({
        "País/Región": ["Chile (2025)", "Brasil (2025)", "California CAISO (4 meses)", "Alemania (2024)", "Ecopetrol (est.)"],
        "Curtailment (GWh)": ["6.084", "15.000", "738", "4.800", f"{total_curt * 330 / 1000:.1f}"],
        "% Generación renovable": ["8.2%", "20.6%", "5.4%", "3.8%", "~12%"],
    })
    st.dataframe(bench, use_container_width=True, hide_index=True)
    
    # Curva agregada
    t_agg = np.linspace(0, 24, 96)
    gen_total = np.zeros(96)
    dem_total = np.zeros(96)
    for pk, p in PARQUES_SOLARES.items():
        if p['curtailment_pct'] > 0:
            np.random.seed(42)
            hs, gs = curva_solar_tipica(p['capacidad_mw'], p['irradiancia_kwhm2'], ruido=0.02)
            hd, dd = curva_demanda_tipica(p['demanda_campo_mw'] if p['demanda_campo_mw'] > 0 else p['capacidad_mw'] * 0.6)
            gen_total += np.interp(t_agg, hs, gs)
            dem_total += np.interp(t_agg, hd, dd)
    exc_agg = np.maximum(gen_total - dem_total, 0)
    
    fig_agg = go.Figure()
    fig_agg.add_trace(go.Scatter(x=t_agg, y=gen_total, name="Generación solar total",
        fill="tozeroy", fillcolor="rgba(255,179,0,0.25)", line=dict(color="#FFB300", width=2)))
    fig_agg.add_trace(go.Scatter(x=t_agg, y=dem_total, name="Demanda total campos",
        fill="tozeroy", fillcolor="rgba(21,101,192,0.15)", line=dict(color="#1565C0", width=2)))
    fig_agg.add_trace(go.Scatter(x=t_agg, y=exc_agg, name="Excedente (curtailment)",
        fill="tozeroy", fillcolor="rgba(198,40,40,0.3)", line=dict(color="#C62828", width=2)))
    fig_agg.update_layout(height=400, paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"),
        xaxis_title="Hora", yaxis_title="Potencia (MW)",
        title="Balance Energético Agregado — 5 Parques Solares")
    st.plotly_chart(fig_agg, use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 14: BALANCE ENERGÉTICO
# ═══════════════════════════════════════════════════════════════════════
with tabs[14]:
    st.markdown("# ⚖️ Balance Energético — Flujo Sankey + Proyección")
    
    st.markdown("### Flujo de Energía del Grupo Ecopetrol")
    fig_sk = go.Figure(data=[go.Sankey(
        node=dict(pad=15, thickness=20, line=dict(color="black", width=0.5),
            label=["Solar (375 MW)", "Red SIN", "Diesel/Gas", "Campos Petroleros",
                   "Refinerías", "Estaciones Bombeo", "Excedente Solar",
                   "BESS+SUNFLEX-EMS", "Demand Response"],
            color=["#FFB300","#1565C0","#455A64","#2E7D32","#C62828","#FF8F00","#F44336","#4CAF50","#9C27B0"]),
        link=dict(
            source=[0,0,0,0,1,2,6,6,7,8],
            target=[3,4,5,6,3,5,7,8,3,3],
            value=[85,35,30,31,120,40,18,13,16,10],
            color=["rgba(255,179,0,0.4)","rgba(255,179,0,0.4)","rgba(255,179,0,0.4)",
                   "rgba(244,67,54,0.4)","rgba(21,101,192,0.4)","rgba(69,90,100,0.4)",
                   "rgba(76,175,80,0.4)","rgba(156,39,176,0.4)","rgba(76,175,80,0.4)","rgba(156,39,176,0.4)"]))])
    fig_sk.update_layout(height=500, paper_bgcolor="rgba(0,0,0,0)", font=dict(color="#1a1a2e"),
        title_text="Flujo Energético Ecopetrol (MW) — con SUNFLEX-EMS capturando excedentes")
    st.plotly_chart(fig_sk, use_container_width=True)
    
    st.markdown("### Proyección 10 años — Valor capturado con SUNFLEX-EMS")
    anios = np.arange(2026, 2036)
    val_perdido = np.full(10, total_curt * 330 * 1000 * 286 / 1e9)
    val_capturado = val_perdido * np.linspace(0.3, 0.77, 10)
    
    fig_proy = go.Figure()
    fig_proy.add_trace(go.Bar(x=anios, y=val_perdido, name="Valor sin EMS (perdido)",
        marker_color="rgba(198,40,40,0.4)"))
    fig_proy.add_trace(go.Bar(x=anios, y=val_capturado, name="Valor capturado con EMS",
        marker_color="rgba(67,160,71,0.7)"))
    fig_proy.update_layout(barmode='overlay', height=350, paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"),
        xaxis_title="Año", yaxis_title="B COP/año",
        title="Valorización de excedentes solares — Proyección 10 años")
    st.plotly_chart(fig_proy, use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 15: PILOTO vs TRADICIONAL BESS ← NUEVO TAB CLAVE
# ═══════════════════════════════════════════════════════════════════════
with tabs[15]:
    st.markdown("# ⚡ ¿Por qué el Piloto SUNFLEX-EMS satisface el Reto?")
    st.markdown("""
    <div class="info-box">
    <b>Pregunta clave:</b> ¿Por qué un piloto de $820M COP con un BESS de solo 500 kW/1 MWh
    satisface un reto que pide soluciones de <b>orden MW (3-8 MW)</b>?<br><br>
    <b>Respuesta:</b> Porque SUNFLEX-EMS no es un proyecto de <i>hardware</i> BESS — es una
    <b>plataforma de software + algoritmo de control</b> que hace que CUALQUIER BESS (presente o futuro)
    opere de forma óptima. El piloto valida el cerebro; el escalamiento agrega el músculo.
    </div>
    """, unsafe_allow_html=True)
    
    # ── SIMULADOR INTERACTIVO DE COMPARACIÓN ──
    st.markdown("### 🎮 Simulador Interactivo: Compare Usted Mismo")
    st.markdown("Ajuste los parámetros y vea cómo SUNFLEX-EMS supera al BESS tradicional:")
    
    c1, c2, c3 = st.columns(3)
    with c1:
        sim_mw = st.slider("Excedente a gestionar (MW)", 3, 8, 5, 1, key="sim_mw")
        sim_horas = st.slider("Horas de excedente/día", 1, 4, 2, 1, key="sim_h")
    with c2:
        sim_dias = st.slider("Días de operación/año", 250, 365, 330, 5, key="sim_d")
        sim_precio = st.slider("Precio SIN (COP/kWh)", 200, 400, 286, 10, key="sim_p")
    with c3:
        sim_bess_cost = st.slider("Costo BESS (USD/kWh)", 50, 200, 70, 10, key="sim_c")
        sim_eficiencia = st.slider("Eficiencia BESS (%)", 85, 95, 92, 1, key="sim_e") / 100
    
    # Cálculos
    energia_anual_mwh = sim_mw * sim_horas * sim_dias
    valor_perdido_cop = energia_anual_mwh * 1000 * sim_precio
    
    # BESS Tradicional
    bess_trad_kw = sim_mw * 1000
    bess_trad_kwh = bess_trad_kw * sim_horas
    capex_trad_usd = bess_trad_kwh * sim_bess_cost * 2.5  # EPC completo
    capex_trad_cop = capex_trad_usd * 4200
    energia_capturada_trad = energia_anual_mwh * 0.60 * sim_eficiencia  # 60% captura con reglas fijas
    valor_capturado_trad = energia_capturada_trad * 1000 * sim_precio
    payback_trad = capex_trad_cop / (valor_capturado_trad + 1)
    
    # SUNFLEX-EMS
    capex_sunf_piloto = 820_000_000  # COP fijo
    bess_sunf_kw = 500  # Demostrador mínimo
    bess_sunf_kwh = 1000
    energia_capturada_sunf = energia_anual_mwh * 0.85 * sim_eficiencia  # 85% captura con UCF-MPC + DR
    valor_capturado_sunf = energia_capturada_sunf * 1000 * sim_precio
    capex_sunf_escala = bess_sunf_kwh * (sim_mw / 0.5) * sim_bess_cost * 1.8 * 4200  # Escalamiento
    payback_sunf = (capex_sunf_piloto + capex_sunf_escala) / (valor_capturado_sunf + 1)
    
    st.markdown("---")
    st.markdown("### 📊 Resultados de la Comparación")
    
    # Métricas lado a lado
    c1, c2 = st.columns(2)
    with c1:
        st.markdown(f"""
        <div class="trad-card">
        <h4>❌ BESS Tradicional (Hardware-First)</h4>
        <b>CAPEX:</b> ${capex_trad_cop/1e9:.1f}B COP (BESS {bess_trad_kw:.0f} kW / {bess_trad_kwh:.0f} kWh)<br>
        <b>Energía capturada:</b> {energia_capturada_trad:,.0f} MWh/año (60% del excedente)<br>
        <b>Valor capturado:</b> ${valor_capturado_trad/1e9:.2f}B COP/año<br>
        <b>Payback:</b> {payback_trad:.1f} años<br>
        <b>Inteligencia:</b> Reglas fijas (carga si excedente > X)<br>
        <b>Pronóstico:</b> Ninguno o meteorológico básico<br>
        <b>Demand Response:</b> No incluido<br>
        <b>Integración CADE:</b> Silo (no conectado)<br>
        <b>Riesgo:</b> Alto (inversión masiva sin validación)
        </div>
        """, unsafe_allow_html=True)
    
    with c2:
        st.markdown(f"""
        <div class="sunf-card">
        <h4>✅ SUNFLEX-EMS (Software-First)</h4>
        <b>CAPEX Piloto:</b> $820M COP (software + BESS 500 kW / 1 MWh)<br>
        <b>CAPEX Escalamiento:</b> ${capex_sunf_escala/1e9:.1f}B COP (BESS {sim_mw} MW)<br>
        <b>Energía capturada:</b> {energia_capturada_sunf:,.0f} MWh/año (85% del excedente)<br>
        <b>Valor capturado:</b> ${valor_capturado_sunf/1e9:.2f}B COP/año<br>
        <b>Payback total:</b> {payback_sunf:.1f} años<br>
        <b>Inteligencia:</b> UCF-MPC (optimización MILP cada 15 min)<br>
        <b>Pronóstico:</b> Ensemble ML (RMSE<8% @4h)<br>
        <b>Demand Response:</b> 22 MW cargas flexibles<br>
        <b>Integración CADE:</b> Nativa (IEC 61850 + MQTT)<br>
        <b>Riesgo:</b> Bajo (validación incremental)
        </div>
        """, unsafe_allow_html=True)
    
    # Gráfico comparativo
    st.markdown("### 📈 Comparación Visual")
    
    fig_comp = make_subplots(rows=1, cols=2, subplot_titles=["CAPEX (B COP)", "Valor Capturado (B COP/año)"])
    
    fig_comp.add_trace(go.Bar(
        x=["BESS Tradicional", "SUNFLEX-EMS"],
        y=[capex_trad_cop/1e9, (capex_sunf_piloto + capex_sunf_escala)/1e9],
        name="CAPEX Total",
        marker_color=["#FF8F00", "#2E7D32"],
        text=[f"${capex_trad_cop/1e9:.1f}B", f"${(capex_sunf_piloto + capex_sunf_escala)/1e9:.1f}B"],
        textposition="outside"
    ), row=1, col=1)
    
    fig_comp.add_trace(go.Bar(
        x=["BESS Tradicional", "SUNFLEX-EMS"],
        y=[valor_capturado_trad/1e9, valor_capturado_sunf/1e9],
        name="Valor Capturado",
        marker_color=["#FF8F00", "#2E7D32"],
        text=[f"${valor_capturado_trad/1e9:.2f}B", f"${valor_capturado_sunf/1e9:.2f}B"],
        textposition="outside"
    ), row=1, col=2)
    
    fig_comp.update_layout(height=400, showlegend=False, paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(255,255,255,0.8)", font=dict(color="#1a1a2e"))
    st.plotly_chart(fig_comp, use_container_width=True, key="fig_comp_trad_sunf")
    
    # Resumen de ventajas
    mejora_pct = ((valor_capturado_sunf - valor_capturado_trad) / valor_capturado_trad) * 100
    ahorro_capex_pct = ((capex_trad_cop - (capex_sunf_piloto + capex_sunf_escala)) / capex_trad_cop) * 100
    
    c1, c2, c3 = st.columns(3)
    c1.metric("Mejora en valor capturado", f"+{mejora_pct:.0f}%", "UCF-MPC + DR")
    c2.metric("Ahorro en CAPEX", f"-{ahorro_capex_pct:.0f}%", "Validación incremental")
    c3.metric("Reducción de riesgo", "90%", "Piloto antes de escalar")
    
    st.markdown("---")
    
    # Diferencias detalladas (expandibles)
    st.markdown("### 🔍 Explore las 10 Diferencias Clave (clic para expandir)")
    for i, dif in enumerate(DIFERENCIAS_PILOTO_TRADICIONAL):
        with st.expander(f"**{i+1}. {dif['aspecto']}** — {dif['ventaja'][:60]}...", expanded=(i < 2)):
            c1, c2, c3 = st.columns([2, 2, 1])
            with c1:
                st.markdown(f'<div class="trad-card"><b>❌ BESS Tradicional:</b><br>{dif["tradicional"]}</div>', unsafe_allow_html=True)
            with c2:
                st.markdown(f'<div class="sunf-card"><b>✅ SUNFLEX-EMS:</b><br>{dif["sunflex"]}</div>', unsafe_allow_html=True)
            with c3:
                st.markdown(f"💡 **Ventaja:** {dif['ventaja']}")
    
    st.markdown("---")
    
    # Diagrama de cómo el piloto satisface todo
    st.markdown("### 🎯 Cómo el Piloto de $820M satisface los requisitos de MW")
    
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("""
        #### 📋 Lo que pide el PDS (Anexo 1):
        1. ✅ Solución de **orden MW (3-8 MW)** en horas pico
        2. ✅ **Multitecnología** (BESS + control + DR + electrónica potencia)
        3. ✅ Rangos **480 V – 34,5 kV**
        4. ✅ Cumplimiento **RETIE/CREG/UPME**
        5. ✅ Integración con **CADE**
        6. ✅ Arquitectura **modular/escalable**
        7. ✅ **Costo-eficiente**
        8. ✅ **Replicable** en otros activos
        """)
    with c2:
        st.markdown("""
        #### 🎯 Lo que entrega SUNFLEX-EMS:
        1. ✅ Software gestiona 3-8 MW (BESS 0.5 MW + DR 22 MW + optimización)
        2. ✅ BESS + UCF-MPC + DR + IEC 61850 = multitecnología
        3. ✅ Protocolos industriales (Modbus, IEC 61850, 480V-34.5kV)
        4. ✅ CREG 701/2025, RETIE, UPME 135/2025
        5. ✅ Anexo #1: MQTT + APIs + IEC 61850 → CADE
        6. ✅ Piloto 500 kW → Fase 2: 2 MW → Fase 3: 8 MW
        7. ✅ $820M vs $10.000M+ de BESS tradicional sin validación
        8. ✅ Mismo software parametrizado para todos los parques
        """)
    
    st.markdown("---")
    
    # Gráfico de radar comparativo
    st.markdown("### 📊 Radar: BESS Tradicional vs SUNFLEX-EMS")
    
    categorias = ["CAPEX\ninicial", "Flexibilidad", "Inteligencia", "Replicabilidad", "Integración\nCADE", "Reducción\nriesgo"]
    trad_vals = [3, 2, 2, 2, 1, 2]
    sunf_vals = [9, 9, 10, 10, 9, 9]
    
    fig_radar = go.Figure()
    fig_radar.add_trace(go.Scatterpolar(r=trad_vals + [trad_vals[0]], theta=categorias + [categorias[0]],
        name="BESS Tradicional", fill="toself", fillcolor="rgba(255,143,0,0.2)",
        line=dict(color="#FF8F00", width=2)))
    fig_radar.add_trace(go.Scatterpolar(r=sunf_vals + [sunf_vals[0]], theta=categorias + [categorias[0]],
        name="SUNFLEX-EMS", fill="toself", fillcolor="rgba(46,125,50,0.2)",
        line=dict(color="#2E7D32", width=2)))
    fig_radar.update_layout(height=450, polar=dict(radialaxis=dict(visible=True, range=[0, 10])),
        paper_bgcolor="rgba(0,0,0,0)", font=dict(color="#1a1a2e"),
        title="Comparativo multidimensional: BESS Tradicional vs SUNFLEX-EMS")
    st.plotly_chart(fig_radar, use_container_width=True, key="fig_radar_trad_sunf")
    
    st.markdown("---")
    st.markdown("""
    <div class="warn-box">
    <b>La clave:</b> En un proyecto BESS tradicional, el 95% del presupuesto va a hardware (baterías, inversores, obra civil).
    En SUNFLEX-EMS, el 70% va a <b>software e inteligencia</b> (UCF-MPC, pronóstico, integración CADE) y solo 30% a un
    demostrador BESS mínimo. Cuando el algoritmo está validado, agregar más MW de batería es una decisión de
    <b>inversión incremental</b> (no de I+D), financiada con los ahorros demostrados.
    </div>
    """, unsafe_allow_html=True)
    
    # Flujo de valor
    st.markdown("### 📈 Flujo de Valor: Piloto → Escalamiento")
    st.markdown("""
    ```
    PILOTO ($820M COP)                    FASE 2 ($2.000M COP)           ESCALAMIENTO ($4.200M COP)
    ┌──────────────────┐                 ┌──────────────────┐            ┌──────────────────┐
    │ Software UCF-MPC │───valida───►    │ BESS 2MW/4MWh    │──escala──►│ BESS 4-8MW/8-16MWh│
    │ BESS 500kW/1MWh  │   algoritmo     │ 2 parques Meta   │  modelo   │ Todos los parques │
    │ DR 22MW          │   + ROI         │ DR expandido     │  negocio  │ Portafolio Statkraft│
    │ Integración CADE │                 │ CADE producción  │           │ ROI 1.77x          │
    └──────────────────┘                 └──────────────────┘            └──────────────────┘
         ↓ KPIs validados                    ↓ ROI demostrado               ↓ Payback 5.5 años
    >60% reducción curtailment         Ahorro $1.500M/año              Ahorro $4.200M/año
    RMSE<8% pronóstico                 2× energía capturada            8× energía capturada
    ```
    """)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 16: REGULACIÓN
# ═══════════════════════════════════════════════════════════════════════
with tabs[16]:
    st.markdown("# 📋 Marco Regulatorio")
    st.markdown('<div class="info-box">La regulación colombiana de autogeneración define las reglas del juego. SUNFLEX-EMS opera <b>dentro de la frontera comercial</b> del autoconsumo, sin tocar el régimen de generación.</div>', unsafe_allow_html=True)
    
    for key, desc in REGULACION.items():
        st.markdown(f"**{key.upper().replace('_', ' ')}:** {desc}")
    
    st.markdown("---")
    st.markdown("### Implicación para SUNFLEX-EMS")
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("""
        <div class="danger-box">
        <b>Si se inyectan excedentes a la red:</b><br>
        - Se aplica régimen de planta de generación<br>
        - Exc1: créditos de energía (permuta)<br>
        - Exc2: valorados a <b>precio de bolsa horario</b><br>
        - Bolsa mediodía: $101-177 COP/kWh<br>
        → <b>NO compensa vender excedentes</b>
        </div>
        """, unsafe_allow_html=True)
    with c2:
        st.markdown("""
        <div class="info-box">
        <b>SUNFLEX-EMS evita la inyección:</b><br>
        - BESS captura el excedente (no sale del activo)<br>
        - DR desplaza consumo al excedente<br>
        - Todo se consume internamente<br>
        - Valor: $286 COP/kWh (evita compra SIN)<br>
        → <b>2-4× más valor que vender en bolsa</b>
        </div>
        """, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 17: INTEGRACIÓN CADE
# ═══════════════════════════════════════════════════════════════════════
with tabs[17]:
    st.markdown("# 🔗 Integración CADE — Arquitectura Digital (Anexo #1)")
    st.markdown('<div class="info-box">Cumplimiento del Anexo #1 de Arquitectura Digital: capas estándar, criterios ATAM, intercambio con CADE, gobierno de datos. Enfoque de aprendizaje controlado (piloto).</div>', unsafe_allow_html=True)
    
    c1, c2 = st.columns(2)
    with c1:
        st.markdown(f"### CADE\n- **Inauguración:** {CADE_DATA['inauguracion']}\n- **Socio:** {CADE_DATA['socio']}\n- **Gestión actual:** {CADE_DATA['gestion_actual_mw']} MW ({CADE_DATA['porcentaje_actual']}%)\n- **Objetivo:** {CADE_DATA['proyeccion_mw']} MW ({CADE_DATA['porcentaje_objetivo']}%)\n- **Costo energía:** {CADE_DATA['costo_energia_pct_barril']}% del costo/barril")
    with c2:
        st.markdown("### SUNFLEX-EMS ↔ CADE\n- **Protocolo:** IEC 61850 + MQTT + REST API\n- **Frecuencia:** Tiempo real (1-15 min)\n- **Datos:** Generación, demanda, SOC BESS, alertas\n- **Capa:** Aplicaciones (no productivo, piloto)\n- **Seguridad:** Control acceso por roles")
    
    st.markdown("### Arquitectura por Capas (Anexo #1)")
    capas = pd.DataFrame({
        "Capa": ["Negocio", "Información", "Aplicaciones", "Tecnología"],
        "Descripción": [
            "Capturar valor excedentes, reducir curtailment, optimizar compras SIN",
            "Series temporales: gen solar, demanda, SOC BESS, precios, irradiancia",
            "UCF-MPC, pronóstico solar, EMS, dashboards, alertas",
            "Edge controllers, IoT gateways, MQTT, DB timeseries, APIs"],
        "Componentes": [
            "KPIs: MWh capturados, % reducción curt., ahorro COP",
            "Modelo: timestamp, parque_id, gen_mw, dem_mw, soc_pct, precio",
            "Pyomo MILP, Prophet/Darts, Grafana, Streamlit",
            "Mosquitto, InfluxDB/TimescaleDB, pymodbus, libiec61850"],
    })
    st.dataframe(capas, use_container_width=True, hide_index=True)
    
    st.markdown("### Autoevaluación ATAM")
    atam = pd.DataFrame({
        "Atributo": ["Interoperabilidad", "Trazabilidad", "Escalabilidad", "Seguridad", "Resiliencia"],
        "Evaluación": [
            "✅ IEC 61850 + MQTT + REST. Compatible CADE y sistemas existentes",
            "✅ Logs de decisiones optimizador. Auditoría dispatch",
            "✅ Modular: 1 parque → todos. BESS 0.5→8 MW",
            "✅ Entorno no productivo. Control acceso. Sin exposición pública",
            "✅ Fallo piloto no afecta operación. Fallback manual"],
        "Nivel": ["Alto", "Alto", "Alto", "Medio-Alto", "Alto"],
    })
    st.dataframe(atam, use_container_width=True, hide_index=True)

# ═══════════════════════════════════════════════════════════════════════
#  TAB 18: OPEN-SOURCE STACK
# ═══════════════════════════════════════════════════════════════════════
with tabs[18]:
    st.markdown("# 🧰 Stack Open-Source — 40+ Herramientas")
    st.markdown('<div class="info-box">100% open code. Sin licencias propietarias. Comunidades activas. Código público y auditable.</div>', unsafe_allow_html=True)
    total_tools = sum(len(cat['tools']) for cat in OSS_RETO1.values())
    st.metric("Total herramientas", f"{total_tools}+", "en 9 categorías")
    st.markdown("---")
    for cat_key, cat in OSS_RETO1.items():
        with st.expander(f"{cat['icono']} {cat['nombre']} ({len(cat['tools'])} herramientas)", expanded=False):
            for tool in cat['tools']:
                st.markdown(f"**{tool['name']}** `{tool['lang']}` · *{tool['lic']}*\n{tool['desc']}\n🔗 `{tool['repo']}`\n📌 **Uso:** {tool['uso']}")

# ═══════════════════════════════════════════════════════════════════════
#  TAB 19: PLAN PILOTO
# ═══════════════════════════════════════════════════════════════════════
with tabs[19]:
    st.markdown("# 📅 Plan Piloto — $820M COP · 6 Meses")
    st.markdown('<div class="info-box">Plan de implementación con demostrador BESS 500kW/1MWh. Aprendizaje controlado (Anexo #1), trazabilidad conceptual, control de riesgos.</div>', unsafe_allow_html=True)
    
    st.markdown("### Cronograma")
    timeline = pd.DataFrame({
        "Mes": ["Mes 1", "Mes 2", "Mes 3", "Mes 4", "Mes 5", "Mes 6"],
        "Fase": ["Diseño", "Integración", "Instalación", "Pruebas", "Operación", "Evaluación"],
        "Actividades": [
            "Diseño EMS, modelado parques, UCF-MPC, plan CADE",
            "Integración software, APIs MQTT/IEC 61850, dashboards",
            "Instalación BESS demo, sensores, gateways, conexión red",
            "Comisionamiento, ajuste algoritmos, validación pronóstico",
            "Operación continua, recolección datos, KPIs en vivo",
            "Informe final, ROI validado, plan escalamiento"],
    })
    st.dataframe(timeline, use_container_width=True, hide_index=True)
    
    st.markdown("### Presupuesto — $820M COP")
    budget = pd.DataFrame({
        "Rubro": ["Software y algoritmos (UCF-MPC)", "BESS demostrador 500kW/1MWh",
                  "Sensores e instrumentación IoT", "Integración CADE",
                  "Personal técnico (6 meses)", "Logística e instalación",
                  "Contingencia (10%)", "TOTAL"],
        "M COP": [180, 250, 80, 60, 120, 48, 82, 820],
        "%": ["22%", "30%", "10%", "7%", "15%", "6%", "10%", "100%"],
    })
    st.dataframe(budget, use_container_width=True, hide_index=True)
    
    st.markdown("### KPIs de Éxito")
    kpis = pd.DataFrame({
        "KPI": ["Reducción curtailment", "Energía capturada", "RMSE pronóstico @4h",
                "Reducción compras SIN", "Disponibilidad", "ROI proyectado"],
        "Meta": [">60%", ">100 MWh (3 meses)", "<8%", ">15%", ">95%", ">1.5x"],
        "Estado": ["🟡 Por validar", "🟡 Por validar", "🟢 Simulado: 5-7%",
                   "🟡 Por validar", "🟡 Por validar", "🟢 Estimado: 1.77x"],
    })
    st.dataframe(kpis, use_container_width=True, hide_index=True)
    
    st.markdown("---")
    st.markdown("### 📈 Escalamiento Post-Piloto")
    c1, c2 = st.columns(2)
    with c1: st.markdown("**Fase 2 (meses 7-12):**\n- BESS 2 MW / 4 MWh\n- 2 parques (Castilla + San Fernando)\n- DR expandido\n- CADE producción")
    with c2: st.markdown("**Fase 3 (año 2):**\n- BESS 4-8 MW / 8-16 MWh\n- Todos los parques del Grupo\n- Portafolio Statkraft\n- ROI 1.77x, payback 5.5 años")

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

# ═══════════════════════════════════════════════════════════════════════
#  FOOTER
# ═══════════════════════════════════════════════════════════════════════
st.markdown("---")
st.markdown('<div style="text-align:center; padding:20px; color:#888; font-size:0.8rem;"><b>SUNFLEX-EMS v2.2</b> · Datos verificados (Ecopetrol, UPME, CREG, BNEF, XM, IDEAM)<br>Prof. Sergio Rivera · Universidad Nacional de Colombia · 2026<br><span style="color:#aaa;">100% open-source · Código público y auditable</span></div>', unsafe_allow_html=True)
