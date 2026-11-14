/**
 * DEFINICIÓN DE CADA CATÁLOGO (lo único que cambia entre pantallas de catálogo)
 *
 * campos: formulario de alta/edición, en orden.
 *   tipo: 'texto' (por defecto) | 'ruc' (con consulta a SUNAT) | 'seleccion' (con `opciones`)
 *   requerido / mensajeRequerido, placeholder, ayuda, valorInicial, vacioComoNulo, ancho: 'medio'
 *   validar(valor, formulario): mensaje de error o null. Al modificar, solo se aplica si el valor cambió
 *   (puede haber registros antiguos que no cumplan la regla).
 * buscarEn: campos donde busca el cuadro de búsqueda.
 * tarjeta: qué más muestra cada fila de la bandeja.  ficha: qué muestra la ficha de detalle.
 */
import { Briefcase, Building2, Factory, FileDigit, Landmark, Tags, Users } from 'lucide-react';
import { CATEGORIA_PROVEEDOR, CLASE_ADUANERA, TIPO_GASTO } from '../../constants';
import { validarRuc } from '../../utils/validaciones';
import GastosDelConcepto from '../conceptos/GastosDelConcepto';

const RUC_O_TEXTO = (r) => (r?.ruc ? `RUC: ${r.ruc}` : 'S/RUC');

const campoRuc = (placeholder, requerido) => ({
  nombre: 'ruc', etiqueta: 'RUC (11 Dígitos)', tipo: 'ruc', placeholder, requerido,
  mensajeRequerido: 'El RUC es obligatorio.', vacioComoNulo: true, ancho: 'medio',
  validar: (valor) => validarRuc(valor, { opcional: !requerido }).error,
});

const campoNombre = (etiqueta, placeholder, mensajeRequerido) => ({
  nombre: 'nombre', etiqueta, placeholder, requerido: true, mensajeRequerido,
  ayuda: '💡 Puedes editar libremente este nombre para ajustarlo a tu estándar operativo.',
});

export const ETIQUETAS_CATEGORIA_PROVEEDOR = {
  [CATEGORIA_PROVEEDOR.NACIONAL]: 'Nacional',
  [CATEGORIA_PROVEEDOR.INTERNACIONAL]: 'Internacional',
  [CATEGORIA_PROVEEDOR.ESTADO_O_TRIBUTO]: 'Estado / Tributo (SUNAT)',
};
const OPCIONES_CATEGORIA = Object.entries(ETIQUETAS_CATEGORIA_PROVEEDOR).map(([valor, etiqueta]) => ({ valor, etiqueta }));

export const BANCOS = {
  ruta: 'bancos', campoId: 'id_banco', Icono: Landmark,
  textos: {
    singular: 'Banco',
    titulo: 'Catálogo de Entidades Bancarias',
    subtitulo: 'Instituciones financieras autorizadas para emisión y registro de Vouchers de pago',
    placeholderBusqueda: 'Buscar por Nombre del Banco...',
    sinResultados: 'No se encontraron bancos con los criterios indicados.',
    ayudaSinSeleccion: 'Seleccione un banco de la bandeja izquierda para ver o modificar su denominación.',
    referencia: (r) => `la entidad "${r.nombre}"`,
    advertenciaBorrado: 'tiene vouchers vinculados',
  },
  campos: [campoNombre('Nombre de la Institución Financiera', 'Ej. BCP, BBVA, Interbank, Scotiabank...', 'El nombre de la entidad bancaria es obligatorio.')],
  buscarEn: ['nombre'],
  ficha: {
    titulo: 'Datos de la Entidad Bancaria',
    destacado: { etiqueta: 'Denominación', valor: (r) => r?.nombre },
    datos: [{ etiqueta: 'Nombre Oficial', valor: (r) => r?.nombre }],
  },
};

