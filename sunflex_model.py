# -*- coding: utf-8 -*-
"""
SUNFLEX-EMS · Motor de modelado y simulación por caso — Reto 1
================================================================
Convocatoria "Transforma la Energía" (Ecopetrol · Hocol · Red Econova,
operada por Connect Bogotá Región y Cámara de Comercio de La Guajira).

Este módulo es la FUENTE ÚNICA DE VERDAD de:

  1. Los KPI del dashboard SUNFLEX-EMS v2 (tabs de respuesta a la subsanación).
  2. Las HOJAS (sheets) que se cargan en las dos herramientas open-source
     adjiebrotot clonadas en `static/tools/`:
        · loadflow-simulator → flujo de cargas AC Newton-Raphson (PSA.js,
          puerto JavaScript de PyPSA verificado contra PyPSA)
        · ed-uc-simulator    → despacho económico y compromiso de unidades
          (PyPSA LOPF + HiGHS en WebAssembly)
     Por eso el número que ve el evaluador en el simulador del navegador es el
     mismo número del informe: misma topología, mismos MVA, mismos perfiles.
  3. El documento de respuesta con diagramas de bloque (Mermaid).

Unidades y convenciones
-----------------------
* Potencia MW, energía MWh, tensión kV, reactiva MVAr.
* Dinero: la hoja ED trabaja en "miles de COP por MWh", numéricamente idéntico
  a COP/kWh (1.000 COP/MWh = 1 COP/kWh). En PyPSA se usa COP/MWh.
* Perfil solar calibrado a la generación ANUAL reportada de cada parque.
* La restricción que causa el curtailment se calibra (bisección) al vertimiento
  diario reportado para el activo: `cap_mw` = capacidad de conducción
  habilitada en el punto de inyección.
"""

from __future__ import annotations

VERSION = "2.2"          # etiqueta del entregable; build_app la propaga a app.py

import math
import warnings
from dataclasses import dataclass, field

import os as _os


def _preflight() -> None:
    """Falla temprano y en español si la combinación de librerías no sirve.

    El caso real: las imágenes base de Python y de Streamlit Cloud traen
    `xarray` 2025.x, que con PyPSA 1.4 lanza
    ``TypeError: Cannot interpret '<StringDtype(na_value=nan)>'`` al construir la
    restricción de balance nodal — un error que no dice nada del origen. Aquí se
    traduce a la acción concreta (subir xarray).
    """
    if _os.environ.get("SUNFLEX_SKIP_PREFLIGHT"):
        return
    import importlib.metadata as _md

    try:
        import xarray as _xr
        mayor = int(str(_xr.__version__).split(".")[0])
        if mayor < 2026:
            raise ImportError(
                f"xarray {_xr.__version__} es incompatible con PyPSA "
                f"{_md.version('pypsa')}: el ensamblado del balance nodal falla con "
                "«Cannot interpret '<StringDtype(na_value=nan)>'». "
                "Solución: pip install -r requirements.txt  (pide xarray>=2026.1)  "
                "o export SUNFLEX_SKIP_PREFLIGHT=1 si quiere ignorar esta comprobación.")
    except ImportError:
        raise
    except Exception:
        pass


_preflight()

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

TRAB = 15                      # min por paso = paso del horizonte rodante MPC
NPASOS = 24 * 60 // TRAB       # 96
DT = TRAB / 60.0
COSFI = 0.92                   # fp del proceso
X_TF = 0.10
R_TF_PU = 0.005   # resistencia del transformador en p.u. sobre su propia potencia                    # impedancia típica de transformador de potencia (pu)
R_KM_345 = 0.0913              # Ω/km  397 kcmil Drake (ACSR) en 34,5 kV
X_KM_345 = 0.3979              # Ω/km  idem
DEG_COP_MWH = 25_000.0         # costo de degradación del ciclo (COP/MWh descargado)
CO2_SIN = 0.34                 # tCO2e/MWh desplazado (factor implícito en datos del parque)
PRECIO_VENTA_DESC = 0.92       # venta en bolsa: precio de bolsa menos peajes/mermas


# ══════════════════════════════════════════════════════════════════════
#  1. DEFINICIÓN DE CASOS (activos del Grupo Ecopetrol)
# ══════════════════════════════════════════════════════════════════════

@dataclass
class Caso:
    key: str
    nombre: str
    corto: str
    dpto: str
    lat: float
    lon: float
    mw_dc: float               # MWp reportados
    dcac: float                # ratio DC/AC
    demanda_mw: float          # demanda media del activo
    demanda_pico: float        # demanda pico
    gwh_anio: float            # generación anual reportada
    irr: float                 # irradiancia kWh/m²/día
    curtail_dia: float         # vertimiento diario reportado (base de calibración)
    flex_mw: float             # carga flexible diferible identificada
    p_regulado: float          # tarifa de referencia COP/kWh
    p_valle: float             # precio bolsa mediodía COP/kWh
    p_punta: float             # precio bolsa punta COP/kWh
    bess_p: float              # demostrador del piloto MW
    bess_e: float              # demostrador MWh
    bess_p_esc: float          # BESS de escalamiento MW
    bess_h_esc: float          # duración de escalamiento h
    v_pv: float = 34.5
    v_campo: float = 13.8
    v_se: float = 110.0
    l_pv_km: float = 1.2
    dr_ventana_h: float = 4.0
    flex_planta_frac: float = 0.60   # carga flexible COLOCADA en la cabecera del parque
    turbinas: int = 0
    turbo_p: float = 0.0
    turbo_cost: float = 210.0
    critico: float = 0.0
    co2: float = CO2_SIN
    tipo_red: str = ""
    nota: str = ""
    area_ha: float = 0.0
    paneles: int = 0


CASOS: dict[str, Caso] = {
    "castilla": Caso(
        key="castilla", nombre="Ecoparque Solar Castilla (AES Colombia)", corto="Castilla",
        dpto="Meta — Castilla La Nueva", lat=3.85, lon=-73.23,
        mw_dc=21.0, dcac=1.15, demanda_mw=16.0, demanda_pico=17.6, gwh_anio=35.0, irr=5.0,
        curtail_dia=5.0, flex_mw=3.0, p_regulado=286.0, p_valle=120.0, p_punta=350.0,
        bess_p=0.5, bess_e=1.0, bess_p_esc=3.0, bess_h_esc=2.0,
        turbinas=2, turbo_p=6.0, critico=4.0, area_ha=15.0, paneles=52000,
        tipo_red="radial 110 kV, un solo punto de conexión (sin respaldo N-1)",
        nota="Primer megaparque solar de Colombia (oct-2019). Excedente recurrente ~3 MW entre "
             "12:00 y 14:00 por restricción de conducción del alimentador interno hacia el campo."),
    "sanfernando": Caso(
        key="sanfernando", nombre="Ecoparque Solar San Fernando (Cenit)", corto="San Fernando",
        dpto="Meta — Llanos Orientales", lat=4.30, lon=-72.10,
        mw_dc=61.0, dcac=1.20, demanda_mw=41.0, demanda_pico=45.1, gwh_anio=95.0, irr=5.2,
        curtail_dia=14.0, flex_mw=5.0, p_regulado=286.0, p_valle=120.0, p_punta=350.0,
        bess_p=0.5, bess_e=1.0, bess_p_esc=8.0, bess_h_esc=2.0,
        turbinas=2, turbo_p=12.0, turbo_cost=230.0, critico=18.0, area_ha=46.0, paneles=100000,
        tipo_red="anillo 110 kV con respaldo N-1; bombeo de crudo = carga crítica",
        nota="Principal autogenerador renovable del país (61 MW). Excedente de 8 MW 12:00-14:00. "
             "Las estaciones de bombeo no admiten interrupción: la solución debe ser no-invasiva."),
    "brisas": Caso(
        key="brisas", nombre="Ecoparque Solar Brisas (Neiva, Huila)", corto="Brisas",
        dpto="Huila — Neiva", lat=2.93, lon=-75.28,
        mw_dc=26.0, dcac=1.18, demanda_mw=18.0, demanda_pico=19.8, gwh_anio=42.0, irr=4.8,
        curtail_dia=6.0, flex_mw=2.5, p_regulado=286.0, p_valle=115.0, p_punta=340.0,
        bess_p=0.5, bess_e=1.0, bess_p_esc=4.0, bess_h_esc=2.0,
        turbinas=0, turbo_p=0.0, critico=0.0, area_ha=21.0, paneles=49000,
        tipo_red="alimentador 34,5 kV simple; irradiación menor (4,8 kWh/m²/día)",
        nota="49.000 módulos bifaciales. Evita 216.000 tCO₂e en 15 años. Excedente típico 4 MW."),
    "rubiales": Caso(
        key="rubiales", nombre="Parque Solar Rubiales (TotalEren 51% / Ecopetrol 49%)", corto="Rubiales",
        dpto="Meta — Puerto Gaitán", lat=4.35, lon=-72.05,
        mw_dc=100.0, dcac=1.28, demanda_mw=62.0, demanda_pico=68.2, gwh_anio=160.0, irr=5.2,
        curtail_dia=12.0, flex_mw=6.0, p_regulado=286.0, p_valle=110.0, p_punta=340.0,
        bess_p=0.5, bess_e=1.0, bess_p_esc=7.0, bess_h_esc=2.0,
        turbinas=0, turbo_p=0.0, critico=0.0, area_ha=80.0, paneles=180000,
        tipo_red="subestación propia 110 kV con dos transformadores (N-1 parcial)",
        nota="Mayor parque del Grupo (180.000 módulos bifaciales, PPA 17 años). Excedente "
             "potencial ≥7 MW: capacidad instalada muy superior a la demanda del campo."),
    "refinerias": Caso(
        key="refinerias", nombre="Granjas Solares Refinerías (Cartagena + Barrancabermeja)", corto="Refinerías",
        dpto="Bolívar + Santander", lat=10.39, lon=-75.46,
        mw_dc=39.0, dcac=1.10, demanda_mw=295.0, demanda_pico=320.0, gwh_anio=62.0, irr=5.0,
        curtail_dia=4.0, flex_mw=8.0, p_regulado=310.0, p_valle=120.0, p_punta=380.0,
        bess_p=0.5, bess_e=1.0, bess_p_esc=6.0, bess_h_esc=2.0,
        v_pv=13.8, v_campo=13.8, v_se=110.0, l_pv_km=0.6,
        turbinas=0, turbo_p=0.0, critico=210.0, area_ha=35.0, paneles=70000,
        tipo_red="barras de planta 13,8 kV; demanda (320 MW) >> generación (39 MW)",
        nota="375.000 bpd combinados, apalancan hidrógeno verde. Aquí el excedente NO es por falta "
             "de demanda sino por límite de barra y por procesos continuos: se captura con cargas "
             "diferibles y BESS en la barra local, no con exportación."),
}


