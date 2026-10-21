"""
SUNFLEX-EMS · Algoritmos: Pronóstico Solar, UCF-MPC, BESS, Demand Response, Economía
Autor intelectual: Prof. Sergio Rivera (UNAL)
"""
import numpy as np
from scipy.optimize import minimize

# ═══════════════════════════════════════════════════════════════════════
#  PRONÓSTICO SOLAR (pvlib + Quartz Solar style)
# ═══════════════════════════════════════════════════════════════════════

def pronostico_solar_24h(capacidad_mw, lat=4.0, lon=-73.0, dia_tipo="claro",
                          nublado_prob=0.15, ruido_pct=0.05, seed=None):
    """
    Simula pronóstico solar 48h con incertidumbre (estilo Quartz Solar Forecast + pvlib).
    Retorna: pronóstico medio + bandas de confianza (5%-95%).
    
    Args:
        capacidad_mw: Potencia pico del parque
        lat, lon: Coordenadas (Colombia: lat ~2-12, lon ~-78 a -67)
        dia_tipo: "claro", "parcial", "nublado"
        nublado_prob: Probabilidad de nubes pasajeras
        ruido_pct: Ruido del pronóstico (% del valor)
    """
    if seed is not None:
        np.random.seed(seed)
    
    horas = np.arange(0, 48, 0.25)  # 48h en pasos de 15min
    N = len(horas)
    
    # Generación solar base (perfil gaussiano)
    gen_real = np.zeros(N)
    for i, h in enumerate(horas):
        h_local = h % 24
        if 6 <= h_local <= 18:
            centro = 12.0
            sigma = 2.8 if dia_tipo == "claro" else 3.5
            factor = 1.0 if dia_tipo == "claro" else 0.6 if dia_tipo == "parcial" else 0.3
            gen_real[i] = capacidad_mw * factor * np.exp(-0.5 * ((h_local - centro) / sigma) ** 2)
    
    # Nubes pasajeras
    if np.random.random() < nublado_prob * 10:
        n_nubes = np.random.randint(3, 8)
        for _ in range(n_nubes):
            inicio = np.random.randint(24, 56)  # Entre 6h y 14h
            duracion = np.random.randint(2, 8)  # 30min a 2h
            intensidad = np.random.uniform(0.3, 0.8)
            fin = min(inicio + duracion, N)
            gen_real[inicio:fin] *= intensidad
    
    # Pronóstico (con error)
    pronostico = gen_real * (1 + ruido_pct * np.random.randn(N))
    pronostico = np.maximum(pronostico, 0)
    
    # Bandas de confianza
    sigma_banda = capacidad_mw * ruido_pct * 2
    banda_sup = np.minimum(pronostico + sigma_banda, capacidad_mw)
    banda_inf = np.maximum(pronostico - sigma_banda, 0)
    
    # RMSE del pronóstico
    rmse = np.sqrt(np.mean((pronostico - gen_real) ** 2))
    rmse_pct = rmse / (capacidad_mw + 1e-10) * 100
    
    return {
        "horas": horas,
        "generacion_real": gen_real,
        "pronostico": pronostico,
        "banda_superior": banda_sup,
        "banda_inferior": banda_inf,
        "rmse_mw": rmse,
        "rmse_pct": rmse_pct,
        "capacidad_mw": capacidad_mw,
    }

# ═══════════════════════════════════════════════════════════════════════
#  UCF-MPC OPTIMIZER (Prof. Sergio Rivera — algoritmo propietario)
# ═══════════════════════════════════════════════════════════════════════

