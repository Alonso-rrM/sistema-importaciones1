import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Permite acceder desde otras PCs de la red local (ej. http://192.168.1.50:5173)
    host: true,
    port: 5173,
    // Reenvía /api/* al backend FastAPI local, así no hace falta exponer el puerto 8000 ni configurar CORS
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
