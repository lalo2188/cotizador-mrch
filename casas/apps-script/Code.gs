/**
 * 🏠 Casas → Google Sheet
 * Recibe las casas que mandas con el botón ❤️ de la extensión de Chrome, las guarda en la hoja
 * "Casas", copia las fotos a Drive y calcula el tiempo en carro al CETI Colomos según el horario
 * de entrada/salida de la hoja "Horario" (que se llena desde el calendario de Google).
 *
 * Instalación: ver casas/README.md
 */

const CONFIG = {
  DESTINO: 'CETI Plantel Colomos, Nueva Escuela 1151, Lomas de Providencia, 44647 Guadalajara, Jal.',
  ZONA: 'Jalisco, México',           // se agrega a direcciones incompletas ("Colonia Chapalita")
  ZONA_HORARIA: 'America/Mexico_City',
  MINUTOS_ANTES: 40,                 // para la ida: salir de casa X minutos antes de la hora de entrada
  VOTANTES: ['Lalo', 'Esposa'],      // cámbialos por sus nombres antes de correr "Preparar hoja"
  // Carpeta de Drive donde se crea una subcarpeta con las fotos de cada casa (el ID es lo que va
  // después de /folders/ en el link de la carpeta). Si lo dejas vacío, se crea "Casas - fotos" en tu Drive.
  CARPETA_FOTOS_ID: '1TRgO15UTDh56bzfnJphdxURMMHib7bC_',
  MAX_FOTOS: 40
};

const HOJA = 'Casas';
const HOJA_HORARIO = 'Horario';
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Columnas de la hoja "Casas" (el orden aquí = orden en la hoja)
const COLS = [
  ['id', 'ID', 50],
  ['guardada', 'Guardada', 90],
  ['foto', 'Foto', 170],
  ['titulo', 'Título', 230],
  ['precio', 'Precio', 110],
  ['recamaras', 'Rec.', 45],
  ['banos', 'Baños', 50],
  ['estacionamientos', 'Estac.', 50],
  ['m2Construccion', 'm² const.', 70],
  ['m2Terreno', 'm² terreno', 75],
  ['direccion', 'Dirección / colonia', 200],
  ['ida', '🚗 Ida al CETI (min, prom.)', 95],
  ['idaMax', '🚗 Ida peor día (min)', 90],
  ['regreso', '🚗 Regreso (min, prom.)', 95],
  ['km', 'Km', 50],
  ['precision', 'Ubicación', 95],
  ['voto1', '👍 ' + CONFIG.VOTANTES[0], 80],
  ['voto2', '👍 ' + CONFIG.VOTANTES[1], 80],
  ['veredicto', 'Veredicto', 120],
  ['notas', 'Notas', 220],
  ['fuente', 'Fuente', 95],
  ['link', 'Anuncio', 80],
  ['ruta', 'Ruta', 70],
  ['carpeta', 'Fotos (Drive)', 100],
  ['descripcion', 'Descripción', 300],
  ['lat', 'Lat', 80],
  ['lng', 'Lng', 80]
];
const C = {};
COLS.forEach((c, i) => { C[c[0]] = i + 1; });
const letra_ = k => columnToLetter_(C[k]);

