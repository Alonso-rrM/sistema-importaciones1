/**
 * Lógica de una pantalla de catálogo (bancos, almacenes, agentes, importadores, proveedores):
 * carga, filtros, selección, alta, modificación, baja lógica, restauración y borrado definitivo.
 * La presentación vive en PantallaCatalogo.jsx; lo que cambia entre catálogos, en su `definicion`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import useDebounce from '../../hooks/useDebounce';
import { ESTADO_REGISTRO } from '../../constants';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

export const MODO = Object.freeze({ DETALLE: 'DETALLE', NUEVO: 'NUEVO', MODIFICAR: 'MODIFICAR' });
export const FILTRO_TODOS = 'TODOS';

function formularioVacio(definicion) {
  return Object.fromEntries(definicion.campos.map((c) => [c.nombre, c.valorInicial ?? '']));
}

function formularioDesde(definicion, registro) {
  return Object.fromEntries(definicion.campos.map((c) => [c.nombre, registro?.[c.nombre] ?? c.valorInicial ?? '']));
}

/** Nombre visible de un registro (la mayoría de catálogos lo guarda en `nombre`). */
export const nombreDe = (definicion, registro) => registro?.[definicion.campoNombre || 'nombre'];

export default function useCatalogo(definicion) {
  const { avisar, confirmar } = useInteraccion();
  const { ruta, campoId, textos } = definicion;

  const [registros, setRegistros] = useState([]);
  const [seleccionId, setSeleccionId] = useState(null);
  const [modo, setModo] = useState(MODO.DETALLE);
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState(ESTADO_REGISTRO.ACTIVO);
  const [filtroExtra, setFiltroExtra] = useState('');
  const [formulario, setFormulario] = useState(() => formularioVacio(definicion));
  const [guardando, setGuardando] = useState(false);

  const obtener = useCallback(async () => {
    const mostrarInactivos = filtroEstado !== ESTADO_REGISTRO.ACTIVO;
    const { data } = await api.get(`/${ruta}/?mostrar_inactivos=${mostrarInactivos}`);
    return data || [];
  }, [ruta, filtroEstado]);

  /** Vuelve a leer el catálogo (después de guardar, dar de baja, etc.). */
  const cargar = useCallback(async () => {
    try {
      const data = await obtener();
      setRegistros(data);
    } catch {
      avisar('No se pudo conectar con la base de datos.', 'error');
    }
  }, [obtener, avisar]);

  useEffect(() => {
    let vigente = true;
    obtener()
      .then((data) => {
        if (!vigente) return;
        setRegistros(data);
        // Al abrir la pantalla se muestra el primer registro
        if (data.length > 0) setSeleccionId((actual) => actual ?? data[0][campoId]);
      })
      .catch(() => vigente && avisar('No se pudo conectar con la base de datos.', 'error'));
    return () => { vigente = false; };
  }, [obtener, campoId, avisar]);

  const filtrados = useMemo(() => {
    const termino = busquedaDiferida.toLowerCase();
    return registros.filter((r) => {
      const coincide = definicion.buscarEn.some((campo) => String(r[campo] ?? '').toLowerCase().includes(termino));
      const pasaExtra = !definicion.filtroExtra || !filtroExtra || r[definicion.filtroExtra.campo] === filtroExtra;
      if (filtroEstado === FILTRO_TODOS) return coincide && pasaExtra;
      return coincide && pasaExtra && r.estado_registro === filtroEstado;
    });
  }, [registros, busquedaDiferida, filtroEstado, filtroExtra, definicion]);

  const seleccionado = useMemo(
    () => registros.find((r) => r[campoId] === seleccionId) || null,
    [registros, seleccionId, campoId],
  );

  const conteo = useMemo(() => ({
    activos: registros.filter((r) => r.estado_registro === ESTADO_REGISTRO.ACTIVO).length,
    inactivos: registros.filter((r) => r.estado_registro === ESTADO_REGISTRO.INACTIVO).length,
    todos: registros.length,
  }), [registros]);

  const seleccionar = (registro) => {
    setSeleccionId(registro[campoId]);
    setModo(MODO.DETALLE);
  };

  const nuevo = () => {
    setSeleccionId(null);
    setFormulario(formularioVacio(definicion));
    setModo(MODO.NUEVO);
  };

  const modificar = () => {
    if (!seleccionado) return;
    setFormulario(formularioDesde(definicion, seleccionado));
    setModo(MODO.MODIFICAR);
  };

  const cancelar = () => {
    setModo(MODO.DETALLE);
    if (!seleccionado && filtrados.length > 0) setSeleccionId(filtrados[0][campoId]);
  };

  const cambiarCampo = (nombre, valor) => setFormulario((f) => ({ ...f, [nombre]: valor }));

  const guardar = async (evento) => {
    evento.preventDefault();
    for (const campo of definicion.campos) {
      if (campo.requerido && !String(formulario[campo.nombre] ?? '').trim()) {
        avisar(campo.mensajeRequerido || `El campo ${campo.etiqueta} es obligatorio.`, 'error');
        return;
      }
    }
    const datos = Object.fromEntries(definicion.campos.map((c) => {
      const valor = typeof formulario[c.nombre] === 'string' ? formulario[c.nombre].trim() : formulario[c.nombre];
      if (valor === '' && c.vacioComoNulo) return [c.nombre, null];
      return [c.nombre, c.convertir ? c.convertir(valor) : valor];
    }));

    setGuardando(true);
    try {
      if (modo === MODO.NUEVO) {
        const { data } = await api.post(`/${ruta}/`, datos);
        avisar(`✅ ${textos.singular} registrado exitosamente.`, 'exito');
        await cargar();
        setSeleccionId(data?.[campoId] ?? null);
      } else {
        await api.put(`/${ruta}/${seleccionId}`, datos);
        avisar(`✅ ${textos.singular} actualizado exitosamente.`, 'exito');
        await cargar();
      }
      setModo(MODO.DETALLE);
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'Error al guardar el registro.')}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const desactivar = async () => {
    if (!seleccionado) return;
    const ok = await confirmar({
      titulo: `Desactivar ${textos.singular.toLowerCase()}`,
      mensaje: `¿Estás seguro de desactivar ${textos.referencia(seleccionado)}?\nEsta acción lo marcará como INACTIVO.`,
      textoAceptar: 'Desactivar',
      peligro: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/${ruta}/${seleccionId}`);
      avisar(`✅ ${textos.singular} "${nombreDe(definicion, seleccionado)}" desactivado correctamente.`, 'exito');
      await cargar();
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'No se pudo desactivar.')}`, 'error');
    }
  };

  const restaurar = async () => {
    if (!seleccionado) return;
    try {
      await api.put(`/${ruta}/${seleccionId}/restaurar`);
      avisar(`✅ ${textos.singular} "${nombreDe(definicion, seleccionado)}" restaurado a ACTIVO.`, 'exito');
      await cargar();
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'No se pudo restaurar.')}`, 'error');
    }
  };

  const eliminarDefinitivo = async () => {
    if (!seleccionado) return;
    const ok = await confirmar({
      titulo: 'Eliminar definitivamente',
      mensaje: `⚠️ ¿Deseas eliminar DEFINITIVAMENTE ${textos.referencia(seleccionado)}?\n\n` +
        `Esta acción NO se puede deshacer y fallará si ${textos.advertenciaBorrado}.`,
      textoAceptar: 'Eliminar definitivamente',
      peligro: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/${ruta}/${seleccionId}/fisico`);
      avisar(`✅ ${textos.singular} "${nombreDe(definicion, seleccionado)}" eliminado definitivamente.`, 'exito');
      setSeleccionId(null);
      await cargar();
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'No se pudo eliminar definitivamente.')}`, 'error');
    }
  };

  return {
    registros, filtrados, seleccionado, conteo, modo, formulario, guardando,
    busqueda, setBusqueda, filtroEstado, setFiltroEstado, filtroExtra, setFiltroExtra,
    seleccionar, nuevo, modificar, cancelar, cambiarCampo, guardar, desactivar, restaurar, eliminarDefinitivo,
  };
}
