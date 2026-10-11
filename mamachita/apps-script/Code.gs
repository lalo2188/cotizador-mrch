/**
 * Mamachita · Backend en Google Apps Script
 *
 * Pega este archivo en la hoja de prospectos: Extensiones → Apps Script.
 * Luego corre `configurar` una vez (ver LEEME.md). Hace cuatro cosas:
 *   1. Agrega las columnas Estado / Lat / Lng a "Prospectos" y crea la pestaña "Entregas".
 *   2. Geocodifica (saca coordenadas de) cada tienda nueva que escribas en la hoja.
 *   3. Expone un Web App para que el mapa registre entregas y cambie estados.
 *   4. Te manda un correo diario con las tiendas que toca reestockear.
 */

// Clave que pide el mapa para guardar cambios. Déjala vacía si no quieres clave.
var PIN = '';

var HOJA_TIENDAS = 'Prospectos';
var HOJA_ENTREGAS = 'Entregas';
var COLUMNAS_EXTRA = ['Estado', 'Lat', 'Lng'];
var COLUMNAS_ENTREGAS = ['Fecha', 'Tienda', 'Tradicional', 'Pistache/Morita', 'Precio', 'Reestock', 'Quedaban', 'Notas'];
var DIAS_REESTOCK = 14;
var DIAS_AVISO = 3;

// ---------- Configuración inicial ----------

function configurar() {
  const ss = SpreadsheetApp.getActive();
  const tiendas = ss.getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(tiendas);
  COLUMNAS_EXTRA.forEach(function (c) {
    if (enc.indexOf(c) === -1) {
      tiendas.getRange(1, tiendas.getLastColumn() + 1).setValue(c).setFontWeight('bold');
      enc.push(c);
    }
  });

  llenarEstados();

  let entregas = ss.getSheetByName(HOJA_ENTREGAS);
  if (!entregas) {
    entregas = ss.insertSheet(HOJA_ENTREGAS);
    entregas.getRange(1, 1, 1, COLUMNAS_ENTREGAS.length).setValues([COLUMNAS_ENTREGAS]).setFontWeight('bold');
    entregas.setFrozenRows(1);
    entregas.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    entregas.getRange('F:F').setNumberFormat('yyyy-mm-dd');
    entregas.getRange('E:E').setNumberFormat('$#,##0.00');
  }

  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('alEditar').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('revisarReestock').timeBased().everyDays(1).atHour(8).create();
  if (ss.getSheetByName(HOJA_COLONIAS)) ScriptApp.newTrigger('actualizarColonias').timeBased().everyHours(1).create();

  geocodificar();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌶️ Mamachita')
    .addItem('Sacar coordenadas faltantes', 'geocodificar')
    .addItem('Llenar columna Estado', 'llenarEstados')
    .addItem('Buscar tiendas en Google (por zona)', 'buscarTiendasGoogle')
    .addItem('Buscar tiendas en un pueblo o colonia nueva…', 'buscarEnLugar')
    .addItem('Actualizar pestaña COLONIAS', 'armarColonias')
    .addItem('Agregar calle a nombres genéricos', 'renombrarGenericas')
    .addItem('Revisar reestocks (correo)', 'revisarReestock')
    .addItem('Configurar (una sola vez)', 'configurar')
    .addToUi();
}

// Pone "Prospecto" (o "Visitado" si ya está palomeada) en las filas sin Estado
// y deja la columna como lista desplegable.
function llenarEstados() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  const cEst = enc.indexOf('Estado') + 1, cVis = enc.indexOf('Visitado') + 1, cNom = enc.indexOf('Nombre') + 1;
  const n = hoja.getLastRow() - 1;
  if (!cEst || n < 1) return;
  const rango = hoja.getRange(2, cEst, n, 1);
  const estados = rango.getValues();
  const visitados = cVis ? hoja.getRange(2, cVis, n, 1).getValues() : [];
  const nombres = cNom ? hoja.getRange(2, cNom, n, 1).getValues() : [];
  rango.setValues(estados.map(function (f, i) {
    if (f[0] !== '' || (cNom && !nombres[i][0])) return f;
    return [visitados[i] && visitados[i][0] === true ? 'Visitado' : 'Prospecto'];
  }));
  hoja.getRange(2, cEst, hoja.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Prospecto', 'Visitado', 'Interesado', 'Activa', 'No interesado'], true)
      .setAllowInvalid(false).build());
}