/* ───────────────────────── menú ───────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏠 Casas')
    .addItem('1. Preparar hoja (solo la primera vez)', 'prepararHoja')
    .addItem('2. Configurar calendario de la escuela', 'configurarCalendario')
    .addItem('3. Ver código para la extensión', 'verCodigo')
    .addSeparator()
    .addItem('Actualizar horario desde el calendario', 'actualizarHorario')
    .addItem('Recalcular tiempos (fila seleccionada)', 'recalcularSeleccionada')
    .addItem('Recalcular tiempos (todas las que falten)', 'recalcularFaltantes')
    .addToUi();
}

function prepararHoja() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CONFIG.ZONA_HORARIA);
  let sh = ss.getSheetByName(HOJA);
  if (sh && sh.getLastColumn() > 0 && sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].join('|') !== COLS.map(c => c[1]).join('|')) {
    sh.setName(HOJA + ' (versión anterior ' + Utilities.formatDate(new Date(), CONFIG.ZONA_HORARIA, 'dd-MM HH:mm') + ')');
    sh = null;
  }
  sh = sh || ss.insertSheet(HOJA, 0);

  sh.getRange(1, 1, 1, COLS.length).setValues([COLS.map(c => c[1])])
    .setFontWeight('bold').setBackground('#14161D').setFontColor('#FFFFFF').setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(C.foto);
  COLS.forEach((c, i) => sh.setColumnWidth(i + 1, c[2]));
  sh.hideColumns(C.id);

  const max = sh.getMaxRows();
  const votos = SpreadsheetApp.newDataValidation().requireValueInList(['👍', '🤔', '👎'], true).setAllowInvalid(false).build();
  sh.getRange(2, C.voto1, max - 1, 2).setDataValidation(votos).setHorizontalAlignment('center').setFontSize(16);
  sh.getRange(2, C.precio, max - 1, 1).setNumberFormat('$#,##0');
  sh.getRange(2, C.guardada, max - 1, 1).setNumberFormat('dd/mm/yy');
  sh.getRange(2, 1, max - 1, COLS.length).setVerticalAlignment('middle');
  sh.getRange(2, C.descripcion, max - 1, 1).setWrap(false);

  // Colores: fila verde si los dos dicen 👍, gris si alguien dijo 👎; tiempos verde→rojo
  const todo = sh.getRange(2, 1, max - 1, COLS.length);
  const v = '$' + letra_('veredicto') + '2';
  const ida = sh.getRange(2, C.ida, max - 1, 2);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=${v}="✅ Los dos"`).setBackground('#DCFCE7').setRanges([todo]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=${v}="❌ Nel"`).setBackground('#F3F4F6').setFontColor('#9CA3AF').setRanges([todo]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue('#86EFAC', SpreadsheetApp.InterpolationType.NUMBER, '10')
      .setGradientMidpointWithValue('#FDE68A', SpreadsheetApp.InterpolationType.NUMBER, '25')
      .setGradientMaxpointWithValue('#FCA5A5', SpreadsheetApp.InterpolationType.NUMBER, '45')
      .setRanges([ida, sh.getRange(2, C.regreso, max - 1, 1)]).build()
  ]);
  if (!sh.getFilter()) sh.getRange(1, 1, max, COLS.length).createFilter();

  const hh = ss.getSheetByName(HOJA_HORARIO) || ss.insertSheet(HOJA_HORARIO);
  if (hh.getLastRow() === 0) {
    hh.getRange(1, 1, 1, 3).setValues([['Día', 'Entrada', 'Salida']]).setFontWeight('bold');
    hh.getRange('E1').setValue('Se llena con "🏠 Casas → Actualizar horario desde el calendario". También puedes escribirlo a mano (formato 07:00).');
  }
  const def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 2) ss.deleteSheet(def);

  token_(); // genera el código secreto
  SpreadsheetApp.getUi().alert('Listo ✅\n\nSigue: "2. Configurar calendario de la escuela" y luego publica el script (ver README).');
}

function configurarCalendario() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Calendario de la escuela',
    'Pega la "Dirección secreta en formato iCal" del calendario (termina en .ics):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = r.getResponseText().trim();
  if (!/^https:\/\/.+\.ics(\?.*)?$/.test(url)) return ui.alert('Esa URL no parece de un calendario .ics');
  PropertiesService.getScriptProperties().setProperty('ICS_URL', url);
  actualizarHorario();
}

function verCodigo() {
  SpreadsheetApp.getUi().alert('Código secreto para la extensión:\n\n' + token_() +
    '\n\nCópialo en la extensión (clic en su ícono) junto con la URL /exec del script publicado.');
}

function token_() {
  const p = PropertiesService.getScriptProperties();
  let t = p.getProperty('TOKEN');
  if (!t) { t = Utilities.getUuid().replace(/-/g, '').slice(0, 16); p.setProperty('TOKEN', t); }
  return t;
}

/* ───────────────────────── web app (lo que llama la extensión) ───────────────────────── */

function doGet(e) {
  if ((e.parameter.token || '') !== token_()) return json_({ ok: false, error: 'Código secreto incorrecto' });
  return json_({ ok: true, mensaje: 'Sheet "' + SpreadsheetApp.getActive().getName() + '"', sheetUrl: SpreadsheetApp.getActive().getUrl() });
}

