/**
 * DEFINICIÓN DE CADA CATÁLOGO (lo único que cambia entre pantallas de catálogo)
 *
 * campos: formulario de alta/edición, en orden.
 *   tipo: 'texto' (por defecto) | 'ruc' (con consulta a SUNAT) | 'seleccion' (con `opciones`)
 *   requerido / mensajeRequerido, placeholder, ayuda, valorInicial, vacioComoNulo, ancho: 'medio'
 * buscarEn: campos donde busca el cuadro de búsqueda.
 * tarjeta: qué más muestra cada fila de la bandeja.  ficha: qué muestra la ficha de detalle.
 */
import { Briefcase, Building2, Factory, Landmark, Users } from 'lucide-react';
import { CATEGORIA_PROVEEDOR } from '../../constants';

const RUC_O_TEXTO = (r) => (r?.ruc ? `RUC: ${r.ruc}` : 'S/RUC');

const campoRuc = (placeholder, requerido) => ({
  nombre: 'ruc', etiqueta: 'RUC (11 Dígitos)', tipo: 'ruc', placeholder, requerido,
  mensajeRequerido: 'El RUC es obligatorio.', vacioComoNulo: true, ancho: 'medio',
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
    campoRuc('Ej. 20987654321', false),
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
    insignia: (r) => ETIQUETAS_CATEGORIA_PROVEEDOR[r.categoria] || r.categoria || ETIQUETAS_CATEGORIA_PROVEEDOR[CATEGORIA_PROVEEDOR.NACIONAL],
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