// ---------- Geocodificación ----------

function geocodificar() {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  const n = hoja.getLastRow();
  const inicio = Date.now();
  let ok = 0, fallas = 0, fila = 2;
  // Apps Script corta a los 6 min; paramos antes y se puede volver a correr para seguir.
  for (; fila <= n && Date.now() - inicio < 4.5 * 60 * 1000; fila++) {
    try {
      const r = geocodificarFila_(hoja, enc, fila);
      if (r === true) ok++; else if (r === false) fallas++;
    } catch (err) {
      fallas++;
      console.warn('Fila ' + fila + ': ' + err);
    }
  }
  SpreadsheetApp.flush();
  ss.toast(ok + ' ubicadas, ' + fallas + ' sin encontrar' + (fila <= n ? '. Faltan filas: vuelve a correrlo.' : '.'), '🌶️ Mamachita', 10);
}

function alEditar(e) {
  const hoja = e.range.getSheet();
  if (hoja.getName() !== HOJA_TIENDAS) return;
  const enc = encabezados_(hoja);
  for (let fila = e.range.getRow(); fila <= e.range.getLastRow(); fila++) {
    if (fila > 1) geocodificarFila_(hoja, enc, fila);
  }
}

function geocodificarFila_(hoja, enc, fila) {
  const cLat = enc.indexOf('Lat') + 1, cLng = enc.indexOf('Lng') + 1;
  const cUbi = enc.indexOf('Ubicación') + 1, cNom = enc.indexOf('Nombre') + 1;
  if (!cLat || !cLng || !cUbi) throw new Error('Faltan las columnas Lat/Lng/Ubicación: corre "configurar"');
  const valores = hoja.getRange(fila, 1, 1, enc.length).getValues()[0];
  const ubicacion = String(valores[cUbi - 1] || '').trim();
  if (!ubicacion || valores[cLat - 1] !== '') return null;

  const consultas = [ubicacion + ', Jalisco, México'];
  if (cNom && valores[cNom - 1]) consultas.unshift(valores[cNom - 1] + ', ' + ubicacion + ', Jalisco, México');
  const geo = Maps.newGeocoder().setRegion('mx').setLanguage('es');
  for (let i = 0; i < consultas.length; i++) {
    const r = geo.geocode(consultas[i]);
    if (r.status === 'OK' && r.results.length) {
      const loc = r.results[0].geometry.location;
      hoja.getRange(fila, cLat).setValue(loc.lat);
      hoja.getRange(fila, cLng).setValue(loc.lng);
      return true;
    }
  }
  return false;
}

// ---------- Web App ----------

// Sin parámetros: devuelve la lista. Con ?d={...}: ejecuta un cambio. El mapa manda
// los cambios por GET porque algunos navegadores bloquean el POST hacia Apps Script.
function doGet(e) {
  // Si el sitio pide JSONP (?callback=...), respondemos como JavaScript: así no depende de CORS.
  const cb = e && e.parameter && e.parameter.callback;
  CALLBACK_ = cb && /^[A-Za-z_$][\w$]{0,40}$/.test(cb) ? cb : '';
  if (e && e.parameter && e.parameter.d) {
    let d;
    try { d = JSON.parse(e.parameter.d); } catch (err) { return json_({ ok: false, error: 'Datos inválidos' }); }
    return json_(manejar_(d));
  }
  const ss = SpreadsheetApp.getActive();
  return json_({
    ok: true,
    tiendas: filas_(ss.getSheetByName(HOJA_TIENDAS)),
    entregas: filas_(ss.getSheetByName(HOJA_ENTREGAS)),
  });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Datos inválidos' }); }
  return json_(manejar_(d));
}

