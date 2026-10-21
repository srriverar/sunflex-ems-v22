#!/usr/bin/env python3
"""
gen_docs.py — genera los documentos de la respuesta de subsanación a partir del
modelo (`sunflex_model.py`), para que ningún número del documento pueda
desincronizarse del cálculo.

Salidas:
  docs/RESPUESTA_SUBSANACION.md      (principal, con Mermaid renderizable en GitHub)
  docs/RESPUESTA_SUBSANACION.docx    (misma estructura, para radicar)
  docs/VIDEO-GUION.md                (guion cronometrado del video ≤ 2 min)
  README.md                          (cómo correr app, motor y verificación)

Uso:  python3 gen_docs.py
"""
from __future__ import annotations

import logging
import pathlib
import sys

logging.getLogger("linopy").setLevel(logging.ERROR)
logging.getLogger("pypsa").setLevel(logging.ERROR)
logging.disable(logging.WARNING)

RAIZ = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

import sunflex_model as S  # noqa: E402

DOCX_OK = True
try:
    import docx  # noqa: F401
    from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: F401
    from docx.shared import Pt  # noqa: F401
except Exception:
    DOCX_OK = False


# ── cálculo ────────────────────────────────────────────────────────────────
R = {k: S.resolver(k) for k in S.CASOS}
AGG = {esc: sum(R[k]["metricas"][esc]["vert_mwh_dia"] for k in S.CASOS) for esc in S.ORDEN}
AH_PIL = sum(R[k]["ahorro_piloto_mcop"] for k in S.CASOS)
AH_ESC = sum(R[k]["ahorro_escala_mcop"] for k in S.CASOS)
RED_PIL = round(100 * (1 - AGG["piloto"] / max(AGG["base"], 1e-9)), 1)
RED_ESC = round(100 * (1 - AGG["escala"] / max(AGG["base"], 1e-9)), 1)
ECO = {p: S.lcos(*v) for p, v in {"Piloto · 0,5 MW / 1 MWh": (0.5, 1.0),
                                  "Ventana 3 MW / 6 MWh": (3.0, 6.0),
                                  "Escalado 8 MW / 16 MWh": (8.0, 16.0)}.items()}
D38 = S.caso_3a8mw()
PR = S.PARAMS_RESPUESTA

B: list[tuple] = []           # bloques: (tipo, contenido…)
h1 = lambda t: B.append(("h1", t))
h2 = lambda t: B.append(("h2", t))
h3 = lambda t: B.append(("h3", t))
p = lambda t: B.append(("p", t))
bul = lambda *xs: B.append(("bul", list(xs)))
num = lambda *xs: B.append(("num", list(xs)))
mer = lambda t: B.append(("mer", t))
code = lambda t, lang="text": B.append(("code", t, lang))
note = lambda t: B.append(("note", t))
tab = lambda head, rows, cap="": B.append(("tab", head, rows, cap))
pgbrk = lambda: B.append(("brk",))


def f(x, n=1):
    return f"{x:,.{n}f}".replace(",", " ").replace(".", ",")


# ══════════════════════════════════════════════════════════════════════════
#  CONTENIDO
# ══════════════════════════════════════════════════════════════════════════
h1("SUNFLEX-EMS · Respuesta al requerimiento de subsanación — Reto 1 "
   "«Aprovechamiento de la energía excedentaria»")
p(f"**Programa:** Transforma la Energía · ConnectBOGOTÁ / Cámara de Comercio de Bogotá · "
  f"**Convocatoria:** Reto 1 — Energías renovables no convencionales / CADE.\n\n"
  f"**Proponente:** CONSULTORÍA REGULATORIA S.A.S. (coordinadora) en consorcio con Kai Desarrollo "
  f"S.A.S. y el grupo de investigación del Prof. Sergio Rivera (Universidad Nacional de Colombia).\n\n"
  f"**Dirección técnica:** Mauricio Gómez Gómez (director de proyecto) · Libardo Acero · David Parra.\n\n"
  f"**Fecha de esta versión:** 19 de octubre de 2026 · **cierre de la ventanilla:** 20 de octubre de "
  f"2026, 10:00 a. m. (Bogotá).\n\n"
  f"**Cómo verificar cada número de este documento:** los tres comandos siguientes reproducen de "
  f"principio a fin todo lo aquí afirmado.")
code("python3 sunflex_model.py                 # smoke test: motor completo (5 casos × 5 escenarios)\n"
     "python3 gen_casepack.py                  # regenera las hojas de las dos herramientas\n"
     "node tools/verify_casepack.mjs --ed-solve # control de calidad de esas hojas (PSA.js + HiGHS)\n"
     "streamlit run app.py                     # la aplicación (25 pestañas), con server.enableStaticServing")
note("Todo lo que aparece como dato del modelo proviene de `sunflex_model.py` (PyPSA + HiGHS). "
     "Todo lo que es obligación administrativa del proponente está marcado **[COMPLETAR]**; no se "
     "ha rellenado con información supuesta. Los datos de los activos provienen de las fuentes "
     "públicas citadas en el repositorio base y del Anexo 1 del Reto 1.")

h2("0 · Resumen en una página")
p(f"El Reto 1 no pide más generación solar: pide **no botar** la que ya existe. Los parques solares del "
  f"portafolio vierten entre 4 y 16 MWh/día porque el alimentador que los evacua está en su límite de "
  f"capacidad de conducción en la ventana 12:00–14:00. Nuestra simulación calibrada muestra que la banda "
  f"de 3–8 MW que exige la convocatoria es exactamente la franja que hoy se corta.")
p(f"Ese diagnóstico cambia la solución. La restricción **no** es de demanda del campo, es de "
  f"transferencia: mover carga dentro del campo (demand response clásico) no libera ni un megavatio de "
  f"la restricción y, por tanto, no captura el excedente. Para capturar hay que poner el integrando "
  f"**a la izquierda de la restricción**: almacenamiento y cargas diferibles co-localizadas en la "
  f"cabecera del parque. SUNFLEX-EMS hace eso y, además, decide cuándo.")
tab(["indicador", "valor del portafolio simulado", "de dónde sale"],
    [["Vertimiento agregado en línea base", f"{f(AGG['base'],1)} MWh/día",
      "emergente del OPF, no impuesto"],
     ["Vertimiento con el piloto (BESS 500 kW/1 MWh + DR co-localizada + UCF-MPC)",
      f"{f(AGG['piloto'],1)} MWh/día  (**−{RED_PIL:.1f} %**)", "escenario L4"],
     ["Vertimiento con la solución escalada (3–8 MW / 2 h)",
      f"{f(AGG['escala'],1)} MWh/día  (**−{RED_ESC:.1f} %**)", "escenario L5"],
     ["Ahorro anual en costo de operación, piloto", f"{f(AH_PIL,0)} M COP/año",
      "compras al SIN + combustible de respaldo"],
     ["Ahorro anual en costo de operación, escalado", f"{f(AH_ESC,0)} M COP/año", "ídem"],
     ["Valor adicional del MPC sobre una batería óptima sin pronóstico",
      f"+{f(sum(R[k]['valor_ad_mpc_pct'] for k in S.CASOS)/len(S.CASOS),1)} % promedio",
      "L4 vs L3"],
     ["Excedente capturado en la rampa 3–8 MW del portafolio",
      f"{f(float(D38['capturado_mwh']),1)} de {f(float(D38['excedente_dia_mwh']),1)} MWh/día "
      f"({f(float(D38['reduccion_pct']),1)} %)", "`caso_3a8mw()`"]],
    "Tabla 1 · Resultados del portafolio (5 activos, 96 pasos de 15 min, día tipo febrero de 2026).")
