# ☀️🔋 SUNFLEX-EMS v1.1

**Sistema de Gestión Energética de Excedentes Solares — UPSSISTEMAS**

Plataforma interactiva para el **Reto 1: Aprovechamiento de la Energía Excedentaria** del ecosistema Econova (Grupo Ecopetrol).

## 🎯 Descripción

SUNFLEX-EMS es la capa de inteligencia que UPSSISTEMAS agrega a sus BESS para que capturen más valor, anticipen excedentes con pronóstico, co-optimicen la demanda flexible y se integren al CADE de Ecopetrol.

### Problema
Los parques solares del Grupo Ecopetrol generan excedentes de **3-8 MW** entre 12:00 y 14:00 que no pueden ser aprovechados por limitaciones de conducción de la red eléctrica, generando eventos de curtailment.

### Solución
- **BESS + SUNFLEX-EMS**: Hardware BESS de calidad + capa de inteligencia predictiva
- **UCF-MPC**: Optimización MILP con horizonte rodante 24h, paso 15 min
- **Demand Response**: Co-optimización de 22 MW de cargas flexibles
- **Pronóstico solar**: Ensemble ML (RMSE < 8% @ 4h)
- **Integración CADE**: IEC 61850 + MQTT + APIs REST

## 📊 Resultado clave

| Métrica | BESS Estándar | BESS + SUNFLEX-EMS |
|---------|--------------|---------------------|
| Excedente aprovechado | 1.09 MWh/día | 3.20 MWh/día |
| Reducción compras SIN | 4.7% | 8.2% |
| Reducción vertimiento | 4.9% | 14.4% |
| Ahorro | $0.85M COP/día | $1.84M COP/día (**2.2×**) |
| Descarga en hora pico | 55% | **100%** |

## 🚀 Ejecutar localmente

```bash
pip install -r requirements.txt
streamlit run app.py
```

## 📁 Estructura

```
SUNFLEX_EMS/
├── app.py                  # App Streamlit principal (21 tabs)
├── data_reto1.py           # Datos verificados de parques solares
├── algorithms_reto1.py     # Motor UCF-MPC + simuladores
├── requirements.txt        # Dependencias Python
├── .streamlit/
│   └── config.toml         # Configuración tema claro
└── README.md
```

## 🧰 Stack Open-Source

40+ herramientas: pvlib, Prophet, Darts, Pyomo, HiGHS, OpenEMS, Grafana, InfluxDB, pandapower, Mosquitto, pymodbus, libiec61850.

## 📋 Datos verificados

Fuentes públicas: Ecopetrol, UPME, CREG, BNEF (dic-2025), XM, IDEAM, PV Magazine.

## 🏢 UPSSISTEMAS

Soluciones Inteligentes en Energía — BESS + Inteligencia Integrada.

---
*SUNFLEX-EMS v1.1 · 100% open-source · Datos públicos y auditables*
