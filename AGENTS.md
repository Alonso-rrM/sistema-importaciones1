# Contexto para asistentes de IA (y para cualquier persona que retome el proyecto)

> Lee este archivo completo antes de analizar o modificar el código.
> Se actualiza al cerrar cada fase del plan de mejora. Si algo aquí contradice al código, manda el código
> y hay que corregir este archivo.

## 1. Qué es el sistema

Sistema interno de importaciones. Registra los **gastos de cada contenedor** y controla **si se pagaron**.
No se conecta con SUNAT: solo registra lo que la usuaria ve en el portal.

Estructura del negocio: `Contenedor (maestro) -> DAM -> Gasto -> Pagos`. Los pagos salen de vouchers bancarios.
Un gasto puede estar en dólares y pagarse en soles (o al revés) con tipo de cambio.

## 2. Tecnologías y estructura

| Capa | Tecnología | Dónde |
|---|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Pydantic 2 | `main.py`, `routers/`, `services/`, `domain/` |
| Base de datos | PostgreSQL, migraciones con Alembic | `models.py`, `alembic/versions/` |
| Frontend | React 19, Vite, Tailwind, Axios | `frontend/src/` |
| Pruebas | pytest + batería de seguridad contra PostgreSQL | `tests/` |

Archivos clave:

- `constantes.py` y `frontend/src/constants/index.js`: valores fijos (roles, estados, monedas...). Son espejo uno del otro.
- `services/state_machine.py`: máquina de estados. `decidir_estado_dam` es la regla pura de las transiciones
  automáticas de la DAM (con su tabla documentada); `evaluar_gatillos_gastos_dam` solo la aplica.
- `services/pagos.py`: registrar y anular pagos, partidos en pasos. Las rutas de `routers/finanzas.py` solo delegan.
- `domain/`: reglas puras, sin base de datos: amortización de pagos (`finanzas.py`), sugerencia de clase
  aduanera (`conceptos.py`), abreviación de razón social (`razon_social.py`).
- `routers/catalogo_generico.py`: las seis rutas estándar de un catálogo. Bancos, agentes, proveedores,
  almacenes, importadores y conceptos se DECLARAN en `routers/catalogos.py`.
- `services/carga_masiva.py`: constructoras por catálogo para la carga desde Excel (patrón Factory).
- `services/audit_trail.py` REGISTRA los cambios; `services/bitacora_legible.py` los TRADUCE a lenguaje de negocio.
- `services/sunat.py`: cliente de la consulta de RUC (ApiPeru). `routers/integraciones.py` solo lo expone.
- `routers/operaciones.py`: contenedores y DAMs. `routers/finanzas.py`: gastos, vouchers, pagos y tipo de cambio.
- `main.py`: solo arma la aplicación (configuración, middleware y routers).
- `scripts/verificar_valores.py`: diagnóstico de SOLO LECTURA de valores fuera de catálogo en la base.

## 3. Rama de trabajo (importante)

- El trabajo de mejora vive en la rama **`claude/exciting-einstein-sntfhn`**, no en `main`.
- `main` sigue en el commit `51aa1eb` (anterior al plan). Si analizas `main`, verás que "faltan" archivos
  como `constantes.py`, `AGENTS.md`, `pyproject.toml`, `tests/test_*.py` o `scripts/verificar_valores.py`:
  **no faltan, están en la rama.**
- Antes de trabajar: `git fetch origin` y `git checkout claude/exciting-einstein-sntfhn` (o `git pull` si ya estás en ella).
- **No vuelvas a crear** nada de lo listado en la sección 5 sobre `main`: duplicaría el trabajo y causaría conflictos.

## 4. Reglas obligatorias al modificar código

1. **Nunca escribas a mano un valor fijo.** Usa `constantes.py` (`EstadoPago.PAGADO`, `Rol.SUPERADMIN`,
   `Moneda.USD`...) y en el frontend `src/constants` (`ESTADO_PAGO.PAGADO`, `ROL.SUPERADMIN`...).
   Hay pruebas y una regla de ESLint que rechazan los textos y números de rol escritos a mano.
2. **Si agregas o cambias un valor fijo, hazlo en los DOS archivos** de constantes y en
   `tests/test_constantes.py`. Una prueba verifica que coincidan.
3. **Todo cambio de esquema va con migración de Alembic** (`alembic/versions/`). `alembic check` debe quedar limpio.
4. **El dinero siempre con `Decimal`**, nunca `float`, y redondeo `ROUND_HALF_UP` (`domain/finanzas.py`).
5. **Antes de dar algo por terminado, corre las verificaciones** (sección 6). Deben pasar todas.
6. No actives restricciones `CHECK` ni validación estricta sobre campos existentes sin antes correr
   `scripts/verificar_valores.py` contra la base real (puede haber registros antiguos con otros valores).
7. La clase de un concepto (tributo, percepción, OMC) se lee del campo `clase_aduanera`.
   **No clasifiques conceptos buscando palabras en su nombre.**
8. Mensajes de commit en español, claros, uno por cambio lógico.
9. **Lo pagado de un gasto se calcula SOLO con `domain/finanzas.py`** (`amortizacion_de_pago`, `total_amortizado`):
   cada pago se convierte y redondea por separado. No escribas otra fórmula de conversión de pagos.