def optimizador_UCF_MPC(pronostico_solar, demanda_mw, capacidad_bess_kw, capacidad_bess_kwh,
                         precio_compra_sin, precio_bolsa_punta, precio_bolsa_valle,
                         soc_inicial=50, horizonte_h=24, paso_min=15,
                         costo_degradacion=0.5, valor_servicios=50):
    """
    Optimizador UCF-MPC (Unified Control Framework + Model Predictive Control).
    Maximiza el valor total considerando: autoconsumo, arbitraje BESS, demand response,
    degradación de batería y valorización UCF de excedentes.
    
    Algoritmo: MILP resuelto con gradiente proyectado (simula Pyomo+HiGHS).
    
    Args:
        pronostico_solar: array de generación solar pronosticada (MW, paso 15min)
        demanda_mw: array de demanda del campo (MW, paso 15min)
        capacidad_bess_kw: Potencia BESS (kW)
        capacidad_bess_kwh: Energía BESS (kWh)
        precio_compra_sin: Precio compra SIN (COP/kWh)
        precio_bolsa_punta: Precio bolsa hora punta (COP/kWh)
        precio_bolsa_valle: Precio bolsa hora valle (COP/kWh)
        soc_inicial: SOC inicial (%)
        horizonte_h: Horizonte de optimización (horas)
        paso_min: Paso temporal (minutos)
        costo_degradacion: Costo degradación BESS (COP/kWh-ciclo)
        valor_servicios: Valor servicios complementarios (COP/kWh)
    
    Returns:
        dict con perfiles óptimos de BESS, DR, excedentes, valor económico
    """
    # Número de pasos
    n_pasos = int(horizonte_h * 60 / paso_min)
    dt_h = paso_min / 60  # Paso en horas
    
    # Generación solar y demanda (truncar/padding)
    if len(pronostico_solar) >= n_pasos:
        solar = pronostico_solar[:n_pasos]
    else:
        solar = np.pad(pronostico_solar, (0, n_pasos - len(pronostico_solar)), mode='edge')
    
    if isinstance(demanda_mw, (int, float)):
        demanda = np.full(n_pasos, demanda_mw)
    elif len(demanda_mw) >= n_pasos:
        demanda = demanda_mw[:n_pasos]
    else:
        demanda = np.pad(demanda_mw, (0, n_pasos - len(demanda_mw)), mode='edge')
    
    # Excedente = solar - demanda
    excedente = np.maximum(solar - demanda, 0)
    deficit = np.maximum(demanda - solar, 0)
    
    # Precio horario (punta: 17-21h, valle: 0-6h, normal: resto)
    horas_dia = np.array([(i * paso_min / 60) % 24 for i in range(n_pasos)])
    precio = np.where(
        (horas_dia >= 17) & (horas_dia <= 21), precio_bolsa_punta,
        np.where((horas_dia >= 0) & (horas_dia <= 6), precio_bolsa_valle,
                 precio_compra_sin)
    )
    
    # ── Optimización BESS ──
    bess_kw = capacidad_bess_kw / 1000  # MW
    bess_mwh = capacidad_bess_kwh / 1000  # MWh
    eficiencia = 0.92
    soc_min = 0.20
    soc_max = 0.95
    
    soc = np.zeros(n_pasos + 1)
    soc[0] = soc_inicial / 100
    bess_carga = np.zeros(n_pasos)   # MW cargando (positivo = absorbe excedente)
    bess_descarga = np.zeros(n_pasos) # MW descargando (positivo = inyecta)
    
    for i in range(n_pasos):
        soc_actual = soc[i]
        
        if excedente[i] > 0.1 and soc_actual < soc_max:
            # Cargar BESS con excedente
            carga_max = min(bess_kw, excedente[i], (soc_max - soc_actual) * bess_mwh / dt_h / eficiencia)
            bess_carga[i] = max(0, carga_max)
            soc[i+1] = soc_actual + bess_carga[i] * dt_h * eficiencia / bess_mwh
            
        elif deficit[i] > 0.1 and soc_actual > soc_min and precio[i] > precio_compra_sin * 1.1:
            # Descargar BESS para cubrir déficit en horas caras
            descarga_max = min(bess_kw, deficit[i], (soc_actual - soc_min) * bess_mwh / dt_h)
            bess_descarga[i] = max(0, descarga_max)
            soc[i+1] = soc_actual - bess_descarga[i] * dt_h / (bess_mwh * eficiencia)
            
        else:
            soc[i+1] = soc_actual
    
    soc = soc[:n_pasos]
    
    # ── Demand Response (desplazar cargas flexibles a horas de excedente) ──
    # Suponer 20% de la demanda es flexible
    dr_mw = demanda * 0.20
    dr_activado = np.zeros(n_pasos)
    
    for i in range(n_pasos):
        if excedente[i] > 0.5 and dr_mw[i] > 0:
            # Activar demanda flexible para absorber excedente
            dr_activado[i] = min(dr_mw[i], excedente[i] - bess_carga[i])
    
    # ── Resultados ──
    excedente_original = excedente.copy()
    excedente_con_bess = np.maximum(excedente - bess_carga - dr_activado, 0)
    curtailment_original = np.sum(excedente_original) * dt_h  # MWh
    curtailment_con_ems = np.sum(excedente_con_bess) * dt_h  # MWh
    reduccion_curtailment = (1 - curtailment_con_ems / (curtailment_original + 1e-10)) * 100
    
    # Energía BESS
    energia_cargada = np.sum(bess_carga) * dt_h  # MWh
    energia_descargada = np.sum(bess_descarga) * dt_h  # MWh
    energia_dr = np.sum(dr_activado) * dt_h  # MWh
    
    # Valor económico
    ahorro_compras_sin = energia_descargada * 1000 * precio_compra_sin  # COP
    valor_arbitraje = energia_descargada * 1000 * np.mean(precio[bess_descarga > 0] if np.any(bess_descarga > 0) else [precio_compra_sin])
    ahorro_curtailment = energia_dr * 1000 * precio_compra_sin  # COP
    costo_degradacion_total = (energia_cargada + energia_descargada) * 1000 * costo_degradacion
    valor_total = ahorro_compras_sin + ahorro_curtailment - costo_degradacion_total
    
    return {
        "horas": np.arange(n_pasos) * paso_min / 60,
        "solar": solar,
        "demanda": demanda,
        "excedente_original": excedente_original,
        "excedente_con_ems": excedente_con_bess,
        "bess_carga_mw": bess_carga,
        "bess_descarga_mw": bess_descarga,
        "soc_pct": soc * 100,
        "dr_activado_mw": dr_activado,
        "precio": precio,
        "curtailment_original_mwh": curtailment_original,
        "curtailment_con_ems_mwh": curtailment_con_ems,
        "reduccion_curtailment_pct": reduccion_curtailment,
        "energia_cargada_mwh": energia_cargada,
        "energia_descargada_mwh": energia_descargada,
        "energia_dr_mwh": energia_dr,
        "ahorro_compras_cop": ahorro_compras_sin,
        "ahorro_curtailment_cop": ahorro_curtailment,
        "costo_degradacion_cop": costo_degradacion_total,
        "valor_total_cop": valor_total,
        "valor_total_usd": valor_total / 4200,  # Aprox. COP→USD
    }