function manejar_(d) {
  const lock = LockService.getScriptLock();
  let r;
  try {
    lock.waitLock(20000);
    if (PIN && String(d.pin) !== PIN) r = { ok: false, error: 'PIN incorrecto' };
    else if (d.accion === 'entrega') r = conResumen_(registrarEntrega_(d));
    else if (d.accion === 'estado') r = conResumen_(cambiarEstado_(d.tienda, d.estado));
    else if (d.accion === 'tienda') r = agregarTienda_(d);
    else if (d.accion === 'buscar') r = { ok: true, tiendas: buscarCerca_(Number(d.lat), Number(d.lng), Number(d.radio) || 1200) };
    else r = { ok: false, error: 'Acción desconocida' };
  } catch (err) {
    r = { ok: false, error: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (err) { /* no se tomó el candado */ }
  }
  r.accion = d.accion;
  return r;
}

function registrarEntrega_(d) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_ENTREGAS);
  if (!hoja) return { ok: false, error: 'Corre "configurar" primero' };
  const fecha = d.fecha ? fechaLocal_(d.fecha) : new Date();
  const reestock = d.reestock ? fechaLocal_(d.reestock) : new Date(fecha.getTime() + DIAS_REESTOCK * 864e5);
  const enc = encabezados_(hoja);
  const valores = {
    'Fecha': fecha, 'Tienda': d.tienda, 'Tradicional': num_(d.tradicional),
    'Pistache/Morita': num_(d.pistache), 'Precio': d.precio === '' || d.precio == null ? '' : num_(d.precio),
    'Reestock': reestock, 'Quedaban': d.quedaban === '' || d.quedaban == null ? '' : num_(d.quedaban),
    'Notas': d.notas || '',
  };
  hoja.appendRow(enc.map(function (c) { return c in valores ? valores[c] : ''; }));
  cambiarEstado_(d.tienda, 'Activa');
  return { ok: true };
}

function cambiarEstado_(nombre, estado) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  const cNom = enc.indexOf('Nombre') + 1, cEst = enc.indexOf('Estado') + 1, cVis = enc.indexOf('Visitado') + 1;
  const nombres = hoja.getRange(2, cNom, Math.max(hoja.getLastRow() - 1, 1), 1).getValues();
  for (let i = 0; i < nombres.length; i++) {
    if (String(nombres[i][0]).trim() === String(nombre).trim()) {
      if (cEst) hoja.getRange(i + 2, cEst).setValue(estado);
      if (cVis) hoja.getRange(i + 2, cVis).setValue(estado !== 'Prospecto');
      return { ok: true };
    }
  }
  return { ok: false, error: 'No encontré la tienda "' + nombre + '"' };
}

function agregarTienda_(d) {
  d.nombre = nombreConCalle_(d.nombre, d.ubicacion);
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  // Evita duplicados si el sitio reintenta: mismo nombre y (misma liga de Maps o a menos de 60 m).
  const ya = filas_(hoja).some(function (t) {
    if (norm_(t['Nombre']) !== norm_(d.nombre)) return false;
    if (d.maps && t['Maps'] === d.maps) return true;
    return d.lat && t['Lat'] && distanciaKm_(Number(d.lat), Number(d.lng), Number(t['Lat']), Number(t['Lng'])) < 0.06;
  });
  if (ya) return { ok: true, yaExistia: true };
  const valores = {
    'Prioridad': d.prioridad || 'Media', 'Zona': d.zona || '', 'Tipo': d.tipo || 'Abarrotes',
    'Nombre': d.nombre, 'Ubicación': d.ubicacion || '', 'Visitado': false,
    'Maps': d.maps || (d.lat ? 'https://www.google.com/maps/search/?api=1&query=' + d.lat + ',' + d.lng : ''),
    'Notas': d.notas || '', 'Estado': 'Prospecto', 'Lat': d.lat || '', 'Lng': d.lng || '',
  };
  hoja.appendRow(enc.map(function (c) { return c in valores ? valores[c] : ''; }));
  geocodificarFila_(hoja, enc, hoja.getLastRow());
  return { ok: true };
}

// ---------- Buscar tiendas en Google Maps (Places API) ----------
// Requiere una clave de Google Places guardada en Configuración del proyecto →
// Propiedades de la secuencia de comandos → GOOGLE_PLACES_KEY (ver README).