export const ALMACENES = {
  ruta: 'almacenes', campoId: 'id_almacen', Icono: Factory,
  textos: {
    singular: 'Almacén',
    titulo: 'Catálogo de Almacenes',
    subtitulo: 'Depósitos temporales y almacenes de destino de la mercancía',
    placeholderBusqueda: 'Buscar por Nombre o Ubicación...',
    sinResultados: 'No se encontraron almacenes con los criterios indicados.',
    ayudaSinSeleccion: 'Seleccione un depósito de la bandeja izquierda para ver o actualizar sus datos físicos.',
    referencia: (r) => `el almacén "${r.nombre}"`,
    advertenciaBorrado: 'tiene contenedores asignados',
  },
  campos: [
    campoNombre('Nombre del Almacén', 'Ej. DP World Callao, Ransa San Agustín...', 'El nombre del almacén es obligatorio.'),
    { nombre: 'ubicacion', etiqueta: 'Ubicación / Dirección', placeholder: 'Ej. Av. Manco Cápac 123, Callao...', vacioComoNulo: true },
  ],
  buscarEn: ['nombre', 'ubicacion'],
  tarjeta: { subtitulo: (r) => r.ubicacion || 'Sin ubicación' },
  ficha: {
    titulo: 'Datos del Almacén',
    destacado: { etiqueta: 'Denominación', valor: (r) => r?.nombre },
    datos: [
      { etiqueta: 'Nombre', valor: (r) => r?.nombre },
      { etiqueta: 'Ubicación', valor: (r) => r?.ubicacion || 'Sin ubicación' },
    ],
  },
};

export const AGENTES = {
  ruta: 'agentes', campoId: 'id_agente', Icono: Briefcase,
  textos: {
    singular: 'Agente',
    titulo: 'Catálogo de Agentes de Aduana',
    subtitulo: 'Agencias autorizadas ante SUNAT para el desaduanamiento de mercancías',
    placeholderBusqueda: 'Buscar por RUC o Nombre...',
    sinResultados: 'No se encontraron agentes de aduana con los criterios indicados.',
    ayudaSinSeleccion: 'Seleccione un agente de la bandeja izquierda para ver o actualizar sus datos operativos.',
    referencia: (r) => `a la agencia "${r.nombre}"`,
    advertenciaBorrado: 'tiene despachos asignados',
  },
  campos: [
    campoRuc('Ej. 20111222333', true),
    campoNombre('Razón Social / Nombre de la Agencia', 'Nombre oficial o abreviado de la agencia de aduanas...', 'El nombre de la Agencia de Aduanas es obligatorio.'),
  ],
  buscarEn: ['nombre', 'ruc'],
  tarjeta: { detalleDerecha: RUC_O_TEXTO },
  ficha: {
    titulo: 'Datos de la Agencia',
    destacado: { etiqueta: 'RUC', valor: (r) => r?.ruc || 'No declarado' },
    datos: [
      { etiqueta: 'Razón Social', valor: (r) => r?.nombre },
      { etiqueta: 'RUC', valor: (r) => r?.ruc || 'Sin RUC' },
    ],
  },
};

export const IMPORTADORES = {
  ruta: 'importadores', campoId: 'id_importador', Icono: Building2,
  textos: {
    singular: 'Importador',
    titulo: 'Catálogo de Importadores',
    subtitulo: 'Gestión de empresas importadoras maestras con validación SUNAT y trazabilidad operativa',
    placeholderBusqueda: 'Buscar por RUC o Razón Social...',
    sinResultados: 'No se encontraron importadores con los criterios especificados.',
    ayudaSinSeleccion: 'Seleccione un importador de la bandeja izquierda para consultar o actualizar su información fiscal.',
    referencia: (r) => `al importador "${r.nombre}"`,
    advertenciaBorrado: 'tiene operaciones vinculadas',
  },
  campos: [
    campoRuc('Ej. 20123456789', true),
    campoNombre('Razón Social', 'Nombre oficial o abreviado de la empresa...', 'La Razón Social es obligatoria.'),
  ],
  buscarEn: ['nombre', 'ruc'],
  tarjeta: { detalleDerecha: RUC_O_TEXTO },
  ficha: {
    titulo: 'Datos del Importador',
    destacado: { etiqueta: 'RUC', valor: (r) => r?.ruc || 'No declarado' },
    datos: [
      { etiqueta: 'Razón Social', valor: (r) => r?.nombre },
      { etiqueta: 'RUC', valor: (r) => r?.ruc || 'Sin RUC' },
    ],
  },
};