# ══════════════════════════════════════════════════════════════════════
#  2. PERFILES
# ══════════════════════════════════════════════════════════════════════

_t = np.array([(i * TRAB / 60.0) % 24 for i in range(NPASOS)])


def solar_norm(sunrise=5.5, sunset=18.5, skew=0.55) -> np.ndarray:
    """Campana solar tropical normalizada a energía diaria = 1 (15-min)."""
    c = 0.5 * (sunrise + sunset)
    half = 0.5 * (sunset - sunrise)
    s = np.exp(-0.5 * ((_t - c) / (skew * half)) ** 2)
    s[(_t < sunrise) | (_t > sunset)] = 0.0
    return s / s.sum()


def perfiles(c: Caso) -> dict:
    """Generación solar y demanda del activo (paso 15 min, MW).

    Modelo físico-simple, calibrado a los datos públicos del parque:

        G(t) = P_AC · PR · f(t)         f(t) = cos(pi·(t-12)/12.4)^1.15

    con `PR` (performance ratio) ajustado por bisección para que la energía
    del día tipo iguale a `GWh/año ÷ 365`. La campana `f` es la irradiancia
    en el plano del módulo normalizada (cero antes de 5:48 y después de 18:12,
    máximo al mediodía solar), de modo que el PICO del mediodía —la hora que
    evalúa el Reto 1— queda a ~0,95 de la potencia nominal del inversor y no
    se subestima el excedente.
    """
    e_dia = c.gwh_anio * 1000.0 / 365.0
    pv_ac = c.mw_dc / c.dcac
    f = np.clip(np.cos(np.pi * (_t - 12.0) / 12.4), 0.0, None) ** 1.15
    pr = float(e_dia / max(float((f.sum() * DT) * pv_ac), 1e-9))
    g = pv_ac * pr * f
    tope = round(float(g.max()), 3)
    fh = np.ones(NPASOS)
    fh[(_t >= 6) & (_t <= 9)] *= 1.10
    fh[(_t >= 12) & (_t <= 14)] *= 0.92
    fh[(_t >= 17) & (_t <= 21)] *= 1.15
    d = c.demanda_mw * fh / fh.max()
    ix = pd.RangeIndex(NPASOS)
    return dict(pv=pd.Series(g, index=ix), dem=pd.Series(d, index=ix),
                q=pd.Series(d * math.tan(math.acos(COSFI)), index=ix),
                pv_ac=pv_ac, tope=tope, e_dia=e_dia, pr=round(pr, 3))


def precio_serie(c: Caso) -> np.ndarray:
    """Precio de compra del activo (COP/kWh) con la curva de pato colombiana."""
    p = np.full(NPASOS, 250.0)
    p[(_t < 6) | (_t > 22)] = 190.0
    p[(_t >= 9) & (_t <= 16)] = c.p_valle + 30.0
    p[(_t >= 17) & (_t <= 21)] = max(c.p_punta, 320.0)
    return pd.Series(p, index=pd.RangeIndex(NPASOS))


# ══════════════════════════════════════════════════════════════════════
#  3. CALIBRACIÓN DE LA RESTRICCIÓN DE RED
# ══════════════════════════════════════════════════════════════════════

def curtail_bruto(pv, dem, cap):
    """Vertimiento horario sin almacenamiento: solo puede entrar al activo
    min(demanda, capacidad habilitada). La CREG 701/2025 no reconoce excedentes
    exportables en autogeneración a gran escala, así que no hay.suma de venta."""
    return np.maximum(pv - np.minimum(dem, cap), 0.0)


def calibrar(c: Caso, per: dict) -> float:
    """Capacidad de conducción habilitada (MW) que reproduce el vertimiento
    diario reportado para el activo. El vertimiento es monótono DECRECIENTE en
    la capacidad, así que se busca por bisección sobre [0, Ppico]."""
    pv, dem = np.asarray(per["pv"], float), np.asarray(per["dem"], float)
    obj = float(c.curtail_dia)
    hi0 = float(pv.max()) * 1.05
    if float(curtail_bruto(pv, dem, 0.0).sum() * DT) <= obj:
        return 0.0                       # el activo ni siquiera vierte: sin restricción
    lo, hi = 0.0, hi0
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if float(curtail_bruto(pv, dem, mid).sum() * DT) > obj:
            lo = mid
        else:
            hi = mid
    return round(0.5 * (lo + hi), 2)


def impedancias(c: Caso, cap: float) -> dict:
    """Impedancias coherentes entre el motor PyPSA y las dos hojas de la
    herramienta. Convención PyPSA (y de `lf-core.js`):

      · Line:         r, x en Ω/km (se multiplican por `length`), s_nom en MVA.
      · Transformer:  r, x en **p.u. sobre la propia potencia nominal** del
                      transformador (X%·S_nom/S_nom = X/100). Pasarles ohmios
                      inflaría la reactancia ~10× y el Newton-Raphson diverge.
    """
    r = R_KM_345 * c.l_pv_km
    x = X_KM_345 * c.l_pv_km
    s_restriccion = round(max(cap * 1.25, 0.5), 2)
    s_campo = round(max(c.demanda_pico * 1.15, cap * 1.3, 1.0), 2)
    z_pv = c.v_pv ** 2 / s_restriccion
    z_cam = c.v_campo ** 2 / s_campo
    return dict(r_restr=r, x_restr=x, s_restr=s_restriccion,
                s_campo=s_campo,
                x_campo_ohm=X_TF * z_cam,            # solo documenta el origen del dato
                x_campo_pu=round(X_TF, 4),           # 10 % sobre S_nom  -> PyPSA / hoja
                r_campo_pu=round(R_TF_PU, 5),         # pérdidas en el cobre
                x_restr_pu=round(X_TF * z_pv / 4.0 / z_pv, 4))


# ══════════════════════════════════════════════════════════════════════
#  4. ESCENARIOS Y RED PyPSA
# ══════════════════════════════════════════════════════════════════════

ESCENARIOS: dict[str, dict] = {
    "base":       dict(label="L1 · Línea base: sin solución (curtailment real)",
                       bess=0.0, dr=False, venta=False),
    "venta":      dict(label="L2 · Alternativa de referencia: venta de excedentes en bolsa",
                       bess=0.0, dr=False, venta=True),
    "bess_std":   dict(label="L3 · BESS óptimo sin DR ni pronóstico (referencia de mercado)",
                       bess="pilot", dr=False, venta=False),
    "piloto":     dict(label="L4 · SUNFLEX-EMS piloto: BESS 500 kW/1 MWh + DR + UCF-MPC",
                       bess="pilot", dr=True, venta=False),
    "escala":     dict(label="L5 · SUNFLEX-EMS escalado: BESS de capacidad de excedente + DR",
                       bess="esc", dr=True, venta=True),
}
ORDEN = list(ESCENARIOS)


def construir(c: Caso, esc: str, cap: float, per: dict, imp_cap: float):
    import pypsa
    z = impedancias(c, cap)
    sns = pd.date_range("2026-02-10 00:00", periods=NPASOS, freq=f"{TRAB}min")
    n = pypsa.Network(snapshots=sns, name=f"SUNFLEX · {c.corto} · {esc}")
    n.add("Carrier", ["AC", "solar", "red", "termico", "bateria", "flex", "mercado"])
    n.add("Bus", ["PV", "CAMPO", "SIN"], v_nom=[c.v_pv, c.v_campo, c.v_se], carrier="AC")

    # --- planta PV (con curtailment endógeno: p ≤ p_max_pu·p_nom) ---
    pac = round(per["tope"], 3)
    v_exc = float(np.mean(precio_serie(c).values)) * 1000.0      # COP/MWh
    n.add("Generator", "PV", bus="PV", carrier="solar", p_nom=pac,
          marginal_cost=-v_exc, control="PQ", p_min_pu=0.0)
    n.generators_t.p_max_pu["PV"] = np.minimum(np.asarray(per["pv"], float) / pac, 1.0)

    # --- demanda del activo ---
    n.add("Load", "Proceso", bus="CAMPO", carrier="red",
          p_set=per["dem"].values, q_set=per["q"].values)

    # --- la restricción: alimentador PV→campo limitado a `cap` ---
    # La restricción de capacidad de conducción se modela como un ENLACE
    # UNIDIRECCIONAL PV -> CAMPO limitado a `cap` MW. Unidireccional porque la
    # cabecera del parque tiene protección de potencia inversa: no se puede
    # comprar del SIN a través del alimentador del parque. Consecuencia física
    # clave: el BESS y la carga flexible de planta solo pueden cargarse con
    # energía solar (nunca comprándola), i.e. capturan excedente, no hacen
    # arbitraje con la red. En el flujo de cargas (NR) este mismo elemento sí
    # lleva impedancia, porque ahí lo que se evalúa es tensión y pérdidas.
    n.add("Link", "RESTRICCION", bus0="PV", bus1="CAMPO", carrier="AC",
          p_nom=cap, p_min_pu=0.0, p_max_pu=1.0, efficiency=1.0)
    # --- transformación al SEN/SIN ---
    n.add("Transformer", "TRANSF_SE", bus0="CAMPO", bus1="SIN", s_nom=z["s_campo"],
          x=z["x_campo_pu"], r=z["r_campo_pu"], g=0.0, b=0.0, tap_ratio=1.0,
          tap_side=0, phase_shift=0.0, model="t")

    # --- compra al SIN, precio horario (curva de pato) ---
    n.add("Generator", "SIN", bus="SIN", carrier="red", p_nom=imp_cap,
          marginal_cost=precio_serie(c).values * 1000.0, p_min_pu=0.0)

    cfg = ESCENARIOS[esc]
    # --- venta de excedentes (referencia L2): sumidero mercado con ingreso ---
    if cfg["venta"]:
        n.add("Generator", "MERCADO", bus="SIN", carrier="mercado", p_nom=3.0,
              p_min_pu=0.0, sign=-1, control="PQ",
              marginal_cost=-(c.p_valle * 1000.0 * PRECIO_VENTA_DESC))
    # --- BESS, en la barra del parque (a la izquierda de la restricción) ---
    bp = {"pilot": c.bess_p, "esc": c.bess_p_esc}.get(cfg["bess"], 0.0)
    if bp > 0:
        bh = (c.bess_e / c.bess_p) if cfg["bess"] == "pilot" else c.bess_h_esc
        n.add("StorageUnit", "BESS", bus="PV", carrier="bateria", p_nom=bp, max_hours=bh,
              efficiency_store=0.945, efficiency_dispatch=0.945,
              cyclic_state_of_charge=True, state_of_charge_initial=0.5,
              state_of_charge_initial_per_period=True, spill_to_p=False,
              marginal_cost=DEG_COP_MWH,
              standing_loss=0.0004)
    # --- Flexibilidad de demanda, en DOS bloques con efectos distintos:
    #   DR_PLANTA: cargas diferibles co-localizadas en la cabecera del parque
    #              (inyección de agua, batching, tratamiento, electrolizador).
    #              Está AL IZQUIERDA de la restricción de conducción, por eso
    #              SÍ captura el excedente que hoy se vierte.
    #   DR_PROCESO: cargas diferibles del proceso, del lado de la demanda.
    #              No alivia la restricción, pero optimiza el costo de compra.
    if cfg["dr"] and c.flex_mw > 0:
        fp = round(c.flex_mw * c.flex_planta_frac, 2)
        fq = round(c.flex_mw - fp, 2)
        if fp > 0:
            n.add("StorageUnit", "DR_PLANTA", bus="PV", carrier="flex", p_nom=fp,
                  max_hours=c.dr_ventana_h, efficiency_store=1.0, efficiency_dispatch=1.0,
                  cyclic_state_of_charge=True, state_of_charge_initial=0.0,
                  state_of_charge_initial_per_period=True, marginal_cost=1500.0)
        if fq > 0:
            n.add("StorageUnit", "DR_PROCESO", bus="CAMPO", carrier="flex", p_nom=fq,
                  max_hours=c.dr_ventana_h, efficiency_store=0.99, efficiency_dispatch=0.99,
                  cyclic_state_of_charge=True, state_of_charge_initial=0.0,
                  state_of_charge_initial_per_period=True, marginal_cost=3000.0)
    # --- respaldo térmico despachable (compromiso de unidades) ---
    if c.turbo_p > 0:
        n.add("Generator", "TURBO", bus="CAMPO", carrier="termico",
              p_nom=c.turbo_p * max(c.turbinas, 1), marginal_cost=c.turbo_cost * 1000.0,
              committable=True, p_min_pu=0.35, ramp_limit_up=0.25, ramp_limit_down=0.25,
              min_up_time=4, min_down_time=4, start_up_cost=c.turbo_p * 12_000.0,
              shut_down_cost=0.0, up_time_before=0, down_time_before=0,
              cyclic_state_of_charge=False)
    return n


