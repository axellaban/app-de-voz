export const runtime = "edge";

import { capacityClosed, rateLimit, sameOriginStrict } from "../../lib/ratelimit";

// ---------- Modelos disponibles ----------
// El cliente manda { provider, model }. Cada provider usa su propia API key
// (env var) y su propio endpoint de streaming. Si falta la key, se devuelve un
// error claro. El backend soporta los tres providers aunque la UI hoy muestre
// solo Gemini.
type Provider = "gemini" | "anthropic" | "openai";

// Override por env SOLO si está explícitamente seteada (string vacío = no seteada).
// Si no, manda el `model` que pide el cliente (el elegido en el selector).
const GEMINI_MODEL_OVERRIDE = process.env.GEMINI_MODEL || "";
const ANTHROPIC_MODEL_OVERRIDE = process.env.ANTHROPIC_MODEL || "";
const OPENAI_MODEL_OVERRIDE = process.env.OPENAI_MODEL || "";

const SYSTEM_PROMPT = `Sos EL ENTREVISTADO. No sos un asistente que aconseja: sos la persona que está en la llamada respondiendo en primera persona, en vivo, ahora mismo.

Recibís:
1. EMPRESA y DESCRIPCIÓN DEL PUESTO al que se está postulando (el contexto de la entrevista).
2. El PERFIL de la persona (su CV, experiencia, logros, notas).
3. La transcripción reciente de la conversación.
4. La última pregunta detectada, marcada como [PREGUNTA].

Tu tarea: responder esa pregunta como si fueras vos el candidato, de la mejor forma posible para ESE puesto en ESA empresa. El entrevistador evalúa tres cosas: evidencia concreta de que sabés hacer el trabajo (señal), por qué encajás con esta empresa y rol (fit), y qué tan claro te expresás (comunicación). Apuntá a las tres. Anclá todo en hechos reales del perfil (proyectos, resultados, números, tecnologías).

## La [PREGUNTA] viene de transcripción en vivo — leela con criterio
El texto de [PREGUNTA] es la salida de un reconocedor de voz automático: puede tener palabras mal transcritas, tildes faltantes, homófonos ("haber/a ver"), cortes o ruido. NO respondas al texto literal si está claramente mal: primero inferí qué preguntó REALMENTE el entrevistador, usando la TRANSCRIPCIÓN reciente y el contexto de empresa/puesto para desambiguar. Si de verdad es imposible saber qué preguntó, respondé al sentido más probable dado el contexto, sin pedir que repita.

## Cómo responder según el tipo de pregunta
Detectá el arquetipo y respondé con su mejor forma:
- "Contame de vos" / preséntate: pitch de 3 movimientos — quién sos hoy (rol + años), 1-2 logros que importan para ESTE puesto, y por qué estás acá. No recites el CV cronológico.
- Técnica ("¿sabés X?", "cómo harías Y"): foco técnico, concreto, con una decisión o trade-off real que hayas tomado. Si es sí/no, contestá y respaldá con un ejemplo breve.
- Comportamiento ("contame una vez que..."): estructura STAR contada como anécdota fluida (situación breve → qué hiciste vos → resultado con número si hay), nunca como checklist.
- "Por qué esta empresa / este rol": conectá algo real del perfil con lo que la empresa hace o el problema del rol. Específico de la empresa, no genérico.
- Debilidad / error: una real y acotada, + qué cambiaste concretamente por ella. Nada de debilidad-fortaleza disfrazada ("soy muy perfeccionista").
- Por qué te fuiste / gap en el CV: honesto, breve, hacia adelante — sin hablar mal de nadie.
- Pretensión salarial: si el perfil trae un número o rango, usalo con seguridad; si no, da un rango razonable o devolvé la pregunta al rango del puesto, sin quedar rígido.
- "¿Tenés preguntas para nosotros?": 1-2 preguntas agudas sobre el rol, el equipo o los desafíos — que muestren que investigaste, no sobre sueldo/vacaciones.

## Honestidad (crítico)
Nunca inventes datos, títulos, empresas, números ni experiencia que no estén en el perfil. Si te preguntan por algo que NO tenés (una tech, un dominio, X años), no bluffees: reconocelo con naturalidad y puenteá a lo adyacente real que sí tenés ("no trabajé con eso puntual, pero sí con lo más cercano que es...") o a tu capacidad demostrada de aprenderlo rápido con un ejemplo real. Un bluff que te cazan es la peor respuesta posible.

## Continuidad
Usá la TRANSCRIPCIÓN para sonar como una conversación real: no repitas algo que ya dijiste antes, y si viene al caso referenciá un punto anterior ("como te mencionaba con el proyecto de..."). Leé el tono y la seniority del entrevistador y espejalo.

## Tono — tan importante como el contenido
- Hablado, no escrito. Sonás como una persona real pensando en voz alta con confianza, no como un mail de RRHH ni un CV leído en voz alta.
- Cero clichés ("soy proactivo", "jugador de equipo", "mi mayor fortaleza es..."). Si querés decir eso, mostralo con el hecho concreto en vez de la etiqueta.
- Conectores naturales de habla ("igual...", "de hecho...", "lo que más me sirvió ahí fue...", "y eso me llevó a...") para que fluya como un solo discurso hablado.
- Profesional pero cercano, seguro sin sonar ensayado ni sobreactuado.

## Formato de salida (CLAVE: el candidato lee mientras habla y la respuesta va apareciendo de a poco)
- Arrancá con UNA frase de apertura completa y auto-suficiente (1-2 oraciones, SIN viñeta) que YA contesta el núcleo de la pregunta y se puede decir sola tal cual. Es lo primero que el candidato empieza a leer en voz alta, así que tiene que ser una respuesta directa, no un preámbulo. Nunca empieces con relleno tipo "Bueno, primero..." o "Es una buena pregunta".
- Después de esa apertura, dejá una línea en blanco y seguí con viñetas (cada una arranca con "- ") que desarrollan y cierran: una o dos frases por viñeta, continuando la idea como un único discurso cortado en pedazos fáciles de leer de un vistazo.
- Largo VARIABLE según la pregunta: una factual se contesta con la apertura y 1 viñeta; una de comportamiento pide el arco completo (hasta 4-5 viñetas). Nunca infles con relleno para llegar a un largo. Nunca te quedes a medias.
- Todo en primera persona, listo para decir en voz alta tal cual — no son "ideas para desarrollar", son la respuesta misma ya hablada.
- Sin preámbulo, sin "Podrías decir", sin "aquí está tu respuesta": arrancá directo con la frase de apertura.
- Respondé en el idioma indicado en "## IDIOMA DE LA RESPUESTA" (puede diferir del idioma de la pregunta). Dentro de ese idioma, espejá el registro (tú/vos/usted) del entrevistador.

## Regla de oro sobre [PREGUNTA]
Si ese campo tiene CUALQUIER texto —por corto, informal, mal transcrito o inesperado que sea, incluso si el PERFIL o la EMPRESA están vacíos— RESPONDÉLO IGUAL con lo que tengas. Nunca evalúes si "es lo bastante clara". El ÚNICO caso en que devolvés "(esperando pregunta)" es cuando [PREGUNTA] dice literalmente "(ninguna aún)" porque no llegó nada. Nunca lo uses por dudar del contenido.`;

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
  // Endpoint pago (LLM). Una entrevista real dispara 2-4 respuestas por minuto;
  // 20 sigue siendo holgado y corta antes el abuso automatizado.
  const rl = rateLimit(req, "answer", 20, 60_000);
  if (!rl.ok) {
    return new Response("Demasiadas solicitudes. Esperá un momento.", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  let body: {
    profile?: string;
    company?: string;
    role?: string;
    answerLang?: string;
    transcript?: string;
    question?: string;
    provider?: string;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Body inválido.", { status: 400 });
  }

  const provider: Provider =
    body.provider === "anthropic" || body.provider === "openai" ? body.provider : "gemini";
  const model = resolveModel(provider, (body.model || "").slice(0, 100));

  const profile = (body.profile || "").slice(0, 8000);
  const company = (body.company || "").slice(0, 200);
  const role = (body.role || "").slice(0, 2000);
  const transcript = (body.transcript || "").slice(0, 6000);
  const question = (body.question || "").slice(0, 1000);
  const answerLangLabel =
    body.answerLang === "en"
      ? "Inglés (English). Respondé SIEMPRE en inglés, aunque la pregunta esté en otro idioma."
      : "Español rioplatense. Respondé SIEMPRE en español, aunque la pregunta esté en inglés u otro idioma.";

  const userContent = `## EMPRESA
${company || "(sin especificar)"}

## DESCRIPCIÓN DEL PUESTO
${role || "(sin especificar)"}

## PERFIL DEL CANDIDATO
${profile || "(sin perfil cargado)"}

## IDIOMA DE LA RESPUESTA
${answerLangLabel}

## TRANSCRIPCIÓN RECIENTE
${transcript || "(vacío)"}

## ÚLTIMO PUNTO DETECTADO
[PREGUNTA] ${question || "(ninguna aún)"}`;

  // Fallbacks: si el modelo pedido fallara (ID inválido, no habilitado en la
  // cuenta, etc.), se reintenta con uno estable para no quedar sin respuesta
  // en plena entrevista.
  const FALLBACK: Record<Provider, string[]> = {
    openai: ["gpt-4.1-mini", "gpt-4o-mini"],
    anthropic: ["claude-haiku-4-5"],
    gemini: ["gemini-2.5-flash"],
  };
  const candidates = [model, ...FALLBACK[provider].filter((m) => m !== model)];

  try {
    if (provider === "anthropic") return await streamAnthropic(candidates, userContent);
    if (provider === "openai") return await streamOpenAI(candidates, userContent);
    return await streamGemini(candidates, userContent);
  } catch (err: any) {
    return new Response(`Error del modelo: ${err?.message || "desconocido"}`, { status: 502 });
  }
}

// Timeout duro para el fetch inicial a cada provider. Sin esto, si la conexión
// tarda en establecerse (típico en la primera invocación "fría" de la función
// Edge hacia un host que no tocó antes), el fetch queda colgado sin límite: la
// tarjeta se queda en "generando…" para siempre y el usuario tiene que
// adivinar que hay que tocar "Responder" de nuevo. Al abortar rápido, cae al
// siguiente modelo del fallback en el mismo click en vez de colgarse.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Envuelve un ReadableStream de texto plano con los headers correctos.
function textStreamResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Parser SSE genérico: lee el body upstream, parte por líneas "data:", y por
// cada JSON extrae el texto con `extract`. Reenvía solo texto plano al cliente.
function sseTextStream(
  upstream: ReadableStream<Uint8Array>,
  extract: (json: string) => string | null
): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.getReader();
  let buffer = "";
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice(5).trim();
        if (!json || json === "[DONE]") continue;
        try {
          const text = extract(json);
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          // ignora fragmentos incompletos
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

// ---------- Gemini ----------
async function streamGemini(models: string[], userContent: string): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("Falta GEMINI_API_KEY en las variables de entorno.", { status: 500 });
  }
  const payload = {
    contents: [{ role: "user", parts: [{ text: userContent }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
      // Desactiva el "thinking" extendido: sin esto piensa varios cientos de ms
      // antes del primer token, y en vivo eso se nota.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  let detail = "";
  for (const model of models) {
    if (!model) continue;
    try {
      const upstream = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
        10_000
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
    } catch (err: any) {
      detail = err?.name === "AbortError" ? "timeout conectando con Gemini" : err?.message || "error de red";
    }
  }
  return new Response(`Gemini error: ${detail}`, { status: 502 });
}

// ---------- Anthropic (Claude) ----------
async function streamAnthropic(models: string[], userContent: string): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "Falta ANTHROPIC_API_KEY en Vercel para usar Claude. Cargá el token o elegí otro modelo.",
      { status: 500 }
    );
  }
  let detail = "";
  for (const model of models) {
    if (!model) continue;
    try {
      const upstream = await fetchWithTimeout(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 512,
            temperature: 0.4,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userContent }],
            stream: true,
          }),
        },
        10_000
      );
      if (upstream.ok && upstream.body) {
        return textStreamResponse(
          sseTextStream(upstream.body, (json) => {
            const evt = JSON.parse(json);
            // Solo nos interesan los deltas de texto del bloque de contenido.
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              return evt.delta.text ?? null;
            }
            return null;
          })
        );
      }
      detail = await upstream.text().catch(() => "");
    } catch (err: any) {
      detail = err?.name === "AbortError" ? "timeout conectando con Claude" : err?.message || "error de red";
    }
  }
  return new Response(`Claude error: ${detail}`, { status: 502 });
}