var CONSULTAS_GOOGLE = ['tienda de abarrotes', 'tienda', 'minisuper', 'miscelánea', 'cremería', 'mercado', 'tortillería'];
var TIPOS_GOOGLE = {
  convenience_store: 'Abarrotes', grocery_store: 'Abarrotes', food_store: 'Tienda de alimentación',
  supermarket: 'Minisúper', market: 'Mercado', butcher_shop: 'Carnicería', deli: 'Deli / gourmet',
  health_food_store: 'Tienda naturista', liquor_store: 'Vinos y licores', store: 'Tienda', tortilleria: 'Tortillería',
};
var TIPOS_UTILES = Object.keys(TIPOS_GOOGLE);
var CADENAS = /oxxo|7[\s-]?eleven|circle\s?k|kiosko|\bextra\b|go\s?mart|farmacia|walmart|costco|sam'?s|soriana|aurrer|chedraui|la comer|fresko|city market|superama|\bheb\b|mi bodega|bodega aurrera|super g\b|la michoacana/i;

function buscarCerca_(lat, lng, radio, consultas) {
  const clave = PropertiesService.getScriptProperties().getProperty('GOOGLE_PLACES_KEY');
  if (!clave) throw new Error('Falta la clave GOOGLE_PLACES_KEY en las propiedades del script');
  const existentes = filas_(SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS));
  const vistos = {};
  const salida = [];
  const dLat = radio / 111320, dLng = radio / (111320 * Math.cos(lat * Math.PI / 180));
  (consultas || CONSULTAS_GOOGLE).forEach(function (consulta) {
    let token = '';
    for (let pagina = 0; pagina < 3; pagina++) {
      const cuerpo = {
        textQuery: consulta, languageCode: 'es', regionCode: 'MX', pageSize: 20,
        // Restringido al cuadro de búsqueda: con solo "bias" Google prefiere tiendas de Guadalajara
        // y en pueblos como Tala no quedaba ninguna después de filtrar por distancia.
        locationRestriction: { rectangle: {
          low: { latitude: lat - dLat, longitude: lng - dLng },
          high: { latitude: lat + dLat, longitude: lng + dLng },
        } },
      };
      if (token) cuerpo.pageToken = token;
      const r = UrlFetchApp.fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(cuerpo),
        headers: {
          'X-Goog-Api-Key': clave,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.primaryType,places.types,places.businessStatus,nextPageToken',
        },
      });
      const d = JSON.parse(r.getContentText());
      if (d.error) throw new Error('Google Places: ' + d.error.message);
      (d.places || []).forEach(function (p) {
        if (vistos[p.id] || p.businessStatus !== 'OPERATIONAL' || !p.location) return;
        vistos[p.id] = true;
        const nombre = p.displayName ? p.displayName.text : '';
        const tipos = [p.primaryType].concat(p.types || []);
        const esTortilleria = /tortill/i.test(nombre);
        const tipo = esTortilleria ? 'tortilleria' : tipos.filter(function (t) { return TIPOS_GOOGLE[t]; })[0];
        if (!nombre || !tipo || CADENAS.test(nombre)) return;
        if (distanciaKm_(lat, lng, p.location.latitude, p.location.longitude) * 1000 > radio * 1.25) return;
        const repetida = existentes.some(function (x) {
          if (String(x.Maps || '').indexOf(p.googleMapsUri) === 0) return true;
          if (x.Lat === '' || x.Lng === '') return false;
          const metros = distanciaKm_(Number(x.Lat), Number(x.Lng), p.location.latitude, p.location.longitude) * 1000;
          return metros < 15 || (metros < 60 && norm_(x.Nombre).slice(0, 6) === norm_(nombre).slice(0, 6));
        });
        if (repetida) return;
        salida.push({
          nombre: nombre, tipo: TIPOS_GOOGLE[tipo], ubicacion: (p.formattedAddress || '').replace(/, Jal\.?,? ?(México)?$/, ''),
          lat: p.location.latitude, lng: p.location.longitude, maps: p.googleMapsUri,
        });
      });
      token = d.nextPageToken;
      if (!token) break;
    }
  });
  return salida;
}