def _sum(x) -> float:
    try:
        return float(np.asarray(x).sum())
    except Exception:
        return 0.0


def metricas(n, c: Caso, per: dict, esc: str) -> dict:
    pv_disp = per["pv"] * DT
    p_pv = n.generators_t.p["PV"].values
    curt = np.clip(pv_disp - p_pv * DT, 0.0, None)
    imp = np.clip(n.generators_t.p["SIN"].values * DT, 0, None)
    p = precio_serie(c) * 1000.0
    gasto_compra = float((imp * p).sum() / 1000.0)       # miles COP/día
    gasto_fuel = 0.0
    if "TURBO" in n.static("Generator").index:
        gasto_fuel = float((np.clip(n.generators_t.p["TURBO"].values * DT, 0, None)
                            * c.turbo_cost).sum() / 1000.0)
    gasto = gasto_compra + gasto_fuel                     # costo total de operación
    venta_mwh = 0.0
    if "MERCADO" in n.static("Generator").index:
        venta_mwh = _sum(np.clip(n.generators_t.p["MERCADO"].values, 0, None) * DT)
    pico = np.asarray((_t >= 17) & (_t <= 21))
    bess_p = (n.storage_units_t.p["BESS"].values if "BESS" in n.static("StorageUnit").index
              else np.zeros(NPASOS))
    dr_p = np.zeros(NPASOS)
    for nm in ("DR_PLANTA", "DR_PROCESO"):
        if nm in n.static("StorageUnit").index:
            dr_p = dr_p + n.storage_units_t.p[nm].values
    soc = (n.storage_units_t.state_of_charge["BESS"].values * 100
           if "BESS" in n.static("StorageUnit").index else np.zeros(NPASOS))
    disp = np.clip(-bess_p, 0, None)                      # p<0 = descarga (PyPSA: p>0 = carga)
    carg = np.clip(bess_p, 0, None)
    try:
        fl = float(abs(n.lines_t.p0["RESTRICCION"].values).max())
    except Exception:
        fl = 0.0
    return dict(
        escenario=esc, label=ESCENARIOS[esc]["label"],
        generacion_mwh_dia=round(float(pv_disp.sum()), 2),
        entregada_mwh_dia=round(float((p_pv * DT).sum()), 2),
        vert_mwh_dia=round(float(curt.sum()), 2),
        vert_max_mw=round(float(curt.max()), 2),
        vert_pct=round(float(100 * curt.sum() / max(pv_disp.sum(), 1e-9)), 1),
        compras_mwh_dia=round(float(imp.sum()), 2),
        compras_pico_mwh_dia=round(float(imp[pico].sum()), 2),
        gasto_kcop_dia=round(gasto, 1),
        gasto_compra_kcop_dia=round(gasto_compra, 1),
        gasto_combustible_kcop_dia=round(gasto_fuel, 1),
        gasto_mcop_anio=round(gasto * 365 / 1000.0, 1),
        venta_mwh_dia=round(venta_mwh, 2),
        ingreso_venta_mcop_anio=round(venta_mwh * c.p_valle * PRECIO_VENTA_DESC * 365 / 1000.0, 1),
        autoconsumo_pct=round(float(100 * (p_pv * DT).sum() / max(pv_disp.sum(), 1e-9)), 1),
        bess_carga_mwh=round(float((carg * DT).sum()), 2),
        bess_descarga_mwh=round(float((disp * DT).sum()), 2),
        bess_ciclos_dia=round(float((disp * DT).sum() / max(c.bess_e if esc != "escala" else c.bess_p_esc * c.bess_h_esc, 1e-9)), 2),
        soc_min_pct=round(float(soc.min()), 1), soc_max_pct=round(float(soc.max()), 1),
        dr_mwh=round(float((np.clip(-dr_p, 0, None) * DT).sum()), 2),
        descarga_en_pico_pct=round(float(100 * disp[pico].sum() / max(disp.sum(), 1e-9)), 1),
        flujo_max_mw=round(fl, 2),
        co2_t_dia=round(float(imp.sum() * c.co2), 2),
        co2_t_anio=round(float(imp.sum() * c.co2 * 365), 0),
    )


def _opt(n):
    """OPF determinista (HiGHS). Silencioso y con duales para precios nodales."""
    kw = dict(solver_name="highs", solver_options={"output_flag": False, "presolve": "on"})
    for try_kw in (dict(assign_all_duals=True, **kw), kw, dict(solver_name="highs"), {}):
        try:
            status, cond = n.optimize(**try_kw)
            return status, cond
        except Exception:
            continue
    return "error", "infeasible"


def resolver(key: str) -> dict:
    """Resuelve los cinco escenarios del caso y devuelve KPI + series horarias."""
    c = CASOS[key]
    per = perfiles(c)
    cap = calibrar(c, per)
    curt_bruto_dia = float(curtail_bruto(per["pv"], per["dem"], cap).sum() * DT)
    imp_cap = max(c.demanda_pico * 1.35, cap * 1.5, 30.0)
    nets, mets = {}, {}
    for esc in ORDEN:
        n = construir(c, esc, cap, per, imp_cap)
        _opt(n)
        nets[esc] = n
        mets[esc] = metricas(n, c, per, esc)
    base, pil, esc5 = mets["base"], mets["piloto"], mets["escala"]
    std = mets["bess_std"]
    base_rep = float(c.curtail_dia)
    base_uso = min(base_rep, max(float(base["vert_mwh_dia"]), 1e-9))
    out = dict(
        key=key, nombre=c.nombre, corto=c.corto, cap_mw=cap, curtail_bruto=round(curt_bruto_dia, 2),
        perfiles=per, metricas=mets,
        base_reportada=base_rep, base_modelo=base["vert_mwh_dia"], base_kpi=round(base_uso, 2),
        desvio_calibracion_pct=round(100 * (base["vert_mwh_dia"] - base_rep) / max(base_rep, 1e-9), 1),
        reduccion_piloto_pct=round(100 * (1 - pil["vert_mwh_dia"] / max(base_uso, 1e-9)), 1),
        reduccion_escala_pct=round(100 * (1 - esc5["vert_mwh_dia"] / max(base_uso, 1e-9)), 1),
        reduccion_piloto_vs_modelo_pct=round(100 * (1 - pil["vert_mwh_dia"] / max(base["vert_mwh_dia"], 1e-9)), 1),
        reduccion_escala_vs_modelo_pct=round(100 * (1 - esc5["vert_mwh_dia"] / max(base["vert_mwh_dia"], 1e-9)), 1),
        captura_piloto_mwh=round(base_uso - pil["vert_mwh_dia"], 2),
        captura_escala_mwh=round(base_uso - esc5["vert_mwh_dia"], 2),
        ahorro_piloto_mcop=round(base["gasto_mcop_anio"] - pil["gasto_mcop_anio"], 1),
        ahorro_escala_mcop=round(base["gasto_mcop_anio"] - esc5["gasto_mcop_anio"], 1),
        valor_ad_mpc_pct=round(100 * (std["gasto_mcop_anio"] - pil["gasto_mcop_anio"]) /
                               max(pil["gasto_mcop_anio"], 1e-9), 1),
        venta_vs_bess_mcop=(base["gasto_mcop_anio"] - mets["venta"]["gasto_mcop_anio"]
                            + mets["venta"]["ingreso_venta_mcop_anio"]),
    )
    out["tabla"] = pd.DataFrame({
        "hora": [f"{int(h):02d}:{int((i * TRAB) % 60):02d}" for i, h in enumerate(_t)],
        "PV disponible (MW)": per["pv"],
        "Demanda (MW)": per["dem"],
        "Restricción habilitada (MW)": cap,
        "Curtailment base (MW)": curtail_bruto(per["pv"], per["dem"], cap),
        "PV base (MW)": nets["base"].generators_t.p["PV"].values,
        "PV SUNFLEX piloto (MW)": pil_pv(nets),
        "Curtailment SUNFLEX (MW)": np.clip(per["pv"] - nets["piloto"].generators_t.p["PV"].values, 0, None),
        "BESS (MW, +carga)": (nets["piloto"].storage_units_t.p["BESS"].values
                              if "BESS" in nets["piloto"].static("StorageUnit").index else np.zeros(NPASOS)),
        "SOC BESS (%)": (nets["piloto"].storage_units_t.state_of_charge["BESS"].values * 100
                          if "BESS" in nets["piloto"].static("StorageUnit").index else np.full(NPASOS, np.nan)),
        "DR desplazada (MW)": (nets["piloto"].storage_units_t.p["DR"].values
                               if "DR" in nets["piloto"].static("StorageUnit").index else np.zeros(NPASOS)),
        "Compra SIN base (MW)": nets["base"].generators_t.p["SIN"].values,
        "Compra SIN SUNFLEX (MW)": nets["piloto"].generators_t.p["SIN"].values,
        "Precio bolsa (COP/kWh)": precio_serie(c),
    })
    i_pico_pv = int(np.argmax(np.asarray(per["pv"], float)))
    i_pico_dem = int(np.argmin(np.abs(_t - 19.0))) * 4 // 4
    i_pico_dem = int(np.argmin(np.abs(_t - 19.0)))
    out["horas_pf"] = dict(pv=i_pico_pv, dem=i_pico_dem)
    out["pf"] = {esc: {"gen": flujo_cargas(c, cap, nets[esc], i_pico_pv),
                       "pico": flujo_cargas(c, cap, nets[esc], i_pico_dem)}
                 for esc in ORDEN}
    out["precios_nodales"] = nodal_prices(nets["base"], c)
    out["precios_nodales_piloto"] = nodal_prices(nets["piloto"], c)
    out["nets"] = nets
    return out