export const PROVEEDORES = {
  ruta: 'proveedores', campoId: 'id_proveedor', Icono: Users,
  textos: {
    singular: 'Proveedor',
    titulo: 'Catálogo de Proveedores',
    subtitulo: 'Proveedores de servicios logísticos, agencias de aduana, navieras y entidades portuarias',
    placeholderBusqueda: 'Buscar por RUC o Razón Social...',
    sinResultados: 'No se encontraron proveedores con los criterios indicados.',
    ayudaSinSeleccion: 'Seleccione un proveedor de la bandeja izquierda para ver o editar sus datos comerciales.',
    referencia: (r) => `al proveedor "${r.nombre}"`,
    advertenciaBorrado: 'tiene gastos vinculados',
  },
  campos: [
    {
      ...campoRuc('Ej. 20987654321', false),
      // Un proveedor del exterior no tiene RUC peruano: su identificación no se valida
      validar: (valor, formulario) => (formulario.categoria === CATEGORIA_PROVEEDOR.INTERNACIONAL
        ? null : validarRuc(valor, { opcional: true }).error),
    },
    {
      nombre: 'categoria', etiqueta: 'Categoría', tipo: 'seleccion', requerido: true, ancho: 'medio',
      opciones: OPCIONES_CATEGORIA, valorInicial: CATEGORIA_PROVEEDOR.NACIONAL,
      ayuda: 'Use "Estado / Tributo" para SUNAT y demás entidades del Estado.',
    },
    campoNombre('Razón Social / Nombre Oficial', 'Nombre oficial o abreviado del proveedor...', 'La Razón Social o Nombre es obligatorio.'),
  ],
  buscarEn: ['nombre', 'ruc'],
  filtroExtra: { campo: 'categoria', textoTodos: 'Todas las Cat.', opciones: OPCIONES_CATEGORIA },
  tarjeta: {
    insignias: [(r) => ETIQUETAS_CATEGORIA_PROVEEDOR[r.categoria] || r.categoria || ETIQUETAS_CATEGORIA_PROVEEDOR[CATEGORIA_PROVEEDOR.NACIONAL]],
    detalleDerecha: RUC_O_TEXTO,
  },
  ficha: {
    titulo: 'Datos del Proveedor',
    destacado: { etiqueta: 'RUC', valor: (r) => r?.ruc || 'No declarado' },
    datos: [
      { etiqueta: 'Razón Social', valor: (r) => r?.nombre },
      { etiqueta: 'RUC', valor: (r) => r?.ruc || 'Sin RUC' },
      { etiqueta: 'Categoría', valor: (r) => ETIQUETAS_CATEGORIA_PROVEEDOR[r?.categoria] || r?.categoria || '-' },
    ],
  },
};