function doPost(e) {
  let casa;
  try { casa = JSON.parse(e.postData.contents); } catch (_) { return json_({ ok: false, error: 'JSON inválido' }); }
  if (casa.token !== token_()) return json_({ ok: false, error: 'Código secreto incorrecto (menú 🏠 Casas → Ver código)' });

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(HOJA);
  if (!sh) return json_({ ok: false, error: 'Falta correr "🏠 Casas → Preparar hoja"' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let fila, id;
  try {
    const clave = urlClave_(casa.url);
    const n = sh.getLastRow();
    if (n > 1) {
      const links = sh.getRange(2, C.link, n - 1, 1).getRichTextValues().map(r => urlClave_(r[0] && r[0].getLinkUrl()));
      const i = links.indexOf(clave);
      if (i >= 0) return json_({ ok: true, duplicada: true, fila: i + 2, sheetUrl: ss.getUrl() });
    }
    fila = n + 1;
    id = n > 1 ? Math.max(0, ...sh.getRange(2, C.id, n - 1, 1).getValues().map(r => +r[0] || 0)) + 1 : 1;

    const fila_ = new Array(COLS.length).fill('');
    const set = (k, v) => { fila_[C[k] - 1] = v === undefined || v === null ? '' : v; };
    set('id', id);
    set('guardada', new Date());
    set('titulo', casa.titulo);
    set('precio', numero_(casa.precio));
    set('recamaras', numero_(casa.recamaras));
    set('banos', numero_(casa.banos));
    set('estacionamientos', numero_(casa.estacionamientos));
    set('m2Construccion', numero_(casa.m2Construccion));
    set('m2Terreno', numero_(casa.m2Terreno));
    set('direccion', casa.direccion);
    set('notas', casa.notas);
    set('fuente', casa.fuente + (casa.moneda === 'USD' ? ' (precio en USD)' : ''));
    set('veredicto', veredicto_('', ''));
    set('descripcion', (casa.descripcion || '').slice(0, 45000));
    set('lat', numero_(casa.lat));
    set('lng', numero_(casa.lng));
    // Las celdas de texto se escriben como texto (evita que "=algo" o "+52…" se vuelvan fórmula)
    ['titulo', 'direccion', 'notas', 'descripcion'].forEach(k => {
      const s = String(fila_[C[k] - 1] || '');
      if (/^[=+\-@]/.test(s)) fila_[C[k] - 1] = "'" + s;
    });
    sh.getRange(fila, 1, 1, COLS.length).setValues([fila_]);
    link_(sh.getRange(fila, C.link), '🔗 Ver anuncio', casa.url);
    sh.setRowHeight(fila, 110);
  } finally {
    lock.releaseLock();
  }

  // Lo lento va fuera del candado: fotos y tiempos
  const avisos = [];
  try { ponerFotos_(sh, fila, id, casa); } catch (err) { avisos.push('Fotos: ' + err.message); }
  let tiempos = null;
  try { tiempos = calcularFila_(sh, fila); } catch (err) { avisos.push('Tiempo al CETI: ' + err.message); }

  return json_({ ok: true, fila, tiempos, aviso: avisos.join(' · '), sheetUrl: ss.getUrl() });
}

/* ───────────────────────── fotos ───────────────────────── */

function ponerFotos_(sh, fila, id, casa) {
  const fotos = (casa.fotos || []).filter(u => /^https?:\/\//.test(u)).slice(0, CONFIG.MAX_FOTOS);
  if (!fotos.length) return;

  // Descarga las fotos (los links de Facebook caducan; por eso se copian a Drive)
  const pedidas = fotos.map(url => ({
    url, muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: casa.url || '' }
  }));
  const blobs = UrlFetchApp.fetchAll(pedidas).map((r, i) => {
    const h = r.getHeaders();
    const tipo = String(h['Content-Type'] || h['content-type'] || '');
    if (r.getResponseCode() !== 200 || !/^image\//.test(tipo)) return null;
    const ext = tipo.includes('png') ? 'png' : tipo.includes('webp') ? 'webp' : 'jpg';
    return r.getBlob().setName(`foto-${String(i + 1).padStart(2, '0')}.${ext}`);
  }).filter(Boolean);
  if (!blobs.length) throw new Error('no se pudo descargar ninguna foto');

  // Una carpeta por casa dentro de la carpeta de fotos
  const nombre = `${id} - ${(casa.titulo || 'casa').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)}`;
  const carpeta = carpetaFotos_().createFolder(nombre);
  blobs.forEach(b => carpeta.createFile(b));
  carpeta.createFile('datos del anuncio.txt', [
    casa.titulo, casa.url, '', 'Precio: ' + (casa.precio || '—'), 'Dirección: ' + (casa.direccion || '—'), '',
    casa.descripcion || ''
  ].join('\n'), MimeType.PLAIN_TEXT);
  link_(sh.getRange(fila, C.carpeta), `📷 ${blobs.length} fotos`, carpeta.getUrl());

  // Miniatura dentro de la celda (queda guardada en el Sheet aunque borren el anuncio)
  const chica = blobs.find(b => b.getBytes().length < 1.5e6 && !/webp/.test(b.getContentType()));
  if (chica) {
    try {
      const img = SpreadsheetApp.newCellImage()
        .setSourceUrl('data:' + chica.getContentType() + ';base64,' + Utilities.base64Encode(chica.getBytes()))
        .setAltTextTitle(casa.titulo || 'Casa').build();
      sh.getRange(fila, C.foto).setValue(img);
    } catch (_) { /* sin miniatura; las fotos quedan en la carpeta */ }
  }
}

function carpetaFotos_() {
  if (CONFIG.CARPETA_FOTOS_ID) {
    try { return DriveApp.getFolderById(CONFIG.CARPETA_FOTOS_ID); } catch (_) { /* sin acceso: usa la de respaldo */ }
  }
  const it = DriveApp.getRootFolder().getFoldersByName('Casas - fotos');
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder('Casas - fotos');
}

/* ───────────────────────── tiempos al CETI ───────────────────────── */

function recalcularSeleccionada() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA);
  const fila = sh.getActiveRange().getRow();
  if (fila < 2) return SpreadsheetApp.getUi().alert('Selecciona una celda de la casa que quieres recalcular.');
  try {
    const t = calcularFila_(sh, fila, true);
    SpreadsheetApp.getActive().toast(`Ida ~${t.ida} min · regreso ~${t.regreso} min`, 'Fila ' + fila);
  } catch (err) {
    SpreadsheetApp.getUi().alert('No se pudo: ' + err.message);
  }
}

function recalcularFaltantes() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA);
  const n = sh.getLastRow();
  let ok = 0, mal = 0;
  for (let f = 2; f <= n; f++) {
    if (sh.getRange(f, C.ida).getValue() !== '') continue;
    try { calcularFila_(sh, f); ok++; } catch (_) { mal++; }
  }
  SpreadsheetApp.getActive().toast(`${ok} calculadas, ${mal} con error`, 'Tiempos al CETI');
}