// Recorre cada zona de la hoja y agrega las tiendas nuevas que Google conoce alrededor.
// Corta antes de los 6 min de Apps Script; si faltan zonas, vuelve a correrlo y sigue.
function buscarTiendasGoogle() {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheetByName(HOJA_TIENDAS);
  const props = PropertiesService.getScriptProperties();
  const hechas = JSON.parse(props.getProperty('ZONAS_BUSCADAS') || '[]');
  const zonas = {};
  filas_(hoja).forEach(function (t) {
    if (t.Lat === '' || t.Lng === '') return;
    const z = String(t.Zona || '').split('/')[0].trim();
    if (!z) return;
    if (!zonas[z]) zonas[z] = { lat: 0, lng: 0, n: 0 };
    zonas[z].lat += Number(t.Lat); zonas[z].lng += Number(t.Lng); zonas[z].n++;
  });
  const inicio = Date.now();
  let agregadas = 0, pendientes = 0;
  // Se recuerda cada combinación colonia + búsqueda: si agregamos otra búsqueda
  // (p. ej. "tortillería"), se corre solo esa en las colonias ya revisadas.
  // Las entradas viejas (solo el nombre de la colonia) cubren las 6 búsquedas originales.
  const ORIGINALES = ['tienda de abarrotes', 'tienda', 'minisuper', 'miscelánea', 'cremería', 'mercado'];
  const hecha = function (z, q) {
    return hechas.indexOf(z + '|' + q) !== -1 || (hechas.indexOf(z) !== -1 && ORIGINALES.indexOf(q) !== -1);
  };
  Object.keys(zonas).forEach(function (z) {
    const faltan = CONSULTAS_GOOGLE.filter(function (q) { return !hecha(z, q); });
    if (!faltan.length) return;
    if (Date.now() - inicio > 4.5 * 60 * 1000) { pendientes++; return; }
    const c = zonas[z];
    buscarCerca_(c.lat / c.n, c.lng / c.n, 1000, faltan).forEach(function (t) {
      agregarTienda_({ nombre: t.nombre, tipo: t.tipo, zona: z, ubicacion: t.ubicacion, lat: t.lat, lng: t.lng,
        maps: t.maps, prioridad: 'Media', notas: 'Encontrada en Google Maps' });
      agregadas++;
    });
    faltan.forEach(function (q) { hechas.push(z + '|' + q); });
    props.setProperty('ZONAS_BUSCADAS', JSON.stringify(hechas));
  });
  ss.toast(agregadas + ' tiendas nuevas agregadas' + (pendientes ? '. Faltan ' + pendientes + ' zonas: vuelve a correrlo.' : '. ¡Todas las zonas revisadas!'), '🌶️ Mamachita', 15);
}

// Busca tiendas alrededor de un lugar que escribas (p. ej. "Tala, Jalisco") y las agrega a la hoja.
function buscarEnLugar() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Buscar tiendas en Google', '¿Dónde? (ej. "Tala, Jalisco" o "Centro, Tlaquepaque")', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
  const lugar = r.getResponseText().trim();
  const g = Maps.newGeocoder().setRegion('mx').setLanguage('es').geocode(lugar);
  if (g.status !== 'OK' || !g.results.length) { ui.alert('No encontré "' + lugar + '" en Google Maps.'); return; }
  const loc = g.results[0].geometry.location;
  const zona = lugar.split(',')[0].trim();
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  const nuevas = buscarCerca_(loc.lat, loc.lng, 3000);
  nuevas.forEach(function (t) {
    const valores = {
      'Prioridad': 'Media', 'Zona': zona, 'Tipo': t.tipo, 'Nombre': nombreConCalle_(t.nombre, t.ubicacion),
      'Ubicación': t.ubicacion, 'Visitado': false, 'Maps': t.maps, 'Notas': 'Encontrada en Google Maps',
      'Estado': 'Prospecto', 'Lat': t.lat, 'Lng': t.lng,
    };
    hoja.appendRow(enc.map(function (c) { return c in valores ? valores[c] : ''; }));
  });
  ui.alert(nuevas.length + ' tiendas nuevas agregadas en ' + zona + '.');
}

