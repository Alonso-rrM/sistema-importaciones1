import api from '../services/api';

/**
 * Descarga un reporte en Excel por streaming desde FastAPI respetando los filtros activos.
 * @param {string} endpoint - Endpoint de exportación (ej: '/maestros/exportar')
 * @param {object} params - Parámetros de filtrado activos
 * @param {string} fallbackFilename - Nombre por defecto si la cabecera no se detecta
 */
export async function descargarExcel(endpoint, params = {}, fallbackFilename = 'Reporte.xlsx') {
  const response = await api.get(endpoint, {
    params,
    responseType: 'blob',
  });

  let filename = fallbackFilename;
  const disposition = response.headers['content-disposition'];
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    if (match && match[1]) {
      filename = match[1].replace(/['"]/g, '');
    }
  }

  const blob = new Blob([response.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
