/** Eliminación de un expediente con motivo de auditoría obligatorio. Escape cierra el modal. */
import { useEffect, useEffectEvent, useState } from 'react';
import api from '../../services/api';
import { LARGO_MINIMO_MOTIVO } from '../../components/ModalAnularPago';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

export default function ModalEliminarExpediente({ idMaestro, onCerrar, onEliminado }) {
  const { avisar } = useInteraccion();
  const [motivo, setMotivo] = useState('');

  const cerrarConEscape = useEffectEvent((e) => { if (e.key === 'Escape') onCerrar(); });
  useEffect(() => {
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, []);

  const eliminar = async () => {
    if (motivo.trim().length < LARGO_MINIMO_MOTIVO) {
      avisar(`Debe ingresar un motivo válido de al menos ${LARGO_MINIMO_MOTIVO} caracteres.`, 'advertencia');
      return;
    }
    try {
      await api.delete(`/maestros/${idMaestro}`, { data: { motivo: motivo.trim() } });
      onCerrar();
      onEliminado();
    } catch (error) {
      avisar(`Error al eliminar: ${mensajeDeError(error, 'Error desconocido')}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-rose-950/30 border-b border-rose-900/50 p-4"><h3 className="text-rose-400 font-bold">⚠️ Confirmar Eliminación</h3></div>
        <div className="p-5">
          <textarea autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} rows="3" className="w-full text-sm bg-slate-950 border border-slate-700 text-slate-200 rounded p-2 focus:border-rose-500" placeholder="Motivo de auditoría (mín 10 caracteres)..."></textarea>
        </div>
        <div className="bg-slate-800/50 p-4 flex justify-end gap-3"><button onClick={onCerrar} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200">Cancelar</button><button onClick={eliminar} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded">Eliminar Maestro</button></div>
      </div>
    </div>
  );
}
