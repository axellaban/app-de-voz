export const runtime = "edge";

// Retorna la API Key directamente para que el navegador abra el WebSocket contra Deepgram.
// Esto permite que funcione con cualquier rol de clave (incluido Member) sin requerir privilegios de Admin.
export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Falta DEEPGRAM_API_KEY en las variables de entorno." },
      { status: 500 }
    );
  }

  return Response.json({ token: apiKey });
}

