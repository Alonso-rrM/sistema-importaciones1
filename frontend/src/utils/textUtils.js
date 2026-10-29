/**
 * Normaliza y acorta razones sociales oficiales de SUNAT para su uso operativo en el ERP.
 * Permite mantener la legibilidad y evitar desbordes en celdas, tarjetas y selectores.
 * 
 * @param {string} texto Razón social original devuelta por SUNAT
 * @returns {string} Razón social limpia y compacta
 */
export function acortarRazonSocial(texto) {
  if (!texto || typeof texto !== 'string') return '';

  let nombre = texto.trim().toUpperCase();

  // 1. Si contiene guion (" - "), priorizar la forma comercial o sigla corta posterior al guion
  // Ej: "SUPERINTENDENCIA NACIONAL DE ADUANAS Y DE ADMINISTRACION TRIBUTARIA - SUNAT" -> "SUNAT"
  // Ej: "DISTRIBUIDORA Y LOGISTICA GLOBAL SOCIEDAD ANONIMA CERRADA - DILOG S.A.C." -> "DILOG S.A.C."
  if (nombre.includes(' - ')) {
    const partes = nombre.split(' - ').map(p => p.trim()).filter(Boolean);
    if (partes.length >= 2) {
      const p1 = partes[0];
      const p2 = partes[partes.length - 1];
      // Si la parte tras el guion es más compacta y tiene al menos 2 letras, usarla como nombre operativo
      if (p2.length <= p1.length && p2.length >= 2) {
        nombre = p2;
      }
    }
  }

  // 2. Reemplazar denominaciones societarias extensas por sus siglas oficiales peruanas
  const reemplazos = [
    [/\bSOCIEDAD\s+ANONIMA\s+CERRADA\b/gi, 'S.A.C.'],
    [/\bSOCIEDAD\s+COMERCIAL\s+DE\s+RESPONSABILIDAD\s+LIMITADA\b/gi, 'S.R.L.'],
    [/\bEMPRESA\s+INDIVIDUAL\s+DE\s+RESPONSABILIDAD\s+LIMITADA\b/gi, 'E.I.R.L.'],
    [/\bSOCIEDAD\s+ANONIMA\s+ABIERTA\b/gi, 'S.A.A.'],
    [/\bSOCIEDAD\s+ANONIMA\b/gi, 'S.A.'],
    [/\bS\s*\.?\s*A\s*\.?\s*C\s*\.?\b/gi, 'S.A.C.'],
    [/\bS\s*\.?\s*R\s*\.?\s*L\s*\.?\b/gi, 'S.R.L.'],
    [/\bE\s*\.?\s*I\s*\.?\s*R\s*\.?\s*L\s*\.?\b/gi, 'E.I.R.L.'],
    [/\bS\s*\.?\s*A\s*\.?\s*A\s*\.?\b/gi, 'S.A.A.'],
    [/\bS\s*\.?\s*A\s*\.?(?!\w)/gi, 'S.A.']
  ];

  for (const [patron, sigla] of reemplazos) {
    nombre = nombre.replace(patron, sigla);
  }

  // 3. Limpiar comillas, prefijos de SUNAT (" 'O ' ") y espacios parásitos
  nombre = nombre.replace(/['"`]/g, '');
  nombre = nombre.replace(/\s+O\s+(?=S\.)/g, ' ');
  nombre = nombre.replace(/\s+/g, ' ').trim();
  nombre = nombre.replace(/\.{2,}/g, '.');

  return nombre;
}