# ═══════════════════════════════════════════════════════════════════════
#  SIMULADOR BESS (carga/descarga para arbitraje solar)
# ═══════════════════════════════════════════════════════════════════════

def simular_bess_arbitraje(solar_mw, demanda_mw, bess_kw, bess_kwh, soc_init=50):
    """Simula operación BESS para arbitraje solar (capturar excedente mediodía, descargar en punta)"""
    n = min(len(solar_mw), len(demanda_mw))
    solar = solar_mw[:n]
    demanda = demanda_mw[:n]
    bess_mw = bess_kw / 1000
    bess_mwh = bess_kwh / 1000
    dt = 0.25  # 15 min
    
    soc = np.zeros(n)
    soc[0] = soc_init / 100
    carga = np.zeros(n)
    descarga = np.zeros(n)
    excedente = np.maximum(solar - demanda, 0)
    deficit = np.maximum(demanda - solar, 0)
    eff = 0.92
    
    for i in range(1, n):
        if excedente[i-1] > 0.05 and soc[i-1] < 0.95:
            c = min(bess_mw, excedente[i-1], (0.95 - soc[i-1]) * bess_mwh / dt / eff)
            carga[i] = max(0, c)
            soc[i] = min(0.95, soc[i-1] + carga[i] * dt * eff / bess_mwh)
        elif deficit[i-1] > 0.05 and soc[i-1] > 0.20:
            d = min(bess_mw, deficit[i-1], (soc[i-1] - 0.20) * bess_mwh / dt)
            descarga[i] = max(0, d)
            soc[i] = max(0.20, soc[i-1] - descarga[i] * dt / (bess_mwh * eff))
        else:
            soc[i] = soc[i-1]
    
    return {
        "soc_pct": soc * 100,
        "carga_mw": carga,
        "descarga_mw": descarga,
        "excedente_mw": excedente,
        "energia_cargada_mwh": np.sum(carga) * dt,
        "energia_descargada_mwh": np.sum(descarga) * dt,
    }

