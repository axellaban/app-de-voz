export const runtime = "edge";

import { capacityClosed, rateLimit, sameOriginStrict } from "../../lib/ratelimit";

type Provider = "gemini" | "anthropic" | "openai";

const GEMINI_MODEL_OVERRIDE = process.env.GEMINI_MODEL || "";
const ANTHROPIC_MODEL_OVERRIDE = process.env.ANTHROPIC_MODEL || "";
const OPENAI_MODEL_OVERRIDE = process.env.OPENAI_MODEL || "";

const SYSTEM_PROMPT_INTERVIEWER = `Sos el ENTREVISTADOR. No sos un asistente que aconseja: estás en la llamada haciendo la entrevista en vivo al candidato, ahora mismo.

Recibís:
1. EMPRESA y DESCRIPCIÓN DEL PUESTO (contexto).
2. El PERFIL del candidato (su CV, experiencia, logros).
3. El TIPO DE ENTREVISTA (Técnica, Comportamiento, HR, General).
4. El HISTORIAL de la entrevista hasta ahora (todas las preguntas hechas por vos y las respuestas dadas por el candidato).

Tu tarea: Generar la SIGUIENTE PREGUNTA de la entrevista.
Reglas críticas:
1. Sé un entrevistador profesional, realista y directo. Adapta tu tono al seniority del puesto.
2. Si el HISTORIAL está vacío, da una breve bienvenida (máximo 1 oración) y haz la primera pregunta de forma natural basada en su CV y el puesto.
3. Si ya hay historial, lee la última respuesta del candidato. Podés hacer un comentario muy breve de transición o repreguntar sobre lo que dijo (follow-up) para profundizar, y luego formula la siguiente pregunta.
4. Mantén tu respuesta MUY corta y conversacional (máximo 2-3 oraciones en total). Debe ser ideal para leerse de un vistazo o ser leída por un sintetizador de voz.
5. Haz una sola pregunta a la vez. No acumules preguntas.
6. Responde SIEMPRE en el idioma indicado en "## IDIOMA DE LA RESPUESTA".
7. Devuelve ÚNICAMENTE el texto que diría el entrevistador. Sin preámbulos, sin "Aquí está la pregunta", sin etiquetas como "Pregunta:" ni "Entrevistador:".
8. Si el PROGRESO indica que es la ÚLTIMA pregunta, avisale brevemente al candidato que es la última antes de formularla.
9. Si recibís una imagen del candidato (un frame de su cámara), podés hacer UN comentario muy breve, cálido y profesional sobre lo que ves (su energía, su sonrisa, que se lo ve preparado) antes de la pregunta — solo si suma y suena natural. Nunca evalúes aspecto físico, ropa ni el lugar donde está, y nunca lo incomodes. Si no hay nada natural para decir, no menciones la imagen.`;

const SYSTEM_PROMPT_FEEDBACK = `Sos un COACH DE ENTREVISTAS experto. Tu tarea es analizar una simulación de entrevista completa y generar un reporte de feedback detallado, constructivo y accionable.
Recibís:
1. EMPRESA y DESCRIPCIÓN DEL PUESTO.
2. PERFIL DEL CANDIDATO.
3. El HISTORIAL completo de la entrevista (preguntas del entrevistador y respuestas del candidato).

Tu tarea: Generar un reporte en formato JSON con la siguiente estructura exacta:
{
  "score": 85,
  "summary": "Resumen general del desempeño...",
  "indicators": [
    { "name": "Claridad", "score": 80 },
    { "name": "Estructura", "score": 70 },
    { "name": "Fit con el puesto", "score": 75 },
    { "name": "Confianza", "score": 65 }
  ],
  "strengths": [
    "Fortaleza 1...",
    "Fortaleza 2..."
  ],
  "improvements": [
    "Mejora 1...",
    "Mejora 2..."
  ],
  "questions": [
    {
      "question": "Pregunta realizada",
      "answer": "Respuesta dada",
      "score": 72,
      "analysis": "Análisis de qué estuvo bien y qué faltó en esa respuesta específica.",
      "suggestion": "Una propuesta de respuesta ideal en primera persona (yo) basada en su perfil real, lista para decir en voz alta."
    }
  ]
}

Sobre "indicators": son SIEMPRE esos 4 nombres exactos (Claridad, Estructura, Fit con el puesto, Confianza), cada uno con un score 0-100 honesto. Cada pregunta lleva también su "score" 0-100 individual.

Reglas críticas:
- Sé honesto pero motivador. Valora la señal técnica, el fit cultural y la comunicación.
- No inventes logros que no estén en el perfil del candidato.
- Devuelve ÚNICAMENTE el objeto JSON válido. No uses bloques de código Markdown como \`\`\`json ni texto explicativo antes o después. Devuelve solo las llaves del JSON.`;