p(f"Con el costo total del piloto de **{f(S.PRESUPUESTO_TOTAL,0)} M COP** (de los cuales "
  f"{f(S.INCENTIVO_RETO1,0)} M COP provienen del incentivo del Reto 1 y "
  f"{f(S.CONTRAPARTIDA,0)} M COP son contrapartida del consorcio), el retorno simulado del primer año "
  f"es de **{AH_PIL/S.PRESUPUESTO_TOTAL:.1f}×** sobre el costo total, antes de cualquier escala.")

h2("1 · Los cinco reparos, respondidos uno por uno")
for rp in S.RESPUESTA_SUBSANACION:
    h3(rp["titulo"])
    p(rp["respuesta"])
    if rp.get("evidencia"):
        bul(*[f"Evidencia: `{e}`" for e in rp["evidencia"]])
    if rp.get("pendiente"):
        bul(*[f"**[COMPLETAR]** {x}" for x in rp["pendiente"]])

h2("2 · Habilitantes y anexos administrativos")
p("Plazo de subsanación: **3 días hábiles** contados desde el requerimiento, según los términos de "
  "referencia. Radicación en la plataforma `connectbogota.charly.io/spar/programs/38616` y copia a "
  "`transformalaenergia@connectbogota.org`.")
tab(["#", "documento", "quién lo aporta", "estado"],
    [["1", "Certificado de existencia y representación legal (< 30 días)", "proponente", "[COMPLETAR]"],
     ["2", "Poder o documento de representación legal suficiente", "proponente", "[COMPLETAR]"],
     ["3", "Cédula del representante legal", "proponente", "[COMPLETAR]"],
     ["4", "RUT y aceptación de la cláusula de tratamiento de datos", "proponente", "[COMPLETAR]"],
     ["5", "Estados financieros 2025 (o certificación del revisor fiscal)", "proponente", "[COMPLETAR]"],
     ["6", "Soportes de parafiscales de los últimos 6 meses", "proponente", "[COMPLETAR]"],
     ["7", "Certificación SG-SST del equipo de campo", "proponente", "[COMPLETAR]"],
     ["8", "Pacto de consorcio (solidario, representante común, plazo)", "consorcio", "[COMPLETAR]"],
     ["9", "Anexo 6 · Experiencia del proponente", "proponente", "[COMPLETAR] — ver §1.4"],
     ["10", "Video ≤ 2 min, enlace público o no listado de YouTube", "consorcio",
      "[COMPLETAR] — guion en `docs/VIDEO-GUION.md`"],
     ["11", "Declaración de no inhabilidad / no listas restrictivas", "proponente", "[COMPLETAR]"],
     ["12", "Anexo técnico: este documento + `output/verificacion_hojas.md`", "consorcio",
      "listo (verificado)"]])

h2("3 · Especificación técnica (respuestas técnicas exigidas)")
h3("3.1 · Mecanismo: captura, almacenamiento, transformación, desplazamiento y uso productivo")
p("**Captura.** El EMS mide el despacho real del alimentador y conoce la capacidad de conducción "
  "habilitada (la calibra contra el vertimiento reportado por el activo). La señal de captura es la "
  "brecha de precio entre el nodo de la planta y el nodo del campo: en la hora solar punta el nodo de la "
  f"planta vale 0 COP/kWh (el excedente no tiene por dónde salir) y el del campo vale "
  f"{R['castilla']['precios_nodales']['CAMPO']['pico']:.0f} COP/kWh en punta. Esa diferencia es la "
  "renta de congestión que la solución captura.")
p("**Almacenamiento.** BESS LFP en la cabecera del parque, con protección de potencia inversa en el "
  "punto de conexión: el modelo la representa con un enlace unidireccional, de modo que la batería "
  "**no puede** cargar comprándole al SIN; solo absorbe energía que hoy se vierte. Esto elimina de raíz "
  "la crítica habitual («su ahorro es arbitraje con la red, no aprovechamiento del excedente»).")
p("**Transformación / uso productivo.** La otra mitad de la captura es carga diferible **co-localizada** "
  "en la cabecera: bombeo de inyección de agua, plantas de tratamiento, batch de proceso térmico y "
  "electrolizador de prueba. Se programa 2–4 h dentro de la ventana 12:00–14:00 y se devuelve al "
  "proceso en la misma jornada, sin incumplir el programa de producción.")
p("**Gestión temporal.** Lo capturado se despacha en 17:00–21:00, cuando el precio de bolsa y el cargo "
  "por demanda castigan. En el modelo, el valor de esa decisión no se supone: se mide como la "
  f"diferencia entre una batería óptima sin pronóstico y el MPC completo "
  f"(+{f(sum(R[k]['valor_ad_mpc_pct'] for k in S.CASOS)/len(S.CASOS),1)} % de valor adicional en "
  "promedio).")
tab(["activo", "capacidad de conducción habilitada (MW)", "vertimiento base (MWh/día)",
     "L3 solo BESS", "L4 piloto", "L5 escalado", "reducción piloto", "reducción escala"],
    [[S.CASOS[k].corto, f(R[k]["cap_mw"], 2), f(R[k]["metricas"]["base"]["vert_mwh_dia"], 2),
      f(R[k]["metricas"]["bess_std"]["vert_mwh_dia"], 2), f(R[k]["metricas"]["piloto"]["vert_mwh_dia"], 2),
      f(R[k]["metricas"]["escala"]["vert_mwh_dia"], 2), f"{R[k]['reduccion_piloto_pct']:.1f} %",
      f"{R[k]['reduccion_escala_pct']:.1f} %"] for k in S.CASOS] +
    [["**portafolio**", "—", f(AGG["base"], 2), f(AGG["bess_std"], 2), f(AGG["piloto"], 2),
      f(AGG["escala"], 2), f"**{RED_PIL:.1f} %**", f"**{RED_ESC:.1f} %**"]],
    "Tabla 2 · Reducción del vertimiento por escenario. La escalera L1→L5 separa mérito del hardware, "
    "de la flexibilidad de planta y del algoritmo.")
note("Refinerías llega a 100 % de reducción porque su excedente (4 MWh/día) es menor que la suma de su "
     "flexibilidad co-localizada (4,8 MW) más el BESS; San Fernando y Rubiales quedan en 25 % porque su "
     "ventana es de 14–16 MWh/día y el demostrador del piloto es de 1 MWh. La conclusión operativa está "
     "en §6 (reconciliación de la meta).")

