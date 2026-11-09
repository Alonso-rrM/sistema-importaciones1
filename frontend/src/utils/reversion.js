/**
 * Si al anular un pago el backend revirtió el estado de una DAM (porque el levante/cierre lo había
 * concedido el sistema por ese pago), se avisa de forma visible: el contenedor dejó de tener levante.
 */
export function avisarReversionDam(respuesta) {
  const r = respuesta?.data?.reversion_dam;
  if (!r) return;
  window.alert(
    `⚠ ATENCIÓN: cambió el estado aduanero\n\n` +
    `Contenedor: ${r.contenedor || '-'}\n` +
    `DAM: ${r.numero_de_dam || '-'}\n\n` +
    `Antes:  ${r.estado_anterior}\n` +
    `Ahora:  ${r.estado_nuevo}\n\n` +
    `El estado lo había otorgado el sistema por el pago que acabas de anular. ` +
    `Si el pago correspondía a otro contenedor, regístralo ahora en el contenedor correcto.`
  );
}