/**
 * Calcula ida (saliendo MINUTOS_ANTES antes de cada entrada) y regreso (saliendo del CETI a la hora de salida)
 * para cada día de la hoja Horario, con el tráfico estimado del próximo día así.
 * desdeDireccion = true ignora Lat/Lng guardados y vuelve a ubicar con la columna Dirección.
 */
function calcularFila_(sh, fila, desdeDireccion) {
  const horario = leerHorario_();
  if (!horario.length) throw new Error('la hoja "Horario" está vacía (menú 🏠 Casas → Actualizar horario)');

  const get = k => sh.getRange(fila, C[k]).getValue();
  let lat = get('lat'), lng = get('lng'), precision;
  if (desdeDireccion || !lat || !lng) {
    const dir = String(get('direccion') || '').trim();
    if (!dir) throw new Error('la casa no tiene dirección');
    const consulta = /jal(isco)?\b|guadalajara|zapopan|tlaquepaque|tonal[aá]|tlajomulco/i.test(dir) ? dir + ', México' : dir + ', ' + CONFIG.ZONA;
    const g = Maps.newGeocoder().setRegion('mx').setLanguage('es').geocode(consulta);
    if (!g.results || !g.results.length) throw new Error('Google Maps no encontró "' + dir + '"');
    const res = g.results[0];
    lat = res.geometry.location.lat; lng = res.geometry.location.lng;
    precision = res.geometry.location_type === 'ROOFTOP' || res.types.indexOf('street_address') >= 0 ? '📍 Exacta' : '≈ Aprox. (colonia)';
    sh.getRange(fila, C.lat, 1, 2).setValues([[lat, lng]]);
  } else {
    precision = '📍 Exacta (del anuncio)';
  }
  const origen = lat + ',' + lng;

  const idas = [], regresos = [], detalle = [];
  let km = null;
  horario.forEach(h => {
    let linea = DIAS[h.dia] + ':';
    if (h.entrada) {
      const salida = new Date(proximaFecha_(h.dia, h.entrada).getTime() - CONFIG.MINUTOS_ANTES * 60000);
      const r = manejar_(origen, CONFIG.DESTINO, salida);
      idas.push(r.min); km = r.km;
      linea += ` ida ${r.min} min (entra ${h.entrada})`;
    }
    if (h.salida) {
      const r = manejar_(CONFIG.DESTINO, origen, proximaFecha_(h.dia, h.salida));
      regresos.push(r.min);
      linea += ` · regreso ${r.min} min (sale ${h.salida})`;
    }
    detalle.push(linea);
  });

  const prom = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : '';
  const t = { ida: prom(idas), idaMax: idas.length ? Math.max(...idas) : '', regreso: prom(regresos) };
  sh.getRange(fila, C.ida, 1, 5).setValues([[t.ida, t.idaMax, t.regreso, km != null ? Math.round(km * 10) / 10 : '', precision]]);
  sh.getRange(fila, C.ida).setNote('Con tráfico estimado por Google Maps (ida saliendo ' + CONFIG.MINUTOS_ANTES + ' min antes de la entrada):\n' + detalle.join('\n'));
  const ruta = `https://www.google.com/maps/dir/?api=1&origin=${origen}&destination=${encodeURIComponent(CONFIG.DESTINO)}&travelmode=driving`;
  link_(sh.getRange(fila, C.ruta), '🗺️ Ver ruta', ruta);
  return t;
}