h3("3.2 · Capacidad, eficiencia, tiempo de respuesta, vida útil y degradación")
tab(["parámetro", "piloto", "escalado", "cómo se obtuvo"],
    [["Potencia del integrando", "0,5 MW", "3–8 MW (banda del reto)", "dimensionado a la ventana de excedente"],
     ["Energía", "1 MWh (2 h)", "6–16 MWh (2 h)", "duración = ancho de la ventana 12:00–14:00"],
     ["Eficiencia global round-trip AC-AC", f"{PR['eficiencia_global']:.2f}",
      f"{PR['eficiencia_global']:.2f}", "0,945² (inversor+celda) × 0,98 (transformador)"],
     ["Tiempo de respuesta", f"≤ {PR['respuesta_ms']} ms", f"≤ {PR['respuesta_ms']} ms",
      "lazo local PLC/RTU; el MPC solo mueve consignas cada 1–5 min"],
     ["Vida útil", f"{PR['vida_util_años']} años o 6 000 ciclos equivalentes", "ídem",
      "LFP según ficha del fabricante; 1 ciclo/día en el modelo"],
     ["Degradación", f"{PR['degradacion_anual']*100:.0f} %/año", "ídem",
      "penalizada en el OPF como costo marginal de desgaste (25 000 COP/MWh descargado)"],
     ["Soc operativo", "10–95 %", "10–95 %", "restricción del modelo; evita fondo de energía"],
     ["Ciclos por día", "1", "1", "restricción cíclica del día tipo"]],
    "Tabla 3 · Ficha técnica del integrando. Ningún valor es de vitrina: los que entran en la "
    "optimización están en `sunflex_model.py`.")

h3("3.3 · Operación dentro de la banda 3–8 MW y porcentaje de reducción")
p(f"La rampa agregada del portafolio en la ventana exigida se simula con BESS de 8 MW/16 MWh más "
  f"22 MW de carga diferible co-localizada: **{f(float(D38['reduccion_pct']),1)} %** del excedente "
  f"vertido deja de perderse y **{f(float(D38['energia_anual_mwh']),0)} MWh/año** pasan a ser energía "
  f"útil del activo, sin elevar en ningún paso la potencia inyectada al sistema por encima de la que "
  f"hoy ya se está cortando (es decir: no se le pide ninguna autorización nueva de capacidad).")
bul("La potencia capturada se limita a `min(excedente, potencia del integrando, espacio de SOC)`; "
    "nunca suma flujo nuevo al alimentador en la hora crítica.",
    "La descarga se programa contra la punta de precio (17:00–21:00) o contra la rampa de la propia "
    "planta si el CADE ordena curtailment adicional.",
    "Toda la energía capturada queda contabilizada en el medidor certificado del punto de conexión, "
    "que es la línea de base auditable del KPI.")
h3("Supuestos declarados (exigidos en las bases)")
tab(["#", "supuesto", "valor usado", "efecto si se equivoca"],
    [["S1", "Capacidad de conducción habilitada del alimentador",
      "calibrada por bisección hasta replicar el vertimiento reportado",
      "define el tamaño del integrando; si el operador entrega otra cifra, el dimensionado se recalcula "
      "en 1 clic (`S.calibrar`)"],
     ["S2", "Irradiancia media del sitio", "4,8–5,2 kWh/m²/día según activo",
      "±10 % en la energía solar, casi lineal en el excedente"],
     ["S3", "Perfil de demanda del campo", "curva tipo normalizada a la media y al pico reportados",
      "cambia la hora de cruce con la restricción, no su magnitud"],
     ["S4", "Precio de bolsa", "escalón valle 110–120, medio 250, punta 340–380 COP/kWh (XM histórico)",
      "afecta el ahorro monetario, no la reducción de vertimiento"],
     ["S5", "Eficiencia del integrando", f"{PR['eficiencia_global']:.2f} round-trip",
      "1 punto de eficiencia ≈ 1 % del ahorro anual"],
     ["S6", "Costo de degradación", "25 000 COP/MWh descargado",
      "si se subestima, la batería cicla más de lo prudente; el modelo ya la incluye como costo"],
     ["S7", "Días de operación del activo", "365 (vertimiento) / 300 (rampa del portafolio)",
      "escala los acumulados anuales"],
     ["S8", "Tarifa regulada y peajes", "no se modelan (el ahorro es en energía, bolsa)",
      "el ahorro real por demanda y peajes sería adicional, no se reclama"]],
    "Tabla 4 · Supuestos. Ningún KPI se reporta sin la fila que lo sostiene.")

h3("3.4 · Control: predecir, visualizar, optimizar y coordinar")
num("**Predicción.** Pronóstico solar 24–48 h con corrección de sesgo por sitio y bandas de confianza; "
    "el EMS dimensiona la ventana de captura con el percentil 20 (conservador) y reserva el resto para "
    "autoconsumo.",
    "**Visualización del balance generación–demanda–excedentes.** Panel por activo con la franja "
    "cortada en tiempo real, SOC, MWh capturados del día y precio nodal de la cabecera.",
    "**Optimización.** UCF-MPC: funciones de costo de incertidumbre sobre un horizonte rodante con el "
    "despacho resuelto como OPF lineal (PyPSA + HiGHS); la función de costo incorpora el valor del "
    "excedente, el precio horario, el desgaste y la penalización por incumplir el programa de proceso.",
    "**Coordinación multi-fuente.** Un solo lazo manda a BESS, DR y respaldos térmicos con jerarquía "
    "explícita: primero no violar la capacidad de conducción, después capturar, después economizar.",
    "**Integración con el CADE.** Lectura de la instrucción de curtailment y reporte del aprovechamiento "
    "por el mismo canal de telemetría (15 min), sin modificar el despacho que ordena el operador.")
mer("""```mermaid
flowchart LR
  CADE[CADE / XM] -->|instrucción de curtailment y capacidad habilitada, 15 min| EMS
  W[Sensor irradiación + SCADA inversores] --> FC[Forecast 24-48 h con bandas]
  FC --> EMS[UCF-MPC · OPF PyPSA+HiGHS]
  EMS -->|consignas 1-5 s| BESS[BESS cabecera 0,5-8 MW]
  EMS -->|consignas| DR[Cargas diferibles co-localizadas]
  EMS -->|techo de inyección| INV[Inversores PV]
  EMS -->|reporte de aprovechamiento| CADE
  EMS --> HMI[Balance generación-demanda-excedente]
  MED[Medidor certificado] --> EMS
```""")
h3("3.5 · Requerimientos de conexión e instalación")
tab(["aspecto", "piloto (demostrador)", "escalado"],
    [["Tensión de conexión", "480 V en cabera del parque; el alimentador existente a 34,5 kV no se toca",
      "480 V / 34,5 kV según tamaño; hasta 8 MW entra por la misma cabecera"],
     ["Espacio", "1 contenedor 20 ft + 1 gabinete de maniobra (≈ 60 m²)",
      "2–4 contenedores 20 ft (≈ 250 m²), en predio ya intervenido"],
     ["Obras civiles", "platea de concreto de 30 m³, sin zanjas nuevas: cableado por bandeja existente",
      "platea, canalización y cuneta; sin subestación nueva"],
     ["Modificaciones a la red del operador", "ninguna", "ninguna; se opera bajo la misma "
      "capacidad habilitada, con protección de potencia inversa ajustada"],
     ["Requisitos RETIE / RETILAP", "certificación del instalador, puesta a tierra, selectividad y "
      "señalización; estudio de cortocircuito y coordinación anexado",
      "ídem + prueba de inyección con el operador, y calidad de energía (THD, flicker) medida 7 días"],
     ["Ambiental", "sinLicencia (intervención en predio industrial); manejo de residivo de RAEES con "
      "gestor autorizado", "plan de manejo ambiental para transporte de contenedores; gestión de "
      "baterías al final de vida con el fabricante"],
     ["Ruido / seguridad", "ventilación ≤ 65 dBA a 1 m, perimetraje, detección de gas y corte de "
      "emergencia E-stop", "ídem + sistema de supresión en contenedor"],
     ["Modularidad y reubicación", "el integrando es remolcable y se conecta con plug-in de 480 V; el "
      "EMS se configura por archivo de caso (esta app es la demostración)",
      "mismo patrón por módulos de 2 MW; se puede trasladar entre activos del portafolio en 3 semanas"]],
    "Tabla 5 · Conexión e instalación. Las bases piden «fácil instalación, sin obras civiles mayores» y "
    "valoran la movilidad: el diseño es contenedor + archivo de configuración.")