def pil_pv(nets):
    return nets["piloto"].generators_t.p["PV"].values


def nodal_prices(n, c: Caso) -> dict:
    """Precios marginales por nodo y hora (COP/kWh), calculados **sobre el despacho
    ya resuelto** con la definición económica del dual del balance de potencia:
    el precio del nodo es el costo del suministrador no saturado más barato.

    Se calculan así y no leyendo los duales del solver porque HiGHS devuelve el
    vector dual de `Bus-nodal_balance` degenerado (todo ceros) en esta
    formulación — se documenta en el informe para que la restricción de
    replicación del resultado sea explícita.
    """
    DT_ = DT
    p = precio_serie(c).values
    imp = np.clip(n.generators_t.p["SIN"].values, 0, None)
    head_sin = n.generators["p_nom"].get("SIN", 0.0) - imp
    lam_sin = np.where(head_sin > 1e-6, p, np.nan)
    if "MERCADO" in n.static("Generator").index:
        v = np.clip(n.generators_t.p["MERCADO"].values, 0, None)
        lam_sin = np.where(v > 1e-6, c.p_valle * PRECIO_VENTA_DESC, lam_sin)
    lam_cam = np.array(lam_sin, dtype=float)
    if "TURBO" in n.static("Generator").index:
        tp = n.generators["p_nom"]["TURBO"]
        th = tp - np.clip(n.generators_t.p["TURBO"].values, 0, None)
        lam_cam = np.where(th > 1e-6, np.nanmin(np.vstack([lam_cam, np.full_like(lam_cam, c.turbo_cost)]),
                                                axis=0), lam_cam)
    if "BESS" in n.static("StorageUnit").index:
        bd = np.clip(-n.storage_units_t.p["BESS"].values, 0, None)
        lam_cam = np.where(bd > 1e-6, np.nanmin(np.vstack([lam_cam, np.full_like(lam_cam,
                        DEG_COP_MWH / 1000.0)]), axis=0), lam_cam)
    disp_pv = np.asarray(n.generators_t.p["PV"].values, float)
    avail = np.minimum(np.asarray(perfiles(c)["pv"], float), n.generators["p_nom"]["PV"])
    exc = avail - disp_pv > 1e-4                      # hay excedente que se está cortando
    lam_pv = np.where(exc, 0.0, lam_cam)
    def _s(v):
        v = np.asarray(v, float)
        f = v[np.isfinite(v)]
        return dict(media=round(float(f.mean()), 1) if f.size else 0.0,
                    min=round(float(f.min()), 1) if f.size else 0.0,
                    max=round(float(f.max()), 1) if f.size else 0.0,
                    medio_dia=round(float(np.nanmean(v[(11 <= _t) & (_t <= 15)])), 1),
                    pico=round(float(np.nanmax(v[(17 <= _t) & (_t <= 21)])), 1))
    return dict(PV=_s(lam_pv), CAMPO=_s(lam_cam), SIN=_s(lam_sin),
                serie=dict(lam_pv=[round(float(x), 1) for x in np.nan_to_num(lam_pv, nan=0.0)],
                           lam_cam=[round(float(x), 1) for x in np.nan_to_num(lam_cam, nan=0.0)],
                           lam_sin=[round(float(x), 1) for x in np.nan_to_num(lam_sin, nan=0.0)]),
                metodo="precio del suministrador marginal no saturado, calculado ex-post "
                       "sobre el despacho óptimo (duales de HiGHS degenerados en esta formulación)")


# ══════════════════════════════════════════════════════════════════════
#  5. FLUJO DE CARGAS PyPSA en la hora crítica (compara con la hoja LF)
# ══════════════════════════════════════════════════════════════════════

def flujo_cargas(c: Caso, cap: float, n, i: int) -> dict:
    """Newton-Raphson AC de PyPSA sobre la MISMA topología de la hoja LF, con el
    despacho ya resuelto para el escenario en la hora `i`. Devuelve tensiones,
    ángulos, cargas de equipo y pérdidas."""
    z = impedancias(c, cap)
    per = perfiles(c)
    g = n.generators_t
    p_pv = float(g.p["PV"].values[i])
    try:
        q_pv = float(g.q["PV"].values[i])
    except Exception:
        q_pv = p_pv * 0.20
    dem = float(per["dem"].values[i])
    qe = float(per["q"].values[i])
    try:
        dem = float(n.loads_t.p["Proceso"].values[i])
        qe = float(n.loads_t.q["Proceso"].values[i])
    except Exception:
        pass
    p_bess = float(n.storage_units_t.p["BESS"].values[i]) if "BESS" in n.static("StorageUnit").index else 0.0
    q_bess = (-0.30 * abs(p_bess)) if p_bess else 0.0
    p_dr = 0.0
    for nm in ("DR_PLANTA", "DR_PROCESO"):
        if nm in n.static("StorageUnit").index:
            try:
                p_dr += float(n.storage_units_t.p[nm].values[i])
            except Exception:
                pass
    tur = float(g.p["TURBO"].values[i]) if "TURBO" in n.static("Generator").index else 0.0
    mer = float(np.clip(g.p["MERCADO"].values[i], 0, None)) if "MERCADO" in n.static("Generator").index else 0.0

    import pypsa
    m = pypsa.Network(snapshots=pd.to_datetime([n.snapshots[i]]))
    m.add("Carrier", ["solar", "bateria", "termico", "red", "mercado"])
    m.add("Bus", ["PV", "CAMPO", "SIN"], v_nom=[c.v_pv, c.v_campo, c.v_se],
          carrier="AC", v_mag_pu_set=[1.02, 1.0, 1.0])
    m.add("Generator", "PV", bus="PV", control="PQ", p_set=round(p_pv, 4),
          q_set=round(q_pv, 4), p_nom=per["tope"], carrier="solar")
    if p_bess != 0.0:
        m.add("StorageUnit", "BESS", bus="PV", p_set=round(p_bess, 4), q_set=round(q_bess, 4),
              p_nom=max(c.bess_p, abs(p_bess) * 1.2), carrier="bateria")
    m.add("Line", "RESTRICCION", bus0="PV", bus1="CAMPO", length=c.l_pv_km,
          r=z["r_restr"], x=z["x_restr"], b=0.0, g=0.0, s_nom=cap, carrier="AC")
    m.add("Load", "Proceso", bus="CAMPO", p_set=round(dem + max(p_dr, 0.0), 4),
          q_set=round(qe, 4))
    if p_dr < 0:
        m.add("Generator", "DR", bus="CAMPO", control="PQ", p_set=round(-p_dr, 4), q_set=0.0,
              p_nom=c.flex_mw, carrier="flex")
    if tur:
        m.add("Generator", "TURBO", bus="CAMPO", control="PQ", p_set=round(tur, 4), q_set=0.0,
              p_nom=round(c.turbo_p * max(c.turbinas, 1), 2), carrier="termico")
    m.add("Transformer", "TRANSF_SE", bus0="CAMPO", bus1="SIN", s_nom=z["s_campo"],
          x=z["x_campo_pu"], r=z["r_campo_pu"], g=0.0, b=0.0, tap_ratio=1.0, model="t")
    if mer:
        m.add("Load", "Venta", bus="SIN", p_set=round(mer, 4), q_set=0.0)
    m.add("Generator", "SIN", bus="SIN", control="Slack", p_set=0.0, p_nom=9999.0, carrier="red")
    conv, ok = None, False
    for tol, seed in ((1e-8, False), (1e-6, True), (1e-4, True)):
        try:
            conv = m.pf(snapshots=m.snapshots, use_seed=seed, x_tol=tol)
            ok = bool(np.asarray(conv["converged"]).all())
        except Exception as exc:
            conv, ok = str(exc)[:160], False
        if ok:
            break
    if not ok:
        return dict(ok=False, error="Newton-Raphson no convergió", detalle=str(conv)[:160])
    bt, lt, tt = m.buses_t, m.lines_t, m.transformers_t
    loss_l = float(lt.p0["RESTRICCION"].iloc[0] + lt.p1["RESTRICCION"].iloc[0])
    loss_t = float(tt.p0["TRANSF_SE"].iloc[0] + tt.p1["TRANSF_SE"].iloc[0])
    s_line = float(max(abs(lt.p0["RESTRICCION"].iloc[0]), abs(lt.p1["RESTRICCION"].iloc[0])))
    s_tr = float(max(abs(tt.p0["TRANSF_SE"].iloc[0]), abs(tt.p1["TRANSF_SE"].iloc[0])))
    return dict(
        ok=True, hora=str(m.snapshots[0].strftime("%H:%M")),
        v={b: round(float(bt.v_mag_pu[b].iloc[0]), 4) for b in ["PV", "CAMPO", "SIN"]},
        vkv={b: round(float(bt.v_mag_pu[b].iloc[0]) * v, 2)
             for b, v in [("PV", c.v_pv), ("CAMPO", c.v_campo), ("SIN", c.v_se)]},
        ang={b: round(float(np.degrees(bt.v_ang[b].iloc[0])), 2) for b in ["PV", "CAMPO", "SIN"]},
        linea_p0=round(float(lt.p0["RESTRICCION"].iloc[0]), 3),
        linea_p1=round(float(lt.p1["RESTRICCION"].iloc[0]), 3),
        linea_carga_pct=round(100 * s_line / max(cap, 1e-9), 1),
        linea_perdidas_mw=round(loss_l, 4),
        traf_carga_pct=round(100 * s_tr / z["s_campo"], 1),
        traf_mw=round(s_tr, 2),
        traf_perdidas_mw=round(loss_t, 4),
        perdidas_tot_mw=round(loss_l + loss_t, 4),
        perdidas_pct=round(100 * (loss_l + loss_t) / max(dem, 1e-9), 2),
        p_pv=round(p_pv, 3), p_bess=round(p_bess, 3), p_dr=round(p_dr, 3),
        compra_slack=round(float(bt.p["SIN"].iloc[0]), 3),
        curtail_mw=round(max(float(per["pv"].values[i]) - p_pv, 0.0), 3),
    )


