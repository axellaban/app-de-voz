export const runtime = "edge";

// Guard de mismo-origen: bloquea que otro sitio pida la key desde el navegador.
// No es protección fuerte (un atacante server-side puede spoofear Origin), pero
// corta el abuso trivial. Protección real requiere auth + rate-limit.
function sameOriginOk(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // sin Origin (native/server) — se permite
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Retorna la API Key directamente para que el navegador abra el WebSocket contra Deepgram.
// Esto permite que funcione con cualquier rol de clave (incluido Member) sin requerir privilegios de Admin.
export async function POST(req: Request) {
  if (!sameOriginOk(req)) {
    return Response.json({ error: "Origen no permitido." }, { status: 403 });
  }
  const rawKey = process.env.DEEPGRAM_API_KEY;
  if (!rawKey) {
    return Response.json(
      { error: "Falta DEEPGRAM_API_KEY en las variables de entorno." },
      { status: 500 }
    );
  }
  const apiKey = rawKey.trim().replace(/^["']|["']$/g, "");

  return Response.json({ token: apiKey });
}

