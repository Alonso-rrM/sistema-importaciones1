/**
 * Al registrar un gasto, los RUC de la agencia de aduanas del expediente se muestran primero
 * (la agencia es un grupo de proveedores: ver pages/agentes/RucsDeLaAgencia.jsx).
 */

/** Separa una lista en los de la agencia y el resto. `idAgenteDe(p)` lee la agencia de cada elemento. */
export function separarPorAgencia(lista, idAgente, idAgenteDe) {
  if (!idAgente) return { deLaAgencia: [], resto: lista };
  const deLaAgencia = lista.filter((p) => idAgenteDe(p) === idAgente);
  return { deLaAgencia, resto: lista.filter((p) => idAgenteDe(p) !== idAgente) };
}

/** Opciones agrupadas para react-select: primero los RUC de la agencia, luego todos los demás. */
export function opcionesConAgenciaPrimero(opciones, idAgente) {
  const { deLaAgencia, resto } = separarPorAgencia(opciones, idAgente, (o) => o.idAgente);
  if (deLaAgencia.length === 0) return opciones;
  return [
    { label: 'RUC de la agencia de aduanas del expediente', options: deLaAgencia },
    { label: 'Todos los proveedores', options: resto },
  ];
}