export const COMPROBANTES = {
  ruta: 'tipos-documento', campoId: 'id_tipo_doc', campoNombre: 'nombre_documento', Icono: FileDigit,
  textos: {
    singular: 'Comprobante',
    titulo: 'Catálogo de Tipos de Comprobante',
    subtitulo: 'Definición de documentos tributarios (Facturas, Boletas, Recibos, Notas de Crédito con multiplicador)',
    placeholderBusqueda: 'Buscar tipo de comprobante...',
    sinResultados: 'No se encontraron tipos de comprobante con los criterios indicados.',
    ayudaSinSeleccion: 'Seleccione un tipo de comprobante de la bandeja izquierda para ver o modificar sus parámetros de cálculo.',
    referencia: (r) => `el comprobante "${r.nombre_documento}"`,
    advertenciaBorrado: 'tiene gastos asociados',
  },
  campos: [
    { nombre: 'nombre_documento', etiqueta: 'Nombre del Tipo de Documento', requerido: true,
      placeholder: 'Ej. Factura Comercial, Boleta de Venta, Nota de Crédito...',
      mensajeRequerido: 'El nombre del tipo de documento es obligatorio.' },
    { nombre: 'multiplicador_financiero', etiqueta: 'Multiplicador Financiero', tipo: 'seleccion', requerido: true,
      valorInicial: 1, convertir: Number,
      opciones: [
        { valor: 1, etiqueta: '+1 (Suma al costo - Facturas, Recibos, Boletas)' },
        { valor: -1, etiqueta: '-1 (Resta al costo - Notas de Crédito, Devoluciones)' },
      ],
      ayuda: 'Indica si el documento suma al costo del contenedor o lo descuenta.' },
  ],
  buscarEn: ['nombre_documento'],
  tarjeta: { insignias: [(r) => `Mult: ${r.multiplicador_financiero > 0 ? '+1' : '-1'}`] },
  ficha: {
    titulo: 'Datos del Comprobante',
    destacado: {
      etiqueta: 'Efecto en el costo',
      valor: (r) => (r?.multiplicador_financiero < 0 ? 'Resta al Gasto (-1)' : 'Suma al Gasto (+1)'),
    },
    datos: [
      { etiqueta: 'Nombre del Documento', valor: (r) => r?.nombre_documento },
      { etiqueta: 'Multiplicador', valor: (r) => `${r?.multiplicador_financiero} (${r?.multiplicador_financiero < 0 ? 'Crédito / Descuento' : 'Débito / Gasto'})` },
    ],
  },
};

