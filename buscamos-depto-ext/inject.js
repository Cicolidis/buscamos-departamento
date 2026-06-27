// Corre en la app. Consume un HTML pendiente (dejado por el service worker) y lo
// inyecta en el flujo de ingesta: abre "Agregar", pega el HTML y dispara "Extraer datos".
let consumiendo = false;

// Lee el pendiente de storage (si es reciente), lo borra y arranca la ingesta.
async function consumirPendiente() {
  if (consumiendo) return;
  const { pendingIngesta } = await chrome.storage.local.get('pendingIngesta');
  if (!pendingIngesta || !pendingIngesta.html) return;
  // Ignorar payloads viejos (p. ej. una recarga suelta de la app no debe re-ingestar).
  if (Date.now() - pendingIngesta.ts > 60000) { chrome.storage.local.remove('pendingIngesta'); return; }
  consumiendo = true;
  await chrome.storage.local.remove('pendingIngesta');
  inyectar(pendingIngesta.html);
}

function inyectar(html) {
  const tryInject = () => {
    const agregarBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.trim() === '+ Agregar');
    if (!agregarBtn) return setTimeout(tryInject, 300);

    agregarBtn.click();

    setTimeout(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return setTimeout(tryInject, 300);

      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype, 'value'
      ).set;
      setter.call(ta, html);
      ta.dispatchEvent(new Event('input', { bubbles: true }));

      setTimeout(() => {
        const extraerBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim() === 'Extraer datos');
        if (extraerBtn) extraerBtn.click();
        consumiendo = false;
      }, 300);
    }, 500);
  };

  tryInject();
}

// Pestaña existente: el service worker nos avisa para consumir el pendiente.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'INGESTA_NOW') consumirPendiente();
});

// Pestaña recién abierta: consumir al cargar.
consumirPendiente();
