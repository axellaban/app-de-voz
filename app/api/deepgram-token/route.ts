export const runtime = "edge";

// Retorna un token JWT temporal si la clave tiene permisos de Admin,
// o hace un fallback devolviendo la API Key directamente para claves de tipo Member.
export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Falta DEEPGRAM_API_KEY en las variables de entorno." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 30 }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        return Response.json({ token: data.access_token });
      }
    }
  } catch (err) {
    // Ignora errores y continúa con el fallback
  }

  return Response.json({ token: apiKey });
}


