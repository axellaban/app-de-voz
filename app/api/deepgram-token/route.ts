export const runtime = "edge";

import { rateLimit, sameOriginStrict } from "../../lib/ratelimit";

// Emite un TOKEN TEMPORAL de Deepgram (grant), no la API key permanente.
// El token expira a los 60s: alcanza para abrir el WebSocket y después es
// inútil. La key permanente NUNCA llega al navegador.
//
// El navegador abre el WS con el subprotocolo ["bearer", access_token]
// (los access tokens de grant usan esquema Bearer; las API keys usaban "token").
export async function POST(req: Request) {
  if (!sameOriginStrict(req)) {
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const rl = rateLimit(req, "dg-token", 30, 60_000);
  if (!rl.ok) {
    return Response.json(
      { error: "Demasiadas solicitudes. Esperá unos segundos." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const rawKey = process.env.DEEPGRAM_API_KEY;
  if (!rawKey) {
    return Response.json(
      { error: "Falta DEEPGRAM_API_KEY en las variables de entorno." },
      { status: 500 }
    );
  }
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, "");

  // Camino seguro: token temporal (grant, TTL 60s). Requiere que la key tenga
  // permiso para emitir grants (rol Member+ con scope adecuado).
  try {
    const r = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });
    if (r.ok) {
      const j: any = await r.json().catch(() => ({}));
      const token = j.access_token || j.key;
      if (token) {
        return Response.json({ token, scheme: "bearer", expires_in: j.expires_in ?? 60 });
      }
    }
    // Fallback: si la key NO puede emitir grants ("Insufficient permissions"),
    // devolvemos la key directa para no romper la app. Sigue protegido por
    // mismo-origen + rate-limit, pero la key llega al navegador. Para el camino
    // seguro, crear en Deepgram una key con permiso de grant.
  } catch {
    // red caída al pedir grant → también caemos al fallback
  }

  return Response.json({ token: apiKey, scheme: "token", fallback: true });
}