function manejar_(origen, destino, salida) {
  const d = Maps.newDirectionFinder()
    .setOrigin(origen).setDestination(destino)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .setDepart(salida)
    .setLanguage('es').setRegion('mx')
    .getDirections();
  if (!d.routes || !d.routes.length) throw new Error('Maps no encontró ruta (' + d.status + ')');
  const leg = d.routes[0].legs[0];
  const seg = (leg.duration_in_traffic || leg.duration).value;
  return { min: Math.round(seg / 60), km: leg.distance.value / 1000 };
}

/** Próxima fecha (a futuro) de ese día de la semana (1=lunes) a esa hora "HH:mm", en hora de Guadalajara. */
function proximaFecha_(dia, hhmm) {
  const tz = CONFIG.ZONA_HORARIA, ahora = new Date();
  const hoy = +Utilities.formatDate(ahora, tz, 'u');
  const faltan = ((dia - hoy + 7) % 7) || 7; // siempre a futuro (Maps solo estima tráfico a futuro)
  const fecha = Utilities.formatDate(new Date(ahora.getTime() + faltan * 86400000), tz, 'yyyy-MM-dd');
  const offset = Utilities.formatDate(ahora, tz, 'XXX'); // -06:00
  return new Date(`${fecha}T${hhmm}:00${offset}`);
}

/* ───────────────────────── horario (calendario .ics) ───────────────────────── */

function leerHorario_() {
  const hh = SpreadsheetApp.getActive().getSheetByName(HOJA_HORARIO);
  if (!hh || hh.getLastRow() < 2) return [];
  const hora = v => {
    if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'HH:mm');
    const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
  };
  return hh.getRange(2, 1, hh.getLastRow() - 1, 3).getValues()
    .map(r => ({ dia: DIAS.indexOf(String(r[0]).trim()), entrada: hora(r[1]), salida: hora(r[2]) }))
    .filter(h => h.dia > 0 && (h.entrada || h.salida));
}

