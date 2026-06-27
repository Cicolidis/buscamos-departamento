// Service worker: recibe el HTML del aviso desde ZonaProp y lo lleva a la app.
// Si la app ya está abierta en una pestaña, la enfoca y le avisa; si no, abre una nueva.
const APP_URL = 'https://cicolidis.github.io/buscamos-departamento/';
const APP_MATCH = 'https://cicolidis.github.io/buscamos-departamento/*';

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'SEND_TO_APP') enviarAApp(msg.html);
});

async function enviarAApp(html) {
  // El HTML viaja por storage (no por window.name): así sirve para pestaña nueva o existente.
  await chrome.storage.local.set({ pendingIngesta: { html, ts: Date.now() } });

  const tabs = await chrome.tabs.query({ url: APP_MATCH });
  if (tabs.length) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    // La app ya está cargada: avisamos a su content script para que consuma el pendiente.
    chrome.tabs.sendMessage(tab.id, { type: 'INGESTA_NOW' }).catch(() => {});
  } else {
    // No está abierta: la abrimos. inject.js leerá el pendiente al cargar.
    chrome.tabs.create({ url: APP_URL });
  }
}