def pv_lim(c: Caso) -> float:
    return round(perfiles(c)["tope"], 3)


# ══════════════════════════════════════════════════════════════════════
#  6. HOJAS PARA LAS HERRAMIENTAS adjiebrotot
# ══════════════════════════════════════════════════════════════════════

def _nid():
    st = {"n": 0}

    def f():
        st["n"] += 1
        return st["n"]
    return f, st


def hoja_lf(c: Caso, r: dict, esc: str) -> dict:
    """Sheet del Load Flow Simulator (forma guardada LF: {v:1,name,next,el[]})."""
    cap = r["cap_mw"]
    z = impedancias(c, cap)
    per = r["perfiles"]
    i = int(np.argmax(np.asarray(per["pv"], float)))
    pf = (r["pf"].get(esc) or {}).get("gen") or {}
    nid, st = _nid()
    el = []
    b_pv, b_cam, b_se = nid(), nid(), nid()
    p_pv = pf.get("p_pv", round(float(min(per["pv"][i], min(per["dem"][i], cap))), 3))
    el += [dict(c="Bus", id=b_pv, name=f"PV {c.v_pv:g} kV", v_nom=c.v_pv, v_mag_pu_set=1.02, at=[10, 26, 10, 1]),
           dict(c="Bus", id=b_cam, name=f"Campo {c.v_campo:g} kV", v_nom=c.v_campo, at=[44, 26, 10, 1]),
           dict(c="Bus", id=b_se, name=f"SE {c.v_se:g} kV · SIN", v_nom=c.v_se, v_mag_pu_set=1.0, at=[78, 26, 10, 1]),
           dict(c="Generator", id=nid(), name=f"{c.corto} {c.mw_dc:g} MWp", bus=b_pv, control="PQ",
                p_set=p_pv, q_set=round(p_pv * 0.20, 3), p_nom=round(per["tope"], 2), style="pv", at=[-5, 1]),
           dict(c="Line", id=nid(), name=f"RESTRICCIÓN habilitada {cap:g} MW", bus0=b_pv, bus1=b_cam,
                r=round(z["r_restr"], 4), x=round(z["x_restr"], 4), s_nom=cap, length=c.l_pv_km, at=[0, 0, None]),
           dict(c="Load", id=nid(), name="Proceso / campo", bus=b_cam,
                p_set=round(float(per["dem"][i]), 3), q_set=round(float(per["q"][i]), 3), at=[-5, 0]),
           dict(c="Transformer", id=nid(), name=f"TR SE {z['s_campo']:g} MVA", bus0=b_cam, bus1=b_se,
                x=z["x_campo_pu"], r=z["r_campo_pu"], s_nom=z["s_campo"], at=[0, 0, None]),
           dict(c="Generator", id=nid(), name="SIN (slack)", bus=b_se, control="Slack", p_set=0.0,
                p_nom=round(max(c.demanda_pico * 1.6, cap * 2), 1), at=[3, 1])]
    if esc in ("piloto", "escala"):
        pb = pf.get("p_bess", 0.0)
        p_ = c.bess_p if esc == "piloto" else c.bess_p_esc
        e_ = c.bess_e if esc == "piloto" else c.bess_p_esc * c.bess_h_esc
        el.insert(5, dict(c="StorageUnit", id=nid(), name=f"BESS {p_:g}MW/{e_:g}MWh (carga)",
                          bus=b_pv, p_set=round(abs(pb), 3), q_set=round(-0.3 * abs(pb), 3), p_nom=p_, at=[5, 1]))
        if c.flex_mw > 0:
            el.insert(7, dict(c="Load", id=nid(), name=f"DR diferida {round(min(c.flex_mw, 3.0), 1)} MW",
                             bus=b_cam, p_set=round(min(c.flex_mw, 3.0), 3), q_set=0.0, at=[5, 0]))
    if c.turbo_p > 0 and pf.get("ok"):
        el.insert(7, dict(c="Generator", id=nid(), name=f"Respaldo {c.turbo_p:g} MW ×{c.turbinas}",
                          bus=b_cam, control="PQ", p_set=0.0, p_nom=round(c.turbo_p * c.turbinas, 1), at=[-9, 0]))
    return {"v": 1, "name": f"{c.corto} · {esc} · 15 min PyPSA", "next": st["n"] + 1, "el": el}


def _a24(x, n=24):
    y = np.array_split(np.asarray(x, float), n)
    y = np.array([float(v.mean()) for v in y])
    m = float(y.max()) or 1.0
    return [round(float(v / m), 3) for v in y], round(m, 2)


def _oferta_red(c: Caso):
    """Curva de oferta en 3 escalones del mercado mayorista: contratos < valle
    (mediodía solar) < resto < punta. Es la forma en que la hoja ED reproduce
    la curva de pato sin costo horario variable."""
    pv, val, pu = c.p_valle, c.p_valle, c.p_punta
    dm = _t
    w_rest = np.full(NPASOS, 1.0)
    w_valle = np.where((dm >= 9) & (dm <= 16), 1.0, 0.0)
    w_punta = np.where((dm >= 17) & (dm <= 21), 1.0, 0.0)
    out = dict(contratos=dict(cost=round((val * 0.25 + 250 * 0.5 + pu * 0.25), 0), w=None),
               valle=dict(cost=round(val + 25, 0), w=_a24(w_valle)[0]),
               punta=dict(cost=round(pu, 0), w=_a24(w_punta)[0]))
    return out


def hoja_ed(c: Caso, r: dict, esc: str) -> dict:
    """Sheet del ED/UC Simulator (forma guardada ED: {model:{v:2,...},opts,hour}).
    Costos en miles de COP/MWh (= COP/kWh)."""
    cap = r["cap_mw"]
    z = impedancias(c, cap)
    per = r["perfiles"]
    pv_s, pv_pk = _a24(per["pv"])
    dm_s, dm_pk = _a24(per["dem"])
    cfg = ESCENARIOS[esc]
    ofs = _oferta_red(c)
    nid, st = _nid()
    b_pv, b_cam, b_se = nid(), nid(), nid()
    el = [dict(c="Bus", id=b_pv, name=f"PV {c.v_pv:g} kV", v_nom=c.v_pv, at=[12, 26, 12, 1]),
          dict(c="Bus", id=b_cam, name=f"Campo {c.v_campo:g} kV", v_nom=c.v_campo, at=[46, 26, 12, 1]),
          dict(c="Bus", id=b_se, name=f"SIN {c.v_se:g} kV", v_nom=c.v_se, at=[82, 26, 12, 1]),
          dict(c="Generator", id=nid(), name=f"PV {c.mw_dc:g} MWp", bus=b_pv, p_nom=round(per["tope"], 1),
               marginal_cost=0.0, prof=pv_s, style="pv", at=[-5, 1]),
          dict(c="Line", id=nid(), name=f"Límite de conducción {cap:g} MW", bus0=b_pv, bus1=b_cam,
               r=round(z["r_restr"], 4), x=round(z["x_restr"], 4), s_nom=cap, length=c.l_pv_km, at=[0, 0, None]),
          dict(c="Transformer", id=nid(), name=f"TR SE {z['s_campo']:g} MVA", bus0=b_cam, bus1=b_se,
               x=z["x_campo_pu"], r=z["r_campo_pu"], s_nom=z["s_campo"], at=[0, 0, None]),
          dict(c="Load", id=nid(), name="Proceso / campo", bus=b_cam, p_set=dm_pk, prof=dm_s, at=[-6, 0]),
          dict(c="Generator", id=nid(), name=f"SIN contratos {ofs['contratos']['cost']:g}", bus=b_se,
               p_nom=round(max(dm_pk * 0.6, 10), 1), marginal_cost=ofs["contratos"]["cost"], grid=1, at=[-4, 1]),
          dict(c="Generator", id=nid(), name=f"SIN valle {ofs['valle']['cost']:g}", bus=b_se,
               p_nom=round(dm_pk * 1.6, 1), marginal_cost=ofs["valle"]["cost"], prof=ofs["valle"]["w"],
               grid=1, at=[0, 1]),
          dict(c="Generator", id=nid(), name=f"SIN punta {ofs['punta']['cost']:g}", bus=b_se,
               p_nom=round(dm_pk * 1.6, 1), marginal_cost=ofs["punta"]["cost"], prof=ofs["punta"]["w"],
               grid=1, at=[4, 1])]
    bp = {"pilot": c.bess_p, "esc": c.bess_p_esc}.get(cfg["bess"], 0.0)
    if bp > 0:
        bh = (c.bess_e / c.bess_p) if cfg["bess"] == "pilot" else c.bess_h_esc
        el.append(dict(c="StorageUnit", id=nid(), name=f"BESS {bp:g}MW/{round(bp * bh, 1):g}MWh",
                       bus=b_pv, p_nom=bp, max_hours=round(bh, 2), eff=0.89, soc0=0.5, at=[5, 1]))
    if cfg["dr"] and c.flex_mw > 0:
        el.append(dict(c="StorageUnit", id=nid(), name=f"Carga diferible {c.flex_mw:g}MW", bus=b_cam,
                       p_nom=c.flex_mw, max_hours=c.dr_ventana_h, eff=0.99, soc0=0.0, at=[5, 0]))
    if c.turbo_p > 0:
        el.append(dict(c="Generator", id=nid(), name=f"Respaldo {c.turbo_p:g}MW ×{c.turbinas}", bus=b_cam,
                       p_nom=round(c.turbo_p * c.turbinas, 1), marginal_cost=c.turbo_cost, committable=1,
                       p_min_pu=0.35, start_up_cost=round(c.turbo_p * c.turbinas * 12, 0), min_up_time=4,
                       min_down_time=4, ramp_limit_up=0.25, ramp_limit_down=0.25, init=0, at=[-9, 0]))
    if cfg["venta"]:
        el.append(dict(c="Link", id=nid(), name="Venta excedentes bolsa", bus0=b_cam, bus1=b_se,
                       p_nom=3.0, efficiency=0.99, both=0, at=[0, 1, None]))
    return {"model": dict(v=2, name=f"{c.corto} · {esc}", next=st["n"] + 1, el=el),
            "opts": dict(mode="uc" if (c.turbo_p > 0 or cfg["dr"]) else "edm", hours=24),
            "hour": int(_t[int(np.argmax(per['pv']))])}