10. Los servicios informan reglas incumplidas con `ErrorDeNegocio` (`services/errores.py`), no con
    `HTTPException`. `main.py` la convierte en la respuesta HTTP.
11. Un catálogo nuevo con las rutas estándar se agrega declarando un `DefinicionCatalogo`; no copies rutas.

## 5. Estado del plan de mejora

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Red de seguridad: pytest, ruff, ESLint, verificación automática en GitHub Actions | Hecha |
| 1 | Valores fijos en un solo lugar (`constantes.py` y `src/constants`) | Hecha |
| 2 | Clase aduanera del concepto en un campo (`clase_aduanera`), ya no por nombre | Hecha |
| 3 | Ordenar el backend: servicio de pagos, catálogos genéricos, `main.py` más delgado, bitácora y máquina de estados | Hecha |
| 4 | Ordenar el frontend: componentes y hooks comunes, diálogos propios | Pendiente |
| 5 | Validación de lo que digita la usuaria (RUC, DAM, comprobantes, montos) | Pendiente |
| 6 | Limpieza: README, `.env.example`, archivos sobrantes | Pendiente |
| — | Registro del C.D.A. de SUNAT (ver sección 8) | En análisis |

Deuda conocida y aceptada por ahora:

- 76 advertencias de ESLint (reglas del compilador de React en pantallas grandes). Tienen tope:
  `npm run lint:ci` falla si aumentan. Se resuelven en la fase 4.
- Restricciones `CHECK` en la base y validación estricta de `tipo_valor`, `canal_control`, `categoria`
  y `status_llegada`: pendientes hasta revisar la base real con `scripts/verificar_valores.py`.
- La categoría de proveedor `ESTADO_O_TRIBUTO` existe en el backend pero **no se puede elegir en pantalla**
  (Proveedores y el modal de creación rápida solo ofrecen Nacional e Internacional).
- Los roles iniciales tienen nombres distintos según se creen por `/setup` o por `scripts/seed_inicial.py`
  (los números de rol coinciden; solo cambia el texto).
- Funciones de consulta y reportes todavía largas (120-180 líneas): `listar_gastos` (finanzas),
  `obtener_datos_liquidacion_contenedor` y `kpi_gastos_maestro` (operaciones), `obtener_analytics_cockpit` y
  `exportar_sabana_liquidaciones` (reportes). Tienen poca cobertura de pruebas: antes de partirlas, agregar
  verificaciones de su salida.

## 6. Cómo verificar

Backend (desde la raíz):

```bash
pip install -r requirements-dev.txt
ruff check .
pytest
```

Sin la variable `TEST_DATABASE_URL`, `pytest` corre las pruebas unitarias y omite las de PostgreSQL.
Con ella corre también la batería de seguridad. **Esa base debe ser desechable y su nombre debe contener
"test": la batería borra todo su contenido.** Para depurar, `CONSERVAR_BASE_PRUEBAS=1` deja los datos que generó.

Frontend (desde `frontend/`):

```bash
npm ci
npm run lint:ci
npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) corre todo lo anterior en cada subida.

## 7. Decisiones de negocio vigentes

- El tipo de valor de un contenedor es solo **DEFINITIVO** o **GARANTIZADO**. "PROVISIONAL" ya no existe:
  la migración `d5a92e7c1b38` convierte los registros antiguos a GARANTIZADO.
- Ajuste de céntimos ("ZD"): si tras un pago quedan USD/S/ 0.05 o menos por diferencias de cambio, el sistema
  crea un pago de ajuste y cierra el gasto. Si se anula el pago que lo originó, el ajuste también se anula.

## 8. Contexto del C.D.A. (trabajo siguiente)

- C.D.A. = Código de Documento Aduanero: número con el que SUNAT identifica cada documento con deuda.
- Cada concepto de gasto del Estado (tributos, percepción, OMC...) tiene **su propio C.D.A.** con su monto.
  Una DAM tiene varios C.D.A.; un contenedor puede tener varias DAMs. Las facturas de proveedores no tienen C.D.A.
- Ejemplo real: DAM `118-26-10-535304`; liquidación de cobranza `118-2026-382310` (percepción IGV, S/ 5,305.00)
  con C.D.A. `118-26-10-535304-25-4-01`. El C.D.A. parece ser el número de la DAM más un sufijo.
- Encaje previsto: proveedor SUNAT con categoría `ESTADO_O_TRIBUTO`, tipo de documento "C.D.A." en el catálogo
  de comprobantes y el C.D.A. en `numero_documento` del gasto.
- Por confirmar con la usuaria: si los tributos propios de la DAM comparten un solo C.D.A. (afectaría el
  candado anti-duplicados de `routers/finanzas.py`) y qué número usa Tesorería para pagar (C.D.A. o número de L/C).
- Por decidir: el concepto "PERCEPCION OMC" hoy está clasificado como PERCEPCION (cuenta para la proforma),
  igual que antes de la fase 2. Si en realidad pertenece a la OMC, se cambia desde la pantalla de Conceptos.
