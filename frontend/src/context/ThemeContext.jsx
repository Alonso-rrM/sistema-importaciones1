import { useEffect, useState } from 'react';
import { TemaContext } from './tema';

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('erp_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    }
    try {
      localStorage.setItem('erp_theme', theme);
    } catch { /* almacenamiento no disponible: el tema vale solo para esta sesión */ }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  return (
    <TemaContext.Provider value={{ theme, isDark: theme === 'dark', toggleTheme }}>
      {children}
    </TemaContext.Provider>
  );
};