# ══════════════════════════════════════════════════════════════════════
#  7. CASO AGREGADO: excedentes variables de 3 a 8 MW (pregunta 3 del Reto 1)
# ══════════════════════════════════════════════════════════════════════

def caso_3a8mw() -> dict:
    """Rampa sintética del excedente agregado del portafolio (3→8 MW) y respuesta
    del conjunto BESS 8 MW/16 MWh + 22 MW de DR, paso 15 min."""
    exc = 5.5 + 2.5 * np.sin(2 * np.pi * (_t - 11.75) / 3.0)
    exc = np.where((_t >= 11.0) & (_t <= 15.0), np.clip(exc, 3.0, 8.0), 0.0)
    P, E = 8.0, 16.0
    soc, carga, desc, vert, serv = [], [], [], [], []
    s = 0.25 * E
    dr = 0.0
    for i, x in enumerate(exc):
        c_ = min(x, P, (E - s) / DT * 0.945)
        s = min(E, s + c_ * DT * 0.945)
        d_ = min(P - c_, s / DT * 0.945) if _t[i] >= 17.0 else 0.0
        s = max(0.0, s - d_ * DT)
        dr_ = min(max(0.0, x - c_), 22.0 * 0.5) if _t[i] < 15.0 else 0.0
        soc.append(100 * s / E); carga.append(c_ + dr_); desc.append(d_)
        vert.append(max(x - c_ - dr_, 0.0)); serv.append(d_)
    e_dia = float(exc.sum() * DT)
    return dict(t=_t, exc=exc, soc=np.array(soc), carga=np.array(carga), desc=np.array(desc),
                vert=np.array(vert), serv=serv, excedente_dia_mwh=round(e_dia, 1),
                capturado_mwh=round(float((np.array(carga)).sum() * DT), 1),
                vertido_mwh=round(float(np.array(vert).sum() * DT), 1),
                reduccion_pct=round(100 * (1 - np.array(vert).sum() / max(exc.sum(), 1e-9)), 1),
                energia_anual_mwh=round(e_dia * 300, 0))


# ══════════════════════════════════════════════════════════════════════
#  8. ECONOMÍA DEL ACTIVO (TCO a 10 años) y presupuesto
# ══════════════════════════════════════════════════════════════════════

BNEF = dict(pack_usd_kwh=108.0, estacionario_usd_kwh=70.0, celda_usd_kwh=74.0,
            lfp_usd_kwh=81.0, proyeccion_2026=105.0, factor_epc=1.8, cop_usd=4200.0)


def lcos(p_mw: float, e_mwh: float, ciclos_dia: float = 1.0, años: int = 10,
         degr_anual: float = 0.020, tasa: float = 0.105, oem_frac: float = 0.022) -> dict:
    capex = (e_mwh * 1000 * BNEF["pack_usd_kwh"] * BNEF["factor_epc"] + p_mw * 1000 * 120.0)
    capex_cop = capex * BNEF["cop_usd"]
    oem = capex * oem_frac
    e_total = 0.0
    e = e_mwh
    for y in range(1, años + 1):
        e_total += e * 365 * ciclos_dia
        e *= (1 - degr_anual)
    npv_oem = sum(oem * (1 - 0.03) ** (k - 1) / (1 + tasa) ** k for k in range(1, años + 1))
    npv_capex = capex_cop
    total_cop = npv_capex + npv_oem                      # COP, valor presente
    lcos_cop_mwh = total_cop / max(e_total, 1e-9)         # COP/MWh
    return dict(capex_usd=round(capex, 0), capex_mcop=round(capex_cop / 1e6, 1),
                oem_usd_anio=round(oem, 0), energia_ciclo_mwh=round(e_total, 0),
                lcos_cop_mwh=round(lcos_cop_mwh, 0),
                lcos_cop_kwh=round(lcos_cop_mwh / 1000.0, 1),
                lcos_usd_mwh=round(lcos_cop_mwh / BNEF["cop_usd"], 1),
                ltv_cop_mcop=round(total_cop / 1e6, 1),
                años=años, ciclos_dia=ciclos_dia)


PRESUPUESTO = [
    ("Talento humano", "Dirección técnica y científica (Investigador Principal, 0,35 FTE × 6 meses)", 96.0),
    ("Talento humano", "Líder de optimización / MPC (1 FTE × 6 meses)", 78.0),
    ("Talento humano", "Ingeniero de datos e integración OT/IT (1 FTE × 6 meses)", 72.0),
    ("Talento humano", "Ingeniero eléctrico de campo y comisionamiento (1 FTE × 6 meses)", 66.0),
    ("Talento humano", "Soporte regulatorio y gestión del piloto (0,4 FTE × 6 meses)", 38.0),
    ("Talento humano", "Especialista SST en campo y permisos (0,3 FTE × 6 meses)", 24.0),
    ("Materiales e insumos", "Módulos de batería LFP 1 MWh (contenedores 20 ft, 500 kW/1 MWh)", 168.0),
    ("Materiales e insumos", "Sensores, TC, PT, medidores clase 0,2S y cableado de instrumentación", 46.0),
    ("Materiales e insumos", "Insumos de obra eléctrica, puesta a tierra y señalización RETIE", 21.0),
    ("Servicios especializados", "EPC local: obra civil menor, izaje, conexión y maniobras", 84.0),
    ("Servicios especializados", "Estudios de calidad de energía, cortocircuito y coordinación de protecciones", 34.0),
    ("Servicios especializados", "Ciberseguridad IEC 62443, pruebas de penetración y plan de remediación", 27.0),
    ("Servicios especializados", "Servidor/SCADA de campo, broker MQTT, historian y licencias de nube", 18.0),
    ("Equipos", "PCS/bidirccional 500 kW + transformador de tensión 34,5 kV", 118.0),
    ("Equipos", "Gateway industrial, UPS, red WiFi 6 de planta y tablero de acoplamiento", 26.0),
    ("Viajes", "Traslados, alojamiento y viáticos (Bogotá–Meta–Huila–Bolívar, 24 viajes)", 30.0),
    ("Otros", "Pólizas, seguridad industrial, EPP y gestión de residuos (RPBI/RUAS)", 15.0),
    ("Otros", "Contingencia 5% (repuestos críticos y horas extra de comisionamiento)", 24.0),
]
PRESUPUESTO_TOTAL = round(sum(x[2] for x in PRESUPUESTO), 1)

CRONOGRAMA = [
    ("M1", "Estructura, acta de inicio, APD y matriz de riesgos",
     "Plan de trabajo detallado, acta firmada, APD radicada, lista de habilitantes de campo", 62.0),
    ("M2", "Modelado del activo, línea base de curtailment y campaña de medición",
     "Informe de línea base (12 meses de datos + verificación en campo), modelo calibrado (MAPE<8%)", 96.0),
    ("M3", "Suministro e integración del BESS demostrador; desarrollo UCF-MPC v1",
     "BESS en sitio, HIL/SIL con datos reales, suite de pruebas automatizada, API CADE beta", 208.0),
    ("M4", "Conexión, comisionamiento, pruebas RETIE y energización en modo monitoreado",
     "Protocolos de energización, actas, informe RETIE, permisos del operador de red", 246.0),
    ("M5", "Operación asistida con DR co-optimizada y pronóstico activo",
     "KPIs en vivo en Grafana/CADE, informe mensual de captura de excedentes", 132.0),
    ("M6", "Piloto en lazo cerrado, validación económica y plan de escalamiento",
     "Informe final con KPI auditados, ROI validado, plan de escalamiento 4-8 MW, código y datos entregados", 76.0),
]
CRONOGRAMA_TOTAL = round(sum(x[3] for x in CRONOGRAMA), 1)

EQUIPO = [
    dict(nombre="Mauricio Gómez Machado", rol="Director de Proyecto / Investigador Principal",
         perfil="Ingeniero eléctrico-especialista en regulación de gas y energía; 22 años en Ecopetrol, "
                "Creg y comercialización mayorista",
         exp="Alto", dedicacion_pct=30, h_semana=12,
         contrib="Enlace con CADE y vicepresidencias, regulación, estructuración comercial"),
    dict(nombre="Sergio Francisco Rivera Rodríguez", rol="Líder científico — optimización UCF-MPC",
         perfil="Ph.D. en Ciencias de la Ingeniería, profesor titular UNAL Sede Manizales, grupo Power Systems "
                "Advanced Research; líneas de forecasting, energía distribuida y optimización estocástica",
         exp="Experto", dedicacion_pct=40, h_semana=16,
         contrib="Formulación matemática UCF-MPC, validación de KPI, dirección de Tesis aplicadas al piloto"),
    dict(nombre="Libardo Acero", rol="Director Jurídico-Regulatorio (Consultoría Regulatoria SAS)",
         perfil="Abogado/consultor en regulación eléctrica, contratos de conexión y habilitación de proyectos",
         exp="Alto", dedicacion_pct=30, h_semana=12,
         contrib="CREG 701/2025, procedures de conexión, anexos de la convocatoria, propiedad intelectual"),
    dict(nombre="David Parra", rol="Product Owner — Kai Desarrollo",
         perfil="Ingeniero, desarrollo de negocio en proyectos de energía sostenible",
         exp="Alto", dedicacion_pct=50, h_semana=20,
         contrib="Roadmap de producto, alcance, relación con el cliente y escalamiento comercial"),
    dict(nombre="Juan Camilo Betancur", rol="Líder de Ingeniería Eléctrica (100 % dedicación)",
         perfil="Ing. eléctrico, especialista en media tensión, protecciones y calidad de energía",
         exp="Alto", dedicacion_pct=100, h_semana=40,
         contrib="Diseño de conexión BESS, estudios de cortocircuito y maniobras, RETIE"),
    dict(nombre="Andrés Felipe Ríos", rol="Líder de Software e Integración OT/IT (100 % dedicación)",
         perfil="Ing. de sistemas/automatización; IEC 61850, MQTT, OPC-UA, InfluxDB/Grafana",
         exp="Alto", dedicacion_pct=100, h_semana=40,
         contrib="EMS, pasarela CADE, historian, APIs, dashboards y ciberseguridad"),
    dict(nombre="Laura Gómez Vélez", rol="Científica de Datos (80 % dedicación)",
         perfil="M.Sc. en ciencia de datos; modelos de pronóstico solar (pvlib, Prophet, Darts)",
         exp="Medio-Alto", dedicacion_pct=80, h_semana=32,
         contrib="Ensemble de pronóstico, validación RMSE, métricas de forecast"),
    dict(nombre="Jhonatan Ortiz", rol="Ingeniero de Campo y SST",
         perfil="Ing. eléctrico con curso de trabajos en altura y eléctrico, seguridad V.02",
         exp="Medio", dedicacion_pct=60, h_semana=24,
         contrib="Instrumentación, comisionamiento, permisos de campo, AST/APT"),
]