function resolveModel(provider: Provider, requested: string): string {
  if (provider === "anthropic") return ANTHROPIC_MODEL_OVERRIDE || requested || "claude-haiku-4-5";
  if (provider === "openai") return OPENAI_MODEL_OVERRIDE || requested || "gpt-4o-mini";
  return GEMINI_MODEL_OVERRIDE || requested || "gemini-2.5-flash";
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

  const rl = rateLimit(req, "simulador", 30, 60_000);
  if (!rl.ok) {
    return new Response("Demasiadas solicitudes. Esperá un momento.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  let body: {
    action?: "next-question" | "feedback";
    profile?: string;
    company?: string;
    role?: string;
    interviewType?: string;
    answerLang?: string;
    provider?: string;
    model?: string;
    history?: Array<{ question: string; answer: string }>;
    questionIndex?: number;
    questionsCount?: number;
    image?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Body inválido.", { status: 400 });
  }

  const action = body.action || "next-question";
  const provider: Provider =
    body.provider === "anthropic" || body.provider === "openai" ? body.provider : "gemini";
  const model = resolveModel(provider, (body.model || "").slice(0, 100));

  const profile = (body.profile || "").slice(0, 8000);
  const company = (body.company || "").slice(0, 200);
  const role = (body.role || "").slice(0, 2000);
  const interviewType = (body.interviewType || "General").slice(0, 100);
  const answerLang = body.answerLang === "en" ? "en" : "es";

  // Truncar cada turno: respuestas dictadas muy largas inflan tokens y la
  // latencia del feedback (que tiene que entrar en los 25s de Edge).
  const history = (body.history || []).slice(0, 20).map((h) => ({
    question: String(h?.question || "").slice(0, 600),
    answer: String(h?.answer || "").slice(0, 2500),
  }));
  const historyText = history.length > 0
    ? history.map((h, i) => `Pregunta ${i + 1}: ${h.question}\nRespuesta ${i + 1}: ${h.answer}`).join("\n\n")
    : "(Aún no comenzó la entrevista)";

  const qIndex = Math.max(1, Math.min(50, Number(body.questionIndex) || history.length + 1));
  const qCount = Math.max(0, Math.min(20, Number(body.questionsCount) || 0));
  const progressText = qCount
    ? `Esta es la pregunta ${qIndex} de ${qCount}.${qIndex >= qCount ? " Es la ÚLTIMA pregunta de la entrevista." : ""}`
    : "(sin límite definido)";

  const answerLangLabel =
    answerLang === "en"
      ? "Inglés (English). Formula tus preguntas en inglés."
      : "Español rioplatense (Argentina). Formulá tus preguntas con voseo (vos, contame, tenés), como un entrevistador porteño.";

  const userContent = `## EMPRESA
${company || "(sin especificar)"}

## DESCRIPCIÓN DEL PUESTO
${role || "(sin especificar)"}

## PERFIL DEL CANDIDATO
${profile || "(sin perfil cargado)"}

## TIPO DE ENTREVISTA
${interviewType}

## PROGRESO
${progressText}

## IDIOMA DE LA RESPUESTA
${answerLangLabel}

## HISTORIAL DE LA ENTREVISTA
${historyText}`;

  const isFeedback = action === "feedback";
  const systemPrompt = isFeedback ? SYSTEM_PROMPT_FEEDBACK : SYSTEM_PROMPT_INTERVIEWER;

  // Frame opcional de la cámara del candidato (data URL JPEG chico) para que
  // el entrevistador "lo vea". Solo se usa en next-question y solo con Gemini.
  let image: { mimeType: string; data: string } | null = null;
  if (!isFeedback && typeof body.image === "string" && body.image.length < 400_000) {
    const m = body.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (m) image = { mimeType: m[1], data: m[2] };
  }

  const FALLBACK: Record<Provider, string[]> = {
    openai: ["gpt-4.1-mini", "gpt-4o-mini"],
    anthropic: ["claude-haiku-4-5"],
    gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  };
  const candidates = [model, ...FALLBACK[provider].filter((m) => m !== model)];

  try {
    if (isFeedback) {
      return await getFeedback(provider, candidates, systemPrompt, userContent);
    } else {
      if (provider === "anthropic") return await streamAnthropic(candidates, systemPrompt, userContent);
      if (provider === "openai") return await streamOpenAI(candidates, systemPrompt, userContent);
      return await streamGemini(candidates, systemPrompt, userContent, image);
    }
  } catch (err: any) {
    return new Response(`Error del modelo: ${err?.message || "desconocido"}`, { status: 502 });
  }
}

function textStreamResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function sseTextStream(
  upstream: ReadableStream<Uint8Array>,
  extract: (json: string) => string | null
): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.getReader();
  let buffer = "";
  return new ReadableStream({
    // El pull loopea hasta encolar datos reales: si resuelve sin encolar,
    // Vercel Edge puede pausar el stream y la sala queda colgada.
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        let enqueuedAny = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (!json || json === "[DONE]") continue;
          try {
            const text = extract(json);
            if (text) {
              controller.enqueue(encoder.encode(text));
              enqueuedAny = true;
            }
          } catch {
            // fragmento incompleto: se ignora
          }
        }
        if (enqueuedAny) return;
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

async function streamGemini(
  models: string[],
  systemPrompt: string,
  userContent: string,
  image?: { mimeType: string; data: string } | null
): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("Falta GEMINI_API_KEY en las variables de entorno.", { status: 500 });
  }
  const parts: Array<Record<string, unknown>> = [{ text: userContent }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  const payload = {
    contents: [{ role: "user", parts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 512,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  let detail = "";
  for (const model of models) {
    if (!model) continue;
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (upstream.ok && upstream.body) {
      return textStreamResponse(
        sseTextStream(upstream.body, (json) => {
          const evt = JSON.parse(json);
          return evt.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        })
      );
    }
    detail = await upstream.text().catch(() => "");
  }
  return new Response(`Gemini error: ${detail}`, { status: 502 });
}

async function streamAnthropic(models: string[], systemPrompt: string, userContent: string): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "Falta ANTHROPIC_API_KEY para usar Claude. Cargá el token o elegí otro modelo.",
      { status: 500 }
    );
  }
  let detail = "";
  for (const model of models) {
    if (!model) continue;
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        temperature: 0.5,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        stream: true,
      }),
    });
    if (upstream.ok && upstream.body) {
      return textStreamResponse(
        sseTextStream(upstream.body, (json) => {
          const evt = JSON.parse(json);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            return evt.delta.text ?? null;
          }
          return null;
        })
      );
    }
    detail = await upstream.text().catch(() => "");
  }
  return new Response(`Claude error: ${detail}`, { status: 502 });
}