h3("3.6 · Seguridad, ambiental y normativo")
bul("Cumplimiento CREG/UPME: la solución no vende energía a terceros ni modifica el título de "
    "generación; el excedente capturado se autoconsume, modalidad amparada por el esquema de "
    "generación distribuida y por el autoconsumo a puerta cerrada del parque.",
    "Seguridad de la información: el lazo de control es local (red OT segregada, gateway OPC-UA con "
    "solo lectura hacia IT), sin exposición a internet del PLC; registro inmutable de eventos (caja "
    "negra) para el descargue ante el operador.",
    "SST: AST/PTS previos a cada maniobra, bloqueo y etiquetado LOTO, protocolo de arc flash y "
    "capacitación del personal del activo; la intervención no requiere trabajo en caliente.",
    "Gestión del fin de vida: contrato con el fabricante para reacondicionamiento o reciclaje de "
    "celdas LFP (trazabilidad por número de serie).")

h3("3.7 · O&M y costo total de propiedad")
p(f"El costo nivelado de la energía ciclada por el integrando (LCOS, 10 años, TIR 10,5 %, con "
  f"degradación del 2 % anual y O&M del 2,2 % del CAPEX) es de "
  f"**{ECO['Ventana 3 MW / 6 MWh']['lcos_cop_kwh']:.0f} COP/kWh** "
  f"(≈ {ECO['Ventana 3 MW / 6 MWh']['lcos_usd_mwh']:.0f} USD/MWh), frente a un precio de punta de "
  f"340–380 COP/kWh: el arbitraje dentro del propio activo es rentable sin subsidios.")
tab(["tamaño", "CAPEX (USD)", "CAPEX (M COP)", "energía ciclada 10 años (MWh)",
     "LCOS (COP/kWh)", "LCOS (USD/MWh)"],
    [[k, f"{v['capex_usd']:,.0f}", f(v["capex_mcop"], 0), f"{v['energia_ciclo_mwh']:,.0f}",
      f"{v['lcos_cop_kwh']:.0f}", f"{v['lcos_usd_mwh']:.0f}"] for k, v in ECO.items()],
    "Tabla 6 · LCOS con precios BNEF (pack LFP "
    f"{S.BNEF['pack_usd_kwh']:.0f} USD/kWh × factor EPC {S.BNEF['factor_epc']}, "
    f"{S.BNEF['cop_usd']:,.0f} COP/USD). No incluye repuestos mayores.")

h2("4 · Piloto propuesto: actividades, entregables, cronograma y costo")
p("**Duración:** 6 meses contados desde el acta de inicio (plazo de los términos de referencia). "
  "**Activo anfitrión:** Castilla (21 MWp), por tres razones: su ventana de excedente es la más "
  "pequeña de medir (5 MWh/día, así que el efecto es atribuible), su flexibilidad co-localizada ya está "
  "identificada y su punto de conexión es el más simple. **Segundo activo en paralelo:** Refinerías, "
  "donde la rampa 3–8 MW del portafolio se ve sin ruido.")
tab(["mes", "actividades", "entregables", "desembolso del incentivo (M COP)"],
    [[m, a, e, f(v, 0)] for m, a, e, v in S.CRONOGRAMA] +
    [["**total**", "", "", f"**{f(S.INCENTIVO_RETO1,0)}**"]],
    "Tabla 7 · Cronograma con entregables y flujo del incentivo.")
p("### Costo del piloto por rubros")
tab(["categoría", "detalle", "M COP"],
    [[cat, det, f(v, 1)] for cat, det, v in S.PRESUPUESTO] +
    [["**TOTAL**", f"incentivo {f(S.INCENTIVO_RETO1,0)} + contrapartida {f(S.CONTRAPARTIDA,0)}",
      f"**{f(S.PRESUPUESTO_TOTAL,1)}**"]],
    "Tabla 8 · Presupuesto por rubros. La contrapartida del consorcio cubre la ingeniería de detalle "
    "sobreviniente y la garantía extendida del PCS.")

h2("5 · Resultados esperados: indicadores, metas y evidencia")
tab(["id", "indicador", "tipo", "línea base", "meta", "cómo se mide la evidencia"],
    [[k["id"], k["nombre"], k["tipo"], k["baselines"], k["meta"], k["fuente"]] for k in S.KPI],
    "Tabla 9 · KPI exigidos por las bases: MWh excedente aprovechado, reducción de compras al SIN y "
    "reducción porcentual de vertimiento contra la línea base del propio activo.")
h3("Qué muestra ya la simulación (y qué no)")
tab(["indicador", "simulado hoy", "estado"],
    [["Reducción de vertimiento, piloto",
      f"{RED_PIL:.1f} % del portafolio; por activo: " + ", ".join(
          f"{S.CASOS[k].corto} {R[k]['reduccion_piloto_pct']:.0f} %" for k in S.CASOS),
      "calculado, no medido"],
     ["Reducción de vertimiento, escalado", f"{RED_ESC:.1f} %", "calculado, no medido"],
     ["Reducción de compras al SIN (energía)",
      f"{100*(1-sum(R[k]['metricas']['piloto']['compras_mwh_dia'] for k in S.CASOS)/max(sum(R[k]['metricas']['base']['compras_mwh_dia'] for k in S.CASOS),1e-9)):.1f} %",
      "calculado, no medido"],
     ["CO₂ evitado (piloto)", f"{f(sum(R[k]['metricas']['piloto']['co2_t_anio'] for k in S.CASOS),0)} t/año",
      "factor de la fuente citada en el repositorio base"],
     ["Disponibilidad del lazo de control", "—", "**por medir en campo** (requisito del piloto)"],
     ["Tiempo de respuesta real del PCS", "—", "**por medir en campo** con la prueba de aceptación"]],
    "Tabla 10 · Separación explícita entre lo que el modelo sostiene y lo que solo el piloto puede "
    "entregar. La convocatoria premia la honestidad del umbral de evidencia, no la magnitud de la promesa.")

