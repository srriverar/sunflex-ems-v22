"""
SUNFLEX-EMS · Datos verificados de Parques Solares Ecopetrol + Contexto SIN + Catálogo OSS Reto 1
Fuentes: Ecopetrol, UPME, CREG, BNEF, PV Magazine, XM, IDEAM
"""
import numpy as np

# ═══════════════════════════════════════════════════════════════════════
#  PARQUES SOLARES ECOPETROL (datos públicos verificados)
# ═══════════════════════════════════════════════════════════════════════
PARQUES_SOLARES = {
    "castilla": {
        "nombre": "Ecoparque Solar Castilla",
        "tipo": "Ecoparque Solar",
        "departamento": "Meta",
        "municipio": "Castilla La Nueva",
        "lat": 3.85, "lon": -73.23,
        "capacidad_mw": 21,
        "energia_gwh_anio": 35,
        "paneles": 52000,
        "area_ha": 15,
        "inauguracion": "Oct 2019",
        "operador": "AES Colombia",
        "contrato_anios": 15,
        "inversion_usd_m": 20,
        "campo_asociado": "Campo Castilla (~115.000 bpd, 2º campo Colombia)",
        "demanda_campo_mw": 35,
        "pct_demanda_cubierta": 30,
        "excedente_tipico_mw": 3,
        "cargas_flexibles_mw": 3,
        "criticidad": "ALTA",
        "bess_demo_kv": 500,
        "bess_demo_kwh": 1000,
        "problema": "Primer megaparque solar de Colombia (2019). 21 MW para campo Castilla. Excedente recurrente de ~3 MW en pico solar por restricción de red interna.",
        "curtailment_mwh_dia": 5,
        "curtailment_pct": 16,
        "precio_compra_sin": 286,
        "precio_bolsa_punta": 350,
        "precio_bolsa_valle": 120,
        "horas_pico": [11, 12, 13, 14],
        "factor_planta": 0.19,
        "co2_ton_anio": 12500,
        "irradiancia_kwhm2": 5.0,
        "fuente": "[9][10]",
    },
    "sanfernando": {
        "nombre": "Ecoparque Solar San Fernando",
        "tipo": "Estación de Bombeo Solar (Cenit)",
        "departamento": "Meta",
        "municipio": "Llanos Orientales",
        "lat": 4.30, "lon": -72.10,
        "capacidad_mw": 61,
        "energia_gwh_anio": 95,
        "paneles": 100000,
        "area_ha": 46,
        "inauguracion": "2021",
        "operador": "Cenit (filial transporte Ecopetrol)",
        "contrato_anios": 15,
        "inversion_usd_m": 55,
        "campo_asociado": "Estaciones bombeo + operaciones Ecopetrol/Cenit Llanos (eq. ciudad 93.000 hab.)",
        "demanda_campo_mw": 45,
        "pct_demanda_cubierta": 100,
        "excedente_tipico_mw": 8,
        "cargas_flexibles_mw": 5,
        "criticidad": "MÁXIMA",
        "bess_demo_kv": 500,
        "bess_demo_kwh": 1000,
        "problema": "Principal autogenerador renovable del país. 61 MW para estaciones de bombeo y múltiples campos en los Llanos. Excedente recurrente de 8 MW entre 12-14h.",
        "curtailment_mwh_dia": 14,
        "curtailment_pct": 15,
        "precio_compra_sin": 286,
        "precio_bolsa_punta": 350,
        "precio_bolsa_valle": 120,
        "horas_pico": [11, 12, 13, 14],
        "factor_planta": 0.18,
        "co2_ton_anio": 32000,
        "irradiancia_kwhm2": 5.2,
        "fuente": "[9][10]",
    },
    "brisas": {
        "nombre": "Ecoparque Solar Brisas",
        "tipo": "Ecoparque Solar (paneles bifaciales)",
        "departamento": "Huila",
        "municipio": "Neiva",
        "lat": 2.93, "lon": -75.28,
        "capacidad_mw": 26,
        "energia_gwh_anio": 42,
        "paneles": 49000,
        "area_ha": 21,
        "inauguracion": "Ene 2023",
        "operador": "AES Colombia",
        "contrato_anios": 15,
        "inversion_usd_m": 25,
        "campo_asociado": "Campos petroleros del Huila + Neiva",
        "demanda_campo_mw": 22,
        "pct_demanda_cubierta": 100,
        "excedente_tipico_mw": 4,
        "cargas_flexibles_mw": 2.5,
        "criticidad": "ALTA",
        "bess_demo_kv": 500,
        "bess_demo_kwh": 1000,
        "problema": "49.000 paneles bifaciales de última generación. 26 MW. Evita 216.000 t CO₂e en 15 años. Excedente de 4 MW en pico solar.",
        "curtailment_mwh_dia": 6,
        "curtailment_pct": 14,
        "precio_compra_sin": 286,
        "precio_bolsa_punta": 340,
        "precio_bolsa_valle": 115,
        "horas_pico": [11, 12, 13, 14],
        "factor_planta": 0.18,
        "co2_ton_anio": 14400,
        "irradiancia_kwhm2": 4.8,
        "fuente": "[11][12]",
    },
    "rubiales": {
        "nombre": "Parque Solar Rubiales",
        "tipo": "JV TotalEren 51% / Ecopetrol 49%",
        "departamento": "Meta",
        "municipio": "Puerto Gaitán",
        "lat": 4.35, "lon": -72.05,
        "capacidad_mw": 100,
        "energia_gwh_anio": 160,
        "paneles": 180000,
        "area_ha": 80,
        "inauguracion": "COD 1T 2024",
        "operador": "TotalEren + Ecopetrol",
        "contrato_anios": 17,
        "inversion_usd_m": 90,
        "campo_asociado": "Campo Rubiales (mayor campo de Ecopetrol)",
        "demanda_campo_mw": 60,
        "pct_demanda_cubierta": 100,
        "excedente_tipico_mw": 7,
        "cargas_flexibles_mw": 6,
        "criticidad": "MÁXIMA",
        "bess_demo_kv": 500,
        "bess_demo_kwh": 1000,
        "problema": "Mayor parque solar de Ecopetrol: 100 MWp, 180.000 paneles bifaciales. PPA 17 años. Excedente potencial de 7+ MW en pico por alta capacidad vs. demanda del campo.",
        "curtailment_mwh_dia": 12,
        "curtailment_pct": 12,
        "precio_compra_sin": 286,
        "precio_bolsa_punta": 340,
        "precio_bolsa_valle": 110,
        "horas_pico": [11, 12, 13, 14],
        "factor_planta": 0.18,
        "co2_ton_anio": 55000,
        "irradiancia_kwhm2": 5.2,
        "fuente": "[13][14]",
    },
    "refinerias": {
        "nombre": "Granjas Solares Refinerías",
        "tipo": "Autogeneración Industrial",
        "departamento": "Bolívar + Santander",
        "municipio": "Cartagena + Barrancabermeja",
        "lat": 10.39, "lon": -75.46,
        "capacidad_mw": 39,
        "energia_gwh_anio": 62,
        "paneles": 70000,
        "area_ha": 35,
        "inauguracion": "2024-2025",
        "operador": "Ecopetrol directo",
        "contrato_anios": 20,
        "inversion_usd_m": 34,
        "campo_asociado": "Refinería Cartagena (Reficar 165.000 bpd) + Refinería Barrancabermeja (210.000 bpd)",
        "demanda_campo_mw": 320,
        "pct_demanda_cubierta": 12,
        "excedente_tipico_mw": 3,
        "cargas_flexibles_mw": 8,
        "criticidad": "CRÍTICA",
        "bess_demo_kv": 500,
        "bess_demo_kwh": 1000,
        "problema": "39 MW solares en 2 refinerías (375.000 bpd combinados). Apalancan hidrógeno verde. Excedente limitado por alta demanda base.",
        "curtailment_mwh_dia": 4,
        "curtailment_pct": 6,
        "precio_compra_sin": 310,
        "precio_bolsa_punta": 380,
        "precio_bolsa_valle": 120,
        "horas_pico": [11, 12, 13, 14],
        "factor_planta": 0.18,
        "co2_ton_anio": 18000,
        "irradiancia_kwhm2": 5.0,
        "fuente": "[9]",
    },
    "portondelsol": {
        "nombre": "El Portón del Sol + Cartera Statkraft",
        "tipo": "Autogeneración Remota (adquisición may-2025)",
        "departamento": "Caldas / La Guajira / Sucre / Córdoba / Magdalena",
        "municipio": "La Dorada + Múltiples",
        "lat": 11.50, "lon": -72.30,
        "capacidad_mw": 128,
        "energia_gwh_anio": 210,
        "paneles": 250000,
        "area_ha": 120,
        "inauguracion": "2025-2028 (progresivo)",
        "operador": "Ecopetrol (adquisición Statkraft may-2025)",
        "contrato_anios": 25,
        "inversion_usd_m": 150,
        "campo_asociado": "Autogeneración remota Grupo Ecopetrol (1.364 MW: 614 solar + 750 eólico)",
        "demanda_campo_mw": 0,
        "pct_demanda_cubierta": 0,
        "excedente_tipico_mw": 0,
        "cargas_flexibles_mw": 0,
        "criticidad": "ESTRATÉGICA",
        "bess_demo_kv": 0,
        "bess_demo_kwh": 0,
        "problema": "Portafolio adquirido a Statkraft (may-2025): 1.364 MW total. 128 MW solar operativo + 3 listos para construir. Propósito: autoconsumo, reducir compras en bilaterales y bolsa. Meta >2.000 MW en 2026.",
        "curtailment_mwh_dia": 0,
        "curtailment_pct": 0,
        "precio_compra_sin": 0,
        "precio_bolsa_punta": 350,
        "precio_bolsa_valle": 101,
        "horas_pico": [10, 11, 12, 13, 14],
        "factor_planta": 0.22,
        "co2_ton_anio": 85000,
        "irradiancia_kwhm2": 6.3,
        "fuente": "[15][16][17][18]",
    },
}

