// Recibe la casa desde content.js y la manda al Apps Script del Google Sheet.
// Se hace aquí (y no en la página) para que el sitio no bloquee la petición por CORS.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'guardarCasa') {
    enviar(msg.data)
      .then(sendResponse)
      .catch(e => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true; // respuesta asíncrona
  }
});

async function enviar(data) {
  const { scriptUrl, token } = await chrome.storage.sync.get(['scriptUrl', 'token']);
  if (!scriptUrl) {
    throw new Error('Falta configurar la URL del Apps Script: clic en el ícono de la extensión.');
  }
  const r = await fetch(scriptUrl, {
    method: 'POST',
    // text/plain evita el "preflight" que Apps Script no soporta
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...data, token: token || '' }),
    redirect: 'follow'
  });
  const txt = await r.text();
  let res;
  try {
    res = JSON.parse(txt);
  } catch (_) {
    throw new Error('El Apps Script respondió algo raro (¿la URL termina en /exec y está publicado para "Cualquier persona"?): ' + txt.slice(0, 150));
  }
  if (res.sheetUrl) chrome.storage.sync.set({ sheetUrl: res.sheetUrl });
  return res;
}