async function streamOpenAI(models: string[], systemPrompt: string, userContent: string): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      "Falta OPENAI_API_KEY para usar GPT. Cargá el token o elegí otro modelo.",
      { status: 500 }
    );
  }
  let detail = "";
  for (const model of models) {
    if (!model) continue;
    const isReasoning = /^(gpt-5|o[0-9])/.test(model);
    const reqBody: Record<string, unknown> = {
      model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    };
    if (isReasoning) {
      reqBody.max_completion_tokens = 900;
      reqBody.reasoning_effort = "low";
    } else {
      reqBody.max_tokens = 512;
      reqBody.temperature = 0.5;
    }
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });
    if (upstream.ok && upstream.body) {
      return textStreamResponse(
        sseTextStream(upstream.body, (json) => {
          const evt = JSON.parse(json);
          return evt.choices?.[0]?.delta?.content ?? null;
        })
      );
    }
    detail = await upstream.text().catch(() => "");
  }
  return new Response(`GPT error: ${detail}`, { status: 502 });
}

// Los modelos a veces desobedecen y envuelven el JSON en fences ```json ...```
// o le anteponen texto: limpiar antes de parsear para no tirar el reporte.
function parseModelJson(text: string): unknown {
  const cleaned = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("JSON inválido del modelo");
  }
}

async function getFeedback(
  provider: Provider,
  models: string[],
  systemPrompt: string,
  userContent: string
): Promise<Response> {
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return new Response("Falta OPENAI_API_KEY.", { status: 500 });
    let detail = "";
    for (const model of models) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        try {
          return Response.json(parseModelJson(j.choices?.[0]?.message?.content || "{}"));
        } catch {
          detail = "JSON inválido del modelo";
          continue;
        }
      }
      detail = await res.text().catch(() => "");
    }
    return new Response(`OpenAI feedback error: ${detail}`, { status: 502 });
  }

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return new Response("Falta ANTHROPIC_API_KEY.", { status: 500 });
    let detail = "";
    for (const model of models) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        try {
          return Response.json(parseModelJson(j.content?.[0]?.text || "{}"));
        } catch {
          detail = "JSON inválido del modelo";
          continue;
        }
      }
      detail = await res.text().catch(() => "");
    }
    return new Response(`Anthropic feedback error: ${detail}`, { status: 502 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return new Response("Falta GEMINI_API_KEY.", { status: 500 });
  let detail = "";
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userContent }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.2,
            // Sin thinking y con margen de tokens: el reporte tiene que
            // empezar a responder antes del límite de 25s de Vercel Edge, y
            // 2048 se quedaba corto con 5 preguntas (JSON truncado = parse roto).
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    if (res.ok) {
      const j = await res.json();
      try {
        return Response.json(parseModelJson(j.candidates?.[0]?.content?.parts?.[0]?.text || "{}"));
      } catch {
        detail = "JSON inválido del modelo";
        continue;
      }
    }
    detail = await res.text().catch(() => "");
  }
  return new Response(`Gemini feedback error: ${detail}`, { status: 502 });
}
