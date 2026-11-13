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
- `services/state_machine.py`: máquina de estados de la DAM y del contenedor (levantes y reversiones).
- `domain/`: reglas puras, sin base de datos (conversión de pagos, sugerencia de clase aduanera).
- `routers/finanzas.py`: gastos, pagos y vouchers. `routers/operaciones.py`: contenedores y DAMs.
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

## 5. Estado del plan de mejora

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Red de seguridad: pytest, ruff, ESLint, verificación automática en GitHub Actions | Hecha |
| 1 | Valores fijos en un solo lugar (`constantes.py` y `src/constants`) | Hecha |
| 2 | Clase aduanera del concepto en un campo (`clase_aduanera`), ya no por nombre | Hecha |
| 3 | Ordenar el backend: servicio de pagos, catálogos genéricos, `main.py` más delgado | Pendiente |
| 4 | Ordenar el frontend: componentes y hooks comunes, diálogos propios | Pendiente |
| 5 | Validación de lo que digita la usuaria (RUC, DAM, comprobantes, montos) | Pendiente |
| 6 | Limpieza: README, `.env.example`, archivos sobrantes | Pendiente |
| — | Registro del C.D.A. de SUNAT (ver sección 7) | En análisis |

Deuda conocida y aceptada por ahora:

- 76 advertencias de ESLint (reglas del compilador de React en pantallas grandes). Tienen tope:
  `npm run lint:ci` falla si aumentan. Se resuelven en la fase 4.
- Restricciones `CHECK` en la base y validación estricta de `tipo_valor`, `canal_control`, `categoria`
  y `status_llegada`: pendientes hasta revisar la base real con `scripts/verificar_valores.py`.
- La categoría de proveedor `ESTADO_O_TRIBUTO` existe en el backend pero **no se puede elegir en pantalla**
  (Proveedores y el modal de creación rápida solo ofrecen Nacional e Internacional).
- Los roles iniciales tienen nombres distintos según se creen por `/setup` o por `scripts/seed_inicial.py`
  (los números de rol coinciden; solo cambia el texto).

## 6. Cómo verificar

Backend (desde la raíz):

```bash
pip install -r requirements-dev.txt
ruff check .
pytest
```

Sin la variable `TEST_DATABASE_URL`, `pytest` corre las pruebas unitarias y omite las de PostgreSQL.
Con ella corre también la batería de seguridad. **Esa base debe ser desechable y su nombre debe contener
"test": la batería borra todo su contenido.**

Frontend (desde `frontend/`):

```bash
npm ci
npm run lint:ci
npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) corre todo lo anterior en cada subida.

## 7. Contexto del C.D.A. (trabajo siguiente)

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
