// Reglas de validación del frontend (src/utils/validaciones.js). Se corre con: npm test
// Usa los mismos casos que el backend (tests/casos_validacion.json): las dos copias deben coincidir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validarComprobante, validarDocumentoSegunProveedor, validarMonto, validarNumeroDam, validarRuc,
} from '../src/utils/validaciones.js';
import { CATEGORIA_PROVEEDOR } from '../src/constants/index.js';

const CASOS = JSON.parse(readFileSync(new URL('../../tests/casos_validacion.json', import.meta.url), 'utf-8'));
const REGLAS = { ruc: validarRuc, numero_dam: validarNumeroDam, comprobante: validarComprobante };

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

test('documento según proveedor: nacional exige comprobante; exterior y Estado, texto libre', () => {
  const { NACIONAL, INTERNACIONAL, ESTADO_O_TRIBUTO } = CATEGORIA_PROVEEDOR;
  assert.deepEqual(validarDocumentoSegunProveedor(NACIONAL, 'f001-5'), { valor: 'F001-00000005', error: null });
  assert.ok(validarDocumentoSegunProveedor(NACIONAL, 'INV 55').error);
  assert.deepEqual(validarDocumentoSegunProveedor(INTERNACIONAL, ' INV-2026/55 '), { valor: 'INV-2026/55', error: null });
  assert.deepEqual(validarDocumentoSegunProveedor(ESTADO_O_TRIBUTO, '118-26-10-535304-25-4-01'),
    { valor: '118-26-10-535304-25-4-01', error: null });
  assert.equal(validarDocumentoSegunProveedor(undefined, 'F001-1').valor, 'F001-00000001');   // sin categoría: nacional
});
