/**
 * Sesión del usuario en el navegador.
 *
 * El token JWT ya NO se guarda en el navegador: viaja en una cookie httpOnly que JavaScript no puede
 * leer (un XSS no puede robar la sesión). Aquí solo se guardan datos de PRESENTACIÓN del usuario
 * (nombre y rol) para decidir qué mostrar en pantalla. Los permisos reales los valida el backend.
 */
const CLAVE = 'erp_usuario';

export function guardarUsuario(usuario) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({
      id_usuario: usuario.id_usuario,
      username: usuario.username,
      id_rol: usuario.id_rol,
    }));
  } catch { /* almacenamiento no disponible: la sesión sigue valiendo por cookie */ }
}

export function obtenerUsuario() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || 'null');
  } catch {
    return null;
  }
}

/** Rol del usuario (1 Admin, 2 Logística, 3 Tesorería, 4 Auditoría) o null si no hay sesión. */
export function obtenerRol() {
  return obtenerUsuario()?.id_rol ?? null;
}

export function limpiarSesionLocal() {
  try {
    localStorage.removeItem(CLAVE);
    localStorage.removeItem('token'); // restos del esquema anterior (token en localStorage)
    localStorage.removeItem('user');
  } catch { /* nada */ }
}