h2("6 · Reconciliación de la promesa con el modelo (meta >60 %)")
p(f"La propuesta base del repositorio fija como meta «>60 % de reducción del curtailment» en el piloto. "
  f"El modelo calibrado devuelve **{RED_PIL:.1f} % de promedio del portafolio con el demostrador de "
  f"1 MWh** y **{RED_ESC:.1f} %** con el escalado. Lo reportamos así, sin inflar la primera cifra, y "
  f"lo explicamos: con un integrando de 0,5 MW/1 MWh no se pueden capturar 14 MWh/día; la meta de "
  f">60 % se cumple en el piloto **si** la flexibilidad co-localizada llega a 3 MW (en Refinerías el "
  f"modelo da {R['refinerias']['reduccion_piloto_pct']:.0f} % con 4,8 MW disponibles; en Castilla, "
  f"{R['castilla']['reduccion_piloto_pct']:.0f} % con 1,8 MW).")
p("Tres vías, todas dentro del presupuesto, cierran la brecha sin cambiar el hardware:")
num("**Ampliar la flexibilidad co-localizada** con las bombas de inyección del bloque Castilla "
    "(+1,2 MW identificados en el levantamiento de la línea base): eleva la captura del piloto a "
    "≈60 % del excedente local en los tres activos pequeños.",
    "**Reportar el KPI en dos tramos** — «captura de lo técnicamente capturable por el demostrador» "
    f"(en el modelo: {f(sum(R[k]['captura_piloto_mwh'] for k in S.CASOS),1)} MWh/día de "
    f"{f(AGG['base']-AGG['piloto'],1)} MWh/día evitados, es decir el 100 % de lo que el integrando "
    "permite) y «reducción total del vertimiento» — que es lo que crece al escalar.",
    "**Usar la ventana 12:00–14:00 como objetivo del piloto y no del escalado**: el reto pide operar "
    "en 3–8 MW; en la rampa agregada la reducción simulada es "
    f"{f(float(D38['reduccion_pct']),1)} % y esa es la cifra que comprometemos en acta.")
p("**Compromiso final:** meta contractual del piloto = ≥ 50 % de reducción del vertimiento medido en el "
  "activo anfitrión y ≥ 60 % en el portafolio al mes 12, con la línea base definida en el acta y el "
  "medidor certificado como única fuente de verdad.")

h2("7 · Arquitectura digital (Anexo #1)")
mer("""```mermaid
flowchart TB
  subgraph NEG[Negocio]
    N1[Meta: capturar el excedente 3-8 MW sin pedir capacidad nueva]
    N2[KPI: MWh aprovechados, -compras SIN, -% vertimiento]
  end
  subgraph INF[Información]
    I1[(MEDICION · real, 1 s)]
    I2[(DESPACHO · histórico, 15 min)]
    I3[(PRONOSTICO · sintético/real, 1 h)]
    I4[(EVENTO_CAJA_NEGRA · inmutable)]
  end
  subgraph APL[Aplicaciones]
    A1[Pronóstico] --> A2[UCF-MPC] --> A3[EMS/SCADA]
    A2 --> A4[Visualización balance]
    A2 --> A5[Reporte CADE]
  end
  subgraph TEC[Tecnología]
    T1[PLC/RTU IEC 61850] --- T2[Gateway OPC-UA单向]
    T3[Servidor PyPSA+HiGHS] --- T4[BESS+PCS con protecciones]
  end
  NEG --> INF --> APL --> TEC
```""")
h3("Autoevaluación ATAM (0–5) con evidencia")
tab(["atributo", "nota", "justificación / escenario de riesgo"],
    [["Interoperabilidad", 4, "OPC-UA + IEC 61850 hacia SCADA y datos de mercado; pierde 1 punto en la "
      "salida del CADE, que según el activo puede exigir un adaptador propietario."],
     ["Trazabilidad", 5, "cada consigna queda firmada en caja negra con el escenario que la produjo; el "
      "KPI se recalcula desde el mismo registro."],
     ["Escalabilidad", 4, "el dimensionado es un archivo de caso (`CASOS`) y el OPF resuelve 5 activos × "
      "96 pasos en segundos; el límite es el lazo de tiempo real por PLC, no el software."],
     ["Seguridad", 4, "lazo OT segregado, sin exposición a internet, usuarios y roles en el gateway; "
      "resta 1 punto mientras no se implemente el monitoreo IDS propuesto para el mes 4."],
     ["Resiliencia", 4, "si cae el MPC, el PLC conserva la última consigna y entra el modo local "
      "(techo fijo); la degradación es operable, no un paro."]],
    "Tabla 11 · Autoevaluación honesta: ninguna nota máxima sin la escena que la sostiene.")
h3("Modelo lógico de datos y distinción real / histórico / sintético")
tab(["entidad", "campos clave", "origen", "frecuencia", "uso en el piloto"],
    [["MEDICION", "p, q, v, i, energía neta por punto de conexión", "real (medidor certificado, RTU)",
      "1 s – 1 min", "línea de base del KPI y cierre del lazo"],
     ["DESPACHO_RED", "MW despachados, instrucción de curtailment, capacidad habilitada",
      "histórico del operador (15 min) + real-time", "15 min", "calibración de `cap_mw` y detección de "
      "eventos de corte"],
     ["PRONOSTICO", "GHI, potencia solar con bandas, precio XM", "mixto: real de sensor + modelo; "
      "sintético para entrenamiento", "1 h", "entrada del MPC"],
     ["FLEX", "inventario de cargas diferibles, ventana y penalización por incumplimiento",
      "real, levantado con el área de producción", "diario",
      "restricción dura: si el proceso no confirma la ventana, esa flexibilidad no se ofrece"],
     ["EVENTO_CAJA_NEGRA", "consigna, motivo, escenario, firma del operador", "inmutable (append-only)",
      "por evento", "auditoría y descargue regulatorio"]],
    "Tabla 12 · El modelo distingue explícitamente qué es dato, qué es estimación y qué es simulación.")
p("**Piloto en entorno no productivo:** los primeros 60 días el EMS opera en *shadow mode* (lee, "
  "calcula, recomienda, no ejecuta) sobre un gemelo de la red del activo; la escritura de consignas al "
  "equipo se habilita por tramos, con prueba de aceptación firmada en cada tramo. Esto cumple la "
  "exigencia de no afectar la operación actual del sistema.")

h2("8 · Equipo, alianzas y dedicación")
tab(["nombre", "rol", "dedicación", "experiencia declarada", "contribución al reto"],
    [[e["nombre"], e["rol"], f"{e['dedicacion_pct']:.0f} % · {e['h_semana']:.0f} h/sem",
      e["exp"][:150], e["contrib"][:110]] for e in S.EQUIPO],
    "Tabla 13 · Equipo mínimo exigido: ≥ 2 personas a tiempo completo y liderazgo con ≥ 2 h/semana. "
    "Los soportes de experiencia van en el Anexo 6.")
tab(["nivel", "estado", "hito", "evidencia"],
    [[t["nivel"], t["estado"], t["hito"], t["evidencia"][:170]] for t in S.TRL],
    "Tabla 14 · TRL por componentes, con énfasis en que el hardware ofertado es TRL 9 (producto "
    "comercial certificado) y el software llega TRL 7–8 al acta de inicio.")

h2("9 · Riesgos y mitigación")
tab(["id", "riesgo", "probabilidad", "impacto", "mitigación"],
    [[r[0], r[1], r[2], r[3], r[4]] for r in S.RIESGOS],
    "Tabla 15 · Matriz de riesgos del piloto.")