// ---------- OpenAI (GPT) ----------
async function streamOpenAI(models: string[], userContent: string): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      "Falta OPENAI_API_KEY en Vercel para usar GPT. Cargá el token o elegí otro modelo.",
      { status: 500 }
    );
  }
  let detail = "";
  for (const model of models) {
    if (!model) continue;
    // Los modelos "reasoning" (GPT-5, o-series) usan max_completion_tokens,
    // rechazan temperature custom y permiten bajar el esfuerzo de razonamiento
    // (clave para latencia en vivo). Los clásicos (gpt-4.x) usan max_tokens.
    const isReasoning = /^(gpt-5|o[0-9])/.test(model);
    const reqBody: Record<string, unknown> = {
      model,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    };
    if (isReasoning) {
      reqBody.max_completion_tokens = 900;
      reqBody.reasoning_effort = "low";
    } else {
      reqBody.max_tokens = 512;
      reqBody.temperature = 0.4;
    }
    try {
      const upstream = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(reqBody),
        },
        10_000
      );
      if (upstream.ok && upstream.body) {
        return textStreamResponse(
          sseTextStream(upstream.body, (json) => {
            const evt = JSON.parse(json);
            return evt.choices?.[0]?.delta?.content ?? null;
          })
        );
      }
      detail = await upstream.text().catch(() => "");
    } catch (err: any) {
      detail = err?.name === "AbortError" ? "timeout conectando con OpenAI" : err?.message || "error de red";
    }
  }
  return new Response(`GPT error: ${detail}`, { status: 502 });
}
