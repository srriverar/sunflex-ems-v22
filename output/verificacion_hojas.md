# Verificación de las hojas SUNFLEX contra los motores de las herramientas

Comando: `node tools/verify_casepack.mjs`  ·  2026-10-19 20:23 UTC

- Hojas LF probadas: **25** (5 activos × 5 escenarios), resueltas con el motor Newton-Raphson AC de la propia herramienta (PSA.js, port de PyPSA).
- Convergen y validan sin error: **25/25**.
- Desvío máximo de tensión PyPSA (Python) ↔ PSA.js (navegador): **0.0011 pu**.
- Desvío máximo de pérdidas totales: **3.1e-2 MW** (ambos motores ven el mismo grafo).
- Rango de tensión admitido en el check: 0,5–1,3 pu; todas las hojas quedan en 0.968–1.000 pu.

| hoja | converge | V mín (pu) | V máx (pu) | pérdidas (MW) | ΔV vs PyPSA | ΔPérd |
|---|---|---|---|---|---|---|
| Castilla · base | sí | 0.9827 | 1.0000 | 0.0154 | 0.0000 | 4.1e-5 |
| Castilla · venta | sí | 0.9827 | 1.0000 | 0.0154 | 0.0000 | 4.1e-5 |
| Castilla · bess_std | sí | 0.9828 | 1.0000 | 0.0155 | 0.0001 | 8.3e-5 |
| Castilla · piloto | sí | 0.9817 | 1.0000 | 0.0208 | 0.0010 | 5.4e-3 |
| Castilla · escala | sí | 0.9837 | 1.0000 | 0.0210 | 0.0011 | 3.3e-3 |
| San Fernando · base | sí | 0.9830 | 1.0000 | 0.0927 | 0.0000 | 7.2e-5 |
| San Fernando · venta | sí | 0.9830 | 1.0000 | 0.0927 | 0.0000 | 7.2e-5 |
| San Fernando · bess_std | sí | 0.9830 | 1.0000 | 0.0929 | 0.0001 | 3.2e-4 |
| San Fernando · piloto | sí | 0.9826 | 1.0000 | 0.0962 | 0.0004 | 3.6e-3 |
| San Fernando · escala | sí | 0.9836 | 1.0000 | 0.1149 | 0.0004 | 1.1e-2 |
| Brisas · base | sí | 0.9836 | 1.0000 | 0.0201 | 0.0000 | 3.9e-5 |
| Brisas · venta | sí | 0.9836 | 1.0000 | 0.0201 | 0.0000 | 3.9e-5 |
| Brisas · bess_std | sí | 0.9836 | 1.0000 | 0.0201 | 0.0001 | 4.6e-5 |
| Brisas · piloto | sí | 0.9829 | 1.0000 | 0.0232 | 0.0007 | 3.1e-3 |
| Brisas · escala | sí | 0.9846 | 1.0000 | 0.0262 | 0.0009 | 1.5e-3 |
| Rubiales · base | sí | 0.9843 | 1.0000 | 0.2489 | 0.0000 | 5.9e-5 |
| Rubiales · venta | sí | 0.9851 | 1.0000 | 0.2777 | 0.0000 | 8.4e-5 |
| Rubiales · bess_std | sí | 0.9843 | 1.0000 | 0.2494 | 0.0000 | 5.5e-4 |
| Rubiales · piloto | sí | 0.9856 | 1.0000 | 0.3059 | 0.0005 | 6.2e-3 |
| Rubiales · escala | sí | 0.9863 | 1.0000 | 0.3345 | 0.0004 | 9.8e-3 |
| Refinerías · base | sí | 0.9680 | 1.0000 | 0.9422 | 0.0000 | 5.5e-5 |
| Refinerías · venta | sí | 0.9680 | 1.0000 | 0.9422 | 0.0000 | 5.5e-5 |
| Refinerías · bess_std | sí | 0.9680 | 1.0000 | 0.9425 | 0.0000 | 3.8e-4 |
| Refinerías · piloto | sí | 0.9680 | 1.0000 | 0.9739 | 0.0002 | 3.1e-2 |
| Refinerías · escala | sí | 0.9680 | 1.0000 | 0.9739 | 0.0002 | 3.1e-2 |

## Hojas del simulador ED-UC

| hoja | modo | horas | validación | warn | estado HiGHS | costo objetivo |
|---|---|---|---|---|---|---|
| Castilla · base | uc | 24 | ok | 0 | no resuelto | - |
| Castilla · venta | uc | 24 | ok | 0 | no resuelto | - |
| Castilla · bess_std | uc | 24 | ok | 0 | no resuelto | - |
| Castilla · piloto | uc | 24 | ok | 0 | no resuelto | - |
| Castilla · escala | uc | 24 | ok | 0 | no resuelto | - |
| San Fernando · base | uc | 24 | ok | 0 | no resuelto | - |
| San Fernando · venta | uc | 24 | ok | 0 | no resuelto | - |
| San Fernando · bess_std | uc | 24 | ok | 0 | no resuelto | - |
| San Fernando · piloto | uc | 24 | ok | 0 | no resuelto | - |
| San Fernando · escala | uc | 24 | ok | 0 | no resuelto | - |
| Brisas · base | edm | 24 | ok | 0 | no resuelto | - |
| Brisas · venta | edm | 24 | ok | 0 | no resuelto | - |
| Brisas · bess_std | edm | 24 | ok | 0 | no resuelto | - |
| Brisas · piloto | uc | 24 | ok | 0 | no resuelto | - |
| Brisas · escala | uc | 24 | ok | 0 | no resuelto | - |
| Rubiales · base | edm | 24 | ok | 0 | no resuelto | - |
| Rubiales · venta | edm | 24 | ok | 0 | no resuelto | - |
| Rubiales · bess_std | edm | 24 | ok | 0 | no resuelto | - |
| Rubiales · piloto | uc | 24 | ok | 0 | no resuelto | - |
| Rubiales · escala | uc | 24 | ok | 0 | no resuelto | - |
| Refinerías · base | edm | 24 | ok | 0 | no resuelto | - |
| Refinerías · venta | edm | 24 | ok | 0 | no resuelto | - |
| Refinerías · bess_std | edm | 24 | ok | 0 | no resuelto | - |
| Refinerías · piloto | uc | 24 | ok | 0 | no resuelto | - |
| Refinerías · escala | uc | 24 | ok | 0 | no resuelto | - |

> Las hojas no se editan a mano: se generan con `python3 gen_casepack.py` desde
> `sunflex_model.py` y este script es el control de calidad de esa generación.