function actualizarHorario() {
  const url = PropertiesService.getScriptProperties().getProperty('ICS_URL');
  const ui = SpreadsheetApp.getUi();
  if (!url) return ui.alert('Primero: 🏠 Casas → Configurar calendario de la escuela');
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return ui.alert('No pude leer el calendario (código ' + r.getResponseCode() + ')');
  const horario = horarioDesdeIcs(r.getContentText(), new Date(), CONFIG.ZONA_HORARIA);
  if (!horario.length) return ui.alert('No encontré clases en el calendario. Llena la hoja "Horario" a mano (Día, Entrada, Salida).');

  const hh = SpreadsheetApp.getActive().getSheetByName(HOJA_HORARIO) || SpreadsheetApp.getActive().insertSheet(HOJA_HORARIO);
  hh.getRange(2, 1, Math.max(hh.getMaxRows() - 1, 1), 3).clearContent();
  hh.getRange(1, 1, 1, 3).setValues([['Día', 'Entrada', 'Salida']]).setFontWeight('bold');
  hh.getRange(2, 2, horario.length, 2).setNumberFormat('@'); // horas como texto "07:00"
  hh.getRange(2, 1, horario.length, 3).setValues(horario.map(h => [DIAS[h.dia], h.entrada, h.salida]));
  ui.alert('Horario actualizado:\n\n' + horario.map(h => `${DIAS[h.dia]}: entra ${h.entrada || '—'}, sale ${h.salida || '—'}`).join('\n') +
    '\n\nSi algo no cuadra, corrígelo a mano en la hoja "Horario".');
}

/**
 * Lee un .ics y regresa por día de la semana la hora de entrada (la más temprana) y de salida (la más tarde).
 * Entiende dos formas de capturarlo:
 *  - un evento que va de la entrada a la salida (ej. "Escuela" 07:00–13:30)
 *  - eventos separados llamados "Entrada …" y "Salida …"
 * Toma eventos que se repiten (RRULE semanal) vigentes y eventos sueltos de -60 a +120 días.
 * Es función "pura" (sin servicios de Google) para poder probarla fuera de Apps Script.
 */