// ---------- Conceptos de gasto ----------
const ETAPAS_GASTO = {
  [TIPO_GASTO.FIJO_DESPACHO]: { corta: 'Fijo Despacho', larga: '1. Gasto Fijo Operativo (Despacho)',
    opcion: '1. Gasto Fijo Operativo (Ruta Crítica Despacho)', clase: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  [TIPO_GASTO.POST_LEVANTE]: { corta: 'Post-Levante', larga: '2. Gasto Post-Levante (Devolución/Entrega)',
    opcion: '2. Gasto Post-Levante (Devolución de Vacío / Entrega)', clase: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  [TIPO_GASTO.EXTRAORDINARIO]: { corta: 'Extraordinario', larga: '3. Gasto Extraordinario (Eventualidades)',
    opcion: '3. Gasto Extraordinario (Multas / Eventualidades)', clase: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
};
const etapaDe = (r) => ETAPAS_GASTO[r?.tipo_gasto] || ETAPAS_GASTO[TIPO_GASTO.EXTRAORDINARIO];

// Clase aduanera: papel del concepto en el despacho. La usa el backend para decidir el levante de la DAM.
export const CLASES_ADUANERAS = {
  [CLASE_ADUANERA.NINGUNA]: { etiqueta: 'Ninguna', detalle: 'No interviene en el levante (fletes, almacenaje, multas, etc.)' },
  [CLASE_ADUANERA.TRIBUTO]: { etiqueta: 'Tributo', detalle: 'Forma parte de la proforma junto con la percepción' },
  [CLASE_ADUANERA.PERCEPCION]: { etiqueta: 'Percepción', detalle: 'Forma parte de la proforma junto con los tributos' },
  [CLASE_ADUANERA.OMC]: { etiqueta: CLASE_ADUANERA.OMC, detalle: 'Ajuste de valor OMC: su pago libera o cierra la DAM' },
};
const claseDe = (r) => CLASES_ADUANERAS[r?.clase_aduanera] || CLASES_ADUANERAS[CLASE_ADUANERA.NINGUNA];
const COLOR_CLASE_NINGUNA = 'bg-slate-500/10 text-slate-400 border-slate-500/30';
const COLOR_CLASE_ADUANERA = 'bg-sky-500/10 text-sky-300 border-sky-500/30';

export const CONCEPTOS = {
  ruta: 'conceptos', campoId: 'id_concepto', Icono: Tags, PanelDetalle: GastosDelConcepto,
  textos: {
    singular: 'Concepto',
    titulo: 'Catálogo de Conceptos de Pago',
    subtitulo: 'Clasificación contable para gastos de importación (Flete, Almacenaje, Agenciamiento, Cuadrilla, etc.)',
    placeholderBusqueda: 'Buscar por Nombre o Descripción...',
    sinResultados: 'No se encontraron conceptos con los criterios indicados.',
    ayudaSinSeleccion: 'Seleccione un concepto de la bandeja izquierda para ver o modificar su clasificación.',
    referencia: (r) => `el concepto "${r.nombre}"`,
    advertenciaBorrado: 'tiene gastos asociados',
  },
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre del Concepto', requerido: true,
      placeholder: 'Ej. Flete Internacional, Almacenaje Callao, Gastos de Despacho...',
      mensajeRequerido: 'El nombre del concepto de pago es obligatorio.' },
    { nombre: 'tipo_gasto', etiqueta: 'Etapa Logística (Clasificación para KPIs)', tipo: 'seleccion', requerido: true,
      valorInicial: TIPO_GASTO.FIJO_DESPACHO,
      opciones: Object.entries(ETAPAS_GASTO).map(([valor, e]) => ({ valor, etiqueta: e.opcion })),
      ayuda: 'Determina cómo medirá el sistema el avance de pagos de este concepto en la barra de progreso del contenedor.' },
    { nombre: 'clase_aduanera', etiqueta: 'Clase Aduanera (Levante de la DAM)', tipo: 'seleccion', requerido: true,
      valorInicial: CLASE_ADUANERA.NINGUNA,
      opciones: Object.entries(CLASES_ADUANERAS).map(([valor, c]) => ({ valor, etiqueta: `${c.etiqueta} — ${c.detalle}` })),
      ayuda: 'El sistema da el levante de la DAM cuando los gastos de clase Tributo y Percepción están pagados. Ya no depende del nombre del concepto.' },
    { nombre: 'descripcion', etiqueta: 'Descripción (Opcional)', tipo: 'multilinea', vacioComoNulo: true,
      placeholder: 'Detalles sobre este concepto o su aplicación contable...' },
  ],
  buscarEn: ['nombre', 'descripcion'],
  tarjeta: {
    insignias: [
      (r) => ({ texto: etapaDe(r).corta, clase: etapaDe(r).clase }),
      (r) => (r.clase_aduanera && r.clase_aduanera !== CLASE_ADUANERA.NINGUNA
        ? { texto: `Aduana: ${claseDe(r).etiqueta}`, clase: COLOR_CLASE_ADUANERA } : null),
    ],
    subtitulo: (r) => r.descripcion || null,
  },
  ficha: {
    titulo: 'Datos del Concepto',
    destacado: { etiqueta: 'Etapa', valor: (r) => etapaDe(r).corta },
    datos: [
      { etiqueta: 'Denominación', valor: (r) => r?.nombre },
      { etiqueta: 'Etapa Logística (KPI)', valor: (r) => ({ texto: etapaDe(r).larga, clase: etapaDe(r).clase }) },
      { etiqueta: 'Clase Aduanera (Levante)', valor: (r) => ({
        texto: claseDe(r).etiqueta, detalle: claseDe(r).detalle,
        clase: !r?.clase_aduanera || r.clase_aduanera === CLASE_ADUANERA.NINGUNA ? COLOR_CLASE_NINGUNA : COLOR_CLASE_ADUANERA,
      }) },
      { etiqueta: 'Descripción / Justificación', valor: (r) => r?.descripcion || 'Sin descripción detallada' },
    ],
  },
};