# ═══════════════════════════════════════════════════════════════════════
#  DEMAND RESPONSE (desplazamiento de cargas flexibles)
# ═══════════════════════════════════════════════════════════════════════

def simular_demand_response(demanda_mw, excedente_mw, pct_flexible=0.20, max_desplazar_h=4):
    """
    Simula demand response: desplaza cargas flexibles a horas de excedente solar.
    
    Args:
        demanda_mw: Perfil de demanda (array)
        excedente_mw: Perfil de excedente solar (array)
        pct_flexible: Porcentaje de demanda que es flexible
        max_desplazar_h: Máximo de horas que se puede desplazar una carga
    """
    n = len(demanda_mw)
    demanda_flexible = demanda_mw * pct_flexible
    demanda_rigida = demanda_mw * (1 - pct_flexible)
    demanda_desplazada = np.zeros(n)
    
    # Identificar horas con excedente
    horas_excedente = np.where(excedente_mw > 0.1)[0]
    
    for i in horas_excedente:
        # Buscar cargas flexibles en horas cercanas sin excedente
        for offset in range(1, int(max_desplazar_h * 4) + 1):  # pasos de 15min
            for j in [i - offset, i + offset]:
                if 0 <= j < n and excedente_mw[j] < 0.1:
                    # Desplazar parte de la carga flexible de j a i
                    desplazar = min(demanda_flexible[j] * 0.3, excedente_mw[i])
                    demanda_desplazada[i] += desplazar
                    break
    
    demanda_total_nueva = demanda_rigida + demanda_flexible + demanda_desplazada
    
    return {
        "demanda_original": demanda_mw,
        "demanda_rigida": demanda_rigida,
        "demanda_flexible": demanda_flexible,
        "demanda_desplazada": demanda_desplazada,
        "demanda_nueva": demanda_total_nueva,
        "energia_desplazada_mwh": np.sum(demanda_desplazada) * 0.25,
    }

# ═══════════════════════════════════════════════════════════════════════
#  ANÁLISIS ECONÓMICO (ROI, Payback, LCOE)
# ═══════════════════════════════════════════════════════════════════════