# Parques Caribe nuevos (2026)
PARQUES_CARIBE_NUEVOS = [
    {"nombre": "Buenavista", "dpto": "Córdoba", "mw": 12.5},
    {"nombre": "Centro", "dpto": "Córdoba", "mw": 12.5},
    {"nombre": "Planeta Rica", "dpto": "Córdoba", "mw": 12.5},
    {"nombre": "Ayapel", "dpto": "Córdoba", "mw": 12.5},
    {"nombre": "El Paso", "dpto": "Cesar", "mw": 12.5},
    {"nombre": "La Paz", "dpto": "Cesar", "mw": 12.5},
    {"nombre": "Sol del Mar II", "dpto": "Magdalena", "mw": 12.5},
    {"nombre": "Asturias", "dpto": "Sucre", "mw": 12.5},
    {"nombre": "Tolú", "dpto": "Sucre", "mw": 12.5},
    {"nombre": "Sol de Zawady", "dpto": "Magdalena", "mw": 12.5},
]

# ═══════════════════════════════════════════════════════════════════════
#  CONTEXTO SIN — DATOS REALES VERIFICADOS
# ═══════════════════════════════════════════════════════════════════════
SIN_CONTEXTO = {
    "capacidad_fncer_total_mw": 4626.73,  # Jul-2026, MinM&E
    "capacidad_solar_mw": 3987.77,
    "participacion_limpia_pct": 74.16,
    "participacion_vre_pct": 13.87,  # Oct-2025
    "meta_vre_2026_pct": 20,
    "solar_supero_carbon_anio": 2025,
    "solar_gwh_2025": 4473.8,
    "carbon_gwh_2025": 3564.2,
    "precio_bolsa_oct2025": 177,  # COP/kWh, XM
    "precio_bolsa_feb2026": 120.2,
    "precio_bolsa_minimo": 101.3,  # 8-feb-2026
    "precio_contratos_promedio": 298.9,
    "precio_industrial_regulado": 286,  # COP/kWh, industria/comercio
    "tiempo_bolsa_bajo_contrato_pct": 80,
    "reco_gen_fv_mw": 1473,  # 15-abr-2026
    "programa_6gw_mw": 4935.95,
    "programa_6gw_operacion_mw": 3852.10,
}