// Para volver a buscar en todas las zonas (por ejemplo, en unos meses).
function reiniciarBusquedaGoogle() {
  PropertiesService.getScriptProperties().deleteProperty('ZONAS_BUSCADAS');
}

function distanciaKm_(a, b, c, d) {
  const r = Math.PI / 180;
  const h = Math.pow(Math.sin((c - a) * r / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin((d - b) * r / 2), 2);
  return 12742 * Math.asin(Math.sqrt(h));
}

function norm_(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ---------- Pestaña COLONIAS: resumen con fórmulas vivas y gráficas ----------

var HOJA_COLONIAS = 'COLONIAS';
var ESTADOS_RESUMEN = ['Prospecto', 'Visitado', 'Interesado', 'Activa', 'No interesado'];
var COLORES_ESTADOS = ['#9AA0AE', '#D4A017', '#2563EB', '#16A34A', '#4B5563'];

function armarColonias() {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheetByName(HOJA_COLONIAS) || ss.insertSheet(HOJA_COLONIAS);
  hoja.getCharts().forEach(function (c) { hoja.removeChart(c); });
  hoja.clear();
  if (hoja.getMaxColumns() < 16) hoja.insertColumnsAfter(hoja.getMaxColumns(), 16 - hoja.getMaxColumns());

  hoja.getRange('A1').setValue('🌶️ Mamachita · Tiendas por colonia').setFontSize(16).setFontWeight('bold').setFontColor('#B3121B');
  const cab = function (rango) { hoja.getRange(rango).setFontWeight('bold').setBackground('#B3121B').setFontColor('#FFFFFF'); };
  hoja.getRange(4, 1, 1, 8).setValues([['Colonia', 'Total'].concat(ESTADOS_RESUMEN, ['% visitado'])]);
  cab('A4:H4');
  hoja.getRange('J4:K4').setValues([['Estado', 'Tiendas']]);
  cab('J4:K4');
  hoja.getRange('M4:N4').setValues([['Tipo', 'Tiendas']]);
  cab('M4:N4');
  hoja.setFrozenRows(4);
  hoja.setColumnWidth(1, 220);
  hoja.setColumnWidth(10, 120);
  hoja.setColumnWidth(13, 190);

  actualizarColonias();
  SpreadsheetApp.flush();

  hoja.insertChart(hoja.newChart().asPieChart()
    .addRange(hoja.getRange('J4:K9')).setNumHeaders(1)
    .setTitle('Tiendas por estado').setColors(COLORES_ESTADOS).setPosition(14, 10, 0, 0)
    .setOption('width', 420).setOption('height', 300)
    .build());
  hoja.insertChart(hoja.newChart().asBarChart()
    .addRange(hoja.getRange('A4:A29')).addRange(hoja.getRange('C4:G29')).setNumHeaders(1).setStacked()
    .setTitle('Top 25 colonias (por estado)').setColors(COLORES_ESTADOS).setPosition(30, 10, 0, 0)
    .setOption('width', 620).setOption('height', 620)
    .build());
  hoja.insertChart(hoja.newChart().asColumnChart()
    .addRange(hoja.getRange('M4:N16')).setNumHeaders(1)
    .setTitle('Tiendas por tipo').setColors(['#B3121B']).setLegendPosition(Charts.Position.NONE)
    .setPosition(14, 14, 0, 0).setOption('width', 460).setOption('height', 300)
    .build());

  // Refresco automático cada hora (además de cada entrega o cambio de estado desde el mapa).
  const yaHay = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'actualizarColonias'; });
  if (!yaHay) ScriptApp.newTrigger('actualizarColonias').timeBased().everyHours(1).create();

  ss.toast('Pestaña COLONIAS lista. Se actualiza sola cada hora y con cada cambio desde el mapa.', '🌶️ Mamachita', 8);
}

