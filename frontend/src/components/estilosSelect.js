/**
 * Estilos oscuros para los desplegables con búsqueda (react-select), en las dos paletas del sistema.
 *   ESTILO_SELECT_TEAL    -> pantallas operativas (Gastos, Vouchers)
 *   ESTILO_SELECT_MORADO  -> Tesorería (Pagos)
 */
const crearEstilo = ({ fondo, fondoMenu, acento, seleccionado, foco }) => ({
  control: (base, state) => ({
    ...base,
    backgroundColor: fondo,
    borderColor: state.isFocused ? acento : '#334155', // acento : slate-700
    boxShadow: state.isFocused ? `0 0 0 1px ${acento}` : 'none',
    '&:hover': { borderColor: '#475569' },
    color: '#f8fafc',
    fontSize: '0.8125rem',
    borderRadius: '0.5rem',
    minHeight: '38px',
  }),
  menu: (base) => ({ ...base, backgroundColor: fondoMenu, border: '1px solid #334155', zIndex: 60 }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? seleccionado : state.isFocused ? foco : 'transparent',
    color: '#f8fafc',
    fontSize: '0.8125rem',
    cursor: 'pointer',
  }),
  singleValue: (base) => ({ ...base, color: '#f8fafc', fontSize: '0.8125rem' }),
  input: (base) => ({ ...base, color: '#f8fafc', fontSize: '0.8125rem' }),
  placeholder: (base) => ({ ...base, color: '#94a3b8', fontSize: '0.8125rem' }),
});

// slate-950 / slate-900 / teal-500 / teal-600 / slate-800
export const ESTILO_SELECT_TEAL = crearEstilo({
  fondo: '#020617', fondoMenu: '#0f172a', acento: '#14b8a6', seleccionado: '#0d9488', foco: '#1e293b',
});

// slate-900 / slate-800 / purple-500 / purple-700 / slate-700
export const ESTILO_SELECT_MORADO = crearEstilo({
  fondo: '#0f172a', fondoMenu: '#1e293b', acento: '#a855f7', seleccionado: '#7e22ce', foco: '#334155',
});