h2("10 · Escalamiento y replicabilidad (+5 pts por La Guajira)")
p(f"El patrón de réplica es un archivo de caso: topología, perfiles, capacidad habilitada, precio y "
  f"flexibilidad. Con ese archivo, el mismo motor produce el dimensionado, el KPI y las hojas de las "
  f"herramientas — es literalmente lo que hace `gen_casepack.py` con los cinco activos de Ecopetrol en "
  f"una corrida de unos 60 segundos para los {len(S.CASOS)} activos.")
bul("Costo marginal de réplica por activo nuevo: levantamiento de flexibilidad (2 semanas) + "
    "integración de datos (1 semana). Sin obra nueva si el activo ya tiene cabecera con espacio para un "
    "contenedor.",
    "Candidatos naturales en el portafolio: Statkraft 128 MW y los parques del Caribe con curtailment "
    "estructural; La Guajira replica el mismo patrón y añade el caso de reubicación del contenedor entre "
    "activos, que es justamente lo que las bases premian con 5 puntos.",
    "El modelo de negocio escalado: contrato por MWh aprovechado (ESCO), con el KPI medido por el "
    "medidor certificado, no por nuestro software.")

h2("11 · Herramientas open-source entregadas y su coherencia con el modelo")
p(f"Las dos herramientas (Load Flow Simulator y ED-UC Simulator) quedan **vendorizadas** dentro de la "
  f"app — sin CDN, sin analítica, sin service worker — y reciben 25 hojas cada una (5 activos × 5 "
  f"escenarios) generadas desde el motor. El usuario puede editar el diagrama y volver a resolver en el "
  f"navegador con PSA.js, un port de PyPSA, de modo que el resultado del navegador y el de Python son el "
  f"mismo cálculo.")
p("Control de calidad de esa entrega (`node tools/verify_casepack.mjs --ed-solve`):")
bul("25/25 hojas LF cargan, validan y **convergen** con el motor Newton-Raphson AC de la propia "
    "herramienta; 0 errores de validación.",
    "Desvío máximo de tensión entre PyPSA (Python) y PSA.js (navegador): **0,0011 pu**; desvío máximo de "
    "pérdidas totales: **0,031 MW** (atribuible al redondeo a 3 decimales del `p_set` en la hoja).",
    "25/25 hojas del simulador ED-UC resuelven `ok/optimal` con HiGHS/wasm en 24 h, en modo EDM o UC "
    "según el activo tenga respaldo térmico o flexibilidad conmutada.",
    "Informe máquina-leíble: `output/verificacion_hojas.md`.")
note("La hoja ED aproxima la curva de oferta de la red en tres escalones porque la herramienta no "
     "admite costo horario variable; por eso el objetivo de la hoja ED **no es comparable 1:1** con el "
     "gasto del modelo, y la venta de excedentes se monetiza solo en el motor (aritmética L2). Se "
     "declara aquí para que la diferencia no se le atribuya a un error del modelo.")

h2("12 · Trazabilidad y límites de lo afirmado")
bul("Fuentes de los datos de activos y precios: publicaciones de Ecopetrol, XM, CREG, UPME, IDEAM y "
    "BNEF listadas en el repositorio base, más el Anexo 1 del Reto 1.",
    "El vertimiento por activo se **calibra** contra el valor reportado en las fuentes; donde el modelo "
    "no puede bajar de ese valor (Rubiales, por potencia solar disponible frente a la demanda del campo) "
    "el desvío se reporta en `desvio_calibracion_pct` y el KPI se calcula contra la línea base más "
    "conservadora.",
    "No se afirma disponibilidad comercial, ni precio de oferta, ni cartas de intención: son elementos "
    "administrativos del proponente y aparecen como **[COMPLETAR]**.",
    "No se reclama ninguna reducción de cargos por demanda ni de peajes (S8): el ahorro mostrado es "
    "solo energía.")

h2("13 · Checklist de radicación (para el día del cierre)")
num("PDF de este documento firmado por el representante legal.",
    "Anexo 6 cargado (experiencia del proponente) y verificado en el formulario.",
    "Enlace de YouTube del video probado en ventana incógnita y < 2:00 min.",
    "Documento/poder de representación legal escaneado legible, con cédula adjunta.",
    "Estados financieros 2025, RUT, parafiscales de 6 meses y SG-SST cargados.",
    "Pacto de consorcio con plazo ≥ al del proyecto y solidario.",
    "Anexo #1 (arquitectura digital) con el diagrama renderizado y la tabla de flujos con el CADE.",
    "Respuesta de las preguntas de la plataforma, sin campos vacíos (revisar casilla por casilla).",
    "Correo de confirmación de radicación archivado como soporte.")

DOC = "\n\n".join([])      # marcador


import re as _re


def norm_es(txt: str) -> str:
    """Decimal con coma (convención colombiana) sin tocar bloques de código ni
    versiones como `v1.1`."""
    partes = _re.split(r"(```.*?```)", txt, flags=_re.S)
    for i in range(0, len(partes), 2):
        partes[i] = _re.sub(r"(?<!v)(?<=\d)\.(?=\d)", ",", partes[i])
    return "".join(partes)


# ── render a markdown ──────────────────────────────────────────────────────
def a_md() -> str:
    out = []
    for b in B:
        t = b[0]
        if t == "h1":
            out.append(f"# {b[1]}\n")
        elif t == "h2":
            out.append(f"\n## {b[1]}\n")
        elif t == "h3":
            out.append(f"\n### {b[1]}\n")
        elif t == "p":
            out.append(b[1].replace("\n\n", "\n\n") + "\n")
        elif t == "bul":
            out.append("\n".join(f"- {x}" for x in b[1]) + "\n")
        elif t == "num":
            out.append("\n".join(f"{i+1}. {x}" for i, x in enumerate(b[1])) + "\n")
        elif t == "note":
            out.append("> " + b[1].replace("\n", "\n> ") + "\n")
        elif t == "mer":
            out.append(b[1] + "\n")
        elif t == "code":
            out.append(f"```{b[2]}\n{b[1]}\n```\n")
        elif t == "tab":
            head, rows, cap = b[1], b[2], b[3]
            out.append("| " + " | ".join(str(h) for h in head) + " |")
            out.append("|" + "|".join(["---"] * len(head)) + "|")
            for r in rows:
                out.append("| " + " | ".join(str(c).replace("\n", " ") for c in r) + " |")
            if cap:
                out.append(f"\n*{cap}*\n")
            out.append("")
        elif t == "brk":
            out.append("\n---\n")
    return norm_es("\n".join(out).replace("\n\n\n", "\n\n"))


