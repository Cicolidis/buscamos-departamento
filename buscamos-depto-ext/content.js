// Botón flotante en la página del aviso de ZonaProp.
// Al clickear, manda el HTML del aviso al service worker (que decide a qué pestaña va).
if (!document.getElementById('bd-enviar-btn')) {
  const btn = document.createElement('button');
  btn.id = 'bd-enviar-btn';
  btn.textContent = '🏠 Enviar a Buscamos Depto';
  btn.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    background: #00d4aa;
    color: #111;
    font-weight: bold;
    font-size: 15px;
    padding: 12px 20px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: background 0.2s;
  `;

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'SEND_TO_APP',
      html: document.documentElement.outerHTML,
    });
    // Feedback breve.
    const original = btn.textContent;
    btn.textContent = '✓ Enviado';
    btn.style.background = '#34d399';
    setTimeout(() => { btn.textContent = original; btn.style.background = '#00d4aa'; }, 1500);
  });

  document.body.appendChild(btn);
}
