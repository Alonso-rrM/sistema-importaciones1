import axios from 'axios';
import { limpiarSesionLocal } from '../utils/session';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000',
  timeout: 15000,
  // La sesión viaja en una cookie httpOnly: hay que permitir que el navegador la envíe
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    // Requerido por la protección CSRF del backend en toda escritura autenticada por cookie
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// Response Interceptor: si la sesión expiró o no existe (401), se limpia y se envía al login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      const esAuth = url.includes('/login') || url.includes('/me');
      if (!esAuth) {
        limpiarSesionLocal();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
