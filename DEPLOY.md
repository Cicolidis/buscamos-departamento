# DEPLOY.md — Pasos para publicar la app

Orden recomendado: primero el Worker, después la app.

---

## Parte 1 — Desplegar el Worker en Cloudflare

Requisitos: una cuenta de Cloudflare (gratis alcanza) y tu `ANTHROPIC_API_KEY` a mano.

```bash
# 1. Instalar wrangler (o usar npx wrangler en cada comando)
npm install -g wrangler

# 2. Iniciar sesión en Cloudflare (abre el navegador)
wrangler login

# 3. Cargar la API key como secret (te la pide de forma interactiva, no queda en el código)
wrangler secret put ANTHROPIC_API_KEY

# 4. (Opcional pero recomendado) token compartido contra abuso casual
wrangler secret put APP_TOKEN
#    Inventá un valor cualquiera, ej: una cadena larga aleatoria. Anotalo: lo vas a
#    necesitar para el cliente (APP_TOKEN en el HTML).

# 5. Desplegar
wrangler deploy
```

Al terminar, wrangler te imprime la URL del Worker, algo como:
`https://deptos-parser.TU-SUBDOMINIO.workers.dev`

Anotá esa URL. **Probalo** rápido:

```bash
curl -X POST https://deptos-parser.TU-SUBDOMINIO.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-App-Token: EL-TOKEN-QUE-PUSISTE" \
  -d '{"contenido":"Departamento 2 ambientes en Palermo, $450000 por mes, expensas 90000."}'
```

Debería devolver un JSON con los campos extraídos.

---

## Parte 2 — Conectar el HTML al Worker

En el `index.html`, reemplazá la función `parsearContenido` (y la línea de configuración
de arriba) por esto. Pegá la URL del Worker y el token si lo usaste.

```javascript
/* ============================================================
   PARSEO VÍA WORKER DE CLOUDFLARE (producción)
   ============================================================ */
const WORKER_URL = "https://deptos-parser.TU-SUBDOMINIO.workers.dev"; // ← tu URL real
const APP_TOKEN  = ""; // ← si configuraste APP_TOKEN en el Worker, ponelo acá; si no, dejalo ""

async function parsearContenido(contenido) {
  const headers = { "Content-Type": "application/json" };
  if (APP_TOKEN) headers["X-App-Token"] = APP_TOKEN;

  const resp = await fetch(WORKER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ contenido }),
  });

  if (!resp.ok) {
    let msg = "El parser respondió " + resp.status;
    try { const e = await resp.json(); if (e.error) msg += " · " + e.error; } catch {}
    throw new Error(msg + ". Revisá el contenido pegado o cargá el aviso a mano.");
  }
  return await resp.json();
}
```

> Nota: la versión vieja parseaba la respuesta de la API en el cliente. Ahora el Worker
> ya devuelve el objeto JSON listo, por eso esta función es más simple.

---

## Parte 3 — Publicar en GitHub Pages

```bash
# Renombrar para tener una URL limpia
mv deptos-laura-camilo.html index.html

# Crear .gitignore (por las dudas, para no subir secrets locales)
echo ".dev.vars" >> .gitignore

git add .
git commit -m "App de deptos + worker de parseo"
# Creá el repo en GitHub y seguí las instrucciones para 'git remote add origin ...'
git push -u origin main
```

Después, en GitHub: **Settings → Pages → Build and deployment → Deploy from a branch →
`main` / `root` → Save.**

En 1-2 minutos tu app queda en:
`https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`

---

## Parte 4 — Cerrar el círculo de seguridad (CORS)

Ahora que sabés el dominio de Pages, restringí el Worker a ese origen:

1. En `wrangler.toml`, poné `ALLOWED_ORIGIN = "https://TU-USUARIO.github.io"`
   (solo esquema + host, **sin** el nombre del repo).
2. Re-desplegá: `wrangler deploy`.

Con esto, solo tu app puede usar el Worker desde un navegador.

---

## Checklist final

- [ ] Worker desplegado y probado con curl.
- [ ] `WORKER_URL` (y `APP_TOKEN` si aplica) puestos en el HTML.
- [ ] App en GitHub Pages cargando departamentos desde Firestore.
- [ ] Parseo de un aviso real funciona end-to-end.
- [ ] `ALLOWED_ORIGIN` apuntando al dominio real y Worker re-desplegado.
- [ ] (Antes del 25/07/2026) Reglas de Firestore renovadas.
