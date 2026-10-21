#!/usr/bin/env python3
"""gen_habilitantes.py — plantillas para los habilitantes y el Anexo 6.

Genera:
  docs/habilitantes/06-anexo-experiencia.xlsx   matriz de experiencia (3 hojas)
  docs/habilitantes/CHECKLIST.md                radicación y plan de los 3 días hábiles

No inventa datos: las filas de proyectos quedan como [COMPLETAR] y una fila
"EJEMPLO ILUSTRATIVO · NO RADICAR" muestra el nivel de detalle que exige el
criterio «experiencia del proponente» (20 pts).
"""
from __future__ import annotations

import logging
import pathlib
import sys

logging.disable(logging.WARNING)
RAIZ = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(RAIZ))

from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Alignment, Font, PatternFill  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402

import sunflex_model as S  # noqa: E402

_RES = {k: S.resolver(k) for k in S.CASOS}
V_BASE = sum(_RES[k]["metricas"]["base"]["vert_mwh_dia"] for k in S.CASOS)
V_PIL = sum(_RES[k]["metricas"]["piloto"]["vert_mwh_dia"] for k in S.CASOS)
V_ESC = sum(_RES[k]["metricas"]["escala"]["vert_mwh_dia"] for k in S.CASOS)
AH_PIL = sum(_RES[k]["ahorro_piloto_mcop"] for k in S.CASOS)
AH_ESC = sum(_RES[k]["ahorro_escala_mcop"] for k in S.CASOS)

CAB = Font(bold=True, color="FFFFFF")
FON = PatternFill("solid", fgColor="1A3A2A")
AJ = Alignment(wrap_text=True, vertical="top")
ROJO = PatternFill("solid", fgColor="FFF3CD")


