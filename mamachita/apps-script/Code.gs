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

  geocodificar();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌶️ Mamachita')
    .addItem('Sacar coordenadas faltantes', 'geocodificar')
    .addItem('Revisar reestocks (correo)', 'revisarReestock')
    .addItem('Configurar (una sola vez)', 'configurar')
    .addToUi();
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

function doGet() {
  const ss = SpreadsheetApp.getActive();
  return json_({
    ok: true,
    tiendas: filas_(ss.getSheetByName(HOJA_TIENDAS)),
    entregas: filas_(ss.getSheetByName(HOJA_ENTREGAS)),
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (PIN && String(d.pin) !== PIN) return json_({ ok: false, error: 'PIN incorrecto' });
    if (d.accion === 'entrega') return json_(registrarEntrega_(d));
    if (d.accion === 'estado') return json_(cambiarEstado_(d.tienda, d.estado));
    if (d.accion === 'tienda') return json_(agregarTienda_(d));
    return json_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
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
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const enc = encabezados_(hoja);
  const valores = {
    'Prioridad': d.prioridad || 'Media', 'Zona': d.zona || '', 'Tipo': d.tipo || 'Abarrotes',
    'Nombre': d.nombre, 'Ubicación': d.ubicacion || '', 'Visitado': false,
    'Maps': d.lat ? 'https://www.google.com/maps/search/?api=1&query=' + d.lat + ',' + d.lng : '',
    'Notas': d.notas || '', 'Estado': 'Prospecto', 'Lat': d.lat || '', 'Lng': d.lng || '',
  };
  hoja.appendRow(enc.map(function (c) { return c in valores ? valores[c] : ''; }));
  geocodificarFila_(hoja, enc, hoja.getLastRow());
  return { ok: true };
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