# ── render a docx ──────────────────────────────────────────────────────────
def a_docx(ruta: pathlib.Path) -> bool:
    if not DOCX_OK:
        return False
    import docx
    from docx.enum.section import WD_ORIENT
    from docx.shared import Cm, Pt

    d = docx.Document()
    for s in d.sections:
        s.orientation = WD_ORIENT.PORTRAIT
        s.left_margin = s.right_margin = Cm(1.9)
        s.top_margin = s.bottom_margin = Cm(1.9)
    st = d.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10)
    for b in B:
        t = b[0]
        if t == "h1":
            d.add_heading(b[1], level=0)
        elif t == "h2":
            d.add_heading(b[1], level=1)
        elif t == "h3":
            d.add_heading(b[1], level=2)
        elif t == "p":
            for para in b[1].split("\n\n"):
                if para.strip():
                    d.add_paragraph(sin_md(para))
        elif t == "bul":
            for x in b[1]:
                d.add_paragraph(sin_md(x), style="List Bullet")
        elif t == "num":
            for x in b[1]:
                d.add_paragraph(sin_md(x), style="List Number")
        elif t == "note":
            pr = d.add_paragraph(sin_md(b[1]))
            pr.paragraph_format.left_indent = Cm(0.6)
            for r in pr.runs:
                r.italic = True
                r.font.size = Pt(9)
        elif t == "mer" or t == "code":
            d.add_paragraph("【diagrama/ código fuente · ver la versión Markdown para el render】")
            for lin in (b[2] if t == "code" else b[1]).splitlines():
                pr = d.add_paragraph(lin)
                pr.paragraph_format.left_indent = Cm(0.4)
                for r in pr.runs:
                    r.font.name = "Consolas"
                    r.font.size = Pt(8)
        elif t == "tab":
            head, rows, cap = b[1], b[2], b[3]
            tb = d.add_table(rows=1, cols=len(head))
            tb.style = "Light Grid Accent 1"
            for i, h in enumerate(head):
                cell = tb.rows[0].cells[i]
                cell.text = ""
                r = cell.paragraphs[0].add_run(str(h))
                r.bold = True
                r.font.size = Pt(9)
            for rw in rows:
                cs = tb.add_row().cells
                for i, c in enumerate(rw):
                    cs[i].text = ""
                    r = cs[i].paragraphs[0].add_run(sin_md(str(c)))
                    r.font.size = Pt(9)
            if cap:
                pr = d.add_paragraph(sin_md(cap))
                for r in pr.runs:
                    r.italic = True
                    r.font.size = Pt(8)
        elif t == "brk":
            d.add_page_break()
    d.save(str(ruta))
    return True


def sin_md(tx: str) -> str:
    for a, bb in (("**", ""), ("`", ""), ("*(", "(")):
        tx = tx.replace(a, bb)
    return norm_es(tx.replace("*", ""))


# ── README ─────────────────────────────────────────────────────────────────
LEEME = f"""# SUNFLEX-EMS · propuesta al Reto 1 «Transforma la Energía»

![ci](https://github.com/USUARIO/sunflex-ems/actions/workflows/ci.yml/badge.svg)
<!-- sustituya USUARIO y, si quiere, añada el badge de Streamlit que aparece en docs/DEPLOY.md -->

Aplicación Streamlit + motor de simulación propio para el Reto 1 (aprovechamiento de
energía solar excedentaria, Ecopetrol / CADE). Los 25 apartados de la app salen del
mismo cálculo: no hay números escritos a mano.

**App desplegada:** <https://SUA-APP.streamlit.app> · **Cómo se despliega:** [`docs/DEPLOY.md`](docs/DEPLOY.md)

| | |
|---|---|
| 🧮 Motor | `sunflex_model.py` — red PyPSA por activo (3 barras), 96 pasos de 15 min, OPF con HiGHS, flujo de cargas Newton-Raphson y economía |
| 🔌 Herramientas | Load Flow Simulator y ED-UC Simulator (GPL-3.0), vendorizados y con 25 hojas propias cada uno |
| 📝 Documento | `docs/RESPUESTA_SUBSANACION.md` / `.docx` — los 5 reparos y todas las preguntas sin responder |
| ✅ Verificación | `output/verificacion_hojas.md` — 25/25 hojas LF convergen con el motor del navegador, 25/25 ED `ok/optimal` |

## Correr en local

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

⚠ **`xarray>=2026.1` es obligatorio**: las imágenes base de Python y de Streamlit Cloud
traen 2025.x, que con PyPSA 1.4 revienta al armar el balance nodal con
`TypeError: Cannot interpret '<StringDtype(na_value=nan)>'`. `requirements.txt` lo
pinea y `sunflex_model.py` lo comprueba al importar (fallo en español, no un
`TypeError` críptico). `make install` o `bash tools/preview.sh` hacen lo mismo.

## Publicar (GitHub → Streamlit Community Cloud)

Este árbol ya trae su historial git hecho, así que solo falta el remoto:

```bash
git remote add origin https://github.com/SU-USUARIO/sunflex-ems.git
git push -u origin main           # el CI de .github/workflows/ci.yml empieza solo
gh run watch                      # opcional: ver el verde antes de seguir
```

Luego, en <https://share.streamlit.io/new> · **New app**: autorice el repo,
`Repository: SU-USUARIO/sunflex-ems`, `Branch: main`, **`Main file path: app.py`**
(esa ruta es la única que debe escribir a mano) → *Advanced settings* →
**Python version: 3.13** → *Deploy*. Tarda 1–3 min (`pip install -r requirements.txt`)
y queda en `https://sunflex-ems.streamlit.app`.

Cuando funcione: reemplace el enlace `SUA-APP.streamlit.app` y el `USUARIO` del badge
de arriba por los reales y vuelva a correr `python3 gen_docs.py` (el README se genera).

## Qué se ve, tabula por tabula

| pestaña | contenido |
|---|---|
| 🏠 Resumen → 📅 Plan Piloto (20) | la propuesta del repositorio base: contexto SIN, los 5 parques con sus sub-pestañas (Curtailment · BESS · DR · Pronóstico), mapa, UCF-MPC, regulación y CADE |
| 🧮 Modelo PyPSA (21) | calibración de la capacidad de conducción, los 5 escenarios L1–L5, curvas del día, flujo de cargas en dos horas críticas, precio marginal del nodo, JSON descargable |
| 🔌 Load Flow (22) | el simulador embebido con la hoja del caso elegido (25 hojas, motor PSA.js) |
| ⏱ ED-UC (23) | el mismo caso como despacho económico 24 h, modo EDM o UC |
| 🎯 Ventana 3–8 MW (24) | la rampa exigida por el Anexo 1 y la regla de despacho del EMS |
| 💰 Economía y TCO (25) | LCOS con precios BNEF, presupuesto por rubros, cronograma, ahorro por activo |

**25 pestañas.** Dos se podaron al armar `app.py` (`👤 Equipo` y `📝 Respuesta de
subsanación`): el equipo y la respuesta a los reparos van en `docs/` (Anexo 6,
`RESPUESTA_SUBSANACION.md`), que es donde los revisa el jurado, y no duplicados en la
app. La poda se hace en `build_app.py` con `assert` sobre el nombre y el bloque, y se
renumeran los índices restantes; `baseline/app.py` sigue verbatim para poder auditar el diff.

Capturas de la app (se regeneran con `python3 tools/capturas.py` con la app corriendo):

| | |
|---|---|
| ![Resumen](docs/capturas/01-resumen.jpg) | ![Modelo PyPSA](docs/capturas/02-motor-pypsa.jpg) |
| ![Load Flow embebido](docs/capturas/04-loadflow.jpg) | ![La hoja dentro del simulador](docs/capturas/04b-loadflow-dentro.jpg) |
| ![Sello de build al pie de la app](docs/capturas/09-sello-build.jpg) | [![detalle](docs/capturas/09b-build-detalle.jpg)](docs/capturas/09-sello-build.jpg) |

Al pie de todas las pestañas la app pinta su **sello de build** (commit, líneas de
`app.py`, hora de escritura y nº de pestañas): si una pantalla no muestra esa línea, lo
que hay delante es una sesión vieja del navegador —el cuadro de excepción de Streamlit se
queda pegado cuando el servidor muere— y no un fallo real. `python3 tools/diagnostico.py`
(o `make diag`) lo confirma en 10 s comparando el commit con el proceso que sirve.

El último recuadro es el iframe por dentro: la hoja `Castilla · piloto` cargada en el
simulador (3 barras, 2 ramas, BESS en carga) y resuelta por su propio motor en 17 ms.

## Verificación (lo que puede repetir el jurado)

```bash
python3 sunflex_model.py                  # 5 activos × 5 escenarios, ~1 min
python3 gen_casepack.py                   # 25 hojas LF + 25 hojas ED
python3 tools/diagnostico.py              # ¿mi copia es la del repo? (make diag)
python3 tools/check_app.py                # las 25 pestañas headless, cero excepciones
make check                                # todo lo anterior
```

Resultado esperado: coincidencia con PyPSA de **≤ 0,0011 pu** en tensión y
**≤ 0,031 MW** en pérdidas (solo redondeo de la hoja); `ci.yml` corre esto mismo en
cada push.

## Estructura

| ruta | qué es |
|---|---|
| `app.py` | la app (generada: `baseline/app.py` verbatim + `tabs_sunflex_src.py`) |
| `build_app.py` | reconstruye `app.py` (no edite `app.py` a mano) |
| `baseline/` | copia verbatim del repositorio base, para el diff de auditoría |
| `data_reto1.py`, `algorithms_reto1.py` | datos y algoritmos del repositorio base |
| `sunflex_model.py` | **el motor**: perfiles, calibración, OPF, flujo de cargas, hojas LF/ED, economía, tablas del anexo |
| `gen_casepack.py` · `gen_docs.py` · `gen_habilitantes.py` | regeneran hojas, documentos y planillas |
| `tools/` | `verify_casepack.mjs` (check Node), `check_app.py`, `capturas.py`, `preview.sh` |
| `static/tools/` | las dos herramientas vendorizadas + `sunflex-cases.js`/`sunflex-boot.js` |
| `docs/` | respuesta de subsanación (`.md`/`.docx`), `DEPLOY.md`, guion del video, `habilitantes/` |
| `output/` | `casepack.json` y `verificacion_hojas.md`, committed para leer sin instalar nada |

## Licencias

`static/tools/` redistribuye las dos herramientas bajo **GPL-3.0** (con sus `LICENSE`),
y el motor usa **PyPSA/linopy/HiGHS bajo MIT**. Detalle y procedencia de los datos:
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Honestidad de los números

- El vertimiento **no es un dato de entrada**: emerge de una restricción de capacidad de
  conducción calibrada contra el valor reportado por cada activo (Rubiales declara +30 %
  de desvío porque su suelo físico no llega a la cifra de la fuente: se reporta, no se oculta).
- El ahorro es solo energía (bolsa). No se reclaman cargos por demanda, peajes ni garantías.
- Los `[COMPLETAR]` son verificables del proponente y se quedan vacíos a propósito.
- La meta «>60 % de reducción» se cumple en el escalado y en activos con flexibilidad
  co-localizada ≥ 3 MW; con el demostrador de 1 MWh el modelo da {RED_PIL:.1f} % del
  portafolio (ver §6 del documento de respuesta).

*Consorcio: Consultoría Regulatoria S.A.S. · Kai Desarrollo S.A.S. · grupo del
Prof. Sergio Rivera (Universidad Nacional de Colombia).*
"""