# ═══════════════════════════════════════════════════════════════════════
#  COSTOS BESS — BLOOMBERGNEF 2025
# ═══════════════════════════════════════════════════════════════════════
BESS_COSTOS = {
    "pack_promedio_usd_kwh": 108,  # BNEF dic-2025
    "estacionario_usd_kwh": 70,    # BNEF dic-2025
    "celda_usd_kwh": 74,
    "lfp_usd_kwh": 81,
    "proyeccion_2026_usd_kwh": 105,
    "factor_epc": 1.8,  # EPC total vs pack
    "cop_usd": 4200,
}

# ═══════════════════════════════════════════════════════════════════════
#  REGULACIÓN
# ═══════════════════════════════════════════════════════════════════════
REGULACION = {
    "creg_701_2025": "Autogeneración a gran escala/remota: formalización conexión, sin excedentes",
    "creg_101_072_2025": "Comunidades energéticas: tope 10% distribución excedentes por usuario",
    "creg_1576_2024": "Intercambio excedentes: Exc1 créditos, Exc2 a precio bolsa horario",
    "creg_30_2018": "Microgeneración: intercambio excedentes limitado 10% facturación mensual",
    "ley_1715_2014": "Marco FNCER y autogeneración",
    "retie": "Reglamento Técnico de Instalaciones Eléctricas",
    "upme_135_2025": "Procedimientos de conexión FNCER",
}

