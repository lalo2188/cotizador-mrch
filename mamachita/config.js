// Configuración del mapa Mamachita.
// Solo edita este archivo; el resto de la app lo lee de aquí.
window.MAMACHITA_CONFIG = {
  // ID de la hoja "Mamachita - Prospectos tiendas Guadalajara y Zapopan".
  // La hoja debe estar compartida como "Cualquier persona con el enlace: lector".
  SHEET_ID: '1tZ1Ov3l2SpUm02NdD-DlHk4FE6h2aYUhKABkUhSwJYs',
  HOJA_TIENDAS: 'Prospectos',
  HOJA_ENTREGAS: 'Entregas',

  // URL del Web App de Apps Script (ver apps-script/Code.gs y LEEME.md).
  // Mientras esté vacío, el mapa funciona en modo lectura y las entregas
  // se capturan directo en la hoja.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbw931usplLkklCOP-RQVBckW50E5DbTbxZepyR5L7wJOpwKyDhWWBW1_rnF9iudoNUA/exec',

  // Sabores que manejamos. La "columna" debe existir igual en la pestaña Entregas.
  SABORES: [
    { id: 'tradicional', nombre: 'Tradicional', corto: 'Trad.', columna: 'Tradicional', color: '#B3121B' },
    { id: 'pistache', nombre: 'Pistache/Morita', corto: 'Pist./Mor.', columna: 'Pistache/Morita', color: '#6B8E23' },
  ],

  // Días por defecto entre una entrega y el siguiente reestock.
  DIAS_REESTOCK: 14,
  // Cuántos días antes del reestock se marca la tienda como "pronto".
  DIAS_AVISO: 3,
  // Precio sugerido por frasco (vacío = sin definir todavía).
  PRECIO_DEFAULT: '',
  // Radio (metros) del territorio que "conquista" cada tienda activa.
  RADIO_TERRITORIO: 700,
};
