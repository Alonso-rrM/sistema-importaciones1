# Sistema de Importaciones

Sistema interno que registra los **gastos de cada contenedor importado** y controla **si se pagaron**.

- **Logística** registra el contenedor (expediente), sus DAMs y los gastos de cada DAM (fletes, almacenaje,
  tributos, percepción, etc.).
- **Tesorería** registra los vouchers bancarios y paga los gastos con ellos, en dólares o soles, con tipo de cambio.
- El sistema calcula saldos, estados de pago y el estado aduanero de cada DAM (proforma, levante, OMC),
  y guarda una bitácora de quién hizo cada cambio.

No se conecta con SUNAT para declarar ni pagar: solo registra lo que se ve en el portal. La única consulta
externa es la del RUC (opcional, mediante ApiPeru).

## Tecnologías

| Parte | Tecnología |
|---|---|
| Backend (API) | Python 3.11+, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Base de datos | PostgreSQL, migraciones con Alembic |
| Frontend | React 19, Vite, Tailwind |
| Pruebas | pytest, batería de seguridad contra PostgreSQL, Playwright (navegador) |

## Instalación

Requisitos: Python 3.11 o superior, Node.js 22 y PostgreSQL (la verificación automática usa Python 3.13 y PostgreSQL 16).

### 1. Backend

```bash
python -m venv .venv
source .venv/bin/activate          # en Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # y completar DATABASE_URL y SECRET_KEY
```

Cree en PostgreSQL una base vacía (por ejemplo `importaciones`) y prepare su estructura:

```bash
python scripts/init_db.py          # SOLO para una base nueva y vacía
```

Para **actualizar** una base que ya está en uso (después de bajar cambios del repositorio):

```bash
alembic upgrade head
```

Inicie la API (queda en http://localhost:8000):

```bash
uvicorn main:app --reload
```

### 2. Frontend

```bash
cd frontend
npm ci
npm run dev                        # http://localhost:5173 (también desde otras PCs de la red)
```

El frontend llama a la API por `/api`, que Vite reenvía al puerto 8000 (`frontend/vite.config.js`).

### 3. Primer uso

1. Abra http://localhost:5173/setup y cree el usuario administrador (solo funciona mientras no exista ningún
   usuario). Alternativa por consola: `python scripts/seed_inicial.py` con `ADMIN_PASSWORD` en el `.env`.
2. Opcional: cargue los catálogos de ejemplo (bancos, conceptos, agentes, importadores) desde `plantillas/`,
   desde el Panel de Administración o con `python scripts/cargar_plantillas.py`.
3. Cree los usuarios de Logística, Tesorería y Auditoría en la pantalla **Usuarios** (ícono de persona con
   engranaje, solo para el Administrador). Ahí también se cambia el rol o el correo, se desactiva una cuenta y se
   restablece una contraseña. Cada usuario cambia la suya con el botón de la llave (abajo a la izquierda).
   Alternativa por consola: `python scripts/crear_usuario.py --usuario mperez --correo mperez@empresa.com --rol logistica`.

   Desactivar una cuenta o cambiar su contraseña cierra sus sesiones abiertas en su siguiente acción;
   un cambio de rol también rige desde su siguiente acción. El sistema no permite que el Administrador se quite
   el acceso a sí mismo ni que quede sin ningún Administrador activo.

## Roles

| Rol | Puede |
|---|---|
| Administrador | Todo, incluida la gestión de usuarios y el desbloqueo de expedientes cerrados |
| Logística | Expedientes, DAMs, gastos y catálogos operativos |
| Tesorería | Vouchers, pagos, tipo de cambio y observaciones de los gastos |
| Auditoría | Solo lectura: reportes, bitácora y papelera |

## Scripts útiles (`scripts/`)

| Script | Para qué |
|---|---|
| `init_db.py` | Crea la estructura en una base **vacía** y la marca en la última migración |
| `seed_inicial.py` | Crea los roles y el administrador sin pasar por `/setup` |
| `crear_usuario.py` | Crea un usuario (Logística, Tesorería, Auditoría u otro Administrador) |
| `cargar_plantillas.py` | Carga los catálogos de `plantillas/*.xlsx` mediante la API (con sus validaciones) |
| `verificar_valores.py` | Diagnóstico de **solo lectura**: valores fuera de catálogo y RUC, DAM o comprobantes con formato antiguo |
| `reset_database.sql` | Borra **todos** los datos (deja la estructura). Úselo con mucho cuidado |
| `preparar_base_e2e.py` | Prepara la base de las pruebas en navegador (la usan las pruebas, no es para uso diario) |

## Verificación (antes de subir cambios)

Backend, desde la raíz:

```bash
pip install -r requirements-dev.txt
ruff check .
pytest
```

Frontend, desde `frontend/`:

```bash
npm run lint:ci
npm test
npm run build
```

Con `TEST_DATABASE_URL` (y `E2E_DATABASE_URL` para `npm run e2e`) se corren también las pruebas contra
PostgreSQL y en navegador. **Esas bases deben ser desechables y su nombre debe contener "test":
las pruebas borran todo su contenido.** GitHub Actions corre todo en cada subida.

## Para quien continúe el desarrollo

Lea primero [`AGENTS.md`](AGENTS.md): explica la estructura del código, las reglas obligatorias (valores fijos,
dinero con `Decimal`, migraciones, validaciones), el estado del plan de mejora y las decisiones de negocio vigentes.