# ═══════════════════════════════════════════════════════════════════════
#  DIFERENCIAS PILOTO vs TRADICIONAL BESS
# ═══════════════════════════════════════════════════════════════════════
DIFERENCIAS_PILOTO_TRADICIONAL = [
    {
        "aspecto": "Enfoque",
        "tradicional": "Hardware-first: comprar batería, instalar, operar",
        "sunflex": "Software-first: algoritmo UCF-MPC + demostrador BESS mínimo",
        "ventaja": "Valida el modelo de negocio ANTES de invertir en hardware masivo",
    },
    {
        "aspecto": "Dimensionamiento",
        "tradicional": "BESS sobredimensionado (worst-case): 4-8 MW desde día 1",
        "sunflex": "Demostrador 500 kW/1 MWh → escala con datos reales validados",
        "ventaja": "Reduce riesgo financiero: $820M vs $10.000M+ sin validación",
    },
    {
        "aspecto": "Control",
        "tradicional": "Reglas fijas (carga si excedente > X, descarga si precio > Y)",
        "sunflex": "UCF-MPC: optimización MILP con incertidumbre, horizonte rodante 24h",
        "ventaja": "Maximiza valor en cada intervalo de 15 min adaptándose a condiciones reales",
    },
    {
        "aspecto": "Pronóstico",
        "tradicional": "Sin pronóstico o pronóstico meteorológico básico",
        "sunflex": "Ensemble ML: pvlib + Quartz + Prophet + Darts (RMSE<8% @4h)",
        "ventaja": "Anticipa excedentes horas antes, permitiendo DR preventivo",
    },
    {
        "aspecto": "Demand Response",
        "tradicional": "No incluido (solo BESS)",
        "sunflex": "DR integrado: desplaza 22 MW de cargas flexibles a horas solares",
        "ventaja": "Multiplica el efecto del BESS ×2-3 sin CAPEX adicional",
    },
    {
        "aspecto": "Integración",
        "tradicional": "Silo: BESS opera independiente del CADE/SCADA",
        "sunflex": "Integración CADE nativa: IEC 61850 + MQTT + APIs REST",
        "ventaja": "Visibilidad total del operador, cumplimiento Anexo #1",
    },
    {
        "aspecto": "Código",
        "tradicional": "Software propietario del fabricante BESS (vendor lock-in)",
        "sunflex": "100% open-source: Pyomo, HiGHS, pvlib, Prophet, etc.",
        "ventaja": "Sin dependencia de proveedor, replicable en todos los parques",
    },
    {
        "aspecto": "Replicabilidad",
        "tradicional": "Cada sitio requiere ingeniería custom",
        "sunflex": "Software parametrizado: misma plataforma, diferente parque",
        "ventaja": "Escala de 1 parque a >2.000 MW sin re-desarrollo",
    },
    {
        "aspecto": "Valorización",
        "tradicional": "Ahorro directo por arbitraje",
        "sunflex": "UCF cuantifica valor bajo incertidumbre + arbitraje + DR + servicios",
        "ventaja": "Caso de negocio más robusto, multi-fuente de valor",
    },
    {
        "aspecto": "CAPEX piloto",
        "tradicional": "$4.200-10.000M COP (BESS 4-8 MW completo)",
        "sunflex": "$820M COP (software + demostrador + integración)",
        "ventaja": "Prueba de concepto con 5-10% del presupuesto total",
    },
]

