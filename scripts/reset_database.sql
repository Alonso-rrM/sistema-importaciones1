-- ============================================================
-- SCRIPT DE LIMPIEZA TOTAL DE DATOS (RESET COMPLETO)
-- Sistema de Importaciones - v1.0
--
-- INSTRUCCIONES:
--   1. Abre DBeaver y conéctate a tu base de datos.
--   2. Abre este archivo como un nuevo script SQL.
--   3. Lee cuidadosamente las advertencias.
--   4. Ejecuta TODO el script de una sola vez (Ctrl+Shift+Enter).
--
-- SEGURIDAD: Este script NO elimina tablas ni columnas.
--   Solo borra filas (TRUNCATE) y reinicia contadores (ID).
--   La estructura queda intacta. No rompe migraciones de Alembic.
-- ============================================================

-- ==========================
-- ⚠️  ADVERTENCIA CRÍTICA ⚠️
-- ==========================
-- Esto borrará TODOS los datos: registros operativos, catálogos,
-- usuarios, vouchers, auditorías, papelera de reciclaje... TODO.
-- Esta acción NO se puede deshacer.
-- ==========================

BEGIN;

-- -----------------------------------------------------------
-- PASO 1: Tablas de auditoría e idempotencia (sin FK hijos)
-- -----------------------------------------------------------
TRUNCATE TABLE public.audit_logs                RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.registro_idempotencia     RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------
-- PASO 2: Papelera de reciclaje (tablas *_eliminados)
-- -----------------------------------------------------------
TRUNCATE TABLE public.pagos_eliminados          RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.gastos_eliminados         RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.dams_eliminadas           RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.maestros_eliminados       RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.vouchers_eliminados       RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------
-- PASO 3: Tablas operativas (hijos antes que padres)
-- -----------------------------------------------------------
TRUNCATE TABLE public.registro_pagos            RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.registro_gastos           RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.detalle_dams              RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.maestro_importaciones     RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.vouchers_bancarios        RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------
-- PASO 4: Catálogos (últimos porque son referenciados)
-- -----------------------------------------------------------
TRUNCATE TABLE public.cat_conceptos_pagos       RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.cat_almacenes             RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.cat_agentes               RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.cat_importadores          RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.cat_proveedores           RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.cat_bancos                RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.catalogo_documentos_pago  RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.historial_tipo_cambio     RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------
-- PASO 5: Usuarios y roles
-- ⚠️  Esto borra TODOS los usuarios incluido el administrador.
-- Deberás crear un nuevo usuario admin desde el endpoint
-- /usuarios/crear-inicial o con el script de seed.
-- -----------------------------------------------------------
TRUNCATE TABLE public.usuarios                  RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.cat_roles                 RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------
-- VERIFICACIÓN FINAL: Confirma que todo quedó vacío
-- -----------------------------------------------------------
SELECT
    'audit_logs'               AS tabla, COUNT(*) AS filas FROM public.audit_logs
UNION ALL SELECT 'registro_idempotencia',  COUNT(*) FROM public.registro_idempotencia
UNION ALL SELECT 'registro_pagos',         COUNT(*) FROM public.registro_pagos
UNION ALL SELECT 'registro_gastos',        COUNT(*) FROM public.registro_gastos
UNION ALL SELECT 'detalle_dams',           COUNT(*) FROM public.detalle_dams
UNION ALL SELECT 'maestro_importaciones',  COUNT(*) FROM public.maestro_importaciones
UNION ALL SELECT 'vouchers_bancarios',     COUNT(*) FROM public.vouchers_bancarios
UNION ALL SELECT 'cat_conceptos_pagos',    COUNT(*) FROM public.cat_conceptos_pagos
UNION ALL SELECT 'cat_almacenes',          COUNT(*) FROM public.cat_almacenes
UNION ALL SELECT 'cat_agentes',            COUNT(*) FROM public.cat_agentes
UNION ALL SELECT 'cat_importadores',       COUNT(*) FROM public.cat_importadores
UNION ALL SELECT 'cat_proveedores',        COUNT(*) FROM public.cat_proveedores
UNION ALL SELECT 'cat_bancos',             COUNT(*) FROM public.cat_bancos
UNION ALL SELECT 'usuarios',               COUNT(*) FROM public.usuarios
UNION ALL SELECT 'cat_roles',              COUNT(*) FROM public.cat_roles
ORDER BY tabla;

COMMIT;