def hoja(ws, titulo, cols, filas, anchos, nota=""):
    ws.append([titulo])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append(cols)
    for c in range(1, len(cols) + 1):
        cell = ws.cell(row=2, column=c)
        cell.font, cell.fill, cell.alignment = CAB, FON, Alignment(wrap_text=True, vertical="center")
    for f in filas:
        ws.append(f)
    for i, w in enumerate(anchos, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for r in range(3, ws.max_row + 1):
        for c in range(1, len(cols) + 1):
            ws.cell(row=r, column=c).alignment = AJ
        if any("[COMPLETAR]" in str(v) for v in ws[r]):
            for c in range(1, len(cols) + 1):
                ws.cell(row=r, column=c).fill = ROJO
    if nota:
        ws.append([])
        ws.append([nota])
        ws.cell(row=ws.max_row, column=1).alignment = AJ
        ws.cell(row=ws.max_row, column=1).font = Font(italic=True, size=9)
    ws.freeze_panes = "A3"


wb = Workbook()

# ── 1 · experiencia del proponente (Anexo 6) ───────────────────────────────
ws = wb.active
ws.title = "Anexo 6 · Experiencia"
cols = ["N°", "Proyecto / contrato", "Cliente", "Año", "Alcance ejecutado",
        "Valor (M COP)", "Rol del proponente", "Resultado medible verifiable",
        "Contacto de verificación", "Soporte adjunto", "Estado"]
filas = [[i, "[COMPLETAR]", "[COMPLETAR]", "[AÑO]", "[qué se hizo, con qué alcance técnico]",
          "[M COP]", "líder / consultor / integrador", "[métrica antes-después]",
          "[nombre, cargo, correo o teléfono del cliente]", "[certificado, acta de liquidación, informe]",
          "pendiente de radicar"] for i in range(1, 9)]
filas.append(["E", "EJEMPLO ILUSTRATIVO · NO RADICAR", "Operador de energía (illustrativo)", 2025,
              "Modelado de 4 parques solares con OPF de 96 pasos y dimensionado de BESS; "
              "integración OPC-UA con SCADA existente",
              640, "modelación, algoritmo y puesta en punto",
              "reducción de 38 % en el vertimiento medido en 6 meses; 3 informes de operación auditados",
              "nombre y correo del área de operación",
              "acta de liquidación + informe final con firma electrónica",
              "este nivel de detalle es el que puntúa"])
hoja(ws, "Anexo 6 · Experiencia verificable del proponente (criterio: 20 puntos)", cols, filas,
     [5, 34, 22, 8, 44, 12, 22, 40, 26, 30, 20],
     "Cómo se usa: una fila por proyecto. El jurado verifica con el contacto indicado, así que "
     "solo se listan contratos con soporte y contacto real. Se recomiendan 4-6 proyectos "
     "directamente comparables (energía solar, almacenamiento, integración con despacho o SCADA) "
     "y no 20 genéricos: el criterio evalúa pertinencia, no cantidad. Las filas en amarillo son "
     "obligatorias de completar antes de radicar.")

# ── 2 · equipo y dedicación ─────────────────────────────────────────────────
ws2 = wb.create_sheet("Trayectoria del consorcio")
cols2 = ["Nombre", "Rol en el proyecto", "Dedicación", "Horas/semana", "Perfil y experiencia",
         "Contribución al Reto 1", "Soporte"]
filas2 = [[e["nombre"], e["rol"], f"{e['dedicacion_pct']:.0f} %", f"{e['h_semana']:.0f}",
           e["perfil"], e["contrib"], "[COMPLETAR: hoja de vida + contratos de exclusividad o "
                                      "laboración]"] for e in S.EQUIPO]
# Se llama «Trayectoria del consorcio», no «Equipo», para no confundirla con la
# pestaña «👤 Equipo» de la app, que se podó en build_app.py: aquí se documenta la
# experiencia verificable (criterio de 20 puntos), no la presentación del equipo.
hoja(ws2, "Equipo del consorcio (mínimo exigido: 2 personas a tiempo completo y liderazgo ≥ 2 h/semana)",
     cols2, filas2, [26, 34, 11, 12, 60, 52, 40],
     "La exigencia de los términos de referencia es ≥ 2 miembros a tiempo completo; este equipo "
     "presenta 2 al 100 % y dirección técnica con la dedicación indicada. Adjuntar hoja de vida "
     "con firma y, si aplica, constancia de disponibilidad durante los 6 meses del piloto.")

# ── 3 · cumplimiento de criterios de evaluación ─────────────────────────────
ws3 = wb.create_sheet("Matriz de criterios")
cols3 = ["Criterio", "Puntos", "Dónde se responde", "Qué hace falta todavía", "Riesgo de puntaje"]
CRIT = [
    ("Pertinencia frente al reto", 20,
     "§0 y §3.1 del documento de respuesta; pestañas «Contexto SIN», «Curtailment» y «Modelo PyPSA»",
     "Confirmar el activo anfitrión con la gerencia de energía de Ecopetrol", "bajo"),
    ("Calidad técnica de la solución", 20,
     "§3 (especificación, supuestos S1-S8, Tablas 2-6); verificación en output/verificacion_hojas.md",
     "Adjuntar el protocolo de prueba de aceptación en campo (HIL + FAT)", "bajo"),
    ("Innovación", 20,
     "§3.1 (captura aguas abajo de la restricción), §3.4 (UCF-MPC), §7 (arquitectura)",
     "Redactar en 5 líneas el estado de la técnica y en qué se diferencia", "medio"),
    ("Experiencia del proponente", 20, "Anexo 6 (esta planilla, hoja 1)",
     "**Llenar la matriz con proyectos reales y sus soportes**", "ALTO: es el punto 4 del reparo"),
    ("Alianzas y ecosistema", 5, "§8 (consorcio, UNAL, acuerdo con el CADE descrito en §3.4)",
     "Carta de intención o correo del área técnica de Ecopetrol/CADE", "medio"),
    ("Equipo humano", 5, "§8 y hoja «Trayectoria del consorcio»", "Hojas de vida firmadas", "bajo"),
    ("Replicabilidad y escalabilidad", 10, "§10 y §4 (réplica = un archivo de caso)",
     "Costo marginal de réplica por activo (cotización de integración)", "bajo"),
    ("Extra: impacto en La Guajira", 5, "§10 (reubicación del contenedor entre activos)",
     "Decidir si se oferta el activo de La Guajira como segundo sitio", "oportunidad"),
]
hoja(ws3, "Matriz de autoevaluación contra los criterios de la convocatoria", cols3,
     [list(c) for c in CRIT], [34, 8, 62, 52, 20],
     "Puntajes según los términos de referencia. «Riesgo de puntaje» es la probabilidad de perder "
     "puntos si la respuesta queda como está hoy; lo marcado ALTO es obligatorio antes del cierre.")

out = RAIZ / "docs" / "habilitantes"
out.mkdir(parents=True, exist_ok=True)
ruta = out / "06-anexo-experiencia.xlsx"
wb.save(ruta)

CHK = f"""# Checklist de radicación y plan de los 3 días hábiles

**Ventanilla de subsanación:** 3 días hábiles desde el requerimiento (términos de referencia).
**Cierre de la convocatoria:** 20-oct-2026, 10:00 a. m. (Bogotá).

## Día 1 · habilitantes documentales
- [ ] Certificado de existencia y representación legal (vigencia < 30 días) · Consultoría Regulatoria S.A.S.
- [ ] Poder especial del representante legal, con facultades explícitas para este proceso
- [ ] Cédula del representante legal, legible
- [ ] RUT con actividad económica concordante con el objeto del contrato
- [ ] Estados financieros 2025 (o certificación del revisor fiscal)
- [ ] Paz y salvo de parafiscales, últimos 6 meses
- [ ] Certificación SG-SST vigente del equipo que irá a campo
- [ ] Declaración de no inhabilidad y de no aparición en listas restrictivas
- [ ] Pacto de consorcio: solidario, representante común, plazo ≥ duración del proyecto
- [ ] Documento de constitución con ≥ 2 años de antigüedad (causal de rechazo si no)

## Día 2 · Anexo 6 y contenido técnico
- [ ] Llenar `06-anexo-experiencia.xlsx` (hoja 1) con proyectos reales + soportes
- [ ] Hojas de vida firmadas del equipo (hoja 2 de la planilla)
- [ ] Verificar que ningún campo del formulario quede sin respuesta (las preguntas sin responder son reparo)
- [ ] Adjuntar `docs/RESPUESTA_SUBSANACION.md` en PDF firmado
- [ ] Adjuntar `output/verificacion_hojas.md` como anexo de validación
- [ ] Adjuntar el Anexo #1 de arquitectura digital con los diagramas renderizados

## Día 3 · video y revisión final
- [ ] Grabar el video con el guion de `docs/VIDEO-GUION.md` (≤ 2:00)
- [ ] Subir a YouTube como **no listado** y probar el enlace en ventana incógnita
- [ ] Pegar el enlace en el formulario **y** en el PDF (si uno falla, queda el otro)
- [ ] Comprobar duración real en YouTube (no en el editor)
- [ ] Lectura final: que ninguna cifra del documento contradiga al modelo (regenerar con `python3 gen_docs.py`)
- [ ] Radicar con tiempo y guardar el acuse de recibo

## Reglas de contenido que no deben romperse
1. **TRL 7-9**: el software va en TRL 7-8 al acta de inicio y el hardware ofertado es TRL 9
   (producto comercial certificado). No describir el proyecto como investigación TRL 1-6.
2. **No afirmar** ahorros de cargos por demanda, peajes o garantía de obligación: el modelo
   solo monetiza energía. Ver supuesto S8.
3. **Declarar los supuestos** S1-S8 junto a cada KPI (las bases lo piden explícitamente).
4. Los campos `[COMPLETAR]` no se sustituyen por datos estimados: son verificables del
   proponente y el jurado los contrasta.

## Comandos que reproducen todo
```bash
python3 sunflex_model.py                  # motor: 5 activos × 5 escenarios
python3 gen_casepack.py                   # 25 hojas LF + 25 hojas ED
node tools/verify_casepack.mjs --ed-solve # 25/25 LF convergen · 25/25 ED ok/optimal
python3 gen_docs.py                       # reescribe los documentos desde el modelo
python3 gen_habilitantes.py               # reescribe esta planilla y el checklist
streamlit run app.py                      # la app (25 pestañas)
```

Resultados que sostienen el documento (portafolio de {len(S.CASOS)} activos, día tipo 2026-02-10):
vertimiento {{vb:.1f}} MWh/día en línea base, {{vp:.1f}} con el piloto (−{{rp:.1f}} %) y
{{ve:.1f}} al escalar (−{{re:.1f}} %); ahorro anual simulado {{ah:,.0f}} M COP en el piloto y
{{ae:,.0f}} M COP escalado.
""".format(vb=V_BASE, vp=V_PIL, ve=V_ESC, rp=100*(1-V_PIL/V_BASE), re=100*(1-V_ESC/V_BASE),
           ah=AH_PIL, ae=AH_ESC)
(out / "CHECKLIST.md").write_text(CHK, encoding="utf-8")
print(f"{ruta.name} · 3 hojas · {ruta.stat().st_size//1024} kB")
print("CHECKLIST.md ·", len(CHK.splitlines()), "líneas")
