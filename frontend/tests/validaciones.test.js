// Reglas de validación del frontend (src/utils/validaciones.js). Se corre con: npm test
// Usa los mismos casos que el backend (tests/casos_validacion.json): las dos copias deben coincidir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  damDelCda, validarCda, validarClave, validarComprobante, validarCorreo, validarDocumentoGasto, validarMonto,
  validarNumeroDam, validarRuc, validarUsuario,
} from '../src/utils/validaciones.js';
import { CATEGORIA_PROVEEDOR, CLASE_ADUANERA } from '../src/constants/index.js';

const CASOS = JSON.parse(readFileSync(new URL('../../tests/casos_validacion.json', import.meta.url), 'utf-8'));
const REGLAS = {
  ruc: validarRuc, numero_dam: validarNumeroDam, comprobante: validarComprobante,
  usuario: validarUsuario, correo: validarCorreo, clave: validarClave, cda: validarCda,
};

for (const [regla, validar] of Object.entries(REGLAS)) {
  test(`${regla}: casos válidos compartidos con el backend`, () => {
    for (const [entrada, salida] of CASOS[regla].validos) {
      assert.deepEqual(validar(entrada), { valor: salida, error: null }, `entrada: ${JSON.stringify(entrada)}`);
    }
  });
  test(`${regla}: casos inválidos compartidos con el backend`, () => {
    for (const entrada of CASOS[regla].invalidos) {
      const { valor, error } = validar(entrada);
      assert.equal(valor, null, `entrada: ${JSON.stringify(entrada)}`);
      assert.ok(error, `debería explicar el error de ${JSON.stringify(entrada)}`);
    }
  });
}

test('ruc opcional: vacío es válido', () => {
  assert.deepEqual(validarRuc('  ', { opcional: true }), { valor: null, error: null });
  assert.ok(validarRuc('123', { opcional: true }).error);
});

test('montos', () => {
  for (const ok of ['1', '10.5', '10.50', '0.01', '1234567890123.99']) assert.equal(validarMonto(ok).error, null, ok);
  for (const malo of ['', '0', '0.00', '-5', '1,50', '10.123', 'abc', '1e5', '$10', '12345678901234']) {
    assert.ok(validarMonto(malo).error, malo);
  }
  assert.equal(validarMonto('0', { permitirCero: true }).error, null);
  assert.equal(validarMonto('', { opcional: true }).valor, null);
  assert.match(validarMonto('10.123', { etiqueta: 'El FOB' }).error, /^El FOB admite como máximo 2 decimales/);
});

test('dam del C.D.A.', () => {
  for (const [cda, dam] of CASOS._dam_del_cda) assert.equal(damDelCda(cda), dam);
});

test('documento del gasto: C.D.A. si el concepto es del Estado; si no, según el proveedor', () => {
  const { NACIONAL, INTERNACIONAL, ESTADO_O_TRIBUTO } = CATEGORIA_PROVEEDOR;
  const doc = (categoria, texto, claseAduanera = CLASE_ADUANERA.NINGUNA) => validarDocumentoGasto({ categoria, claseAduanera }, texto);
  assert.deepEqual(doc(NACIONAL, 'f001-5'), { valor: 'F001-00000005', error: null });
  assert.ok(doc(NACIONAL, 'INV 55').error);
  assert.deepEqual(doc(INTERNACIONAL, ' INV-2026/55 '), { valor: 'INV-2026/55', error: null });
  assert.deepEqual(doc(ESTADO_O_TRIBUTO, 'L/C 118-2026-382310'), { valor: 'L/C 118-2026-382310', error: null });
  assert.deepEqual(doc(ESTADO_O_TRIBUTO, '118-2026-10-535304-25-4-01', CLASE_ADUANERA.PERCEPCION),
    { valor: '118-26-10-535304-25-4-01', error: null });
  assert.ok(doc(ESTADO_O_TRIBUTO, 'F001-5', CLASE_ADUANERA.TRIBUTO).error);   // un tributo exige C.D.A.
  assert.equal(doc(undefined, 'F001-1').valor, 'F001-00000001');   // sin categoría: nacional
});