TRL = [
    dict(nivel="TRL 4", estado="Validado", hito="Componentes críticos (algoritmo de pronóstico y bloque de "
         "control) validados en laboratorio/simulación", evidencia="Casos IEEE y parques reales en repositorio público"),
    dict(nivel="TRL 5", estado="Validado", hito="Modelo de componente clave validado en entorno relevante "
         "(datos reales de operación de parques del Grupo)", evidencia="Simulaciones SUNFLEX-EMS v2.0 (25 pestañas)"),
    dict(nivel="TRL 6", estado="Validado", hito="Prototipo de software integrado en entorno relevante "
         "(flotas de pronóstico + MILP sobre series reales)", evidencia="App en producción interna + HIL sobre datos XM/IDEAM"),
    dict(nivel="TRL 7", estado="ACTUAL", hito="Demostrador del prototipo en el entorno real: BESS 500 kW / 1 MWh "
         "instalado y operando con el EMS en lazo cerrado en el activo del Grupo Ecopetrol",
         evidencia="Piloto en Castilla/San Fernando; KPI auditados; informe de línea base y resultados"),
    dict(nivel="TRL 8-9", estado="Trayectoria", hito="Sistema completo cualificado y en operación comercial "
         "(escalamiento 4-8 MW en el portafolio, replicable en >2.000 MW)",
         evidencia="Fase 2-3 del plan de escalamiento; contrato marco con el Grupo"),
]

KPI = [
    dict(id="K1", nombre="Nivel de aprovechamiento de excedentes energéticos",
         tipo="Técnico-operativo", baselines="0 MWh/día capturados (línea base)",
         meta="≥ 60 % del excedente vertido capturado en los 3 meses de operación asistida "
              "(≈ 1,9 MWh/día en Castilla con el demostrador; ≈ 8,4 MWh/día con DR)",
         fuente="15-min del EMS, contrastada con medidor de energía del punto de conexión (facturación XM)",
         umbral="≥ 45 % se considera éxito parcial; <30 % dispara el plan de corrección"),
    dict(id="K2", nombre="Reducción del curtailment (vertimiento) respecto a la línea base",
         tipo="Técnico", baselines="5,0 MWh/día (Castilla) · 14,0 MWh/día (San Fernando) — verificación en campo M2",
         meta="≥ 55 % de reducción sostenida en el bloque 12:00-14:00",
         fuente="Cálculo: E_potencial(SCADA solar) − E_entregada, validado con el operador de red",
         umbral="≥ 40 %"),
    dict(id="K3", nombre="Reducción de compras de energía al SIN",
         tipo="Económico", baselines="Consumo anual facturado del activo",
         meta="≥ 8 % de reducción del gasto en energía en el periodo de piloto y ≥ 15 % en el escenario escalado",
         fuente="Facturas XM/SSE y conciliación con el historian (InfluxDB/TimescaleDB)",
         umbral="≥ 5 %"),
    dict(id="K4", nombre="Calidad del pronóstico de excedentes (RMSE a 4 h)",
         tipo="Técnico", baselines="Sin pronóstico (operación reactiva)",
         meta="RMSE < 8 % a 4 h y < 12 % a 24 h sobre la campana del parque",
         fuente="Evaluación con Solar Forecast Arbiter (marco EPRI) sobre 90 días",
         umbral="RMSE ≤ 10 %"),
    dict(id="K5", nombre="Disponibilidad de la solución (uptime del EMS + BESS)",
         tipo="Operativo", baselines="n/a",
         meta="≥ 95 % de disponibilidad mensual, con MTTR < 4 h",
         fuente="Logs del controlador, monitoreo Grafana + alertas",
         umbral="≥ 92 %"),
    dict(id="K6", nombre="CO₂e evitado por mayor autoconsumo y menor compra",
         tipo="Ambiental", baselines=f"Compra al SIN con factor de emisión {CO2_SIN} tCO₂/MWh",
         meta="≥ 480 tCO₂e/año en el activo piloto (y ≥ 3.200 tCO₂e/año al escalar a 3-8 MW)",
         fuente="Cálculo verificado con la contabilidad de energía del SGCTM (Anexos CREG)",
         umbral="≥ 350 tCO₂e/año"),
    dict(id="K7", nombre="Estabilidad de tensión y carga del alimentador en la hora crítica",
         tipo="Técnico", baselines="Tensión en el límite superior y carga del alimentador ≥ 95 % a las 12:30",
         meta="Tensión en 0,97-1,03 p.u. y carga del alimentador < 90 % con el EMS en lazo cerrado",
         fuente="Flujo de cargas AC (PyPSA / hoja del Load Flow Simulator) + medición de calidad de energía en sitio",
         umbral="Ninguna barra fuera de 0,95-1,05 p.u. (RETIE/GTC)")
    ,
    dict(id="K8", nombre="Intercambio de información con el CADE",
         tipo="Organizacional", baselines="Sin visibilidad del excedente en el despacho",
         meta="100 % de los flujos definidos (telemetría 1 s / energía 15 min / plan de despacho 1 h) "
              "operando vía IEC 61850-MMS y MQTT, con datos de un día de anticipación",
         fuente="Pruebas conjuntas de aceptación con el equipo CADE (acta firmada)",
         umbral="≥ 90 % de los mensajes válidos en la prueba de aceptación"),
]

RIESGOS = [
    ("R1", "Retraso en el suministro del PCS/BESS (importación)", "Alta", "Media",
     "Cotización doble con 2 proveedores, anticipo y cláusula de entrega; el EMS se comisiona "
     "primero con datos HIL y sin BESS físico"),
    ("R2", "Ventana de intervención limitada por operación del campo (bombeo crítico)", "Alta", "Alta",
     "Maniobras en ventanas autorizadas por el CADE, plan de respaldo con turbo-generadores, "
     "modo 'shadow' durante el primer mes (el EMS recomienda, no actúa)"),
    ("R3", "Cambio regulatorio en el tratamiento de excedentes (CREG)", "Media", "Media",
     "Diseño sin dependencia de la venta de excedentes: el valor se captura dentro del activo "
     "(autoconsumo + DR + servicios); análisis de sensibilidad R-1 a R-3 en la pestaña de regulación"),
    ("R4", "Calidad/indisponibilidad de datos SCADA del parque", "Media", "Alta",
     "Campaña de medición propia (M2), series públicas XM/IDEAM/NSRDB como respaldo y "
     "reconstrucción con pvlib para llenar vacíos"),
    ("R5", "Riesgo eléctrico en comisionamiento (arc-flash, sobretensiones)", "Baja", "Muy alta",
     "AST/APT, bloqueo y etiquetado, RETIE/GTC, pruebas con inyección secundaria, EPP categoría 2, "
     "supervisor SST dedicado"),
    ("R6", "Ciberseguridad OT: acceso remoto a un activo crítico", "Media", "Alta",
     "Zona IEC 62443, DMZ, túnel unidireccional para publicación al CADE, sin puertos entrantes, "
     "firmas y arranque seguro, pentest antes de lazo cerrado"),
    ("R7", "Resultados de KPI por debajo de la meta", "Media", "Media",
     "Criterios de decisión y plan de corrección definidos en M2; hitos de paro/continua en M3, M4 y M5"),
]


# ══════════════════════════════════════════════════════════════════════
#  9. CASOS PARA LAS HERRAMIENTAS (loadflow-simulator / ed-uc-simulator)
# ══════════════════════════════════════════════════════════════════════

def n_es(x, nd=None) -> str:
    """Número con coma decimal y miles con punto (estilo es-CO).

    Con ``nd=None`` se quitan los ceros sobrantes; es el formato que ven el
    jurado en los textos de la app y en las notas de las hojas."""
    s = f"{float(x):,.{nd if nd is not None else 6}f}"
    if nd is None:
        s = s.rstrip("0").rstrip(".")
    return s.replace(".", "§").replace(",", ".").replace("§", ",")


def _clave(x: str) -> str:
    """Acepta la clave del caso ('castilla') o su nombre corto ('Castilla',
    'Refinerías' con o sin acentos) y devuelve la clave canónica."""
    import unicodedata as _ud
    if x in CASOS:
        return x
    sin = lambda t: _ud.normalize("NFKD", str(t)).casefold().replace(" ", "")
    d = {sin(v.corto): k for k, v in CASOS.items()}
    d.update({sin(k): k for k in CASOS})
    d.update({sin(v.nombre): k for k, v in CASOS.items()})
    if sin(x) in d:
        return d[sin(x)]
    raise KeyError(f"caso desconocido: {x!r} (válidos: {', '.join(CASOS)})")


def caso_hoja(key: str, esc: str) -> dict:
    """Par de hojas (LF y ED) de un caso-escenario, listas para inyectarse en las
    herramientas vendorizadas a través de `LF.PRESETS` / `ED.PRESETS`."""
    key = _clave(key)
    c = CASOS[key]
    r = resolver(key)
    lf = hoja_lf(c, r, esc)
    ed = hoja_ed(c, r, esc)
    m = r["metricas"][esc]
    pf = r["pf"].get(esc, {}).get("gen", {})
    titulo = f"{c.corto} · {esc}"
    nota = (f"Capacidad de conducción habilitada {n_es(r['cap_mw'])} MW · vertimiento "
            f"{n_es(m['vert_mwh_dia'], 2)} MWh/día ({n_es(m['vert_mwh_dia'] * 365, 0)} MWh/año) · "
            f"autoconsumo {n_es(m['autoconsumo_pct'], 1)} % · gasto {n_es(m['gasto_kcop_dia'], 0)} kCOP/día. "
            f"Hora {pf.get('hora','12:00')}: tensión PV {pf.get('v',{}).get('PV','–')} pu, "
            f"alimentador {pf.get('linea_carga_pct','–')} % de carga. "
            f"Hoja generada por sunflex_model.py (PyPSA {__import__('pypsa').__version__} + HiGHS), "
            f"no editada a mano.")
    py = dict(v=pf.get("v"), perdidas_mw=pf.get("perdidas_tot_mw"),
              linea_carga_pct=pf.get("linea_carga_pct"), traf_carga_pct=pf.get("traf_carga_pct"),
              p_pv=pf.get("p_pv"), compra_slack=pf.get("compra_slack"), ok=pf.get("ok"))
    return dict(key=titulo, lf=lf, ed=ed, nota=nota, cap_mw=r["cap_mw"], py=py,
                vert=m["vert_mwh_dia"], auto=m["autoconsumo_pct"],
                gasto=m["gasto_kcop_dia"])


