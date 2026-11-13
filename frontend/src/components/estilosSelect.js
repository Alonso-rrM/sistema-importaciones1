/** Estilo oscuro para los desplegables con búsqueda (react-select). `acento`: color del borde con foco. */
export const estiloSelectOscuro = (acento = '#a855f7') => ({
  control: (base, state) => ({
    ...base,
    backgroundColor: '#0f172a', // slate-900
    borderColor: state.isFocused ? acento : '#334155', // acento : slate-700
    boxShadow: state.isFocused ? `0 0 0 1px ${acento}` : 'none',
    '&:hover': { borderColor: '#475569' },
    color: '#f8fafc',
    fontSize: '0.8125rem',
    borderRadius: '0.5rem',
    minHeight: '38px'
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#1e293b', // slate-800
    border: '1px solid #334155',
    zIndex: 60
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#7e22ce' : state.isFocused ? '#334155' : 'transparent',
    color: '#f8fafc',
    fontSize: '0.8125rem',
    cursor: 'pointer'
  }),
  singleValue: (base) => ({
    ...base,
    color: '#f8fafc',
    fontSize: '0.8125rem'
  }),
  input: (base) => ({
    ...base,
    color: '#f8fafc',
    fontSize: '0.8125rem'
  }),
  placeholder: (base) => ({
    ...base,
    color: '#94a3b8',
    fontSize: '0.8125rem'
  })
});
