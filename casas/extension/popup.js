const $ = id => document.getElementById(id);
const estado = (t, cls) => { $('estado').textContent = t; $('estado').className = cls || ''; };

chrome.storage.sync.get(['scriptUrl', 'token', 'sheetUrl'], c => {
  $('url').value = c.scriptUrl || '';
  $('token').value = c.token || '';
  if (c.sheetUrl) { $('sheet').href = c.sheetUrl; $('sheet').style.display = 'block'; }
});

$('guardar').onclick = () => {
  const scriptUrl = $('url').value.trim();
  if (scriptUrl && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(scriptUrl)) {
    return estado('La URL debe ser https://script.google.com/…/exec', 'err');
  }
  chrome.storage.sync.set({ scriptUrl, token: $('token').value.trim() }, () => estado('Guardado ✔', 'ok'));
};

$('probar').onclick = async () => {
  const scriptUrl = $('url').value.trim();
  if (!scriptUrl) return estado('Primero pega la URL', 'err');
  estado('Probando…');
  try {
    const r = await fetch(scriptUrl + '?token=' + encodeURIComponent($('token').value.trim()));
    const j = JSON.parse(await r.text());
    if (!j.ok) return estado('❌ ' + (j.error || 'Error'), 'err');
    if (j.sheetUrl) {
      chrome.storage.sync.set({ sheetUrl: j.sheetUrl });
      $('sheet').href = j.sheetUrl; $('sheet').style.display = 'block';
    }
    estado('✅ Conectado: ' + (j.mensaje || 'ok'), 'ok');
  } catch (e) {
    estado('❌ No respondió bien. ¿Publicaste el script para "Cualquier persona"?', 'err');
  }
};
