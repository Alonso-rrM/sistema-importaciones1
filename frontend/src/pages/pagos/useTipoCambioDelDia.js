/** Tipo de cambio oficial SUNAT del día: lectura y registro/corrección (lo usa el servidor para validar pagos). */
import { useCallback } from 'react';
import api from '../../services/api';
import useConsulta from '../../hooks/useConsulta';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

export function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Número positivo con hasta 4 decimales (ej. 3.7520)
const validarTc = (valor) => (/^\d{1,2}(\.\d{1,4})?$/.test(valor) && parseFloat(valor) > 0
  ? null : 'Ingrese un número positivo con hasta 4 decimales (ej. 3.7520).');

export default function useTipoCambioDelDia() {
  const { avisar, pedirDatos } = useInteraccion();
  // Si no hay TC registrado para hoy el servidor responde 404: se muestra como "no registrado"
  const consultar = useCallback(() => api.get(`/tipo-cambio/${hoyISO()}`).then((r) => r.data).catch(() => null), []);
  const { datos: tcOficial, setDatos } = useConsulta(consultar);

  const registrar = async () => {
    const datos = await pedirDatos({
      titulo: tcOficial ? 'Corregir TC oficial SUNAT de hoy' : 'Registrar TC oficial SUNAT de hoy',
      mensaje: 'Copie los valores publicados por SUNAT para la fecha de hoy.',
      textoAceptar: 'Guardar tipo de cambio',
      campos: [
        { nombre: 'venta', etiqueta: 'Precio de VENTA', placeholder: 'ej. 3.7520', modoEntrada: 'decimal',
          valorInicial: tcOficial?.precio_venta ?? '', validar: validarTc },
        { nombre: 'compra', etiqueta: 'Precio de COMPRA', placeholder: 'ej. 3.7450', modoEntrada: 'decimal',
          valorInicial: tcOficial?.precio_compra ?? '', validar: validarTc },
      ],
    });
    if (!datos) return;
    try {
      // Se envían como texto: el servidor los guarda como decimales exactos (sin errores de coma flotante)
      const res = await api.put('/tipo-cambio/', { fecha: hoyISO(), precio_compra: datos.compra, precio_venta: datos.venta });
      setDatos(res.data);
      avisar('✅ Tipo de cambio del día guardado.', 'exito');
    } catch (err) {
      avisar(`No se pudo registrar el TC: ${mensajeDeError(err)}`, 'error');
    }
  };

  const tcSugerido = tcOficial?.precio_venta ? String(parseFloat(tcOficial.precio_venta)) : '3.75';
  return { tcOficial, tcSugerido, registrar };
}
