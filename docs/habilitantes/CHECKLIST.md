# Checklist de radicación y plan de los 3 días hábiles

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

Resultados que sostienen el documento (portafolio de 5 activos, día tipo 2026-02-10):
vertimiento 45.2 MWh/día en línea base, 26.3 con el piloto (−41.7 %) y
5.4 al escalar (−88.1 %); ahorro anual simulado 3,489 M COP en el piloto y
4,876 M COP escalado.