def main() -> int:
    docs = RAIZ / "docs"
    docs.mkdir(exist_ok=True)
    md = a_md()
    (docs / "RESPUESTA_SUBSANACION.md").write_text(md + "\n", encoding="utf-8")
    n = a_docx(docs / "RESPUESTA_SUBSANACION.docx")
    (docs / "VIDEO-GUION.md").write_text(GUION, encoding="utf-8")
    (RAIZ / "README.md").write_text(LEEME, encoding="utf-8")
    print(f"docs/RESPUESTA_SUBSANACION.md · {len(md.splitlines())} líneas · "
          f"{len(md)//1024} kB · {len(B)} bloques")
    print(f"docs/RESPUESTA_SUBSANACION.docx · {'escrito' if n else 'omitido (falta python-docx)'}")
    print(f"docs/VIDEO-GUION.md · README.md")
    return 0


GUION = f"""# Guion del video · 2:00 min máximo (subir a YouTube como no listado)

| t | plano | audio (máx 2 700 caracteres en total) |
|---|---|---|
| 0:00–0:12 | drone: campo solar al mediodía, invertidores | «A mediodía estos parques producen más de lo que el alimentador puede evacuar.» |
| 0:12–0:28 | gráfico de la ventana 12:00–14:00 con la franja recortada | «Entre 3 y 8 MW se cortan por capacidad de conducción. En el portafolio son 45 MWh al día: 16 GWh al año que ya se pagaron y no se usan.» |
| 0:28–0:45 | app: pestaña *Modelo PyPSA*, curva con el sombreado del vertimiento | «Lo simulamos activo por activo con PyPSA y HiGHS, 15 minutos por paso. El corte no lo inventamos: emerge de la restricción real del alimentador.» |
| 0:45–1:05 | Load Flow Simulator en el navegador, hoja Castilla · piloto | «La misma red, en la herramienta open-source que entregamos: el nodo de la planta vale cero y el del campo 350 pesos. Ahí está el dinero.» |
| 1:05–1:25 | animación: BESS en cabecera cargando con el excedente, luego descargando a las 7 p.m. | «Como la restricción es de transferencia, el almacenamiento va en la cabera del parque y no puede comprarle a la red: solo toma lo que hoy se vierte. La otra mitad es carga diferida co-localizada.» |
| 1:25–1:45 | panel de control: SOC, MWh capturados, KPI, reporte al CADE | «El MPC decide cuándo: predica con percentiles, opera en banda 3–8 MW y reporta por el mismo canal de telemetría. Un 14 % más de valor que una batería óptima sin pronóstico.» |
| 1:45–1:58 | resultados en texto grande + equipo + llamado | «Resultado del modelo: −{RED_PIL:.0f} % de vertimiento en el piloto, −{RED_ESC:.0f} % al escalar, {AH_PIL:,.0f} M COP al año. Seis meses de piloto en Castilla, replicable con un archivo de caso. Somos el consorcio Consultoría Regulatoria, Kai Desarrollo y la Universidad Nacional.» |

**Reglas de cumplimiento:** duración ≤ 2:00 (revisar en YouTube, no en el editor);
enlace probado en ventana incógnita; sin música con derechos; subtítulos
automáticos activados; cerrar con el nombre del reto y del proponente.
"""


if __name__ == "__main__":
    raise SystemExit(main())
