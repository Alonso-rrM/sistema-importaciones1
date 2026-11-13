/** Tema claro / oscuro. El proveedor está en ThemeContext.jsx; aquí el contexto y el hook para usarlo. */
import { createContext, useContext } from 'react';

export const TemaContext = createContext(null);

export function useTheme() {
  const contexto = useContext(TemaContext);
  if (!contexto) throw new Error('useTheme debe ser usado dentro de un ThemeProvider');
  return contexto;
}