# ═══════════════════════════════════════════════════════════════════════
#  CURVAS DE GENERACIÓN SOLAR (perfil tropical colombiano)
# ═══════════════════════════════════════════════════════════════════════
def curva_solar_tipica(capacidad_mw, irradiancia=5.0, hora_inicio=6, hora_fin=18, ruido=0.03):
    """Genera curva de generación solar típica para parque en Colombia (tropical)"""
    horas = np.linspace(hora_inicio, hora_fin, 100)
    centro = 12.0
    sigma = 2.5
    potencia = capacidad_mw * (irradiancia / 5.5) * np.exp(-0.5 * ((horas - centro) / sigma) ** 2)
    potencia += potencia * ruido * np.random.randn(len(potencia))
    potencia = np.maximum(potencia, 0)
    return horas, potencia

def curva_demanda_tipica(demanda_base_mw, cargas_flexibles_mw=0):
    """Genera curva de demanda típica para campo petrolero (24h casi constante)"""
    horas = np.linspace(0, 24, 100)
    demanda = demanda_base_mw * np.ones(len(horas))
    mask_am = (horas >= 6) & (horas <= 9)
    demanda[mask_am] *= 1.10
    mask_md = (horas >= 12) & (horas <= 14)
    demanda[mask_md] *= 0.90
    mask_pm = (horas >= 17) & (horas <= 21)
    demanda[mask_pm] *= 1.15
    demanda += np.random.randn(len(demanda)) * demanda_base_mw * 0.02
    demanda = np.maximum(demanda, demanda_base_mw * 0.75)
    return horas, demanda

def calcular_excedente_y_curtailment(capacidad_mw, demanda_mw, capacidad_red_mw=None):
    """Calcula excedente y curtailment para un parque solar"""
    if capacidad_red_mw is None:
        capacidad_red_mw = demanda_mw * 1.1
    horas_solar, gen_solar = curva_solar_tipica(capacidad_mw)
    horas_dem, demanda = curva_demanda_tipica(demanda_mw)
    demanda_interp = np.interp(horas_solar, horas_dem, demanda)
    excedente = np.maximum(gen_solar - demanda_interp, 0)
    capacidad_disponible = np.maximum(capacidad_red_mw - demanda_interp, 0)
    energia_util = np.minimum(gen_solar, demanda_interp + capacidad_disponible)
    curtailment = np.maximum(gen_solar - energia_util, 0)
    return {
        "horas_solar": horas_solar, "gen_solar": gen_solar,
        "horas_dem": horas_dem, "demanda": demanda,
        "demanda_interp": demanda_interp, "excedente": excedente,
        "curtailment": curtailment, "energia_util": energia_util,
        "capacidad_red": capacidad_red_mw,
    }

