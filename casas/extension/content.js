// Botón ❤️ "Guardar casa": lee lo que se ve en la página del anuncio (como el de Facebook),
// muestra un panel para revisar/corregir los datos y los manda al Google Sheet.
(() => {
  if (window.__casasSheet) return;
  window.__casasSheet = true;

  // Algunos sitios usan letras como atajos (ej. "r") y se "comen" lo que escribes en el panel.
  // Este script corre antes que los de la página, así que aquí atrapamos las teclas primero
  // y no dejamos que el sitio las vea cuando estás escribiendo en el panel.
  const HOST_ID = '__casas_sheet_host';
  ['keydown', 'keypress', 'keyup'].forEach(tipo => window.addEventListener(tipo, e => {
    const h = document.getElementById(HOST_ID);
    if (h && e.composedPath().includes(h)) e.stopImmediatePropagation();
  }, true));

  const HOST = location.hostname;
  const FUENTE =
    /facebook\.com$/.test(HOST) ? 'Marketplace' :
    /inmuebles24/.test(HOST) ? 'Inmuebles24' :
    /trovit/.test(HOST) ? 'Trovit' :
    /propiedades\.com/.test(HOST) ? 'Propiedades.com' :
    /monopolio\.com\.mx/.test(HOST) ? 'Monopolio' :
    /rentumo\./.test(HOST) ? 'Rentumo' : HOST;

  // En Facebook solo tiene sentido en la página de un artículo de Marketplace
  const esPaginaValida = () => FUENTE !== 'Marketplace' || /\/marketplace\/item\//.test(location.pathname);

  /* ───────────────────────── utilidades ───────────────────────── */

  const num = v => {
    if (v == null) return null;
    const s = String(v).replace(/[^\d.,]/g, '');
    if (!s) return null;
    // Miles con punto o coma ("14.000", "1,250,000") → 14000 / 1250000
    if (/^\d{1,3}([.,])\d{3}(\1\d{3})*$/.test(s)) return +s.replace(/[.,]/g, '');
    // "1,250.5" → 1250.5 · "3,5" → 3.5
    const n = parseFloat(s.replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  const limpio = s => (s || '').replace(/\s+/g, ' ').trim();
  const primero = (...vals) => vals.find(v => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v)));
  const enMexico = (lat, lng) => lat > 14 && lat < 33 && lng > -118.5 && lng < -86;
  const textoDe = sel => { const el = document.querySelector(sel); return el ? limpio(el.innerText || el.textContent) : ''; };
  const meta = name => {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? limpio(el.getAttribute('content')) : '';
  };

  // Zona principal: en FB evita leer los "artículos sugeridos" de la barra lateral
  const raiz = () => (FUENTE === 'Marketplace' && document.querySelector('[role="main"]')) || document.body;

  function nodosJsonLd() {
    const out = [];
    const walk = o => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === 'object') {
        out.push(o);
        Object.values(o).forEach(v => { if (v && typeof v === 'object') walk(v); });
      }
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
      try { walk(JSON.parse(s.textContent)); } catch (_) { /* JSON-LD roto, se ignora */ }
    });
    return out;
  }

  /* ───────────────────────── extracción ───────────────────────── */

  const RE = {
    // $14,000 · $14.000 · $14 000 · MX$14 mil · $14k
    precio: /(?:\$|MXN|MN|US\$|USD)\s?(?:(\d+(?:[.,]\d+)?)\s*(mil|k)\b|((?:\d{1,3}(?:[,.\s\u00a0\u202f]\d{3})+|\d{4,})(?:\.\d{2})?))/i,
    rec: /(\d{1,2})\s*(?:rec[aá]maras?|rec\b\.?|habitaciones?|hab\b\.?|dormitorios?|beds?\b|bedrooms?)/i,
    banos: /(\d{1,2}(?:[.,]5)?)\s*(?:baños?|banos?|baths?\b|bathrooms?)/i,
    medios: /(\d)\s*medios?\s*baños?/i,
    estac: /(\d{1,2})\s*(?:estacionamientos?|estac\b\.?|cajon(?:es)?(?: de estacionamiento)?|cocheras?|autos?\b|parking)/i,
    m2c: [
      /(\d[\d,.]*)\s*(?:m²|m2|mts²?|mts2|metros cuadrados)\s*(?:de\s*)?(?:construi\w*|constr\w*|const\.?|cub\.?|cubiert\w*)/i,
      /(?:construcci[oó]n|construidos?|superficie construida|sup\.? construida|cubierta)\s*:?\s*(\d[\d,.]*)\s*(?:m²|m2|mts)/i
    ],
    m2t: [
      /(\d[\d,.]*)\s*(?:m²|m2|mts²?|mts2|metros cuadrados)\s*(?:de\s*)?(?:terreno|tot\.?|totales|lote)/i,
      /(?:terreno|superficie total|sup\.? total|lote)\s*:?\s*(\d[\d,.]*)\s*(?:m²|m2|mts)/i
    ],
    m2: /(\d[\d,.]*)\s*(?:m²|m2|metros cuadrados)/i
  };
  const busca = (txt, re) => {
    for (const r of [].concat(re)) { const m = txt.match(r); if (m) return m[1]; }
    return null;
  };

  function buscarCoordenadas() {
    const valida = (la, ln) => {
      const lat = parseFloat(la), lng = parseFloat(ln);
      return enMexico(lat, lng) ? { lat, lng } : null;
    };
    // Inmuebles24 guarda las coordenadas en base64: mapLatOf = "MjAuNjc…"
    const scripts = [...document.scripts].map(s => s.textContent).join('\n');
    const b64 = scripts.match(/mapLatOf\s*=\s*["']([^"']+)["'][\s\S]{0,200}?mapLngOf\s*=\s*["']([^"']+)["']/);
    if (b64) { try { const r = valida(atob(b64[1]), atob(b64[2])); if (r) return r; } catch (_) {} }
    // JSON en scripts: "latitude": 20.6, "longitude": -103.4  /  lat: 20.6, lng: -103.4
    const re = /["']?lat(?:itude)?["']?\s*[:=]\s*["']?(-?\d{1,2}\.\d{3,})["']?[\s\S]{0,80}?["']?(?:lng|lon|long|longitude)["']?\s*[:=]\s*["']?(-?\d{2,3}\.\d{3,})/gi;
    let m;
    while ((m = re.exec(scripts))) { const r = valida(m[1], m[2]); if (r) return r; }
    // Mapas embebidos: staticmap?center=lat,lng · iframe ?q=lat,lng · links @lat,lng
    const urls = [...document.querySelectorAll('img[src*="map"], iframe[src*="map"], a[href*="maps"]')]
      .map(e => decodeURIComponent(e.getAttribute('src') || e.getAttribute('href') || ''));
    for (const u of urls) {
      const mm = u.match(/(?:center=|[?&]q=|[?&]ll=|query=|destination=|@)(-?\d{1,2}\.\d{3,}),\s*(-?\d{2,3}\.\d{3,})/);
      if (mm) { const r = valida(mm[1], mm[2]); if (r) return r; }
    }
    return null;
  }

  function buscarDireccion(ld) {
    const a = ld.map(n => n.address).find(x => x);
    if (a) {
      if (typeof a === 'string') return limpio(a);
      const partes = [a.streetAddress, a.addressLocality, a.addressRegion].map(limpio).filter(Boolean);
      if (partes.length) return [...new Set(partes)].join(', ');
    }
    const porSitio = {
      Inmuebles24: ['.section-location-property h4', '.section-location-property', '[class*="location-container"] h4', '[class*="LocationLocation"]'],
      'Propiedades.com': ['[class*="address"]', '[class*="Address"]', '[class*="ubicacion"]', '[class*="location"] h2'],
      Trovit: ['[class*="address"]', '[class*="location"]', '.item-address'],
      Rentumo: ['[class*="address"]', '[class*="location"]', '[class*="ubicacion"]'],
      Monopolio: ['[class*="address"]', '[class*="direccion"]', '[class*="ubicacion"]', '[class*="location"]'],
      Marketplace: []
    }[FUENTE] || ['[class*="address"]', '[class*="location"]'];
    for (const sel of porSitio) {
      const t = textoDe(sel);
      if (t && t.length > 4 && t.length < 200) return t;
    }
    if (FUENTE === 'Marketplace') {
      // En FB la ubicación aparece como "Zapopan, JAL" o "Guadalajara, Jalisco"
      const linea = (raiz().innerText || '').split('\n').map(limpio)
        .find(l => /,\s*(JAL|Jal\.?|Jalisco)\b/.test(l) && l.length < 120);
      if (linea) return linea.replace(/^(Publicado|Listed).*? en /i, '');
    }
    return '';
  }

  function buscarFotos(ld) {
    const fotos = new Map();
    const add = u => {
      if (!u || typeof u !== 'string') return;
      u = u.trim();
      if (u.startsWith('//')) u = 'https:' + u;
      if (!/^https?:\/\//.test(u)) return;
      if (/maps\.googleapis|staticmap|logo|avatar|icon|sprite|emoji|\.svg(\?|$)|\.gif(\?|$)|rsrc\.php/i.test(u)) return;
      fotos.set(u.split('#')[0], true);
    };
    // 1) JSON-LD y og:image
    ld.forEach(n => [].concat(n.image || n.photo || []).forEach(i => add(typeof i === 'string' ? i : (i && (i.url || i.contentUrl)))));
    add(meta('og:image'));
    // 2) Galería: imágenes grandes visibles, lazy-load (data-src) y srcset más grande
    raiz().querySelectorAll('img').forEach(img => {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const altFoto = FUENTE === 'Marketplace' && /foto|photo|imagen|image/i.test(img.alt || '');
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-flickity-lazyload');
      if (lazy) add(lazy);
      if ((w >= 300 && h >= 200) || altFoto) {
        const ss = (img.getAttribute('srcset') || '').split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
        add(ss.length ? ss[ss.length - 1] : (img.currentSrc || img.src));
      }
    });
    // 3) Inmuebles24 trae la galería completa en los scripts de la página
    if (FUENTE === 'Inmuebles24') {
      const scripts = [...document.scripts].map(s => s.textContent).join('\n');
      (scripts.match(/https?:\\?\/\\?\/[^"'\s]*naventcdn\.com[^"'\s]*?1200x1200[^"'\s]*?\.(?:jpe?g|webp)/gi) || [])
        .forEach(u => add(u.replace(/\\\//g, '/')));
    }
    return [...fotos.keys()].slice(0, 40);
  }

  function extraer() {
    const ld = nodosJsonLd();
    const txt = raiz().innerText || '';
    const ldNum = (...keys) => {
      for (const n of ld) for (const k of keys) {
        const v = n[k];
        const x = num(v && typeof v === 'object' ? (v.value ?? v.price) : v);
        if (x) return x;
      }
      return null;
    };
    const ldPrecio = (() => {
      for (const n of ld) {
        const o = [].concat(n.offers || [])[0];
        const p = num(o && (o.price ?? (o.priceSpecification && o.priceSpecification.price)));
        if (p) return { p, moneda: o.priceCurrency || '' };
      }
      return null;
    })();

    const precioSitio = {
      Inmuebles24: '[data-qa="POSTING_CARD_PRICE"], .price-value, .price-items span, [class*="price-value"]',
      'Propiedades.com': '[class*="price"], [class*="Price"]',
      Trovit: '[class*="price"]',
      Monopolio: '[class*="price"], [class*="precio"]',
      Rentumo: '[class*="price"], [class*="precio"]',
      Marketplace: ''
    }[FUENTE];
    const precioTexto = precioSitio ? textoDe(precioSitio) : '';
    const mp = precioTexto.match(RE.precio) || txt.match(RE.precio);
    const precioTxt = !mp ? null
      : mp[2] ? Math.round(parseFloat(mp[1].replace(',', '.')) * 1000)  // "14 mil" / "14k"
      : num(mp[3].replace(/[\s\u00a0\u202f]/g, ''));
    const precio = primero(ldPrecio && ldPrecio.p, num(meta('product:price:amount')), precioTxt);
    const usd = /US\$|USD|dólares/i.test(precioTexto) || /USD/i.test((ldPrecio && ldPrecio.moneda) || '');

    let titulo = limpio(primero(
      FUENTE === 'Marketplace' ? textoDe('[role="main"] h1') : '',
      textoDe('h1'), meta('og:title'), document.title
    ));
    titulo = titulo.replace(/\s*[|–-]\s*(Inmuebles24|Trovit|Propiedades\.com|Monopolio|Rentumo|Facebook).*$/i, '');

    const banos = num(busca(txt, RE.banos));
    const medios = num(busca(txt, RE.medios));
    const geo = (() => {
      const g = ld.map(n => n.geo).find(x => x && x.latitude);
      if (g && enMexico(+g.latitude, +g.longitude)) return { lat: +g.latitude, lng: +g.longitude };
      return buscarCoordenadas();
    })();

    const descripcion = limpio(primero(
      textoDe('#longDescription, [class*="description"] , [data-qa="POSTING_DESCRIPTION"]'),
      meta('og:description'), meta('description')
    )).slice(0, 3000);

    return {
      fuente: FUENTE,
      url: location.href.split('#')[0],
      titulo,
      precio: precio || '',
      moneda: usd ? 'USD' : 'MXN',
      recamaras: primero(ldNum('numberOfBedrooms', 'numberOfRooms'), num(busca(txt, RE.rec))) || '',
      banos: primero(ldNum('numberOfBathroomsTotal', 'numberOfFullBathrooms'), banos != null ? banos + (medios ? medios * 0.5 : 0) : null) || '',
      estacionamientos: num(busca(txt, RE.estac)) || '',
      m2Construccion: primero(ldNum('floorSize'), num(busca(txt, RE.m2c)), num(busca(txt, RE.m2))) || '',
      m2Terreno: primero(num(busca(txt, RE.m2t)), ldNum('lotSize')) || '',
      direccion: buscarDireccion(ld),
      lat: geo ? geo.lat : '',
      lng: geo ? geo.lng : '',
      descripcion,
      fotos: buscarFotos(ld)
    };
  }

  /* ───────────────────────── interfaz ───────────────────────── */

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;';
  const ui = host.attachShadow({ mode: 'open' });
  ui.innerHTML = `
  <style>
    * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
    .fab { width: 58px; height: 58px; border-radius: 50%; border: 0; background: #F4561D; color: #fff; font-size: 26px;
           cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.35); display: block; margin-left: auto; }
    .fab:hover { transform: scale(1.06); }
    .panel { display: none; width: 360px; max-height: 80vh; overflow: auto; background: #14161D; color: #fff; border-radius: 14px;
             padding: 14px; margin-bottom: 10px; box-shadow: 0 14px 40px rgba(0,0,0,.45); font-size: 12px; }
    .panel.abierto { display: block; }
    h3 { margin: 0 0 10px; font-size: 15px; }
    .g { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    label { display: block; color: #9AA0AE; font-size: 11px; margin: 8px 0 3px; }
    input, textarea { width: 100%; padding: 7px; border-radius: 7px; border: 1px solid #333846; background: #1E2129; color: #fff; font-size: 12px; }
    textarea { resize: vertical; min-height: 44px; }
    .fotos { display: flex; gap: 4px; overflow-x: auto; margin-top: 8px; }
    .fotos img { height: 54px; border-radius: 5px; }
    .acciones { display: flex; gap: 8px; margin-top: 12px; }
    button.b { flex: 1; padding: 9px; border: 0; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; }
    .pri { background: #F4561D; color: #fff; } .sec { background: #2A2E3A; color: #fff; }
    .pri:disabled { opacity: .5; cursor: wait; }
    .estado { margin-top: 10px; min-height: 16px; line-height: 1.4; }
    .ok { color: #4ADE80; } .err { color: #F87171; } .gris { color: #9AA0AE; }
  </style>
  <div class="panel" id="panel">
    <h3>❤️ Guardar casa</h3>
    <label>Título</label><input id="titulo">
    <div class="g">
      <div><label>Precio</label><input id="precio"></div>
      <div><label>Recámaras</label><input id="recamaras"></div>
      <div><label>Baños</label><input id="banos"></div>
      <div><label>Estac.</label><input id="estacionamientos"></div>
      <div><label>m² const.</label><input id="m2Construccion"></div>
      <div><label>m² terreno</label><input id="m2Terreno"></div>
    </div>
    <label>Dirección / colonia (se usa para calcular el tiempo al CETI)</label>
    <input id="direccion">
    <label id="geoLbl" class="gris"></label>
    <label>Notas</label><textarea id="notas" placeholder="Lo que te llamó la atención…"></textarea>
    <div class="gris" id="nfotos" style="margin-top:8px"></div>
    <div class="fotos" id="fotos"></div>
    <div class="acciones">
      <button class="b sec" id="releer" title="Vuelve a leer la página (útil si cargaron más fotos)">↻ Releer</button>
      <button class="b pri" id="enviar">Guardar en el Sheet</button>
      <button class="b sec" id="cerrar">✕</button>
    </div>
    <div class="estado" id="estado"></div>
  </div>
  <button class="fab" id="fab" title="Guardar esta casa en el Google Sheet">❤️</button>`;

  const $ = id => ui.getElementById(id);
  const CAMPOS = ['titulo', 'precio', 'recamaras', 'banos', 'estacionamientos', 'm2Construccion', 'm2Terreno', 'direccion'];
  let datos = null;

  const estado = (t, cls) => { $('estado').className = 'estado ' + (cls || ''); $('estado').textContent = t; };

  function llenar() {
    datos = extraer();
    CAMPOS.forEach(k => { $(k).value = datos[k] === '' || datos[k] == null ? '' : datos[k]; });
    $('geoLbl').textContent = datos.lat ? `📍 Trae coordenadas exactas (${(+datos.lat).toFixed(5)}, ${(+datos.lng).toFixed(5)})` : '📍 Sin coordenadas: se calculará con la dirección';
    $('nfotos').textContent = `${datos.fotos.length} foto(s) encontradas` + (datos.fotos.length < 3 ? ' — si hay más, ábrelas en la galería y dale ↻ Releer' : '');
    $('fotos').innerHTML = '';
    datos.fotos.slice(0, 12).forEach(u => { const i = document.createElement('img'); i.src = u; i.referrerPolicy = 'no-referrer'; $('fotos').appendChild(i); });
    estado('Revisa/corrige los datos y dale Guardar.', 'gris');
  }

  $('fab').onclick = () => {
    const p = $('panel');
    if (p.classList.toggle('abierto')) llenar();
  };
  $('cerrar').onclick = () => $('panel').classList.remove('abierto');
  $('releer').onclick = llenar;
  $('enviar').onclick = () => {
    const casa = { ...datos, notas: $('notas').value.trim() };
    CAMPOS.forEach(k => { casa[k] = $(k).value.trim(); });
    if (!casa.direccion && !casa.lat) estado('⚠️ Sin dirección no se puede calcular el tiempo al CETI (igual se guarda).', 'err');
    $('enviar').disabled = true;
    estado('Guardando… (calculando tiempos al CETI y copiando fotos, tarda ~20 s)', 'gris');
    chrome.runtime.sendMessage({ type: 'guardarCasa', data: casa }, res => {
      $('enviar').disabled = false;
      if (chrome.runtime.lastError) return estado('❌ ' + chrome.runtime.lastError.message + ' (recarga la página)', 'err');
      if (!res || !res.ok) return estado('❌ ' + ((res && res.error) || 'No se pudo guardar'), 'err');
      if (res.duplicada) return estado(`👀 Esta casa ya estaba guardada (fila ${res.fila}).`, 'ok');
      const t = res.tiempos;
      estado(`✅ Guardada en la fila ${res.fila}.` +
        (t && t.ida != null ? ` 🚗 Al CETI: ~${t.ida} min (peor día ${t.idaMax}), regreso ~${t.regreso} min.` : '') +
        (res.aviso ? ' ⚠️ ' + res.aviso : '') +
        (res.version ? ` (script ${res.version})` : ' (⚠️ script viejo: publica la versión nueva)'), 'ok');
    });
  };

  // Mostrar/ocultar según la página (Facebook cambia de URL sin recargar)
  const sincronizar = () => {
    const valida = esPaginaValida();
    if (valida && !host.isConnected) document.documentElement.appendChild(host);
    if (!valida && host.isConnected) { $('panel').classList.remove('abierto'); host.remove(); }
  };
  const iniciar = () => { sincronizar(); setInterval(sincronizar, 1000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();
})();
