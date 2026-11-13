/**
 * Si al anular un pago el backend revirtió el estado de una DAM (porque el levante/cierre lo había
 * concedido el sistema por ese pago), se avisa con un diálogo que la usuaria debe reconocer:
 * el contenedor dejó de tener levante.
 *
 * `confirmar` es el de useInteraccion() de la pantalla que llama.
 */
export function avisarReversionDam(respuesta, confirmar) {
  const r = respuesta?.data?.reversion_dam;
  if (!r) return Promise.resolve();
  return confirmar({
    titulo: 'Atención: cambió el estado aduanero',
    mensaje:
      `Contenedor: ${r.contenedor || '-'}\n` +
      `DAM: ${r.numero_de_dam || '-'}\n\n` +
      `Antes:  ${r.estado_anterior}\n` +
      `Ahora:  ${r.estado_nuevo}\n\n` +
      'El estado lo había otorgado el sistema por el pago que acabas de anular. ' +
      'Si el pago correspondía a otro contenedor, regístralo ahora en el contenedor correcto.',
    textoAceptar: 'Entendido',
    soloAceptar: true,
    peligro: true,
  });
}
