// Configuración del mapa Quisito · Restaurantes y cafeterías.
// Solo edita este archivo; el resto de la app lo lee de aquí.
window.QUISITO_CONFIG = {
  // ID de la hoja "Quisito - Prospectos restaurantes y cafeterías".
  // Es lo que va entre /d/ y /edit en la liga de la hoja.
  // La hoja debe estar compartida como "Cualquier persona con el enlace: lector".
  SHEET_ID: '',
  HOJA_LUGARES: 'Prospectos',
  HOJA_PEDIDOS: 'Pedidos',

  // URL del Web App de Apps Script (ver apps-script/Code.gs y README.md).
  // Mientras esté vacío, el mapa funciona en modo lectura y los pedidos
  // se capturan directo en la hoja.
  SCRIPT_URL: '',

  // Productos que ofrecemos. La "columna" debe existir igual en la pestaña Pedidos.
  PRODUCTOS: [
    { id: 'quisito', nombre: 'Quisito', corto: 'Quis.', columna: 'Quisito', color: '#C8862A' },
    { id: 'panes', nombre: 'Panes', corto: 'Pan', columna: 'Panes', color: '#8A5A3B' },
    { id: 'postres', nombre: 'Postres', corto: 'Post.', columna: 'Postres', color: '#C2566B' },
  ],
  UNIDAD: 'piezas',

  // Días por defecto entre un pedido y el siguiente seguimiento / resurtido.
  DIAS_SEGUIMIENTO: 7,
  // Cuántos días antes del seguimiento se marca el lugar como "pronto".
  DIAS_AVISO: 2,
  // Precio promedio por pieza (vacío = sin definir todavía).
  PRECIO_DEFAULT: '',
  // Radio (metros) del territorio que "conquista" cada cliente.
  RADIO_TERRITORIO: 600,
  // Centro inicial del mapa (Guadalajara).
  CENTRO: [20.6736, -103.3700],
};