# ═══════════════════════════════════════════════════════════════════════
#  CATÁLOGO OPEN-SOURCE RETO 1
# ═══════════════════════════════════════════════════════════════════════
OSS_RETO1 = {
    "A_modelado_pv": {
        "nombre": "A. Modelado Fotovoltaico",
        "icono": "☀️",
        "tools": [
            {"name": "pvlib-python", "desc": "Modelado PV: irradiancia, temp celda, inversor/módulo, ModelChain + 12 bases de datos", "lang": "Python", "lic": "BSD-3", "repo": "pvlib/pvlib-python", "uso": "Modelar curva generación parques Ecopetrol y cuantificar excedente 3-8 MW"},
            {"name": "SAM (NREL)", "desc": "Modelo tecno-económico PV+BESS: dimensionamiento, financieros, degradación", "lang": "C++/Python", "lic": "BSD-3", "repo": "NREL/ssc", "uso": "Caso de negocio BESS y activo solar (LCOE, ahorros)"},
            {"name": "PVGIS (JRC)", "desc": "Datos recurso solar + simulación PV por coordenadas, API JSON", "lang": "Web/API", "lic": "Abierta", "repo": "re.jrc.ec.europa.eu", "uso": "Irradiancia histórica/TMY de Meta, Huila, La Guajira"},
        ],
    },
    "B_pronostico": {
        "nombre": "B. Pronóstico Solar y Excedentes",
        "icono": "🔮",
        "tools": [
            {"name": "Quartz Solar Forecast", "desc": "Pronóstico solar open-source (Oxford/ADB)", "lang": "Python", "lic": "Apache-2.0", "repo": "openclimatefix/Quartz-Solar-Forecast", "uso": "Pronóstico excedentes 0-48h con RMSE<8%"},
            {"name": "Solar Forecast Arbiter", "desc": "Framework EPRI/U.Arizona: evaluar pronósticos", "lang": "Python", "lic": "MIT", "repo": "SolarArbiter", "uso": "Medir calidad pronóstico excedentes (PDS §3)"},
            {"name": "Prophet (Meta)", "desc": "Pronóstico series temporales con estacionalidad múltiple", "lang": "Python", "lic": "MIT", "repo": "facebook/prophet", "uso": "Pronóstico demanda campos y generación diaria"},
            {"name": "Darts", "desc": "Framework forecasting unificado (ARIMA a Transformers/TFT)", "lang": "Python", "lic": "Apache-2.0", "repo": "unit8co/darts", "uso": "Pronóstico generación/demanda con covariables meteo"},
            {"name": "NeuralProphet", "desc": "Forecasting híbrido AR+NN con covariables", "lang": "Python", "lic": "MIT", "repo": "ourownstory/neural_prophet", "uso": "Pronóstico excedentes con irradiancia y temperatura"},
        ],
    },
    "C_BESS": {
        "nombre": "C. BESS — Modelado y Dimensionamiento",
        "icono": "🔋",
        "tools": [
            {"name": "REopt (NREL)", "desc": "Optimización energía+resiliencia: dimensiona BESS/generación", "lang": "Julia/Python", "lic": "BSD-3", "repo": "NREL/REopt.jl", "uso": "Dimensionar BESS para absorber excedente y reducir compras SIN"},
            {"name": "simses (TUM)", "desc": "Simulador BESS: celdas, convertidores, térmico, envejecimiento", "lang": "Python", "lic": "Ver repo", "repo": "tum-ees/simses", "uso": "Simular carga/descarga, eficiencia y degradación"},
            {"name": "bess-optimizer", "desc": "Optimizador despacho BESS en mercados (Pyomo)", "lang": "Python", "lic": "Ver repo", "repo": "FlexPwr/bess-optimizer", "uso": "Lógica arbitraje/peak-shaving para el piloto"},
        ],
    },
    "D_EMS": {
        "nombre": "D. EMS / Gestión Energética",
        "icono": "🧠",
        "tools": [
            {"name": "OpenEMS", "desc": "EMS abierto para baterías, inversores y cargas", "lang": "Java", "lic": "AGPL-3.0", "repo": "OpenEMS/openems", "uso": "Referencia EMS que orquesta BESS + solar + red"},
            {"name": "pymgrid", "desc": "Generación y simulación microrredes", "lang": "Python", "lic": "MIT", "repo": "Total-RD/pymgrid", "uso": "Escenarios entrenamiento controlador microrred"},
            {"name": "MyEMS", "desc": "EMS industrial: monitoreo, reporting, optimización", "lang": "Python", "lic": "Ver repo", "repo": "MyEMS/myems", "uso": "Capa gestión energética con dashboards tipo CADE"},
        ],
    },
    "E_optimizacion": {
        "nombre": "E. Optimización Matemática (MILP)",
        "icono": "📐",
        "tools": [
            {"name": "Pyomo", "desc": "Modelado algebraico LP/MILP/NLP", "lang": "Python", "lic": "BSD-3", "repo": "Pyomo/pyomo", "uso": "Despacho óptimo solar+BESS+red"},
            {"name": "HiGHS", "desc": "Solver LP/MILP alto rendimiento", "lang": "C++/Python", "lic": "MIT", "repo": "ERGO-Code/HiGHS", "uso": "Motor resolución gratuito para despacho"},
            {"name": "OR-Tools (Google)", "desc": "Suite optimización (CP-SAT, MILP)", "lang": "C++/Python", "lic": "Apache-2.0", "repo": "google/or-tools", "uso": "Scheduling BESS y cargas"},
            {"name": "CVXPY", "desc": "Modelado optimización convexa", "lang": "Python", "lic": "Apache-2.0", "repo": "cvxpy/cvxpy", "uso": "Formulaciones convexas (despacho económico)"},
        ],
    },
    "F_DR_VPP": {
        "nombre": "F. Demand Response + VPP",
        "icono": "🔄",
        "tools": [
            {"name": "VOLTTRON (PNNL)", "desc": "Plataforma energía transactiva: agentes, DR, DER", "lang": "Python", "lic": "BSD", "repo": "VOLTTRON/volttron", "uso": "Orquestar carga flexible"},
            {"name": "OpenADR", "desc": "Estándar abierto respuesta demanda (VTN/VEN)", "lang": "Estándar", "lic": "Abierto", "repo": "OpenADR", "uso": "Protocolo activar DR ante excedentes"},
            {"name": "Grid Singularity (GSy)", "desc": "Motor intercambio local energía (P2P)", "lang": "Python", "lic": "GPL-3.0", "repo": "gridsingularity/gsy-e", "uso": "Simular mercado interno entre activos del Grupo"},
        ],
    },
    "G_IoT": {
        "nombre": "G. IoT / Protocolos / Integración CADE",
        "icono": "🔗",
        "tools": [
            {"name": "Eclipse Mosquitto", "desc": "Broker MQTT de referencia", "lang": "C", "lic": "EPL-2.0", "repo": "eclipse-mosquitto/mosquitto", "uso": "Transporte telemetría parques → controlador"},
            {"name": "Node-RED", "desc": "Orquestación visual flujos IoT/industrial", "lang": "JS", "lic": "Apache-2.0", "repo": "node-red/node-red", "uso": "Prototipo integración medidores, inversores, BESS"},
            {"name": "pymodbus", "desc": "Librería Modbus Python", "lang": "Python", "lic": "BSD-3", "repo": "pymodbus/pymodbus", "uso": "Leer inversores/BESS/medidores"},
            {"name": "libiec61850", "desc": "IEC 61850 (MMS, GOOSE, SV) para subestaciones", "lang": "C", "lic": "GPL-3.0", "repo": "mz-automation/libiec61850", "uso": "Hablar con subestaciones 480V-34.5kV y CADE"},
        ],
    },
    "H_dashboards": {
        "nombre": "H. Dashboards / Historian",
        "icono": "📈",
        "tools": [
            {"name": "Grafana", "desc": "Dashboards y alertas telemetría", "lang": "Go/TS", "lic": "AGPL-3.0", "repo": "grafana/grafana", "uso": "Balance generación-demanda-excedentes (PDS §3)"},
            {"name": "InfluxDB", "desc": "Base de datos series temporales", "lang": "Go", "lic": "MIT", "repo": "influxdata/influxdb", "uso": "Almacenar series generación/demanda/excedentes"},
            {"name": "TimescaleDB", "desc": "PostgreSQL para series temporales", "lang": "C", "lic": "Apache-2.0", "repo": "timescale/timescaledb", "uso": "Historian SQL compatible gobierno datos Anexo #1"},
        ],
    },
    "I_red": {
        "nombre": "I. Simulación Red + Datos Solares",
        "icono": "🔌",
        "tools": [
            {"name": "pandapower", "desc": "Flujo carga, cortocircuito IEC 60909", "lang": "Python", "lic": "BSD-3", "repo": "e2nIEE/pandapower", "uso": "Modelar capacidad conducción red interna"},
            {"name": "OpenDSS (EPRI)", "desc": "Simulador distribución: flujo desbalanceado", "lang": "DLL/Python", "lic": "BSD", "repo": "EPRI-OpenDSS/OpenDSS", "uso": "Hosting capacity alimentadores 480V-34.5kV"},
            {"name": "NSRDB (NREL)", "desc": "Base radiación solar 1998-2025", "lang": "Datos", "lic": "CC", "repo": "data.openei.org", "uso": "Series alta resolución calibrar modelo PV"},
            {"name": "Open-Meteo", "desc": "API meteo abierta (radiación solar ERA5)", "lang": "API", "lic": "CC-BY", "repo": "open-meteo.com", "uso": "Pronóstico meteo sin costo para excedentes"},
        ],
    },
}

# ═══════════════════════════════════════════════════════════════════════
#  DATOS CADE
# ═══════════════════════════════════════════════════════════════════════
CADE_DATA = {
    "nombre": "Centro Autónomo de Despacho de Energía",
    "inauguracion": "Mayo 2026",
    "socio": "ISA",
    "gestion_actual_mw": 173,
    "proyeccion_mw": 931,
    "porcentaje_actual": 20,
    "porcentaje_objetivo": 80,
    "costo_energia_pct_barril": 20,
}