function horarioDesdeIcs(ics, hoy, tz) {
  const lineas = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const eventos = [];
  let ev = null;
  lineas.forEach(l => {
    if (l === 'BEGIN:VEVENT') ev = {};
    else if (l === 'END:VEVENT') { if (ev) eventos.push(ev); ev = null; }
    else if (ev) {
      const i = l.indexOf(':');
      if (i < 0) return;
      const [nombre, ...params] = l.slice(0, i).split(';');
      ev[nombre.toUpperCase()] = { valor: l.slice(i + 1), params: params.join(';') };
    }
  });

  const DIA_ICS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
  const offsetMin = zona => { // minutos a sumar a UTC para tener hora local (sin horario de verano en Gdl desde 2022)
    if (typeof Utilities !== 'undefined') {
      const o = Utilities.formatDate(hoy, zona, 'XXX').match(/([+-])(\d{2}):(\d{2})/);
      return (o[1] === '-' ? -1 : 1) * (+o[2] * 60 + +o[3]);
    }
    return -360;
  };
  const OFF = offsetMin(tz);

  // → { fecha: Date (para comparar), dia: 1-7, hora: "HH:mm" } en hora local; null si es de todo el día
  const leer = prop => {
    if (!prop || /VALUE=DATE(?!-)/.test(prop.params) || !/T/.test(prop.valor)) return null;
    const m = prop.valor.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)/);
    if (!m) return null;
    let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    if (m[7] === 'Z') t += OFF * 60000; // UTC → local; si trae TZID o es "flotante" ya es hora local
    const d = new Date(t);
    const dia = ((d.getUTCDay() + 6) % 7) + 1;
    const hora = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    return { fecha: new Date(t - OFF * 60000), dia, hora };
  };

  const porDia = {};
  const agrega = (dia, tipo, hora) => {
    porDia[dia] = porDia[dia] || { entradas: [], salidas: [] };
    porDia[dia][tipo].push(hora);
  };
  const DIA_MS = 86400000;

  eventos.forEach(e => {
    if (e.STATUS && /CANCELLED/i.test(e.STATUS.valor)) return;
    const ini = leer(e.DTSTART);
    if (!ini) return;
    const fin = leer(e.DTEND);
    const titulo = (e.SUMMARY && e.SUMMARY.valor || '').toLowerCase();
    const rrule = e.RRULE && e.RRULE.valor;
    let dias;
    if (rrule) {
      const hasta = (rrule.match(/UNTIL=(\d{8}(T\d{6}Z?)?)/) || [])[1];
      if (hasta) {
        const u = hasta.length === 8 ? hasta + 'T235959Z' : hasta;
        const fu = new Date(Date.UTC(+u.slice(0, 4), +u.slice(4, 6) - 1, +u.slice(6, 8), +u.slice(9, 11), +u.slice(11, 13)));
        if (fu < hoy) return; // ya terminó
      }
      if (!/FREQ=(WEEKLY|DAILY)/.test(rrule)) return;
      const by = (rrule.match(/BYDAY=([A-Z,0-9+-]+)/) || [])[1];
      dias = by ? by.split(',').map(x => DIA_ICS[x.slice(-2)]).filter(Boolean)
        : /FREQ=DAILY/.test(rrule) ? [1, 2, 3, 4, 5] : [ini.dia];
    } else {
      const dt = (ini.fecha - hoy) / DIA_MS;
      if (dt < -60 || dt > 120) return;
      dias = [ini.dia];
    }

    dias.forEach(dia => {
      if (/salida|recoger/.test(titulo) && !/entrada/.test(titulo)) agrega(dia, 'salidas', ini.hora);
      else if (/entrada|llevar/.test(titulo) && !/salida/.test(titulo)) agrega(dia, 'entradas', ini.hora);
      else {
        agrega(dia, 'entradas', ini.hora);
        if (fin && fin.hora !== ini.hora) agrega(dia, 'salidas', fin.hora);
      }
    });
  });

  return Object.keys(porDia).map(Number).sort().map(dia => {
    const moda = arr => { // la hora más común; en empate, la más temprana/tarde según se pida
      const c = {}; arr.forEach(h => { c[h] = (c[h] || 0) + 1; });
      return Object.keys(c).sort((a, b) => c[b] - c[a] || a.localeCompare(b))[0] || '';
    };
    const ent = porDia[dia].entradas.slice().sort(), sal = porDia[dia].salidas.slice().sort();
    return { dia, entrada: ent.length ? (ent.length > 1 ? moda(ent) : ent[0]) : '', salida: sal.length ? (sal.length > 1 ? moda(sal) : sal[0]) : '' };
  });
}

/* ───────────────────────── utilidades ───────────────────────── */

/** Texto con link (sin fórmulas: =HYPERLINK falla si el Sheet está en otro idioma/región) */
function link_(rango, texto, url) {
  rango.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(texto).setLinkUrl(url).build());
}

function veredicto_(a, b) {
  if (a === '👍' && b === '👍') return '✅ Los dos';
  if (a === '👎' || b === '👎') return '❌ Nel';
  if (!a || !b) return '⏳ Falta votar';
  return '🤔 Platicarlo';
}

/** Al votar (tú o tu esposa) se actualiza el Veredicto. Es un activador simple: no hay que configurar nada. */
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== HOJA) return;
  const f1 = e.range.getRow(), f2 = e.range.getLastRow();
  const c1 = e.range.getColumn(), c2 = e.range.getLastColumn();
  if (f2 < 2 || c2 < C.voto1 || c1 > C.voto2) return;
  const desde = Math.max(f1, 2);
  const votos = sh.getRange(desde, C.voto1, f2 - desde + 1, 2).getValues();
  sh.getRange(desde, C.veredicto, votos.length, 1).setValues(votos.map(v => [veredicto_(v[0], v[1])]));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function numero_(v) {
  if (v === '' || v == null) return '';
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return isFinite(n) ? n : '';
}

/** Para detectar duplicados: Facebook por id de artículo; los demás sin parámetros de rastreo. */
function urlClave_(u) {
  if (!u) return '';
  const fb = String(u).match(/marketplace\/item\/(\d+)/);
  if (fb) return 'fb:' + fb[1];
  return String(u).split('#')[0].split('?')[0].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase();
}

function columnToLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

if (typeof module !== 'undefined') module.exports = { horarioDesdeIcs, urlClave_, numero_ }; // pruebas en Node
