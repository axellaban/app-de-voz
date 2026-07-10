export const runtime = "edge";

// Retorna la API Key directamente para que el navegador abra el WebSocket contra Deepgram.
// Esto permite que funcione con cualquier rol de clave (incluido Member) sin requerir privilegios de Admin.
//
// Ojo: NO llamar a /v1/auth/grant acá. Ese endpoint exige que la key tenga
// scope Admin/Owner (falla con keys Member) y, cuando funciona, el token que
// devuelve no siempre trae permisos suficientes para abrir el WebSocket de
// streaming — rompe la conexión en silencio. Devolver la key tal cual es lo
// que funciona con cualquier tipo de key.
export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Falta DEEPGRAM_API_KEY en las variables de entorno." },
      { status: 500 }
    );
  }

  // Validación previa: el WebSocket del navegador JAMÁS expone el motivo real
  // de un fallo de handshake (por spec) — solo un "error" genérico sin código
  // ni mensaje. Para diagnosticar de verdad, probamos el MISMO permiso que
  // usa el streaming real: pegamos al endpoint REST /v1/listen (no al WS)
  // con los mismos parámetros, que es la forma de ver la respuesta real de
  // Deepgram (código HTTP + header dg-error) sin las limitaciones del navegador.
  // Un 401/403 acá es 1:1 con lo que rompe el WS. Un 200/400 (audio inválido,
  // esperado porque mandamos silencio) confirma que la key SÍ tiene permiso
  // de streaming y el problema está en otro lado (red, firewall, plan).
  try {
    const silence = new Uint8Array(3200); // ~100ms de PCM16 mono a 16kHz en silencio
    const check = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=es&encoding=linear16&sample_rate=16000&channels=1",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "audio/raw",
        },
        body: silence,
      }
    );

    if (check.status === 401 || check.status === 403) {
      const dgError = check.headers.get("dg-error");
      const dgRequestId = check.headers.get("dg-request-id");
      return Response.json(
        {
          error: `Deepgram rechazó la API key para streaming (${check.status})${
            dgError ? `: ${dgError}` : ""
          }. Revisá DEEPGRAM_API_KEY en Vercel o generá una key nueva en console.deepgram.com.`,
          dgRequestId,
        },
        { status: 502 }
      );
    }
    if (check.status === 402) {
      return Response.json(
        {
          error:
            "Deepgram devolvió 402: sin crédito/balance en el proyecto. Revisá el saldo en console.deepgram.com → Billing.",
        },
        { status: 502 }
      );
    }
  } catch {
    // Falla de red al validar: seguimos con el flujo normal de todas formas.
  }

  return Response.json({ token: apiKey });
}
