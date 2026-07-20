export const runtime = "edge";

import { capacityClosed, rateLimit, sameOriginStrict } from "../../../lib/ratelimit";

// Voz del entrevistador del simulador. gpt-4o-mini-tts soporta `instructions`
// (tono/acento); tts-1 no, por eso el retry lo omite.
const TTS_MODEL = "gpt-4o-mini-tts";
const TTS_MODEL_FALLBACK = "tts-1";
// coral = voz femenina cálida; el ritmo se pide por instructions (el modelo
// nuevo no soporta `speed`, el fallback tts-1 sí).
const TTS_VOICE = "coral";
const FALLBACK_SPEED = 1.15;

const INSTRUCTIONS: Record<"es" | "en", string> = {
  es: "Hablá como una entrevistadora profesional, cálida y amena, en español rioplatense neutro. Ritmo ágil, un poco más rápido que una conversación normal, pero sin sonar apurada ni leída.",
  en: "Speak like a warm, friendly and professional female job interviewer. Brisk conversational pace, slightly faster than normal, without sounding rushed.",
};

async function requestSpeech(apiKey: string, model: string, text: string, lang: "es" | "en") {
  const body: Record<string, unknown> = {
    model,
    voice: TTS_VOICE,
    input: text,
    response_format: "mp3",
  };
  if (model === TTS_MODEL) {
    body.instructions = INSTRUCTIONS[lang];
  } else {
    body.speed = FALLBACK_SPEED;
  }
  return fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

export async function POST(req: Request) {
  if (capacityClosed()) {
    return Response.json(
      { error: "Cupos agotados por hoy. Sumate a la lista de espera y te avisamos.", closed: true },
      { status: 503 }
    );
  }
  if (!sameOriginStrict(req)) {
    return new Response("Origen no permitido.", { status: 403 });
  }
  // ~15 oraciones por sesión de 5 preguntas; 40/min deja margen de reintentos.
  const rl = rateLimit(req, "sim-tts", 40, 60_000);
  if (!rl.ok) {
    return new Response("Demasiadas solicitudes. Esperá un momento.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Falta OPENAI_API_KEY para la voz del entrevistador.", { status: 500 });
  }

  let body: { text?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Body inválido.", { status: 400 });
  }

  const text = (body.text || "").trim().slice(0, 600);
  if (!text) {
    return new Response("Texto vacío.", { status: 400 });
  }
  const lang: "es" | "en" = body.lang === "en" ? "en" : "es";

  let upstream = await requestSpeech(apiKey, TTS_MODEL, text, lang);
  if (!upstream.ok && upstream.status >= 400 && upstream.status < 500) {
    upstream = await requestSpeech(apiKey, TTS_MODEL_FALLBACK, text, lang);
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`TTS error: ${detail || upstream.status}`, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
