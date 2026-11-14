/**
 * Aviso antes de guardar un gasto del Estado cuyo C.D.A. no empieza con el N° de la DAM del gasto.
 * Es una advertencia (no un bloqueo): la relación C.D.A. = DAM + sufijo se dedujo de los ejemplos vistos.
 */
import { damDelCda, validarNumeroDam } from './validaciones';

/** Devuelve true si se puede guardar (coincide, o la usuaria confirma que es correcto). */
export async function confirmarCdaDeLaDam(confirmar, cda, numeroDam) {
  if (!cda || !numeroDam) return true;
  const damDelDocumento = damDelCda(cda);
  const damDelGasto = validarNumeroDam(numeroDam).valor ?? numeroDam;   // DAM antigua con otro formato
  if (damDelDocumento === damDelGasto) return true;
  return confirmar({
    titulo: 'El C.D.A. no corresponde a la DAM',
    mensaje: `El C.D.A. ${cda} pertenece a la DAM ${damDelDocumento}, pero este gasto es de la DAM ${numeroDam}.\n\n`
      + 'Revise el número. ¿Registrarlo de todas formas?',
    textoAceptar: 'Registrar igual',
    peligro: true,
  });
}