// Calcula los conteos y los escribe como valores (sin fórmulas).
function actualizarColonias() {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheetByName(HOJA_COLONIAS);
  if (!hoja) return;
  const tiendas = filas_(ss.getSheetByName(HOJA_TIENDAS)).filter(function (t) { return String(t.Nombre || '').trim(); });

  const porColonia = {}, porEstado = {}, porTipo = {};
  ESTADOS_RESUMEN.forEach(function (e) { porEstado[e] = 0; });
  tiendas.forEach(function (t) {
    const colonia = String(t.Zona || '').split('/')[0].trim() || 'Sin colonia';
    const estado = ESTADOS_RESUMEN.filter(function (e) { return norm_(e) === norm_(t.Estado); })[0] || 'Prospecto';
    const tipo = String(t.Tipo || '').trim() || 'Sin tipo';
    if (!porColonia[colonia]) {
      porColonia[colonia] = { total: 0 };
      ESTADOS_RESUMEN.forEach(function (e) { porColonia[colonia][e] = 0; });
    }
    porColonia[colonia].total++;
    porColonia[colonia][estado]++;
    porEstado[estado]++;
    porTipo[tipo] = (porTipo[tipo] || 0) + 1;
  });

  const filasColonia = Object.keys(porColonia)
    .sort(function (a, b) { return porColonia[b].total - porColonia[a].total || a.localeCompare(b); })
    .map(function (c) {
      const o = porColonia[c];
      return [c, o.total].concat(ESTADOS_RESUMEN.map(function (e) { return o[e]; }), [o.total ? 1 - o.Prospecto / o.total : 0]);
    });
  const filasTipo = Object.keys(porTipo)
    .sort(function (a, b) { return porTipo[b] - porTipo[a]; })
    .map(function (t) { return [t, porTipo[t]]; });

  const ultima = Math.max(hoja.getMaxRows(), 5);
  hoja.getRange(5, 1, ultima - 4, 8).clearContent();
  hoja.getRange(5, 10, ultima - 4, 2).clearContent();
  hoja.getRange(5, 13, ultima - 4, 2).clearContent();
  if (hoja.getMaxRows() < filasColonia.length + 5) hoja.insertRowsAfter(hoja.getMaxRows(), filasColonia.length + 5 - hoja.getMaxRows());

  if (filasColonia.length) {
    hoja.getRange(5, 1, filasColonia.length, 8).setValues(filasColonia);
    hoja.getRange(5, 8, filasColonia.length, 1).setNumberFormat('0%');
  }
  const filasEstado = ESTADOS_RESUMEN.map(function (e) { return [e, porEstado[e]]; })
    .concat([['Total', tiendas.length], ['Colonias', filasColonia.length]]);
  hoja.getRange(5, 10, filasEstado.length, 2).setValues(filasEstado);
  hoja.getRange(10, 10, 1, 2).setFontWeight('bold');
  if (filasTipo.length) hoja.getRange(5, 13, filasTipo.length, 2).setValues(filasTipo);

  hoja.getRange('A2').setValue('Actualizado ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') +
    ' · ' + tiendas.length + ' tiendas en ' + filasColonia.length + ' colonias').setFontColor('#7A6455');
}

// Refresca COLONIAS después de un cambio; si falla, no afecta la respuesta al mapa.
function conResumen_(resultado) {
  try { actualizarColonias(); } catch (e) { console.warn('COLONIAS: ' + e); }
  return resultado;
}


// ---------- Nombres genéricos ("Tienda de Abarrotes") → con calle ----------

var NOMBRES_GENERICOS = [
  'tienda', 'tiendita', 'tienda de abarrotes', 'tienda de abarrote', 'tienda abarrotes', 'abarrotes', 'abarrote',
  'abarrotera', 'super abarrotes', 'miscelanea', 'minisuper', 'mini super', 'super', 'tienda de conveniencia',
  'tienda de alimentacion', 'tortilleria', 'cremeria', 'carniceria', 'fruteria', 'frutas y verduras', 'mercado',
];

function esGenerico_(nombre) {
  const n = norm_(nombre).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return NOMBRES_GENERICOS.indexOf(n) !== -1;
}

