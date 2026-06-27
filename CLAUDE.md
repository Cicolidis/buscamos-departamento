# CLAUDE.md — App de búsqueda de departamentos (Juju & Laura)

Contexto de proyecto para Claude Code. Leé esto antes de tocar nada.

## Qué es

App web de uso personal (2 usuarios: **Juju** y **Laura Beat**) para gestionar la búsqueda
de departamentos en alquiler en Buenos Aires. Tablero kanban con 4 columnas, fichas con
fotos/precio/estado, valoración por estrellas y carga de avisos de ZonaProp mediante parseo
con IA.

## Archivos

- `index.html` (o `deptos-laura-camilo.html`) — la app completa. React + ReactDOM + Babel
  standalone + Firebase (compat) + Tailwind, **todo por CDN en un solo archivo**. Sin build step.
- `worker.js` — Cloudflare Worker que hace de proxy a la API de Anthropic para el parseo.
- `wrangler.toml` — config del Worker.

## Arquitectura y la tensión central (importante)

La función `parsearContenido` del HTML llama a un servicio externo para convertir el
texto/HTML de un aviso en JSON estructurado. Hay dos entornos posibles:

- **Dentro de claude.ai (artifact):** se puede llamar a `api.anthropic.com` sin clave. NO es
  el caso de producción.
- **En GitHub Pages (producción real):** NO se puede llamar a la API sin clave. Por eso existe
  el Worker: el navegador llama al Worker, el Worker agrega la `ANTHROPIC_API_KEY` (guardada
  como secret) y llama a Anthropic.

El objetivo del proyecto es la versión de producción: **HTML en GitHub Pages → Worker → Anthropic.**

## Tarea pendiente

1. Desplegar el Worker en Cloudflare (ver `DEPLOY.md`).
2. En el HTML, cambiar `parsearContenido` para que apunte al Worker en vez de a
   `api.anthropic.com`. El reemplazo exacto está en `DEPLOY.md`.
3. Renombrar el HTML a `index.html` y publicar en GitHub Pages.
4. Actualizar `ALLOWED_ORIGIN` en `wrangler.toml` con el dominio real de Pages y re-desplegar.

## Convenciones (respetar)

- **Toda la interfaz en español.** Mensajes de error claros y accionables.
- **Dark mode**, limpio y minimalista. Paleta ya definida en las variables CSS del `<head>`.
- **Firestore en tiempo real** vía `onSnapshot`; la colección es `departamentos`.
- Cada escritura registra `creado_por`/`creado_en` y `modificado_por`/`modificado_en`.
- `estrellas`: 0 = "sin valorar" (se muestra distinto), 1 a 3 = valoración.
- Kanban: 4 columnas `por_visitar` | `visitado` | `favorito` | `descartado`.
  En desktop, drag & drop nativo HTML5. En mobile, tabs + selector "Mover a".

## Reglas de seguridad (no romper)

- **NUNCA** poner la `ANTHROPIC_API_KEY` en el HTML, en `worker.js` ni en `wrangler.toml`.
  Va solo como secret de Cloudflare (`wrangler secret put`).
- **NUNCA** commitear secrets al repo. Si creás un `.dev.vars` para pruebas locales, agregalo
  a `.gitignore`.
- La config de Firebase (`firebaseConfig`) sí puede ir en el cliente: son claves públicas de
  proyecto, no secretos. La protección real son las reglas de Firestore.
- Reglas de Firestore actuales: acceso abierto hasta el 25/07/2026. Después de esa fecha hay
  que renovarlas o la app deja de leer/escribir.

## Estilo de trabajo esperado

- Antes de cambios no triviales, mostrá el plan y esperá OK (usá el modo plan).
- Cambios chicos y revisables. Hacé commit antes de empezar como red de seguridad.