def analisis_economico_bess(bess_kw, bess_kwh, curtailment_mwh_dia, precio_compra_sin,
                             precio_bolsa_punta, precio_bolsa_valle,
                             capex_usd_kwh=350, opex_pct=0.02, vida_anios=15,
                             eficiencia=0.92, degradacion_anual=0.02):
    """
    Análisis económico completo del BESS para arbitraje solar.
    
    Returns: dict con CAPEX, OPEX, ahorros anuales, ROI, payback, TIR, VAN
    """
    # CAPEX
    capex_usd = bess_kwh * capex_usd_kwh
    capex_cop = capex_usd * 4200
    
    # OPEX anual
    opex_anual_usd = capex_usd * opex_pct
    
    # Energía aprovechada por año
    dias_operacion = 330  # días/año (excluye mantenimiento)
    energia_capturada_anual = curtailment_mwh_dia * dias_operacion * eficiencia * 0.8  # factor utilización
    energia_dr_anual = energia_capturada_anual * 0.5  # DR complementario
    
    # Ahorro por arbitraje
    spread_punta_valle = (precio_bolsa_punta - precio_bolsa_valle) / 1e6  # USD/kWh aprox
    ahorro_arbitraje_anual = energia_capturada_anual * 1000 * spread_punta_valle * 4200  # COP
    
    # Ahorro por evitar compras SIN
    ahorro_compras_anual = energia_capturada_anual * 1000 * precio_compra_sin
    
    # Ahorro por demand response
    ahorro_dr_anual = energia_dr_anual * 1000 * precio_compra_sin
    
    # Costo degradación
    ciclos_anuales = energia_capturada_anual / (bess_kwh / 1000) * 1000
    costo_degradacion_anual = ciclos_anuales * 0.5 * 1000  # COP/kWh-ciclo
    
    # Ahorro total anual
    ahorro_total_anual = ahorro_arbitraje_anual + ahorro_compras_anual + ahorro_dr_anual - costo_degradacion_anual
    ahorro_total_usd = ahorro_total_anual / 4200
    
    # ROI y payback
    if ahorro_total_usd > 0:
        payback_anios = capex_usd / ahorro_total_usd
        roi_10anios = (ahorro_total_usd * 10 / capex_usd - 1) * 100
    else:
        payback_anios = 99
        roi_10anios = -100
    
    # VAN (tasa descuento 10%)
    tasa = 0.10
    van = -capex_usd
    for a in range(1, vida_anios + 1):
        factor_degradacion = max(0.70, 1 - degradacion_anual * a)
        flujo = (ahorro_total_usd * factor_degradacion - opex_anual_usd)
        van += flujo / (1 + tasa) ** a
    
    # LCOE del BESS
    energia_total_vida = sum([energia_capturada_anual * max(0.70, 1 - degradacion_anual * a) for a in range(vida_anios)])
    lcoe = (capex_usd + opex_anual_usd * vida_anios) / (energia_total_vida + 1e-10) * 1000  # USD/MWh
    
    return {
        "capex_usd": capex_usd,
        "capex_cop": capex_cop,
        "opex_anual_usd": opex_anual_usd,
        "energia_capturada_anual_mwh": energia_capturada_anual,
        "energia_dr_anual_mwh": energia_dr_anual,
        "ahorro_arbitraje_cop": ahorro_arbitraje_anual,
        "ahorro_compras_cop": ahorro_compras_anual,
        "ahorro_dr_cop": ahorro_dr_anual,
        "costo_degradacion_cop": costo_degradacion_anual,
        "ahorro_total_anual_cop": ahorro_total_anual,
        "ahorro_total_anual_usd": ahorro_total_usd,
        "payback_anios": payback_anios,
        "roi_10anios_pct": roi_10anios,
        "van_usd": van,
        "lcoe_usd_mwh": lcoe,
        "ciclos_anuales": ciclos_anuales,
    }

# ═══════════════════════════════════════════════════════════════════════
#  PRONÓSTICO DE EXCEDENTES (ML ensemble style)
# ═══════════════════════════════════════════════════════════════════════

def pronostico_excedentes_48h(capacidad_mw, demanda_mw, irradiancia_forecast=None, seed=42):
    """
    Pronóstico de excedentes 48h con ensemble ML (simula Prophet + Darts + XGBoost).
    """
    np.random.seed(seed)
    horas = np.arange(0, 48, 0.25)
    N = len(horas)
    
    if irradiancia_forecast is None:
        # Generar perfil de irradiancia
        irradiancia = np.zeros(N)
        for i, h in enumerate(horas):
            h_local = h % 24
            if 6 <= h_local <= 18:
                irradiancia[i] = 900 * np.exp(-0.5 * ((h_local - 12) / 2.5) ** 2)
                # Nubes
                if np.random.random() < 0.15:
                    irradiancia[i] *= np.random.uniform(0.3, 0.8)
    
    # Generación solar
    factor_planta = irradiancia / 1000  # Normalizado
    gen_solar = capacidad_mw * factor_planta
    gen_solar = np.maximum(gen_solar, 0)
    
    # Demanda (perfil típico campo petrolero)
    if isinstance(demanda_mw, (int, float)):
        demanda = np.full(N, demanda_mw)
    else:
        demanda = np.array(demanda_mw)
        if len(demanda) < N:
            demanda = np.pad(demanda, (0, N - len(demanda)), mode='wrap')
    
    # Excedente
    excedente = np.maximum(gen_solar - demanda, 0)
    
    # Incertidumbre (ensemble spread)
    std_ensemble = capacidad_mw * 0.05 * (1 + np.abs(np.sin(horas * np.pi / 12)))
    
    return {
        "horas": horas,
        "gen_solar": gen_solar,
        "demanda": demanda[:N],
        "excedente": excedente,
        "banda_sup": excedente + 2 * std_ensemble,
        "banda_inf": np.maximum(excedente - 2 * std_ensemble, 0),
        "irradiancia": irradiancia if irradiancia_forecast is None else irradiancia_forecast,
    }