// "Calle Tamaulipas s-n, C. Tamaulipas 1139B, Observatorio, 44266 Guadalajara" → "Tamaulipas 1139B"
function calleCorta_(ubicacion) {
  const partes = String(ubicacion || '').split(',').map(function (p) { return p.trim(); }).filter(String);
  const conNumero = partes.filter(function (p) { return /\d/.test(p) && !/^\d{5}\b/.test(p); })[0];
  const calle = conNumero || partes[0] || '';
  return calle.replace(/^(calle|c\.|av\.?|avenida|calz\.?|calzada)\s+/i, '').trim();
}

function nombreConCalle_(nombre, ubicacion) {
  if (!nombre || String(nombre).indexOf(' · ') !== -1 || !esGenerico_(nombre)) return nombre;
  const calle = calleCorta_(ubicacion);
  return calle ? nombre + ' · ' + calle : nombre;
}

// Renombra las tiendas con nombre genérico. No toca las que ya tienen entregas,
// para no romper su historial en la pestaña Entregas.
function renombrarGenericas() {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  const cNom = enc.indexOf('Nombre'), cUbi = enc.indexOf('Ubicación');
  const n = hoja.getLastRow() - 1;
  if (cNom === -1 || cUbi === -1 || n < 1) return;
  const conEntregas = {};
  filas_(ss.getSheetByName(HOJA_ENTREGAS)).forEach(function (e) { conEntregas[norm_(e.Tienda)] = true; });
  const rango = hoja.getRange(2, cNom + 1, n, 1);
  const nombres = rango.getValues();
  const ubicaciones = hoja.getRange(2, cUbi + 1, n, 1).getValues();
  let cambios = 0;
  const nuevos = nombres.map(function (f, i) {
    if (conEntregas[norm_(f[0])]) return f;
    const nuevo = nombreConCalle_(f[0], ubicaciones[i][0]);
    if (nuevo !== f[0]) cambios++;
    return [nuevo];
  });
  rango.setValues(nuevos);
  ss.toast(cambios + ' nombres genéricos ahora llevan su calle.', '🌶️ Mamachita', 8);
}

// ---------- Aviso diario de reestock ----------

function revisarReestock() {
  const entregas = filas_(SpreadsheetApp.getActive().getSheetByName(HOJA_ENTREGAS));
  const ultima = {};
  entregas.forEach(function (e) {
    if (!e.Tienda) return;
    if (!ultima[e.Tienda] || e.Fecha >= ultima[e.Tienda].Fecha) ultima[e.Tienda] = e;
  });
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const lineas = [];
  Object.keys(ultima).forEach(function (t) {
    const r = ultima[t].Reestock ? fechaLocal_(ultima[t].Reestock) : null;
    if (!r) return;
    const dias = Math.round((r - hoy) / 864e5);
    if (dias < 0) lineas.push('🔴 ' + t + ' — vencido hace ' + (-dias) + ' día(s)');
    else if (dias <= DIAS_AVISO) lineas.push('🟠 ' + t + ' — toca en ' + dias + ' día(s)');
  });
  if (!lineas.length) return;
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
    '🌶️ Mamachita: ' + lineas.length + ' tienda(s) por reestockear',
    lineas.join('\n') + '\n\nHoja: ' + SpreadsheetApp.getActive().getUrl());
}

// ---------- Utilidades ----------

function encabezados_(hoja) {
  return hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
}

function filas_(hoja) {
  if (!hoja || hoja.getLastRow() < 2) return [];
  const datos = hoja.getDataRange().getValues();
  const enc = datos.shift().map(function (h) { return String(h).trim(); });
  return datos.filter(function (f) { return f.join('') !== ''; }).map(function (f) {
    const o = {};
    enc.forEach(function (h, i) {
      const v = f[i];
      o[h] = v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : v;
    });
    return o;
  });
}

function fechaLocal_(iso) {
  const p = String(iso).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}

function num_(v) {
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

var CALLBACK_ = '';
function json_(obj) {
  if (CALLBACK_) {
    return ContentService.createTextOutput(CALLBACK_ + '(' + JSON.stringify(obj) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
