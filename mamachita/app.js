(function () {
  'use strict';

  const CFG = window.MAMACHITA_CONFIG;
  const GDL = [20.6736, -103.3700];
  const ESTADOS = {
    vencido:   { nombre: 'Reestock vencido', color: 'var(--s-vencido)', hex: '#DC2626', icono: '!' , orden: 0 },
    pronto:    { nombre: 'Reestock pronto',  color: 'var(--s-pronto)',  hex: '#F59E0B', icono: '', orden: 1 },
    stock:     { nombre: 'Con producto',     color: 'var(--s-stock)',   hex: '#16A34A', icono: '✓', orden: 2 },
    visitado:  { nombre: 'Visitada',         color: 'var(--s-visitado)',hex: '#D4A017', icono: '•', orden: 3 },
    prospecto: { nombre: 'Prospecto',        color: 'var(--s-prospecto)',hex: '#9AA0AE', icono: '', orden: 4 },
    rechazo:   { nombre: 'No interesada',    color: 'var(--s-rechazo)', hex: '#4B5563', icono: '✕', orden: 5 },
  };
  const ACTIVOS = ['vencido', 'pronto', 'stock'];
  const ESTADOS_MANUALES = ['Prospecto', 'Visitado', 'Interesado', 'Activa', 'No interesado'];
  const NIVELES = [
    [0, 'Antojito'], [1, 'Salsera de barrio'], [3, 'Picosita'], [6, 'Jefa de colonia'],
    [10, 'Reina del mercado'], [15, 'Capo del chile'], [25, 'Leyenda tapatía'], [40, 'Mamachita suprema'],
  ];
  const PRIORIDAD_ORDEN = { alta: 0, media: 1, baja: 2 };

  const st = {
    tiendas: [], entregas: [], fuente: '',
    filtroEstados: new Set(Object.keys(ESTADOS)),
    ruta: leerLocal('mm-ruta', []),
    yo: null,
    marcadores: new Map(),
    territorioVisible: true,
    puntoNuevo: null,
  };

  // ---------- Utilidades ----------
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  const dinero = (n) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function leerLocal(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }

  function hoyISO() { const d = new Date(); return iso(d); }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fecha(isoStr) { const p = String(isoStr).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function sumarDias(isoStr, dias) { const d = fecha(isoStr); d.setDate(d.getDate() + dias); return iso(d); }
  function diasHasta(isoStr) { return Math.round((fecha(isoStr) - fecha(hoyISO())) / 864e5); }
  function fechaCorta(isoStr) { return isoStr ? fecha(isoStr).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'; }
  function aISO(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return iso(v);
    const s = String(v).trim();
    let m = s.match(/^Date\((\d+),(\d+),(\d+)/);
    if (m) return iso(new Date(+m[1], +m[2], +m[3]));
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(new Date(+m[1], +m[2] - 1, +m[3]));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) return iso(new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]));
    return '';
  }
  function campo(fila, ...nombres) {
    for (const n of nombres) {
      const k = Object.keys(fila).find((x) => norm(x) === norm(n));
      if (k !== undefined && fila[k] !== null && fila[k] !== '') return fila[k];
    }
    return '';
  }
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms || 2600);
  }
  function distanciaKm(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const zonaBase = (z) => String(z || 'Sin zona').split('/')[0].trim() || 'Sin zona';

  // ---------- Carga de datos ----------
  async function leerGviz(hoja) {
    const url = 'https://docs.google.com/spreadsheets/d/' + CFG.SHEET_ID + '/gviz/tq?tqx=out:json&headers=1&sheet=' + encodeURIComponent(hoja);
    const txt = await (await fetch(url)).text();
    const datos = JSON.parse(txt.slice(txt.indexOf('(') + 1, txt.lastIndexOf(')')));
    if (datos.status === 'error') throw new Error(datos.errors && datos.errors[0] && datos.errors[0].detailed_message);
    const cols = datos.table.cols.map((c) => (c.label || '').trim());
    return datos.table.rows.map((r) => {
      const o = {};
      cols.forEach((c, i) => {
        const celda = r.c[i];
        if (!c) return;
        o[c] = celda == null ? '' : (celda.v instanceof Object ? celda.f : celda.v);
        if (celda && typeof celda.v === 'string' && celda.v.startsWith('Date(')) o[c] = celda.v;
      });
      return o;
    });
  }

  async function cargar() {
    estadoCarga('Leyendo la hoja…');
    let crudo = null;
    if (CFG.SCRIPT_URL) {
      try {
        const d = await (await fetch(CFG.SCRIPT_URL)).json();
        if (d.ok) { crudo = { tiendas: d.tiendas, entregas: d.entregas }; st.fuente = 'script'; }
      } catch (e) { console.warn('Apps Script no respondió, uso lectura directa', e); }
    }
    if (!crudo) {
      try {
        const tiendas = await leerGviz(CFG.HOJA_TIENDAS);
        let entregas = [];
        try {
          const e = await leerGviz(CFG.HOJA_ENTREGAS);
          // Si la pestaña no existe, Google devuelve la primera hoja: lo detectamos por las columnas.
          if (e.length && 'Tienda' in e[0]) entregas = e;
        } catch (err) { /* aún no hay pestaña Entregas */ }
        crudo = { tiendas, entregas }; st.fuente = 'hoja';
      } catch (e) {
        console.error(e);
        estadoCarga('');
        toast('No pude leer la hoja. ¿Está compartida como "cualquiera con el enlace"?', 6000);
        return;
      }
    }
    st.tiendas = crudo.tiendas.map(normalizarTienda).filter((t) => t.nombre);
    st.entregas = crudo.entregas.map(normalizarEntrega).filter((e) => e.tienda && e.fecha);
    calcularEstados();
    pintarTodo();
    estadoCarga('');
    geocodificarFaltantes();
  }

  function normalizarTienda(f, i) {
    const t = {
      id: i,
      nombre: String(campo(f, 'Nombre')).trim(),
      zona: String(campo(f, 'Zona')).trim(),
      tipo: String(campo(f, 'Tipo')).trim(),
      prioridad: String(campo(f, 'Prioridad')).trim() || 'Media',
      ubicacion: String(campo(f, 'Ubicación', 'Ubicacion', 'Dirección')).trim(),
      visitado: ['true', 'si', 'sí', 'x', '1'].includes(norm(campo(f, 'Visitado'))),
      maps: String(campo(f, 'Maps')).trim(),
      notas: String(campo(f, 'Notas')).trim(),
      estadoManual: String(campo(f, 'Estado')).trim(),
      lat: num(campo(f, 'Lat')) || null,
      lng: num(campo(f, 'Lng', 'Lon')) || null,
    };
    if (!t.lat) {
      const m = t.maps.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.maps.match(/query=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/);
      if (m) { t.lat = +m[1]; t.lng = +m[2]; }
    }
    if (!t.lat) {
      const c = leerLocal('mm-geo:' + t.ubicacion, null);
      if (c) { t.lat = c[0]; t.lng = c[1]; t.aprox = true; }
    }
    return t;
  }

  function normalizarEntrega(f) {
    const fechaE = aISO(campo(f, 'Fecha'));
    const cantidades = {};
    CFG.SABORES.forEach((s) => { cantidades[s.id] = num(campo(f, s.columna)); });
    const quedaban = campo(f, 'Quedaban');
    return {
      fecha: fechaE,
      tienda: String(campo(f, 'Tienda')).trim(),
      cantidades,
      total: Object.values(cantidades).reduce((a, b) => a + b, 0),
      precio: campo(f, 'Precio') === '' ? null : num(campo(f, 'Precio')),
      reestock: aISO(campo(f, 'Reestock')) || (fechaE ? sumarDias(fechaE, CFG.DIAS_REESTOCK) : ''),
      quedaban: quedaban === '' ? null : num(quedaban),
      notas: String(campo(f, 'Notas')),
    };
  }

  function calcularEstados() {
    const porTienda = new Map();
    st.entregas.forEach((e) => {
      const k = norm(e.tienda);
      if (!porTienda.has(k)) porTienda.set(k, []);
      porTienda.get(k).push(e);
    });
    porTienda.forEach((lista) => lista.sort((a, b) => a.fecha.localeCompare(b.fecha)));
    st.tiendas.forEach((t) => {
      t.entregas = porTienda.get(norm(t.nombre)) || [];
      t.ultima = t.entregas[t.entregas.length - 1] || null;
      const em = norm(t.estadoManual);
      if (em === 'no interesado') t.estado = 'rechazo';
      else if (t.ultima) {
        t.dias = diasHasta(t.ultima.reestock);
        t.estado = t.dias < 0 ? 'vencido' : t.dias <= CFG.DIAS_AVISO ? 'pronto' : 'stock';
      } else if (em === 'activa') t.estado = 'stock';
      else if (t.visitado || em === 'visitado' || em === 'interesado') t.estado = 'visitado';
      else t.estado = 'prospecto';
    });
  }

  // Coordenadas de respaldo con OpenStreetMap para filas que aún no tienen Lat/Lng.
  // Lo ideal es que el Apps Script las escriba en la hoja (más precisas y para siempre).
  async function geocodificarFaltantes() {
    const faltan = st.tiendas.filter((t) => !t.lat && t.ubicacion);
    if (!faltan.length || st.geocodificando) return;
    st.geocodificando = true;
    for (let i = 0; i < faltan.length; i++) {
      const t = faltan[i];
      estadoCarga('Ubicando tiendas en el mapa ' + (i + 1) + '/' + faltan.length + '…');
      const consultas = [t.ubicacion + ', Jalisco, México', zonaBase(t.zona) + ', ' + t.ubicacion.split(',').slice(-1)[0] + ', Jalisco, México'];
      for (const q of consultas) {
        try {
          const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'es' } });
          const d = await r.json();
          if (d[0]) {
            t.lat = +d[0].lat; t.lng = +d[0].lon; t.aprox = true;
            guardarLocal('mm-geo:' + t.ubicacion, [t.lat, t.lng]);
            break;
          }
        } catch (e) { /* sin red, seguimos */ }
        await new Promise((r) => setTimeout(r, 1100));
      }
      await new Promise((r) => setTimeout(r, 1100));
      if (t.lat) pintarMapa();
    }
    st.geocodificando = false;
    estadoCarga('');
    pintarTodo();
    if (primerEncuadre) { encuadrar(); primerEncuadre = false; }
  }

  function estadoCarga(msg) { const el = $('#estado-carga'); el.textContent = msg; el.classList.toggle('on', !!msg); }

  // ---------- Mapa ----------
  const mapa = L.map('mapa', { zoomControl: false }).setView(GDL, 12);
  L.control.zoom({ position: 'topleft' }).addTo(mapa);
  const fondos = {
    'Calles': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }),
    'Calles (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri',
    }),
    'Satélite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Tiles &copy; Esri',
    }),
  };
  const fondoGuardado = leerLocal('mm-fondo', 'Calles');
  (fondos[fondoGuardado] || fondos['Calles']).addTo(mapa);
  L.control.layers(fondos, null, { position: 'topleft' }).addTo(mapa);
  mapa.on('baselayerchange', (e) => guardarLocal('mm-fondo', e.name));
  const capaTerritorio = L.layerGroup().addTo(mapa);
  const capaPines = L.layerGroup().addTo(mapa);
  const capaRuta = L.layerGroup().addTo(mapa);
  let marcaYo = null, marcaNueva = null, primerEncuadre = true;

  function icono(t) {
    const e = ESTADOS[t.estado];
    return L.divIcon({
      className: 'leaflet-div-icon limpio',
      html: '<div class="pin s-' + t.estado + ' p-' + norm(t.prioridad) + '" style="background:' + e.hex + '"><span style="color:#fff">' + e.icono + '</span></div>',
      iconSize: [26, 26], iconAnchor: [13, 30],
    });
  }

  function visibles() {
    const texto = norm($('#f-texto').value), zona = $('#f-zona').value, prio = norm($('#f-prioridad').value);
    return st.tiendas.filter((t) => st.filtroEstados.has(t.estado)
      && (!zona || zonaBase(t.zona) === zona)
      && (!prio || norm(t.prioridad) === prio)
      && (!texto || norm(t.nombre + ' ' + t.zona + ' ' + t.ubicacion + ' ' + t.tipo + ' ' + t.notas).includes(texto)));
  }

  function pintarMapa() {
    capaPines.clearLayers(); capaTerritorio.clearLayers(); st.marcadores.clear();
    const lista = visibles();
    lista.forEach((t) => {
      if (!t.lat) return;
      const m = L.marker([t.lat, t.lng], { icon: icono(t), title: t.nombre, zIndexOffset: 100 * (6 - ESTADOS[t.estado].orden) })
        .on('click', () => abrirTienda(t.id));
      m.addTo(capaPines);
      st.marcadores.set(t.id, m);
    });
    if (st.territorioVisible) {
      st.tiendas.filter((t) => t.lat && ACTIVOS.includes(t.estado)).forEach((t) => {
        L.circle([t.lat, t.lng], { radius: CFG.RADIO_TERRITORIO, color: '#B3121B', weight: 1, opacity: .35, fillColor: '#B3121B', fillOpacity: .16, interactive: false }).addTo(capaTerritorio);
      });
    }
    if (primerEncuadre && !st.geocodificando && lista.some((t) => t.lat)) { encuadrar(); primerEncuadre = false; }
    pintarRutaMapa();
  }

  function encuadrar() {
    const pts = visibles().filter((t) => t.lat).map((t) => [t.lat, t.lng]);
    if (pts.length) mapa.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }

  // ---------- Panel: tiendas ----------
  function pintarLeyenda() {
    const cuenta = {};
    st.tiendas.forEach((t) => { cuenta[t.estado] = (cuenta[t.estado] || 0) + 1; });
    $('#leyenda').innerHTML = Object.entries(ESTADOS).map(([k, e]) =>
      '<button class="chip' + (st.filtroEstados.has(k) ? '' : ' off') + '" data-estado="' + k + '"><i style="background:' + e.color + '"></i>' + e.nombre + ' · ' + (cuenta[k] || 0) + '</button>').join('');
  }

  function pintarZonasSelect() {
    const sel = $('#f-zona'), actual = sel.value;
    const zonas = [...new Set(st.tiendas.map((t) => zonaBase(t.zona)))].sort((a, b) => a.localeCompare(b, 'es'));
    sel.innerHTML = '<option value="">Todas las zonas</option>' + zonas.map((z) => '<option' + (z === actual ? ' selected' : '') + '>' + esc(z) + '</option>').join('');
  }

  function textoEstado(t) {
    if (t.ultima && ACTIVOS.includes(t.estado)) {
      if (t.dias < 0) return 'vencido ' + (-t.dias) + 'd';
      if (t.dias === 0) return 'hoy';
      return 'en ' + t.dias + 'd';
    }
    return ESTADOS[t.estado].nombre;
  }

  function pintarLista() {
    const lista = visibles().sort((a, b) => ESTADOS[a.estado].orden - ESTADOS[b.estado].orden
      || (a.dias != null && b.dias != null ? a.dias - b.dias : 0)
      || (PRIORIDAD_ORDEN[norm(a.prioridad)] ?? 1) - (PRIORIDAD_ORDEN[norm(b.prioridad)] ?? 1)
      || a.nombre.localeCompare(b.nombre, 'es'));
    $('#lista-tiendas').innerHTML = lista.length ? lista.map((t) =>
      '<button class="item" data-tienda="' + t.id + '">' +
        '<span class="punto" style="background:' + ESTADOS[t.estado].color + ';width:12px;height:12px"></span>' +
        '<span><span class="n">' + esc(t.nombre) + '</span><br><span class="m">' + esc(t.tipo) + ' · ' + esc(zonaBase(t.zona)) + ' · ' + esc(t.prioridad) + (t.lat ? '' : ' · <b>sin ubicación</b>') + '</span></span>' +
        '<span class="badge" style="background:' + ESTADOS[t.estado].color + '">' + esc(textoEstado(t)) + '</span>' +
      '</button>').join('') : '<div class="vacio">Ninguna tienda con esos filtros.</div>';
  }

  // ---------- Panel: entregas ----------
  function pintarEntregas() {
    const activas = st.tiendas.filter((t) => t.ultima);
    const porSabor = {}; CFG.SABORES.forEach((s) => { porSabor[s.id] = 0; });
    let total = 0, valor = 0, sinPrecio = false, vendidos = 0;
    st.entregas.forEach((e) => {
      total += e.total;
      CFG.SABORES.forEach((s) => { porSabor[s.id] += e.cantidades[s.id]; });
      if (e.precio == null) sinPrecio = sinPrecio || e.total > 0; else valor += e.total * e.precio;
    });
    st.tiendas.forEach((t) => {
      for (let i = 1; i < t.entregas.length; i++) {
        const prev = t.entregas[i - 1], cur = t.entregas[i];
        if (cur.quedaban != null) vendidos += Math.max(0, (prev.quedaban || 0) + prev.total - cur.quedaban);
      }
    });
    const vencidas = st.tiendas.filter((t) => t.estado === 'vencido').length;
    $('#kpis').innerHTML = [
      [total, 'Frascos colocados'],
      ...CFG.SABORES.map((s) => [porSabor[s.id], s.nombre]),
      [activas.length, 'Tiendas con producto'],
      [valor ? dinero(valor) + (sinPrecio ? '*' : '') : 'Por definir', 'Valor dejado' + (sinPrecio ? ' (*sin precio en algunas)' : '')],
      [vendidos, 'Vendidos (según "Quedaban")'],
      [vencidas, 'Reestocks vencidos'],
    ].map(([v, l]) => '<div class="kpi"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>').join('');

    const sabCab = CFG.SABORES.map((s) => '<th class="num" title="' + esc(s.nombre) + '">' + esc(s.corto || s.nombre) + '</th>').join('');
    $('#tabla-tiendas-activas').innerHTML = activas.length ? '<table><thead><tr><th>Tienda</th>' + sabCab + '<th class="num">Precio</th><th>Reestock</th></tr></thead><tbody>' +
      activas.sort((a, b) => a.dias - b.dias).map((t) => '<tr data-tienda="' + t.id + '" style="cursor:pointer"><td><b>' + esc(t.nombre) + '</b><br><span style="color:var(--muted);font-size:12px">' + fechaCorta(t.ultima.fecha) + '</span></td>' +
        CFG.SABORES.map((s) => '<td class="num">' + t.ultima.cantidades[s.id] + '</td>').join('') +
        '<td class="num">' + (t.ultima.precio == null ? '—' : dinero(t.ultima.precio)) + '</td>' +
        '<td><span class="badge" style="background:' + ESTADOS[t.estado].color + '" title="' + esc(textoEstado(t)) + '">' + esc(fechaCorta(t.ultima.reestock)) + '</span></td></tr>').join('') +
      '</tbody></table>' : '<div class="vacio">Aún no hay entregas. Cuando dejes frascos en una tienda, regístralos aquí y su pin se pone verde. 🌶️</div>';

    const hist = [...st.entregas].sort((a, b) => b.fecha.localeCompare(a.fecha));
    $('#tabla-historial').innerHTML = hist.length ? '<table><thead><tr><th>Fecha</th><th>Tienda</th>' + sabCab + '<th class="num">Precio</th><th class="num">Quedaban</th></tr></thead><tbody>' +
      hist.map((e) => '<tr><td>' + fechaCorta(e.fecha) + '</td><td>' + esc(e.tienda) + (e.notas ? '<br><span style="color:var(--muted);font-size:12px">' + esc(e.notas) + '</span>' : '') + '</td>' +
        CFG.SABORES.map((s) => '<td class="num">' + e.cantidades[s.id] + '</td>').join('') +
        '<td class="num">' + (e.precio == null ? '—' : dinero(e.precio)) + '</td><td class="num">' + (e.quedaban == null ? '—' : e.quedaban) + '</td></tr>').join('') +
      '</tbody></table>' : '';
  }

  // ---------- Panel: territorio ----------
  function pintarTerritorio() {
    const activas = st.tiendas.filter((t) => ACTIVOS.includes(t.estado)).length;
    const contables = st.tiendas.filter((t) => t.estado !== 'rechazo').length || 1;
    const pct = Math.round(activas / contables * 100);
    let nivel = 0;
    NIVELES.forEach(([min], i) => { if (activas >= min) nivel = i; });
    const sig = NIVELES[nivel + 1];
    const base = NIVELES[nivel][0];
    const avance = sig ? (activas - base) / (sig[0] - base) * 100 : 100;
    $('#hud-nivel').textContent = 'Nivel ' + (nivel + 1) + ' · ' + NIVELES[nivel][1];
    $('#hud-barra').style.width = avance + '%';
    $('#subtitulo').textContent = activas + ' tiendas con producto · ' + pct + '% del mapa';
    $('#rango').innerHTML = '<div class="pct disp">' + pct + '%</div><div><b class="disp" style="font-size:1.2em">Nivel ' + (nivel + 1) + ' · ' + esc(NIVELES[nivel][1]) + '</b>' +
      '<small>' + activas + ' de ' + contables + ' tiendas conquistadas' + (sig ? ' · faltan ' + (sig[0] - activas) + ' para "' + esc(sig[1]) + '"' : ' · ¡territorio máximo!') + '</small></div>';

    const zonas = new Map();
    st.tiendas.forEach((t) => {
      const z = zonaBase(t.zona);
      if (!zonas.has(z)) zonas.set(z, { total: 0, activas: 0, visitadas: 0, rechazo: 0 });
      const o = zonas.get(z); o.total++;
      if (ACTIVOS.includes(t.estado)) o.activas++;
      else if (t.estado === 'visitado') o.visitadas++;
      else if (t.estado === 'rechazo') o.rechazo++;
    });
    $('#zonas').innerHTML = [...zonas.entries()].sort((a, b) => b[1].activas / b[1].total - a[1].activas / a[1].total || b[1].total - a[1].total).map(([z, o]) => {
      const p = (n) => (n / o.total * 100) + '%';
      const corona = o.activas && o.activas === o.total - o.rechazo ? ' 👑' : o.activas ? ' 🚩' : '';
      return '<div class="zona"><div class="cab">' + esc(z) + corona + '<span>' + o.activas + '/' + o.total + '</span></div>' +
        '<div class="barra"><i style="width:' + p(o.activas) + ';background:var(--s-stock)"></i><i style="width:' + p(o.visitadas) + ';background:var(--s-visitado)"></i><i style="width:' + p(o.rechazo) + ';background:var(--s-rechazo)"></i></div></div>';
    }).join('');
  }

  // ---------- Alerta de reestock ----------
  function pintarAlerta() {
    const v = st.tiendas.filter((t) => t.estado === 'vencido').length;
    const p = st.tiendas.filter((t) => t.estado === 'pronto').length;
    const partes = [];
    if (v) partes.push('🔴 ' + v + ' vencido' + (v > 1 ? 's' : ''));
    if (p) partes.push('🟠 ' + p + ' pronto');
    $('#alerta-txt').textContent = partes.join(' · ');
    $('#alerta').classList.toggle('on', partes.length > 0);
  }

  // ---------- Ruta ----------
  function tiendaPorId(id) { return st.tiendas.find((t) => t.id === +id); }
  function rutaTiendas() {
    return st.ruta.map((n) => st.tiendas.find((t) => t.nombre === n)).filter(Boolean);
  }
  function guardarRuta() { guardarLocal('mm-ruta', st.ruta); pintarRuta(); pintarRutaMapa(); }

  function pintarRuta() {
    const lista = rutaTiendas();
    $('#ruta-lista').innerHTML = lista.length ? lista.map((t, i) =>
      '<div class="ruta-item"><span class="num">' + (i + 1) + '</span><span><b>' + esc(t.nombre) + '</b><br><span style="color:var(--muted);font-size:12px">' + esc(t.ubicacion) + '</span></span>' +
      '<button data-quitar="' + esc(t.nombre) + '" title="Quitar">✕</button></div>').join('')
      : '<div class="vacio">Tu ruta está vacía. Usa los botones de arriba o toca una tienda y elige "Agregar a ruta".</div>';

    const conCoords = lista.filter((t) => t.lat);
    let links = '';
    if (conCoords.length) {
      const pt = (t) => t.lat + ',' + t.lng;
      // Google Maps acepta hasta 9 paradas intermedias por enlace; si son más, se parte en tramos.
      const tramos = [];
      let origen = st.yo ? st.yo.join(',') : null;
      let resto = conCoords.slice();
      if (!origen) { origen = pt(resto[0]); resto = resto.slice(1); }
      while (resto.length) {
        const tramo = resto.slice(0, 10);
        resto = resto.slice(10);
        const destino = tramo[tramo.length - 1];
        const paradas = tramo.slice(0, -1).map(pt).join('|');
        tramos.push('https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(origen) + '&destination=' + encodeURIComponent(pt(destino)) + (paradas ? '&waypoints=' + encodeURIComponent(paradas) : ''));
        origen = pt(destino);
      }
      let km = 0, prev = st.yo || [conCoords[0].lat, conCoords[0].lng];
      conCoords.forEach((t) => { km += distanciaKm(prev, [t.lat, t.lng]); prev = [t.lat, t.lng]; });
      links = '<div class="nota">≈ ' + km.toFixed(1) + ' km en línea recta · ' + conCoords.length + ' paradas' + (st.yo ? ' desde tu ubicación' : '') + '</div>' +
        tramos.map((u, i) => '<a class="btn" style="width:100%;margin-bottom:8px" target="_blank" rel="noopener" href="' + esc(u) + '">🧭 Abrir en Google Maps' + (tramos.length > 1 ? ' (tramo ' + (i + 1) + ')' : '') + '</a>').join('');
    }
    $('#ruta-links').innerHTML = links;
  }

  function pintarRutaMapa() {
    capaRuta.clearLayers();
    const pts = rutaTiendas().filter((t) => t.lat).map((t) => [t.lat, t.lng]);
    if (st.yo && pts.length) pts.unshift(st.yo);
    if (pts.length > 1) L.polyline(pts, { color: '#B3121B', weight: 4, opacity: .8, dashArray: '8 8' }).addTo(capaRuta);
  }

  function ordenarPorCercania() {
    const lista = rutaTiendas().filter((t) => t.lat);
    const sinCoords = rutaTiendas().filter((t) => !t.lat);
    if (lista.length < 2) return;
    const orden = [];
    let actual = st.yo || [lista[0].lat, lista[0].lng];
    while (lista.length) {
      let mejor = 0, mejorD = Infinity;
      lista.forEach((t, i) => { const d = distanciaKm(actual, [t.lat, t.lng]); if (d < mejorD) { mejorD = d; mejor = i; } });
      const t = lista.splice(mejor, 1)[0];
      orden.push(t.nombre); actual = [t.lat, t.lng];
    }
    st.ruta = orden.concat(sinCoords.map((t) => t.nombre));
    guardarRuta();
  }

  function ubicarme() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition((p) => {
        st.yo = [p.coords.latitude, p.coords.longitude];
        if (marcaYo) marcaYo.remove();
        marcaYo = L.circleMarker(st.yo, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).addTo(mapa).bindTooltip('Tú');
        res(st.yo);
      }, () => { toast('No pude obtener tu ubicación'); res(null); }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  // ---------- Detalle de tienda ----------
  function abrirHoja(html) { $('#hoja').innerHTML = html; $('#velo').classList.add('on'); }
  function cerrarHoja() { $('#velo').classList.remove('on'); }

  function abrirTienda(id) {
    const t = tiendaPorId(id); if (!t) return;
    if (t.lat) mapa.flyTo([t.lat, t.lng], Math.max(mapa.getZoom(), 15), { duration: .6 });
    const e = ESTADOS[t.estado];
    const enRuta = st.ruta.includes(t.nombre);
    const destino = t.lat ? t.lat + ',' + t.lng : t.ubicacion;
    const hist = [...t.entregas].reverse().map((x) => '<tr><td>' + fechaCorta(x.fecha) + '</td>' + CFG.SABORES.map((s) => '<td class="num">' + x.cantidades[s.id] + '</td>').join('') +
      '<td class="num">' + (x.precio == null ? '—' : dinero(x.precio)) + '</td><td>' + fechaCorta(x.reestock) + '</td></tr>').join('');
    abrirHoja(
      '<div class="top"><h3 class="disp">' + esc(t.nombre) + '</h3><button class="cerrar" data-cerrar>✕</button></div>' +
      '<div style="margin-bottom:10px"><span class="badge" style="background:' + e.color + '">' + esc(e.nombre) + (t.ultima ? ' · ' + esc(textoEstado(t)) : '') + '</span></div>' +
      '<div class="meta"><span>🏷️ ' + esc(t.tipo) + ' · Prioridad ' + esc(t.prioridad) + '</span><span>📍 ' + esc(t.ubicacion || 'Sin dirección') + (t.aprox ? ' <i>(ubicación aproximada)</i>' : '') + '</span><span>🗺️ ' + esc(t.zona) + '</span>' +
        (t.notas ? '<span>📝 ' + esc(t.notas) + '</span>' : '') + '</div>' +
      '<div class="acciones">' +
        '<a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destino) + '">🧭 Cómo llegar</a>' +
        '<button class="btn sec" data-ruta-toggle="' + t.id + '">' + (enRuta ? '✓ En la ruta' : '➕ Agregar a ruta') + '</button>' +
        '<button class="btn" data-entrega-de="' + t.id + '">📦 Registrar entrega</button>' +
        '<a class="btn sec" target="_blank" rel="noopener" href="' + esc(t.maps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(t.nombre + ' ' + t.ubicacion)) + '">🔎 Ver en Maps</a>' +
      '</div>' +
      '<div class="campo"><label>Estado de la tienda</label><select data-estado-de="' + t.id + '">' +
        ESTADOS_MANUALES.map((x) => '<option' + (norm(x) === norm(t.estadoManual || (t.ultima ? 'Activa' : t.visitado ? 'Visitado' : 'Prospecto')) ? ' selected' : '') + '>' + x + '</option>').join('') +
      '</select></div>' +
      (hist ? '<h2 class="disp">Entregas</h2><div class="tabla-wrap"><table><thead><tr><th>Fecha</th>' + CFG.SABORES.map((s) => '<th class="num">' + esc(s.nombre) + '</th>').join('') + '<th class="num">Precio</th><th>Reestock</th></tr></thead><tbody>' + hist + '</tbody></table></div>' : '')
    );
  }

  // ---------- Formularios ----------
  async function enviar(datos) {
    if (!CFG.SCRIPT_URL) return { ok: false, sinScript: true };
    let pin = '';
    try { pin = sessionStorage.getItem('mm-pin') || ''; } catch (e) { /* nada */ }
    let r;
    try {
      r = await fetch(CFG.SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ pin }, datos)) });
    } catch (e) {
      // Google responde con una página de login (sin CORS) cuando la implementación no es pública.
      throw new Error('El Apps Script no respondió. Revisa que la implementación tenga acceso "Cualquier usuario".');
    }
    const txt = await r.text();
    let d;
    try { d = JSON.parse(txt); } catch (e) {
      const m = txt.match(/<div[^>]*>([^<]{10,200})<\/div>/) || txt.match(/<title>([^<]+)<\/title>/);
      throw new Error('Respuesta del Apps Script: ' + (m ? m[1].trim() : 'no es JSON') + '. ¿Publicaste una versión nueva de la implementación?');
    }
    if (!d.ok && /PIN/.test(d.error || '')) {
      const nuevo = prompt('Clave para guardar cambios:');
      if (nuevo) { try { sessionStorage.setItem('mm-pin', nuevo); } catch (e) { /* nada */ } return enviar(datos); }
    }
    return d;
  }

  function urlHoja(hoja) { return 'https://docs.google.com/spreadsheets/d/' + CFG.SHEET_ID + '/edit#gid=0' + (hoja ? '&range=' + encodeURIComponent(hoja + '!A1') : ''); }

  function sinScriptHTML(fila, hoja) {
    return '<div class="nota">Para guardar desde aquí falta conectar el Apps Script (ver <b>LEEME.md</b>). Mientras tanto, copia esta fila y pégala al final de la pestaña <b>' + esc(hoja) + '</b>:' +
      '<pre class="tsv">' + esc(fila) + '</pre><button class="btn sec" data-copiar="' + esc(fila) + '">📋 Copiar fila</button> <a href="' + esc(urlHoja()) + '" target="_blank" rel="noopener">Abrir la hoja →</a></div>';
  }

  function abrirFormEntrega(idTienda) {
    const t = idTienda != null ? tiendaPorId(idTienda) : null;
    const hoy = hoyISO();
    const previo = t && t.ultima;
    abrirHoja(
      '<div class="top"><h3 class="disp">📦 Registrar entrega</h3><button class="cerrar" data-cerrar>✕</button></div>' +
      '<form id="form-entrega">' +
      '<div class="campo"><label>Tienda</label><input name="tienda" list="dl-tiendas" required value="' + esc(t ? t.nombre : '') + '" placeholder="Nombre exacto como en la hoja">' +
        '<datalist id="dl-tiendas">' + st.tiendas.map((x) => '<option value="' + esc(x.nombre) + '">').join('') + '</datalist></div>' +
      '<div class="grid2"><div><label>Fecha</label><input type="date" name="fecha" value="' + hoy + '" required></div>' +
        '<div><label>Próximo reestock</label><input type="date" name="reestock" value="' + sumarDias(hoy, CFG.DIAS_REESTOCK) + '"></div></div>' +
      '<div class="grid2">' + CFG.SABORES.map((s) => '<div><label>' + esc(s.nombre) + ' (frascos)</label><input type="number" min="0" inputmode="numeric" name="sabor-' + s.id + '" value="' + (previo ? previo.cantidades[s.id] : 0) + '"></div>').join('') + '</div>' +
      '<div class="grid2"><div><label>Precio por frasco</label><input type="number" min="0" step="0.5" inputmode="decimal" name="precio" placeholder="Por definir" value="' + esc(previo && previo.precio != null ? previo.precio : CFG.PRECIO_DEFAULT) + '"></div>' +
        '<div><label>Quedaban al llegar</label><input type="number" min="0" inputmode="numeric" name="quedaban" placeholder="' + (previo ? 'frascos sin vender' : 'primera vez') + '"></div></div>' +
      '<div class="campo"><label>Notas</label><textarea name="notas" placeholder="Con quién hablé, acuerdos, etc."></textarea></div>' +
      '<div id="form-extra"></div>' +
      '<button class="btn" style="width:100%" type="submit">Guardar entrega</button></form>'
    );
    const f = $('#form-entrega');
    f.fecha.addEventListener('change', () => { if (f.fecha.value) f.reestock.value = sumarDias(f.fecha.value, CFG.DIAS_REESTOCK); });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const datos = {
        accion: 'entrega', tienda: f.tienda.value.trim(), fecha: f.fecha.value, reestock: f.reestock.value,
        precio: f.precio.value, quedaban: f.quedaban.value, notas: f.notas.value.trim(),
      };
      CFG.SABORES.forEach((s) => { datos[s.id] = f['sabor-' + s.id].value || 0; });
      if (!st.tiendas.some((x) => norm(x.nombre) === norm(datos.tienda)) && !confirm('"' + datos.tienda + '" no está en la lista de tiendas. ¿Guardar de todas formas?')) return;
      const boton = f.querySelector('[type=submit]'); boton.disabled = true; boton.textContent = 'Guardando…';
      try {
        const r = await enviar(datos);
        if (r.sinScript) {
          const fila = [datos.fecha, datos.tienda, ...CFG.SABORES.map((s) => datos[s.id]), datos.precio, datos.reestock, datos.quedaban, datos.notas].join('\t');
          $('#form-extra').innerHTML = sinScriptHTML(fila, CFG.HOJA_ENTREGAS);
        } else if (r.ok) { cerrarHoja(); toast('Entrega guardada 🌶️'); await cargar(); return; }
        else toast('No se guardó: ' + (r.error || 'error'), 5000);
      } catch (e) { toast(e.message || 'No se pudo conectar con el Apps Script', 9000); }
      boton.disabled = false; boton.textContent = 'Guardar entrega';
    });
  }

  function abrirFormTienda() {
    abrirHoja(
      '<div class="top"><h3 class="disp">🏪 Nueva tienda</h3><button class="cerrar" data-cerrar>✕</button></div>' +
      '<form id="form-tienda">' +
      '<div class="campo"><label>Nombre</label><input name="nombre" required></div>' +
      '<div class="grid2"><div><label>Tipo</label><input name="tipo" value="Abarrotes" list="dl-tipos"><datalist id="dl-tipos">' +
        [...new Set(st.tiendas.map((t) => t.tipo))].map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></div>' +
        '<div><label>Prioridad</label><select name="prioridad"><option>Alta</option><option selected>Media</option><option>Baja</option></select></div></div>' +
      '<div class="campo"><label>Zona / colonia</label><input name="zona" list="dl-zonas"><datalist id="dl-zonas">' +
        [...new Set(st.tiendas.map((t) => t.zona))].map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist></div>' +
      '<div class="campo"><label>Dirección</label><input name="ubicacion" placeholder="Calle 123, Colonia, Guadalajara"></div>' +
      '<div class="fila-btns"><button type="button" class="btn sec" id="usar-yo">◎ Estoy aquí</button><button type="button" class="btn sec" id="elegir-mapa">📍 Elegir en el mapa</button></div>' +
      '<div class="nota" id="punto-txt">' + (st.puntoNuevo ? 'Punto: ' + st.puntoNuevo.map((n) => n.toFixed(5)).join(', ') : 'Sin punto: se ubicará con la dirección.') + '</div>' +
      '<div class="campo"><label>Notas</label><textarea name="notas"></textarea></div>' +
      '<div id="form-extra"></div>' +
      '<button class="btn" style="width:100%" type="submit">Agregar a la lista</button></form>'
    );
    const f = $('#form-tienda');
    $('#usar-yo').onclick = async () => { const p = await ubicarme(); if (p) { fijarPunto(p); } };
    $('#elegir-mapa').onclick = () => {
      cerrarHoja(); irA('mapa'); toast('Toca el mapa donde está la tienda', 4000);
      mapa.once('click', (ev) => { fijarPunto([ev.latlng.lat, ev.latlng.lng]); abrirFormTienda(); });
    };
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const datos = { accion: 'tienda', nombre: f.nombre.value.trim(), tipo: f.tipo.value.trim(), prioridad: f.prioridad.value, zona: f.zona.value.trim(), ubicacion: f.ubicacion.value.trim(), notas: f.notas.value.trim() };
      if (st.puntoNuevo) { datos.lat = st.puntoNuevo[0]; datos.lng = st.puntoNuevo[1]; }
      const boton = f.querySelector('[type=submit]'); boton.disabled = true;
      try {
        const r = await enviar(datos);
        if (r.sinScript) {
          const mapsUrl = datos.lat ? 'https://www.google.com/maps/search/?api=1&query=' + datos.lat + ',' + datos.lng : '';
          $('#form-extra').innerHTML = sinScriptHTML([datos.prioridad, datos.zona, datos.tipo, datos.nombre, datos.ubicacion, 'FALSE', mapsUrl, datos.notas].join('\t'), CFG.HOJA_TIENDAS);
        } else if (r.ok) { st.puntoNuevo = null; if (marcaNueva) marcaNueva.remove(); cerrarHoja(); toast('Tienda agregada 🏪'); await cargar(); return; }
        else toast('No se guardó: ' + (r.error || 'error'), 5000);
      } catch (e) { toast(e.message || 'No se pudo conectar con el Apps Script', 9000); }
      boton.disabled = false;
    });
  }

  function fijarPunto(p) {
    st.puntoNuevo = p;
    if (marcaNueva) marcaNueva.remove();
    marcaNueva = L.marker(p, { icon: L.divIcon({ className: 'leaflet-div-icon limpio marca-nueva', html: '📍', iconSize: [28, 28], iconAnchor: [14, 28] }) }).addTo(mapa);
    const txt = $('#punto-txt'); if (txt) txt.textContent = 'Punto: ' + p.map((n) => n.toFixed(5)).join(', ');
  }

  async function cambiarEstadoManual(id, estado) {
    const t = tiendaPorId(id);
    try {
      const r = await enviar({ accion: 'estado', tienda: t.nombre, estado });
      if (r.sinScript) { toast('Cambia la columna "Estado" en la hoja (falta conectar el Apps Script)', 5000); return; }
      if (!r.ok) { toast('No se guardó: ' + (r.error || 'error'), 5000); return; }
      toast('Estado actualizado');
      await cargar();
      abrirTienda(id);
    } catch (e) { toast(e.message || 'No se pudo conectar con el Apps Script', 9000); }
  }


  // ---------- Descubrir tiendas nuevas (OpenStreetMap) ----------
  const capaNuevas = L.layerGroup().addTo(mapa);
  const TIPOS_OSM = {
    convenience: 'Abarrotes', supermarket: 'Minisúper', greengrocer: 'Frutería', deli: 'Deli / gourmet',
    dairy: 'Cremería', general: 'Miscelánea', variety_store: 'Miscelánea', butcher: 'Carnicería',
    health_food: 'Tienda naturista', farm: 'Productos de granja', marketplace: 'Mercado',
  };
  // Cadenas que no reciben producto a consignación.
  const CADENAS = /oxxo|7[\s-]?eleven|circle\s?k|kiosko|\bextra\b|go\s?mart|farmacia|walmart|costco|sam'?s|soriana|aurrer|chedraui|la comer|fresko|city market|superama|heb|bodega/i;
  const SERVIDORES_OSM = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

  async function consultarOSM(q) {
    for (const url of SERVIDORES_OSM) {
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
        if (r.ok) return await r.json();
      } catch (e) { /* probamos el siguiente servidor */ }
    }
    throw new Error('OpenStreetMap no respondió, intenta en un momento');
  }

  async function buscarNuevas() {
    if (mapa.getZoom() < 14) { toast('Acércate más (zoom) a la zona donde quieres buscar', 4000); return; }
    const b = mapa.getBounds();
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(5)).join(',');
    const q = '[out:json][timeout:25];(nwr["shop"~"^(' + Object.keys(TIPOS_OSM).filter((k) => k !== 'marketplace').join('|') + ')$"](' + bbox + ');' +
      'nwr["amenity"="marketplace"](' + bbox + '););out center tags;';
    estadoCarga('Buscando tiendas en esta zona…');
    let datos;
    try { datos = await consultarOSM(q); } catch (e) { estadoCarga(''); toast(e.message, 5000); return; }
    estadoCarga('');
    const conCoords = st.tiendas.filter((t) => t.lat);
    const vistos = new Set();
    st.nuevas = datos.elements.map((e) => {
      const t = e.tags || {};
      const lat = e.lat != null ? e.lat : e.center && e.center.lat;
      const lng = e.lon != null ? e.lon : e.center && e.center.lon;
      const nombre = (t.name || t.brand || '').trim();
      const calle = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
      const cercana = conCoords.map((x) => [x, distanciaKm([lat, lng], [x.lat, x.lng])]).sort((a, c) => a[1] - c[1])[0];
      return {
        nombre, lat, lng,
        tipo: TIPOS_OSM[t.shop] || TIPOS_OSM[t.amenity] || 'Abarrotes',
        zona: t['addr:suburb'] || (cercana && cercana[1] < 1.5 ? cercana[0].zona : ''),
        ubicacion: [calle, t['addr:suburb'], t['addr:city'] || 'Zapopan'].filter(Boolean).join(', '),
        repetida: !!(cercana && cercana[1] < 0.04) || st.tiendas.some((x) => norm(x.nombre) === norm(nombre)),
      };
    }).filter((c) => {
      if (!c.nombre || c.lat == null || c.repetida || CADENAS.test(c.nombre)) return false;
      const k = norm(c.nombre) + '|' + c.lat.toFixed(4);
      if (vistos.has(k)) return false;
      vistos.add(k); return true;
    });
    pintarNuevas();
    if (!st.nuevas.length) { toast('No encontré tiendas nuevas aquí (OpenStreetMap no tiene todas; agrégalas con ＋)', 6000); return; }
    abrirNuevas();
  }

  function pintarNuevas() {
    capaNuevas.clearLayers();
    (st.nuevas || []).forEach((c, i) => {
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({ className: 'leaflet-div-icon limpio', html: '<div class="pin-nuevo">+</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        title: c.nombre,
      }).on('click', () => abrirNuevas(i)).addTo(capaNuevas);
    });
  }

  function abrirNuevas(foco) {
    const lista = st.nuevas || [];
    abrirHoja(
      '<div class="top"><h3 class="disp">🔍 ' + lista.length + ' tiendas nuevas aquí</h3><button class="cerrar" data-cerrar>✕</button></div>' +
      '<div class="nota">Vienen de OpenStreetMap: no están todas las tiendas de barrio y algunas pueden ya no existir. Ya quité las que tienes en tu lista y las cadenas (OXXO, 7-Eleven, súpers grandes).</div>' +
      '<div class="grid2"><div><label>Zona (opcional, para todas)</label><input id="nv-zona" placeholder="Usar la de cada tienda"></div>' +
        '<div><label>Prioridad</label><select id="nv-prio"><option>Alta</option><option selected>Media</option><option>Baja</option></select></div></div>' +
      '<div class="fila-btns"><button class="btn sec" type="button" id="nv-todas">Marcar todas</button><button class="btn sec" type="button" id="nv-ninguna">Ninguna</button></div>' +
      '<div class="lista">' + lista.map((c, i) =>
        '<label class="item" style="grid-template-columns:auto 1fr;cursor:pointer;color:var(--ink);font-size:inherit;font-weight:inherit;margin:0' + (i === foco ? ';border-color:var(--rojo)' : '') + '">' +
        '<input type="checkbox" data-nueva="' + i + '"' + (foco == null || i === foco ? ' checked' : '') + ' style="width:auto">' +
        '<span><span class="n">' + esc(c.nombre) + '</span><br><span class="m">' + esc(c.tipo) + (c.zona ? ' · ' + esc(c.zona) : '') + '<br>' + esc(c.ubicacion) + '</span></span></label>').join('') + '</div>' +
      '<div id="form-extra"></div>' +
      '<button class="btn" style="width:100%;margin-top:12px" id="nv-agregar">Agregar seleccionadas a mi lista</button>'
    );
    $('#nv-todas').onclick = () => document.querySelectorAll('[data-nueva]').forEach((x) => { x.checked = true; });
    $('#nv-ninguna').onclick = () => document.querySelectorAll('[data-nueva]').forEach((x) => { x.checked = false; });
    $('#nv-agregar').onclick = agregarNuevas;
  }

  async function agregarNuevas() {
    const elegidas = [...document.querySelectorAll('[data-nueva]:checked')].map((x) => st.nuevas[+x.dataset.nueva]);
    if (!elegidas.length) { toast('No marcaste ninguna'); return; }
    const zona = $('#nv-zona').value.trim(), prioridad = $('#nv-prio').value;
    const filas = elegidas.map((c) => ({
      accion: 'tienda', nombre: c.nombre, tipo: c.tipo, prioridad, zona: zona || c.zona, ubicacion: c.ubicacion,
      lat: c.lat, lng: c.lng, notas: 'Encontrada en el mapa',
    }));
    if (!CFG.SCRIPT_URL) {
      const tsv = filas.map((d) => [d.prioridad, d.zona, d.tipo, d.nombre, d.ubicacion, 'FALSE',
        'https://www.google.com/maps/search/?api=1&query=' + d.lat + ',' + d.lng, d.notas, 'Prospecto', d.lat, d.lng].join('\t')).join('\n');
      $('#form-extra').innerHTML = sinScriptHTML(tsv, CFG.HOJA_TIENDAS);
      return;
    }
    const boton = $('#nv-agregar'); boton.disabled = true;
    let ok = 0;
    try {
      for (const d of filas) {
        boton.textContent = 'Agregando ' + (ok + 1) + ' de ' + filas.length + '…';
        const r = await enviar(d);
        if (!r.ok) throw new Error(r.error || 'error');
        ok++;
      }
    } catch (e) {
      toast('Se agregaron ' + ok + '; luego falló: ' + e.message, 8000);
    }
    const agregadas = new Set(elegidas.slice(0, ok));
    st.nuevas = st.nuevas.filter((c) => !agregadas.has(c));
    pintarNuevas();
    if (ok === filas.length) { cerrarHoja(); toast(ok + ' tiendas agregadas 🏪'); }
    else boton.disabled = false;
    await cargar();
  }

  // ---------- Navegación ----------
  const esMovil = () => window.matchMedia('(max-width: 860px)').matches;
  function irA(vista) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.vista === vista));
    document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('on', v.id === 'v-' + vista));
    if (vista === 'mapa' || !esMovil()) setTimeout(() => mapa.invalidateSize(), 50);
    guardarLocal('mm-vista', vista);
  }

  function pintarTodo() {
    pintarLeyenda(); pintarZonasSelect(); pintarMapa(); pintarLista();
    pintarEntregas(); pintarTerritorio(); pintarAlerta(); pintarRuta();
  }

  // ---------- Eventos ----------
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) irA(b.dataset.vista); });
  $('#leyenda').addEventListener('click', (e) => {
    const b = e.target.closest('[data-estado]'); if (!b) return;
    const k = b.dataset.estado;
    if (st.filtroEstados.has(k)) st.filtroEstados.delete(k); else st.filtroEstados.add(k);
    pintarLeyenda(); pintarMapa(); pintarLista();
  });
  ['#f-texto', '#f-zona', '#f-prioridad'].forEach((s) => $(s).addEventListener('input', () => { pintarMapa(); pintarLista(); }));
  $('#f-zona').addEventListener('change', () => { encuadrar(); });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-tienda],[data-cerrar],[data-ruta-toggle],[data-entrega-de],[data-quitar],[data-copiar]');
    if (!el) return;
    if (el.dataset.tienda != null) { if (esMovil()) irA('mapa'); abrirTienda(el.dataset.tienda); }
    else if (el.dataset.cerrar != null) cerrarHoja();
    else if (el.dataset.rutaToggle != null) {
      const t = tiendaPorId(el.dataset.rutaToggle);
      st.ruta = st.ruta.includes(t.nombre) ? st.ruta.filter((n) => n !== t.nombre) : st.ruta.concat(t.nombre);
      guardarRuta(); el.textContent = st.ruta.includes(t.nombre) ? '✓ En la ruta' : '➕ Agregar a ruta';
    } else if (el.dataset.entregaDe != null) abrirFormEntrega(el.dataset.entregaDe);
    else if (el.dataset.quitar != null) { st.ruta = st.ruta.filter((n) => n !== el.dataset.quitar); guardarRuta(); }
    else if (el.dataset.copiar != null) {
      navigator.clipboard.writeText(el.dataset.copiar).then(() => toast('Fila copiada: pégala en la hoja'), () => toast('No pude copiar; selecciónala a mano'));
    }
  });
  document.addEventListener('change', (e) => { const s = e.target.closest('[data-estado-de]'); if (s) cambiarEstadoManual(s.dataset.estadoDe, s.value); });
  $('#velo').addEventListener('click', (e) => { if (e.target.id === 'velo') cerrarHoja(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });

  $('#btn-recargar').onclick = () => cargar();
  $('#btn-nueva').onclick = () => abrirFormTienda();
  $('#btn-entrega').onclick = () => abrirFormEntrega(null);
  $('#btn-todo').onclick = () => encuadrar();
  $('#btn-buscar').onclick = buscarNuevas;
  $('#btn-yo').onclick = async () => { const p = await ubicarme(); if (p) { mapa.flyTo(p, 15); pintarRuta(); pintarRutaMapa(); } };
  $('#btn-territorio').onclick = (e) => { st.territorioVisible = !st.territorioVisible; e.currentTarget.classList.toggle('on', st.territorioVisible); pintarMapa(); };

  function rutaReestock() {
    const urgentes = st.tiendas.filter((t) => t.estado === 'vencido' || t.estado === 'pronto').sort((a, b) => a.dias - b.dias);
    if (!urgentes.length) { toast('No hay reestocks pendientes 🎉'); return; }
    st.ruta = urgentes.map((t) => t.nombre);
    guardarRuta(); ordenarPorCercania(); irA('ruta');
  }
  $('#ruta-reestock').onclick = rutaReestock;
  $('#alerta-ruta').onclick = rutaReestock;
  $('#ruta-cerca').onclick = async () => {
    const yo = await ubicarme(); if (!yo) return;
    const cerca = st.tiendas.filter((t) => t.lat && t.estado === 'prospecto' && norm(t.prioridad) !== 'baja')
      .map((t) => [t, distanciaKm(yo, [t.lat, t.lng])]).sort((a, b) => a[1] - b[1]).slice(0, 8).map(([t]) => t.nombre);
    if (!cerca.length) { toast('No encontré prospectos con ubicación'); return; }
    st.ruta = cerca; guardarRuta(); ordenarPorCercania();
  };
  $('#ruta-optimizar').onclick = ordenarPorCercania;
  $('#ruta-limpiar').onclick = () => { st.ruta = []; guardarRuta(); };

  // ---------- Inicio ----------
  const vistaGuardada = leerLocal('mm-vista', 'tiendas');
  irA(esMovil() ? 'mapa' : (vistaGuardada === 'mapa' ? 'tiendas' : vistaGuardada));
  cargar();
})();
