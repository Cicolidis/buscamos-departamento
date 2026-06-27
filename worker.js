/**
 * Worker proxy para parsear avisos de ZonaProp con la API de Anthropic.
 *
 * Recibe POST { "contenido": "<texto o HTML del aviso>" }
 * Devuelve el objeto JSON ya parseado con los campos del departamento.
 *
 * La ANTHROPIC_API_KEY vive como secret del Worker (nunca en el código ni en el cliente).
 * Configurar con:  wrangler secret put ANTHROPIC_API_KEY
 *
 * Seguridad para una app personal estática:
 *  - ALLOWED_ORIGIN restringe qué origen del navegador puede llamar (en [vars] de wrangler.toml).
 *  - APP_TOKEN (opcional) es un token compartido; sube la barrera contra abuso casual.
 *    Configurar con:  wrangler secret put APP_TOKEN
 *    Es honesto decir: como la app es estática, el token viaja en el JS del cliente y es
 *    visible para quien inspeccione. No es secreto fuerte, pero frena el uso casual por
 *    parte de terceros. Para 2 usuarios es razonable.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_INPUT = 30000;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "Usá POST." }, 405, cors);
    }

    // Token compartido opcional
    if (env.APP_TOKEN && request.headers.get("X-App-Token") !== env.APP_TOKEN) {
      return json({ error: "No autorizado." }, 401, cors);
    }

    // Cuerpo
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "El cuerpo no es JSON válido." }, 400, cors); }

    const contenido = String((body && body.contenido) || "").slice(0, MAX_INPUT);
    if (!contenido.trim()) {
      return json({ error: "Falta el campo 'contenido'." }, 400, cors);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Falta configurar ANTHROPIC_API_KEY en el Worker." }, 500, cors);
    }

    const prompt = construirPrompt(contenido);

    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!r.ok) {
        const detalle = await r.text();
        return json({ error: "La API de Anthropic respondió " + r.status, detalle: detalle.slice(0, 500) }, 502, cors);
      }

      const data = await r.json();
      const texto = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const limpio = texto.replace(/```json/gi, "").replace(/```/g, "").trim();

      let obj;
      try { obj = JSON.parse(limpio); }
      catch {
        return json({ error: "No se pudo interpretar la respuesta del modelo.", raw: limpio.slice(0, 500) }, 502, cors);
      }

      return json(obj, 200, cors);
    } catch (e) {
      return json({ error: "Error interno del Worker: " + String(e) }, 500, cors);
    }
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGIN || "*";
  // Si se configuró un origen específico y coincide, lo devolvemos; si está en "*", abrimos.
  const allowOrigin = allowed === "*" ? "*" : (origin === allowed ? origin : allowed);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors },
  });
}

function construirPrompt(contenido) {
  return `Sos un extractor de datos de avisos de alquiler de ZonaProp (Argentina). Te paso el contenido de un aviso (texto visible o HTML). Devolvé ÚNICAMENTE un objeto JSON válido, sin markdown, sin explicaciones, sin texto antes ni después.

Forma exacta del objeto:
{
  "url_zonaprop": "", "titulo": "", "ubicacion": "",
  "precio_alquiler": 0, "moneda_alquiler": "ARS",
  "expensas": 0, "ambientes": 0,
  "superficie_cubierta": 0, "superficie_total": 0, "piso": "",
  "descripcion": "", "contacto_nombre": "", "contacto_telefono": "", "contacto_email": "",
  "fotos": [], "video_url": "", "fecha_publicacion": "",
  "ventajas": [], "desventajas": []
}

Reglas:
- Números como number, sin separadores de miles ni símbolos.
- moneda_alquiler: "ARS" o "USD".
- Si un dato no aparece: "" para strings, 0 para números, [] para arrays.
- fotos: extraé hasta 15 URLs de imágenes del aviso. En HTML buscá etiquetas <img> y URLs de CDN de imágenes (suelen contener "zonaprop" o "naventcdn"). Solo URLs http(s) completas.
- ventajas/desventajas: inferí de la descripción, 0 a 4 ítems cortos cada una.
- descripcion: máximo 600 caracteres.

Contenido del aviso:
<<<
${contenido}
>>>`;
}