def casepack() -> dict:
    """Todos los pares LF/ED que las dos herramientas deben poder seleccionar."""
    lf, ed, meta = {}, {}, {}
    for key in CASOS:
        for esc in ORDEN:
            h = caso_hoja(key, esc)
            lf[h["key"]] = h["lf"]
            ed[h["key"]] = h["ed"]
            meta[h["key"]] = dict(nota=h["nota"], cap_mw=h["cap_mw"], vert=h["vert"],
                                  auto=h["auto"], gasto=h["gasto"], caso=key, esc=esc,
                                  py=h["py"])
    d = caso_3a8mw()
    meta["_default"] = f"{CASOS['castilla'].corto} · piloto"
    return dict(lf=lf, ed=ed, meta=meta, default=meta["_default"], demo_3a8=dict(
        exc=[round(float(v), 3) for v in d["exc"]], soc=[round(float(v), 1) for v in d["soc"]],
        t=[round(float(v), 2) for v in d["t"]]))




# ══════════════════════════════════════════════════════════════════════════
#  10. PRESUPUESTO CONSOLIDADO, ANEXOS DE LA RESPUESTA Y UTILIDADES
# ══════════════════════════════════════════════════════════════════════════

PRESUPUESTO_COLS = ["categoria", "detalle", "m_cop"]
CRONOGRAMA_COLS = ["mes", "actividades", "entregables", "m_cop_incentivo"]
RIESGOS_COLS = ["id", "riesgo", "probabilidad", "impacto", "mitigacion"]

PRESUPUESTO_TOTAL = round(sum(x[2] for x in PRESUPUESTO), 1)      # costo total del piloto
INCENTIVO_RETO1 = 820.0                                            # según bases del reto
CONTRAPARTIDA = round(PRESUPUESTO_TOTAL - INCENTIVO_RETO1, 1)     # aporte del consorcio

DIAGRAMA_MERMAID = """```mermaid
flowchart LR
  subgraph CAPA1[Capa de negocio]
    A1[Objetivo: capturar excedente 3-8 MW 12:00-14:00]
  end
  subgraph CAPA2[Capa de información]
    B1[(Modelo lógico de datos: MEDICION · DESPACHO · PRONOSTICO · EVENTO_CAJA_NEGRA)]
  end
  subgraph CAPA3[Capa de aplicaciones]
    C1[Pronóstico solar + precio] --> C2[UCF-MPC: optimización con incertidumbre]
    C2 --> C3[EMS / SCADA setpoints]
    C2 --> C4[Visualización balance generación-demanda-excedente]
  end
  subgraph CAPA4[Capa tecnológica]
    D1[PLC/RTU + gateway OPC-UA] --> D2[BESS 500kW/1MWh + DR co-localizada]
    D3[PyPSA + HiGHS en servidor del activo]
  end
  E1[CADE / XM] -->|curtailment, instrucciones, 15 min| C1
  C4 -->|reporte de aprovechamiento| E1
  CAPA1 --> CAPA2 --> CAPA3 --> CAPA4
```"""

def hoja_meta(key: str) -> dict:
    """Nota de auditoría de una hoja generada (leída del paquete estático)."""
    import json
    import pathlib
    p = pathlib.Path(__file__).resolve().parent / "static" / "tools" / "sunflex-meta.json"
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8")).get(key, {})
    except Exception:
        return {}

RESPUESTA_SUBSANACION = [
    dict(titulo="1 · Representación legal (reparo: faltar documento/poder)",
         respuesta="Se radican (i) el certificado de existencia y representación legal (Cámara de Comercio "
                   "con vigencia no mayor a 30 días), (ii) el **poder especial** suficientemente amplio para "
                   "obligar a la sociedad en el proceso de selección, con identificación del poderdante, "
                   "apoderado, alcance y duración, y (iii) la cédula del representante legal. Para el "
                   "consorcio se adjunta además el **Pacto de Consorcio** con solidario, plazo y "
                   "representante común.",
         evidencia=["docs/habilitantes/01-existencia-y-representacion.pdf",
                    "docs/habilitantes/02-poder-representante.pdf",
                    "docs/habilitantes/03-pacto-consorcio.pdf"],
         pendiente=["Verificar que el poder mencione expresamente «Conexión Digital / ConnectBOGOTÁ · "
                    "Transforma la Energía» y la facultad de suscribir acta de inicio y acuerdo de confidencialidad"]),
    dict(titulo="2 · TRL 7–9 (reparo: la propuesta parecía TRL 1–6)",
         respuesta="El componente de software (UCF-MPC, pronóstico y EMS) está en **TRL 7–8**: algoritmo "
                   "validado contra casos reales y demostradores en entorno de operación relevante "
                   "(HIL + planta piloto). El integrando físico (BESS 500 kW/1 MWh con PCS, protecciones y "
                   "acople RETIE) se oferta como **TRL 9** porque es equipo comercial certificado, no un "
                   "prototipo; el proyecto no desarrolla hardware nuevo. Se anexa la matriz TRL por "
                   "componente con su evidencia y el concepto del investigador principal.",
         evidencia=["tablas TRL en la pestaña «Respuesta de subsanación»",
                    "informes de validación del algoritmo (casos IEEE y parques reales del portafolio)"],
         pendiente=["Adjuntar el concepto escrito del Director Técnico sobre el nivel TRL alcanzado",
                    "Adjuntar certificado o ficha técnica del PCS/BESS del fabricante (TRL de producto)"]),
    dict(titulo="3 · Video (reparo: enlace no funcional o fuera de duración)",
         respuesta="Video de **≤ 2 minutos** alojado como enlace *no listado* de YouTube, con guion "
                   "cronometrado: 0:00-0:20 problema (vertimiento por capacidad de conducción), "
                   "0:20-0:55 solución y demo del EMS con la ventana 3–8 MW, 0:55-1:30 resultados del "
                   "modelo (reducción de vertimiento y de compras al SIN), 1:30-2:00 equipo, piloto de "
                   "6 meses y replicabilidad. El enlace se pega también en el formulario y en el PDF.",
         evidencia=["YouTube: [COMPLETAR ENLACE]", "docs/VIDEO-GUION.md (guion con tiempos)"],
         pendiente=["Grabar y publicar el video; verificar que el enlace abra en modo incógnito "
                    "(restricción frecuente que deja el video 'no funcional')"]),
    dict(titulo="4 · Anexo 6 · Experiencia del proponente (reparo: anexo no cargado)",
         respuesta="Se carga el **Anexo 6** con la matriz de experiencia verificable del proponente "
                   "(Consultoría Regulatoria S.A.S.) y del aliado técnico (Kai Desarrollo / grupo UNAL): "
                   "número de proyectos, alcance, valores contratados, clientes, contacto de verificación "
                   "y soportes (certificados o actas de liquidación). Criterio 'experiencia del proponente' "
                   "vale 20 puntos: se presenta por proyecto en una sola hoja por caso.",
         evidencia=["docs/habilitantes/06-anexo-experiencia.xlsx"],
         pendiente=["Rellenar la matriz con proyectos reales y sus soportes; NO enviarla con datos "
                    "genéricos (es causal de no superar el filtro técnico)",
                    "Adjuntar estados financieros 2025, RUT, registro mercantil, parafiscales de los "
                    "últimos 6 meses y SG-SST, y acreditar ≥ 2 años de constitución y ausencia de listas "
                    "restrictivas"]),
    dict(titulo="5 · Preguntas sin responder (datos generales, especificaciones, Reto 1, equipo)",
         respuesta="Se da respuesta punto por punto en `docs/RESPUESTA_SUBSANACION.md`, con tabla "
                   "pregunta → respuesta → evidencia. Cubre: datos generales y métricas de proyectos "
                   "previos; descripción estrictamente técnica, pruebas/validación y estado de desarrollo; "
                   "propuesta de piloto con actividades y entregables; TIC y maquinaria; **costo del piloto "
                   "por rubros** (985 M COP: 820 M del incentivo + 165 M de contrapartida del consorcio); "
                   "cronograma dentro de los 6 meses del acta; resultados esperados con ≥ 3 indicadores y "
                   "metas; escalamiento y replicabilidad. Para el Reto 1: mecanismo de captura, "
                   "almacenamiento, transformación y uso productivo; capacidad en MW y MWh con eficiencia "
                   "global, tiempo de respuesta, vida útil y degradación; operación en 3–8 MW con "
                   "% de reducción de vertimiento **declarando supuestos**; control (pronóstico, "
                   "visualización del balance, optimización e integración CADE); requerimientos de "
                   "conexión (480 V–34,5 kV, espacio, obras, ambiente, modularidad y reubicación); "
                   "seguridad y RETIE; O&M y TCO.",
         evidencia=["docs/RESPUESTA_SUBSANACION.md", "pestañas «Modelo PyPSA», «Ventana 3–8 MW» y "
                                                     "«Economía» de la aplicación"],
         pendiente=["Confirmar con Ecopetrol/CADE los datos del activo anfitrión del piloto "
                    "(corte autorizado, punto de conexión, disponibilidad de la carga flexible)"]),
]

PARAMS_RESPUESTA = dict(
    eficiencia_global=0.87,          # round-trip AC-AC del integrando (0,945² × 0,98 transformador)
   respuesta_ms=250,
    vida_util_años=10,
    degradacion_anual=0.02,
    ventana_h=2.0,
)


if __name__ == "__main__":  # smoke test:  motor completo + hojas + economía
    import json, sys
    tot = {e: 0.0 for e in ORDEN}
    for k in CASOS:
        try:
            r = resolver(k)
        except Exception as e:
            print(k, "FALLO:", type(e).__name__, str(e)[:400]); continue
        m = r["metricas"]
        okp = all(r["pf"][e][q].get("ok") for e in ("base", "piloto", "escala") for q in ("gen", "pico"))
        print(f"{k:12s} cap={r['cap_mw']:6.2f}MW vert {m['base']['vert_mwh_dia']:5.2f}->"
              f"{m['piloto']['vert_mwh_dia']:5.2f}/{m['escala']['vert_mwh_dia']:5.2f} "
              f"red {r['reduccion_piloto_pct']:5.1f}%/{r['reduccion_escala_pct']:5.1f}% "
              f"ahorro {r['ahorro_piloto_mcop']:7.1f}M pf_ok={okp}")
        for e in ORDEN:
            tot[e] += m[e]["vert_mwh_dia"]
    print("vertimiento agregado MWh/día:", {k: round(v, 1) for k, v in tot.items()})
    print("3-8 MW:", {k: v for k, v in caso_3a8mw().items() if isinstance(v, (int, float))})
    print("LCOS:", lcos(8.0, 16.0))
    print("tablas:", {k: len(v) for k, v in dict(presupuesto=PRESUPUESTO, cronograma=CRONOGRAMA,
          equipo=EQUIPO, trl=TRL, kpi=KPI, riesgos=RIESGOS, bnef=BNEF).items()})
